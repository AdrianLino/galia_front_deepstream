import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { SpatialService } from '../../core/services/spatial.service';
import { StreamService } from '../../core/services/stream.service';
import {
  SpatialNode,
  SpatialNodeTipo,
  SpatialNodeCreate,
  SpatialNodeUpdate,
  GeoPoint,
} from '../../core/models/spatial.model';
import { RtspSource, RtspSourceCreate, RtspSourceUpdate } from '../../core/models/stream.model';

const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const STREET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const TIPO_ICONS: Record<SpatialNodeTipo, string> = {
  EXTERIOR: '🌍',
  EDIFICIO: '🏢',
  PISO: '📐',
  ZONA_INTERNA: '🚪',
};

const TIPO_COLORS: Record<SpatialNodeTipo, string> = {
  EXTERIOR: 'emerald',
  EDIFICIO: 'blue',
  PISO: 'amber',
  ZONA_INTERNA: 'purple',
};

@Component({
  selector: 'app-geocercas',
  imports: [CommonModule, FormsModule],
  templateUrl: './geocercas.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
    @keyframes fov-pulse {
      0%, 100% { opacity: 0.20; }
      50% { opacity: 0.35; }
    }
    .fov-cone { animation: fov-pulse 3s ease-in-out infinite; }
    .fov-cone-active { animation: fov-pulse 1.2s ease-in-out infinite; opacity: 0.45 !important; }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class GeocercasComponent implements OnInit, OnDestroy {
  private spatialSvc = inject(SpatialService);
  private streamSvc = inject(StreamService);

  @ViewChild('mapDiv') mapDiv?: ElementRef<HTMLDivElement>;

  // ── State ──────────────────────────────────────────────────────────────
  nodes = signal<SpatialNode[]>([]);
  breadcrumb = signal<SpatialNode[]>([]);
  currentParentId = signal<string | undefined>(undefined);
  cameras = signal<RtspSource[]>([]);
  allCameras = signal<RtspSource[]>([]);
  /** Cameras to display on the map — includes cameras from ALL descendant nodes. */
  mapCameras = signal<RtspSource[]>([]);
  loading = signal(false);
  error = signal('');

  // ── Create form state ─────────────────────────────────────────────────
  showCreate = signal(false);
  newName = '';
  newTipo: SpatialNodeTipo = 'EXTERIOR';
  newDescripcion = '';
  newPiso: number | null = null;
  newCentroLat: number | null = null;
  newCentroLng: number | null = null;
  newZoom: number | null = null;

  // ── Polygon drawing state ──────────────────────────────────────────────
  drawingPolygon = signal(false);
  polygonPoints = signal<GeoPoint[]>([]);

  // ── Camera assignment ──────────────────────────────────────────────────
  showAssignCamera = signal(false);
  selectedNodeForCamera = signal<SpatialNode | null>(null);
  cameraModalTab = signal<'create' | 'assign'>('create');
  savingCamera = signal(false);
  pickingCamCoords = signal(false);
  minimizedForPick = signal(false);
  showOrientationFields = signal(false);
  private camCoordsHandler?: (e: L.LeafletMouseEvent) => void;

  // ── New camera form fields ─────────────────────────────────────────────
  newCamName = '';
  newCamRtsp = '';
  newCamObs = '';
  newCamGroup = '';
  newCamLat: number | null = null;
  newCamLng: number | null = null;
  newCamAzimuth: number | null = null;
  newCamFov: number | null = null;
  newCamInclinacion: number | null = null;
  newCamPiso: number | null = null;
  newCamAltura: number | null = null;

  /** Cameras loaded per-node for the inline expanded panels. */
  nodeCamerasCache = signal<Record<string, RtspSource[]>>({});

  /** Which node card is expanded in the list. */
  expandedNodeId = signal<string | null>(null);

  /** Whether the parent-level cameras section is expanded. */
  parentCamerasExpanded = signal(false);

  // ── Edit camera state ──────────────────────────────────────────────────
  editingCamera = signal<RtspSource | null>(null);
  showEditCamera = signal(false);
  savingEdit = signal(false);
  editCamName = '';
  editCamRtsp = '';
  editCamObs = '';
  editCamGroup = '';
  editCamLat: number | null = null;
  editCamLng: number | null = null;
  editCamAzimuth: number | null = null;
  editCamFov: number | null = null;
  editCamInclinacion: number | null = null;
  editCamPiso: number | null = null;
  editCamAltura: number | null = null;
  pickingEditCoords = signal(false);
  minimizedForEditPick = signal(false);
  private editCoordsHandler?: (e: L.LeafletMouseEvent) => void;
  /** Drag handle for rotating azimuth visually on map. */
  private azimuthDragMarker?: L.Marker;
  private editFovPreview?: L.Polygon;

  /** Cameras not yet assigned to the currently selected node (for the assign modal). */
  unassignedCameras = computed(() => {
    const node = this.selectedNodeForCamera();
    if (!node) return this.allCameras();
    const cache = this.nodeCamerasCache();
    const assigned = new Set((cache[node.id] ?? []).map((c: RtspSource) => c.id));
    return this.allCameras().filter(c => !assigned.has(c.id));
  });

  // ── Floor navigation ──────────────────────────────────────────────────
  siblingFloors = signal<SpatialNode[]>([]);

  /** The current PISO node (last breadcrumb item) if we're inside a floor. */
  currentFloor = computed<SpatialNode | null>(() => {
    const bc = this.breadcrumb();
    if (bc.length === 0) return null;
    const last = bc[bc.length - 1];
    return last.tipo === 'PISO' ? last : null;
  });

  /** Sibling floors sorted high → low for the elevator panel. */
  siblingFloorsDesc = computed(() =>
    [...this.siblingFloors()].sort((a, b) => (b.piso ?? 0) - (a.piso ?? 0))
  );

  // ── Map ────────────────────────────────────────────────────────────────
  private map?: L.Map;
  private satelliteLayer?: L.TileLayer;
  private streetLayer?: L.TileLayer;
  private polygonLayer?: L.Polygon;
  private polygonMarkers: L.CircleMarker[] = [];
  private nodePolygons: L.Polygon[] = [];
  private parentPolygon?: L.Polygon;
  private cameraMarkers: L.Marker[] = [];
  private fovLayers: L.Polygon[] = [];
  private drawHandler?: (e: L.LeafletMouseEvent) => void;
  private mapInitialized = false;

  // ── Edit location state ────────────────────────────────────────────────
  editingNodeLocation = signal<SpatialNode | null>(null);
  showEditLocation = signal(false);
  editLocCentroLat: number | null = null;
  editLocCentroLng: number | null = null;
  editLocZoom: number | null = null;
  savingEditLocation = signal(false);
  private editLocCenterHandler?: (e: L.LeafletMouseEvent) => void;

  // ── Detail panel ───────────────────────────────────────────────────────
  selectedNode = signal<SpatialNode | null>(null);
  showDetail = signal(false);

  tipos: SpatialNodeTipo[] = ['EXTERIOR', 'EDIFICIO', 'PISO', 'ZONA_INTERNA'];

  tipoIcon(tipo: SpatialNodeTipo): string { return TIPO_ICONS[tipo]; }

  tipoLabel(tipo: SpatialNodeTipo): string {
    return { EXTERIOR: 'Exterior', EDIFICIO: 'Edificio', PISO: 'Piso', ZONA_INTERNA: 'Zona Interna' }[tipo];
  }

  tipoBg(tipo: SpatialNodeTipo): string {
    const c = TIPO_COLORS[tipo];
    return `bg-${c}-600/20 text-${c}-400 border-${c}-600/30`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadNodes();
    this.loadAllCameras();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // ── Data loading ───────────────────────────────────────────────────────

  loadNodes(): void {
    this.loading.set(true);
    this.spatialSvc.listNodes(this.currentParentId()).subscribe({
      next: (nodes) => {
        this.nodes.set(nodes);
        this.loading.set(false);
        this.loadNodeCameras();
        this.loadSiblingFloors();
        setTimeout(() => this.initMap(), 100);
      },
      error: (err) => {
        this.error.set('Error cargando nodos: ' + (err.error?.detail || err.message));
        this.loading.set(false);
      },
    });
  }

  loadAllCameras(): void {
    this.streamSvc.listSources().subscribe({
      next: (cams) => this.allCameras.set(cams),
    });
  }

  loadNodeCameras(): void {
    const parentId = this.currentParentId();
    const parentTipo = this.breadcrumb().at(-1)?.tipo;
    // Cameras are visible from EDIFICIO level and deeper (covers EDIFICIO→ZONA_INTERNA without PISO)
    const showCameras = parentTipo === 'EDIFICIO' || parentTipo === 'PISO' || parentTipo === 'ZONA_INTERNA';

    if (parentId && showCameras) {
      // Direct cameras for the sidebar panel
      this.spatialSvc.listNodeCameras(parentId).subscribe({
        next: (cams) => this.cameras.set(cams),
      });
      // Recursive cameras (this node + all descendants) for the map markers
      this.spatialSvc.listNodeCameras(parentId, true).subscribe({
        next: (cams) => this.mapCameras.set(cams),
      });
    } else {
      this.cameras.set([]);
      this.mapCameras.set([]);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  navigateToNode(node: SpatialNode): void {
    this.breadcrumb.update(bc => [...bc, node]);
    this.currentParentId.set(node.id);
    this.showDetail.set(false);
    this.showCreate.set(false);
    this.loadNodes();
  }

  navigateToRoot(): void {
    this.breadcrumb.set([]);
    this.currentParentId.set(undefined);
    this.showDetail.set(false);
    this.showCreate.set(false);
    this.loadNodes();
  }

  navigateToBreadcrumb(index: number): void {
    const bc = this.breadcrumb();
    if (index < 0) {
      this.navigateToRoot();
      return;
    }
    const target = bc[index];
    this.breadcrumb.set(bc.slice(0, index + 1));
    this.currentParentId.set(target.id);
    this.showDetail.set(false);
    this.showCreate.set(false);
    this.loadNodes();
  }

  selectNode(node: SpatialNode): void {
    this.selectedNode.set(node);
    this.showDetail.set(true);
  }

  /** Load sibling PISO nodes when we're currently inside a floor. */
  loadSiblingFloors(): void {
    const bc = this.breadcrumb();
    const last = bc.length > 0 ? bc[bc.length - 1] : null;
    if (!last || last.tipo !== 'PISO') {
      this.siblingFloors.set([]);
      return;
    }
    // Parent of this PISO is the building (second-to-last in breadcrumb)
    const buildingId = bc.length >= 2 ? bc[bc.length - 2].id : undefined;
    this.spatialSvc.listNodes(buildingId).subscribe({
      next: (nodes) => {
        const floors = nodes
          .filter(n => n.tipo === 'PISO')
          .sort((a, b) => (a.piso ?? 0) - (b.piso ?? 0));
        this.siblingFloors.set(floors);
      },
    });
  }

  /** Navigate to a sibling floor (replaces current PISO in breadcrumb). */
  navigateToSiblingFloor(floor: SpatialNode): void {
    if (floor.id === this.currentFloor()?.id) return;
    const bc = this.breadcrumb();
    this.breadcrumb.set([...bc.slice(0, -1), floor]);
    this.currentParentId.set(floor.id);
    this.showDetail.set(false);
    this.showCreate.set(false);
    this.loadNodes();
  }

  /** Go one level up in the hierarchy. */
  goBack(): void {
    const bc = this.breadcrumb();
    if (bc.length === 1) {
      this.navigateToRoot();
    } else {
      this.navigateToBreadcrumb(bc.length - 2);
    }
  }

  // ── Map ────────────────────────────────────────────────────────────────

  initMap(): void {
    if (!this.mapDiv?.nativeElement) return;

    // Create the map only once — reuse it across navigations
    if (!this.mapInitialized || !this.map) {
      if (this.map) this.map.remove();

      this.map = L.map(this.mapDiv.nativeElement, {
        center: [19.4326, -99.1332],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      this.satelliteLayer = L.tileLayer(SATELLITE_URL, { maxZoom: 20, attribution: '&copy; Esri' });
      this.streetLayer = L.tileLayer(STREET_URL, { maxZoom: 20, attribution: '&copy; OpenStreetMap' });
      this.satelliteLayer.addTo(this.map);
      L.control.layers({ 'Sat\u00e9lite': this.satelliteLayer, 'Calles': this.streetLayer }, {}, { position: 'topright' }).addTo(this.map);

      this.mapInitialized = true;
    }

    // When inside a node → hide tiles (white bg); at root → show tiles
    const atRoot = this.breadcrumb().length === 0;
    if (this.map && this.satelliteLayer && this.streetLayer) {
      if (atRoot) {
        if (!this.map.hasLayer(this.satelliteLayer) && !this.map.hasLayer(this.streetLayer)) {
          this.satelliteLayer.addTo(this.map);
        }
      } else {
        if (this.map.hasLayer(this.satelliteLayer)) this.satelliteLayer.remove();
        if (this.map.hasLayer(this.streetLayer)) this.streetLayer.remove();
      }
    }

    // Clear previous overlays
    this.clearMapOverlays();

    // Render context (parent), children, and cameras
    this.renderParentPolygon();
    this.renderNodePolygons();
    this.renderCameraMarkers();
    this.fitMapBounds();

    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  private clearMapOverlays(): void {
    this.nodePolygons.forEach(p => p.remove());
    this.nodePolygons = [];
    this.parentPolygon?.remove();
    this.parentPolygon = undefined;
    this.cameraMarkers.forEach(m => m.remove());
    this.cameraMarkers = [];
    this.fovLayers.forEach(l => l.remove());
    this.fovLayers = [];
  }

  /** Show the current parent node's polygon as a dashed context outline. */
  private renderParentPolygon(): void {
    const bc = this.breadcrumb();
    if (bc.length === 0) return;
    const parent = bc[bc.length - 1];
    if (!parent.geo_poligono || parent.geo_poligono.length < 3) return;

    const latlngs: L.LatLngExpression[] = parent.geo_poligono.map(
      (p: GeoPoint) => [p.lat, p.lng] as L.LatLngExpression
    );
    const color = parent.tipo === 'EXTERIOR' ? '#10b981' :
                  parent.tipo === 'EDIFICIO' ? '#3b82f6' :
                  parent.tipo === 'PISO' ? '#f59e0b' : '#a855f7';
    this.parentPolygon = L.polygon(latlngs, {
      color,
      weight: 2,
      dashArray: '6,4',
      fillOpacity: 0.05,
      fillColor: color,
    }).addTo(this.map!);

    this.parentPolygon.bindTooltip(
      `${TIPO_ICONS[parent.tipo as SpatialNodeTipo]} ${parent.name} (actual)`,
      { permanent: false, direction: 'center' }
    );
  }

  private renderNodePolygons(): void {
    for (const node of this.nodes()) {
      if (node.geo_poligono && node.geo_poligono.length >= 3) {
        const latlngs: L.LatLngExpression[] = node.geo_poligono.map(
          (p: GeoPoint) => [p.lat, p.lng] as L.LatLngExpression
        );
        const color = node.tipo === 'EXTERIOR' ? '#10b981' :
                      node.tipo === 'EDIFICIO' ? '#3b82f6' :
                      node.tipo === 'PISO' ? '#f59e0b' : '#a855f7';
        const polygon = L.polygon(latlngs, {
          color,
          weight: 2,
          fillOpacity: 0.15,
          fillColor: color,
        }).addTo(this.map!);

        polygon.bindTooltip(
          `${TIPO_ICONS[node.tipo as SpatialNodeTipo]} ${node.name}`,
          { permanent: true, direction: 'center', className: 'leaflet-tooltip-custom' }
        );

        polygon.on('click', () => this.navigateToNode(node));
        polygon.on('dblclick', () => this.selectNode(node));

        this.nodePolygons.push(polygon);
      }
    }
  }

  /** Fit the map view to show all visible geometry: parent + children + cameras.
   *  Also sets maxBounds to the parent polygon so the user can't scroll away. */
  private fitMapBounds(): void {
    const allLayers: L.Layer[] = [
      ...this.nodePolygons,
      ...(this.parentPolygon ? [this.parentPolygon] : []),
      ...this.cameraMarkers,
    ];

    // Set maxBounds to parent polygon to restrict pan/zoom when inside a node
    if (this.parentPolygon) {
      const bounds = this.parentPolygon.getBounds().pad(0.15);
      this.map?.setMaxBounds(bounds);
      this.map?.setMinZoom(this.map.getBoundsZoom(bounds) - 1);
    } else {
      this.map?.setMaxBounds(undefined as any);
      this.map?.setMinZoom(2);
    }

    if (allLayers.length > 0) {
      const group = L.featureGroup(allLayers);
      this.map?.fitBounds(group.getBounds().pad(0.1));
    } else {
      // No geometry at all — use parent center or default
      const bc = this.breadcrumb();
      if (bc.length > 0) {
        const last = bc[bc.length - 1];
        if (last.centro_lat != null && last.centro_lng != null) {
          this.map?.setView([last.centro_lat, last.centro_lng], last.zoom_nivel ?? 17);
          return;
        }
      }
      this.map?.setView([19.4326, -99.1332], 15);
    }
  }

  private renderCameraMarkers(): void {
    this.cameraMarkers.forEach(m => m.remove());
    this.cameraMarkers = [];
    this.fovLayers.forEach(l => l.remove());
    this.fovLayers = [];

    const directIds = new Set(this.cameras().map(c => c.id));

    for (const cam of this.mapCameras()) {
      if (cam.latitud != null && cam.longitud != null) {
        const isDirect = directIds.has(cam.id);
        const isEditing = this.editingCamera()?.id === cam.id;
        // Camera marker
        const html = isDirect
          ? `<div class="flex items-center justify-center w-7 h-7 rounded-full ${isEditing ? 'bg-amber-500 ring-2 ring-amber-300 ring-offset-1 ring-offset-gray-900' : 'bg-red-600'} border-2 border-white shadow-lg text-white text-xs cursor-pointer transition-all duration-300" style="${isEditing ? 'transform:scale(1.2)' : ''}">📹</div>`
          : `<div class="flex items-center justify-center w-5 h-5 rounded-full bg-orange-400 border-2 border-orange-700 shadow text-white text-xs cursor-pointer">📹</div>`;
        const size: [number, number] = isDirect ? [28, 28] : [20, 20];
        const anchor: [number, number] = isDirect ? [14, 14] : [10, 10];
        const marker = L.marker([cam.latitud, cam.longitud], {
          icon: L.divIcon({ className: '', html, iconSize: size, iconAnchor: anchor }),
        }).addTo(this.map!);
        const label = isDirect ? cam.name : `${cam.name} (zona interna)`;
        marker.bindTooltip(label, { direction: 'top' });
        marker.on('click', () => this.openEditCamera(cam));
        this.cameraMarkers.push(marker);

        // FOV cone — clipped to node walls
        if (cam.azimuth != null && cam.latitud != null && cam.longitud != null) {
          const walls = this.getWallSegments();
          const cone = this.buildFovCone(cam, isEditing, walls);
          if (cone) {
            cone.addTo(this.map!);
            this.fovLayers.push(cone);
          }
        }
      }
    }
  }

  /** Build a semi-transparent FOV cone polygon on the map, clipped by walls. */
  private buildFovCone(cam: RtspSource, active = false, walls: [number, number, number, number][] = []): L.Polygon | null {
    if (cam.latitud == null || cam.longitud == null || cam.azimuth == null) return null;
    const fov = cam.fov_angulo ?? 90;
    const range = 0.00035; // ~35m in degrees — visual range
    const steps = 24; // smoothness
    const half = fov / 2;
    const pts: L.LatLngExpression[] = [[cam.latitud, cam.longitud]];

    for (let i = 0; i <= steps; i++) {
      const angle = cam.azimuth - half + (fov * i) / steps;
      const rad = ((90 - angle) * Math.PI) / 180; // convert azimuth to math angle
      const dx = range * Math.cos(rad);
      const dy = range * Math.sin(rad);

      // Raycast: find nearest wall intersection
      let minT = 1;
      for (const seg of walls) {
        const t = this.raySegmentIntersect(
          cam.longitud!, cam.latitud!, dx, dy,
          seg[0], seg[1], seg[2], seg[3],
        );
        if (t !== null && t < minT) minT = t;
      }

      const lng = cam.longitud + dx * minT;
      const lat = cam.latitud + dy * minT;
      pts.push([lat, lng]);
    }
    pts.push([cam.latitud, cam.longitud]);

    const color = active ? '#f59e0b' : '#ef4444';
    return L.polygon(pts, {
      color,
      weight: 1,
      fillColor: color,
      fillOpacity: active ? 0.35 : 0.18,
      className: active ? 'fov-cone fov-cone-active' : 'fov-cone',
      interactive: false,
    });
  }

  /**
   * Collect all polygon edges (wall segments) from the parent node and child nodes.
   * Each segment is [lng1, lat1, lng2, lat2].
   */
  private getWallSegments(): [number, number, number, number][] {
    const segs: [number, number, number, number][] = [];
    const addPoly = (points: GeoPoint[]) => {
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        segs.push([a.lng, a.lat, b.lng, b.lat]);
      }
    };
    // Parent polygon = outer walls
    const bc = this.breadcrumb();
    if (bc.length > 0) {
      const parent = bc[bc.length - 1];
      if (parent.geo_poligono && parent.geo_poligono.length >= 3) {
        addPoly(parent.geo_poligono);
      }
    }
    // Child node polygons = internal walls
    for (const node of this.nodes()) {
      if (node.geo_poligono && node.geo_poligono.length >= 3) {
        addPoly(node.geo_poligono);
      }
    }
    return segs;
  }

  /**
   * Ray-segment intersection. Returns parameter t (0..1) along the ray, or null.
   * Ray: origin (ox,oy) + t * (dx,dy)   Segment: (ax,ay)→(bx,by)
   */
  private raySegmentIntersect(
    ox: number, oy: number, dx: number, dy: number,
    ax: number, ay: number, bx: number, by: number,
  ): number | null {
    const sx = bx - ax;
    const sy = by - ay;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-15) return null; // parallel
    const t = ((ax - ox) * sy - (ay - oy) * sx) / denom;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
    if (t > 0.005 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
  }

  // ── Polygon drawing ────────────────────────────────────────────────────

  startDrawing(): void {
    if (!this.map) return;
    this.drawingPolygon.set(true);
    this.polygonPoints.set([]);
    this.clearDrawing();

    this.drawHandler = (e: L.LeafletMouseEvent) => {
      const pt: GeoPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      this.polygonPoints.update(pts => [...pts, pt]);
      this.renderDrawing();
    };
    this.map.on('click', this.drawHandler);
    this.map.getContainer().style.cursor = 'crosshair';
  }

  finishDrawing(): void {
    if (!this.map || !this.drawHandler) return;
    this.map.off('click', this.drawHandler);
    this.map.getContainer().style.cursor = '';
    this.drawingPolygon.set(false);
    // Leave polygon on map for visual feedback
  }

  cancelDrawing(): void {
    if (!this.map || !this.drawHandler) return;
    this.map.off('click', this.drawHandler);
    this.map.getContainer().style.cursor = '';
    this.drawingPolygon.set(false);
    this.polygonPoints.set([]);
    this.clearDrawing();
  }

  private renderDrawing(): void {
    this.clearDrawing();
    const pts = this.polygonPoints();
    if (pts.length < 2) {
      if (pts.length === 1) {
        const m = L.circleMarker([pts[0].lat, pts[0].lng], {
          radius: 5, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1,
        }).addTo(this.map!);
        this.polygonMarkers.push(m);
      }
      return;
    }
    const latlngs: L.LatLngExpression[] = pts.map(p => [p.lat, p.lng] as L.LatLngExpression);
    this.polygonLayer = L.polygon(latlngs, {
      color: '#ef4444', weight: 2, dashArray: '5,5', fillOpacity: 0.1,
    }).addTo(this.map!);

    for (const pt of pts) {
      const m = L.circleMarker([pt.lat, pt.lng], {
        radius: 5, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1,
      }).addTo(this.map!);
      this.polygonMarkers.push(m);
    }
  }

  private clearDrawing(): void {
    this.polygonLayer?.remove();
    this.polygonLayer = undefined;
    this.polygonMarkers.forEach(m => m.remove());
    this.polygonMarkers = [];
  }

  undoLastPoint(): void {
    this.polygonPoints.update(pts => pts.slice(0, -1));
    this.renderDrawing();
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  openCreateForm(): void {
    this.showCreate.set(true);
    this.newName = '';
    // Smart default tipo based on parent tipo
    const bc = this.breadcrumb();
    const parent = bc.length > 0 ? bc[bc.length - 1] : null;
    if (!parent) {
      this.newTipo = 'EXTERIOR';
    } else if (parent.tipo === 'EXTERIOR') {
      this.newTipo = 'EDIFICIO';
    } else if (parent.tipo === 'EDIFICIO') {
      this.newTipo = 'PISO';
    } else {
      this.newTipo = 'ZONA_INTERNA';
    }
    this.newDescripcion = '';
    this.newPiso = null;
    this.newCentroLat = null;
    this.newCentroLng = null;
    this.newZoom = null;
    this.polygonPoints.set([]);
    this.clearDrawing();
    // Auto-inherit parent polygon for PISO nodes
    if (this.newTipo === 'PISO') {
      this.inheritParentPolygon();
    }
  }

  /** Change tipo in the create form; auto-inherits polygon when switching to PISO. */
  setTipo(t: SpatialNodeTipo): void {
    this.newTipo = t;
    if (t === 'PISO') {
      this.inheritParentPolygon();
    }
  }

  /** Copy parent node's polygon into the drawing points (for PISO floors). */
  private inheritParentPolygon(): void {
    const bc = this.breadcrumb();
    const parent = bc.length > 0 ? bc[bc.length - 1] : null;
    if (parent?.geo_poligono && parent.geo_poligono.length >= 3) {
      this.polygonPoints.set([...parent.geo_poligono]);
      this.renderDrawing();
    }
  }

  cancelCreate(): void {
    this.showCreate.set(false);
    this.cancelDrawing();
  }

  saveNode(): void {
    if (!this.newName.trim()) return;

    const pts = this.polygonPoints();
    // Calculate center from polygon if available
    let centroLat = this.newCentroLat;
    let centroLng = this.newCentroLng;
    if (!centroLat && !centroLng && pts.length >= 3) {
      centroLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      centroLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    }

    const body: SpatialNodeCreate = {
      name: this.newName.trim(),
      tipo: this.newTipo,
      parent_id: this.currentParentId(),
      descripcion: this.newDescripcion.trim() || undefined,
      geo_poligono: pts.length >= 3 ? pts : undefined,
      centro_lat: centroLat ?? undefined,
      centro_lng: centroLng ?? undefined,
      zoom_nivel: this.newZoom ?? undefined,
      piso: this.newPiso ?? undefined,
    };

    this.spatialSvc.createNode(body).subscribe({
      next: () => {
        this.showCreate.set(false);
        this.cancelDrawing();
        this.loadNodes();
      },
      error: (err) => {
        this.error.set('Error creando nodo: ' + (err.error?.detail || err.message));
      },
    });
  }

  deleteNode(node: SpatialNode): void {
    this.spatialSvc.deleteNode(node.id).subscribe({
      next: () => {
        this.showDetail.set(false);
        this.loadNodes();
      },
      error: (err) => {
        this.error.set('Error eliminando nodo: ' + (err.error?.detail || err.message));
      },
    });
  }

  // ── Edit location ──────────────────────────────────────────────────────

  openEditLocation(node: SpatialNode): void {
    this.editingNodeLocation.set(node);
    this.showDetail.set(false);
    this.showEditLocation.set(true);
    this.editLocCentroLat = node.centro_lat ?? null;
    this.editLocCentroLng = node.centro_lng ?? null;
    this.editLocZoom = node.zoom_nivel ?? null;
    this.polygonPoints.set(node.geo_poligono && node.geo_poligono.length >= 3 ? [...node.geo_poligono] : []);
    this.clearDrawing();
    if (this.polygonPoints().length >= 3) this.renderDrawing();
  }

  cancelEditLocation(): void {
    this.showEditLocation.set(false);
    this.editingNodeLocation.set(null);
    this.savingEditLocation.set(false);
    if (this.editLocCenterHandler) {
      this.map?.off('click', this.editLocCenterHandler);
      this.editLocCenterHandler = undefined;
      if (this.map) this.map.getContainer().style.cursor = '';
    }
    if (this.drawingPolygon()) {
      this.cancelDrawing();
    } else {
      this.polygonPoints.set([]);
      this.clearDrawing();
    }
  }

  pickEditLocCenter(): void {
    if (!this.map) return;
    this.editLocCenterHandler = (e: L.LeafletMouseEvent) => {
      this.editLocCentroLat = Math.round(e.latlng.lat * 1e6) / 1e6;
      this.editLocCentroLng = Math.round(e.latlng.lng * 1e6) / 1e6;
      if (this.map && this.editLocCenterHandler) {
        this.map.off('click', this.editLocCenterHandler);
        this.map.getContainer().style.cursor = '';
      }
      this.editLocCenterHandler = undefined;
    };
    this.map.on('click', this.editLocCenterHandler);
    this.map.getContainer().style.cursor = 'crosshair';
  }

  saveEditLocation(): void {
    const node = this.editingNodeLocation();
    if (!node) return;
    this.savingEditLocation.set(true);
    const pts = this.polygonPoints();
    let centroLat = this.editLocCentroLat;
    let centroLng = this.editLocCentroLng;
    if (!centroLat && !centroLng && pts.length >= 3) {
      centroLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      centroLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    }
    const body: SpatialNodeUpdate = {
      geo_poligono: pts.length >= 3 ? pts : undefined,
      centro_lat: centroLat ?? undefined,
      centro_lng: centroLng ?? undefined,
      zoom_nivel: this.editLocZoom ?? undefined,
    };
    this.spatialSvc.updateNode(node.id, body).subscribe({
      next: () => {
        this.savingEditLocation.set(false);
        this.showEditLocation.set(false);
        this.editingNodeLocation.set(null);
        if (this.drawingPolygon()) this.cancelDrawing();
        else { this.polygonPoints.set([]); this.clearDrawing(); }
        this.loadNodes();
      },
      error: (err) => {
        this.savingEditLocation.set(false);
        this.error.set('Error guardando ubicación: ' + (err.error?.detail || err.message));
      },
    });
  }

  // ── Camera assignment ──────────────────────────────────────────────────

  /** Toggle the inline camera panel for a node in the list. */
  toggleNodeExpand(node: SpatialNode, event: Event): void {
    event.stopPropagation();
    const already = this.expandedNodeId() === node.id;
    this.expandedNodeId.set(already ? null : node.id);
    if (!already) {
      this.loadCamerasForNode(node.id);
    }
  }

  /** Load cameras for a specific node into the cache. */
  loadCamerasForNode(nodeId: string): void {
    this.spatialSvc.listNodeCameras(nodeId).subscribe({
      next: (cams) => {
        this.nodeCamerasCache.update(cache => ({ ...cache, [nodeId]: cams }));
      },
    });
  }

  openAssignCamera(node: SpatialNode): void {
    this.selectedNodeForCamera.set(node);
    // Ensure we have fresh cameras for this node in the cache
    this.loadCamerasForNode(node.id);
    // Reset create form
    this.newCamName = '';
    this.newCamRtsp = '';
    this.newCamObs = '';
    this.newCamGroup = '';
    this.newCamLat = null;
    this.newCamLng = null;
    this.newCamAzimuth = null;
    this.newCamFov = null;
    this.newCamInclinacion = null;
    this.newCamPiso = node.piso ?? null;
    this.newCamAltura = null;
    this.cameraModalTab.set('create');
    this.savingCamera.set(false);
    this.showOrientationFields.set(false);
    this.showAssignCamera.set(true);
  }

  closeAssignCamera(): void {
    this.stopPickingCamCoords();
    this.showAssignCamera.set(false);
  }

  /** Start map-click mode to pick camera coordinates. */
  startPickingCamCoords(): void {
    if (!this.map) return;
    this.pickingCamCoords.set(true);
    this.minimizedForPick.set(true); // collapse modal so map is visible
    this.camCoordsHandler = (e: L.LeafletMouseEvent) => {
      this.newCamLat = Math.round(e.latlng.lat * 1e6) / 1e6;
      this.newCamLng = Math.round(e.latlng.lng * 1e6) / 1e6;
      this.stopPickingCamCoords();
      this.minimizedForPick.set(false); // restore modal
    };
    this.map.on('click', this.camCoordsHandler);
    this.map.getContainer().style.cursor = 'crosshair';
  }

  stopPickingCamCoords(): void {
    if (this.map && this.camCoordsHandler) {
      this.map.off('click', this.camCoordsHandler);
      this.map.getContainer().style.cursor = '';
    }
    this.pickingCamCoords.set(false);
    this.camCoordsHandler = undefined;
  }

  cancelPickingCamCoords(): void {
    this.stopPickingCamCoords();
    this.minimizedForPick.set(false);
  }

  /** Create a brand-new camera pre-assigned to the current node. */
  createCameraForNode(): void {
    const node = this.selectedNodeForCamera();
    if (!node || !this.newCamName.trim() || !this.newCamRtsp.trim()) return;
    this.savingCamera.set(true);
    const body: RtspSourceCreate = {
      name: this.newCamName.trim(),
      rtsp_url: this.newCamRtsp.trim(),
      observation: this.newCamObs.trim() || undefined,
      group_name: this.newCamGroup.trim() || undefined,
      latitud: this.newCamLat ?? undefined,
      longitud: this.newCamLng ?? undefined,
      azimuth: this.newCamAzimuth ?? undefined,
      fov_angulo: this.newCamFov ?? undefined,
      inclinacion_angulo: this.newCamInclinacion ?? undefined,
      piso: this.newCamPiso ?? undefined,
      altura_m: this.newCamAltura ?? undefined,
      spatial_node_id: node.id,
    };
    this.streamSvc.createSource(body).subscribe({
      next: () => {
        this.savingCamera.set(false);
        this.closeAssignCamera();
        this.loadCamerasForNode(node.id);
        this.loadAllCameras();
        this.loadNodes();
      },
      error: (err) => {
        this.savingCamera.set(false);
        this.error.set('Error creando cámara: ' + (err.error?.detail || err.message));
      },
    });
  }

  assignCameraToNode(cam: RtspSource): void {
    const node = this.selectedNodeForCamera();
    if (!node) return;
    this.spatialSvc.assignCamera(node.id, cam.id).subscribe({
      next: () => {
        this.loadCamerasForNode(node.id);
        this.loadAllCameras();
        this.loadNodes();
        // If this node is also the current parent, refresh its cameras section
        if (node.id === this.currentParentId()) this.loadNodeCameras();
      },
    });
  }

  /** Unassign from the *current parent* node (used in the "Cámaras" section at top of list). */
  unassignCamera(cam: RtspSource): void {
    const parentId = this.currentParentId();
    if (!parentId) return;
    this.spatialSvc.unassignCamera(parentId, cam.id).subscribe({
      next: () => {
        this.loadNodeCameras();
        this.loadAllCameras();
        this.loadNodes();
      },
    });
  }

  /** Unassign from an inline expanded node card. */
  unassignCameraFromNode(node: SpatialNode, cam: RtspSource, event: Event): void {
    event.stopPropagation();
    this.spatialSvc.unassignCamera(node.id, cam.id).subscribe({
      next: () => {
        this.loadCamerasForNode(node.id);
        this.loadAllCameras();
        this.loadNodes();
        if (node.id === this.currentParentId()) this.loadNodeCameras();
      },
    });
  }

  // ── Map click to set center ────────────────────────────────────────────

  setMapClickForCenter(): void {
    if (!this.map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      this.newCentroLat = Math.round(e.latlng.lat * 1e6) / 1e6;
      this.newCentroLng = Math.round(e.latlng.lng * 1e6) / 1e6;
      this.map?.off('click', handler);
      this.map!.getContainer().style.cursor = '';
    };
    this.map.on('click', handler);
    this.map.getContainer().style.cursor = 'crosshair';
  }

  // ── Edit camera ────────────────────────────────────────────────────────

  openEditCamera(cam: RtspSource): void {
    this.editingCamera.set(cam);
    this.editCamName = cam.name;
    this.editCamRtsp = cam.rtsp_url;
    this.editCamObs = cam.observation ?? '';
    this.editCamGroup = cam.group_name ?? '';
    this.editCamLat = cam.latitud ?? null;
    this.editCamLng = cam.longitud ?? null;
    this.editCamAzimuth = cam.azimuth ?? null;
    this.editCamFov = cam.fov_angulo ?? null;
    this.editCamInclinacion = cam.inclinacion_angulo ?? null;
    this.editCamPiso = cam.piso ?? null;
    this.editCamAltura = cam.altura_m ?? null;
    this.showEditCamera.set(true);
    // Re-render so that the selected marker & cone highlight
    this.renderCameraMarkers();
    this.showAzimuthDragHandle();
  }

  closeEditCamera(): void {
    this.stopPickingEditCoords();
    this.removeAzimuthDragHandle();
    this.editFovPreview?.remove();
    this.editFovPreview = undefined;
    this.editingCamera.set(null);
    this.showEditCamera.set(false);
    this.renderCameraMarkers();
  }

  /** Live-update the FOV cone preview on the map when slider changes. */
  onEditOrientationChange(): void {
    this.editFovPreview?.remove();
    if (this.editCamLat != null && this.editCamLng != null && this.editCamAzimuth != null) {
      const preview: RtspSource = {
        ...this.editingCamera()!,
        latitud: this.editCamLat,
        longitud: this.editCamLng,
        azimuth: this.editCamAzimuth,
        fov_angulo: this.editCamFov ?? 90,
      };
      const walls = this.getWallSegments();
      this.editFovPreview = this.buildFovCone(preview, true, walls) ?? undefined;
      if (this.editFovPreview) this.editFovPreview.addTo(this.map!);
    }
    this.showAzimuthDragHandle();
  }

  /** Place a draggable marker at the tip of the azimuth direction to allow rotation by drag. */
  private showAzimuthDragHandle(): void {
    this.removeAzimuthDragHandle();
    if (this.editCamLat == null || this.editCamLng == null || this.editCamAzimuth == null || !this.map) return;

    const range = 0.00035;
    const rad = ((90 - this.editCamAzimuth) * Math.PI) / 180;
    const dx = range * Math.cos(rad);
    const dy = range * Math.sin(rad);

    // Clip handle position to nearest wall
    const walls = this.getWallSegments();
    let minT = 1;
    for (const seg of walls) {
      const t = this.raySegmentIntersect(this.editCamLng, this.editCamLat, dx, dy, seg[0], seg[1], seg[2], seg[3]);
      if (t !== null && t < minT) minT = t;
    }
    const tipLat = this.editCamLat + dy * minT;
    const tipLng = this.editCamLng + dx * minT;

    this.azimuthDragMarker = L.marker([tipLat, tipLng], {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: `<div class="w-5 h-5 rounded-full bg-amber-400 border-2 border-white shadow-lg cursor-grab" style="opacity:0.85"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(this.map);

    this.azimuthDragMarker.bindTooltip('Arrastra para rotar', { direction: 'top', offset: [0, -10] });

    this.azimuthDragMarker.on('drag', (e: any) => {
      if (this.editCamLat == null || this.editCamLng == null) return;
      const latlng = (e.target as L.Marker).getLatLng();
      const dy = latlng.lat - this.editCamLat;
      const dx = latlng.lng - this.editCamLng;
      // Convert dx/dy back to azimuth (0=N, CW)
      let azimuth = 90 - (Math.atan2(dy, dx) * 180) / Math.PI;
      if (azimuth < 0) azimuth += 360;
      this.editCamAzimuth = Math.round(azimuth);
      this.onEditOrientationChange();
    });
  }

  private removeAzimuthDragHandle(): void {
    this.azimuthDragMarker?.remove();
    this.azimuthDragMarker = undefined;
  }

  startPickingEditCoords(): void {
    if (!this.map) return;
    this.pickingEditCoords.set(true);
    this.minimizedForEditPick.set(true);
    this.editCoordsHandler = (e: L.LeafletMouseEvent) => {
      this.editCamLat = Math.round(e.latlng.lat * 1e6) / 1e6;
      this.editCamLng = Math.round(e.latlng.lng * 1e6) / 1e6;
      this.stopPickingEditCoords();
      this.minimizedForEditPick.set(false);
    };
    this.map.on('click', this.editCoordsHandler);
    this.map.getContainer().style.cursor = 'crosshair';
  }

  stopPickingEditCoords(): void {
    if (this.map && this.editCoordsHandler) {
      this.map.off('click', this.editCoordsHandler);
      this.map.getContainer().style.cursor = '';
    }
    this.pickingEditCoords.set(false);
    this.editCoordsHandler = undefined;
  }

  cancelPickingEditCoords(): void {
    this.stopPickingEditCoords();
    this.minimizedForEditPick.set(false);
  }

  saveEditCamera(): void {
    const cam = this.editingCamera();
    if (!cam || !this.editCamName.trim() || !this.editCamRtsp.trim()) return;
    this.savingEdit.set(true);
    const body: RtspSourceUpdate = {
      name: this.editCamName.trim(),
      rtsp_url: this.editCamRtsp.trim(),
      observation: this.editCamObs.trim() || undefined,
      group_name: this.editCamGroup.trim() || undefined,
      latitud: this.editCamLat ?? undefined,
      longitud: this.editCamLng ?? undefined,
      azimuth: this.editCamAzimuth ?? undefined,
      fov_angulo: this.editCamFov ?? undefined,
      inclinacion_angulo: this.editCamInclinacion ?? undefined,
      piso: this.editCamPiso ?? undefined,
      altura_m: this.editCamAltura ?? undefined,
    };
    this.streamSvc.updateSource(cam.id, body).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.closeEditCamera();
        this.loadNodeCameras();
        this.loadAllCameras();
        this.loadNodes();
      },
      error: (err) => {
        this.savingEdit.set(false);
        this.error.set('Error guardando cámara: ' + (err.error?.detail || err.message));
      },
    });
  }
}
