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
  GeoPoint,
} from '../../core/models/spatial.model';
import { RtspSource } from '../../core/models/stream.model';

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
  unassignedCameras = computed(() => {
    const assigned = new Set(this.cameras().map(c => c.id));
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
  private drawHandler?: (e: L.LeafletMouseEvent) => void;
  private mapInitialized = false;

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
    if (parentId) {
      this.spatialSvc.listNodeCameras(parentId).subscribe({
        next: (cams) => this.cameras.set(cams),
      });
    } else {
      this.cameras.set([]);
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

    for (const cam of this.cameras()) {
      if (cam.latitud != null && cam.longitud != null) {
        const marker = L.marker([cam.latitud, cam.longitud], {
          icon: L.divIcon({
            className: '',
            html: `<div class="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 border-2 border-white shadow-lg text-white text-xs">📹</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        }).addTo(this.map!);
        marker.bindTooltip(cam.name, { direction: 'top' });
        this.cameraMarkers.push(marker);
      }
    }
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

  // ── Camera assignment ──────────────────────────────────────────────────

  openAssignCamera(node: SpatialNode): void {
    this.selectedNodeForCamera.set(node);
    this.showAssignCamera.set(true);
  }

  assignCameraToNode(cam: RtspSource): void {
    const node = this.selectedNodeForCamera();
    if (!node) return;
    this.spatialSvc.assignCamera(node.id, cam.id).subscribe({
      next: () => {
        this.loadNodeCameras();
        this.loadAllCameras();
        this.loadNodes();
      },
    });
  }

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
}
