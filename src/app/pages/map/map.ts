import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';

import { GraphQueryService } from '../../core/services/graph-query.service';
import { StreamService } from '../../core/services/stream.service';
import { FacesService } from '../../core/services/faces.service';
import { RtspSource } from '../../core/models/stream.model';
import { ActiveSession, Cooccurrence, RouteEntry, RouteEntryWithAnomaly, SessionTier, TrackingResult, HuntResult, HuntCamera } from '../../core/models/graph.model';
import { Person } from '../../core/models/face.model';

type MapMode = 'live' | 'forensic' | 'tracking';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.html',
  styles: [`
    .map-container { height: calc(100vh - 9rem); }
    /* Fix Leaflet z-index conflict with sticky nav */
    :host ::ng-deep .leaflet-top { z-index: 400; }
    :host ::ng-deep .leaflet-pane { z-index: 300; }
    /* Custom tooltip style */
    :host ::ng-deep .leaflet-tooltip {
      background: rgba(17,24,39,0.92);
      border: 1px solid #374151;
      color: #f3f4f6;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }
    :host ::ng-deep .leaflet-tooltip-top::before { border-top-color: #374151; }
    /* Pulse animation for live sessions */
    @keyframes pulse-ring {
      0%   { transform: scale(0.8); opacity: 0.8; }
      100% { transform: scale(2.0); opacity: 0; }
    }
    .pulse-ring { animation: pulse-ring 1.8s ease-out infinite; }
    /* FOV cone animation (same as geocercas) */
    @keyframes fov-pulse {
      0%, 100% { opacity: 0.18; }
      50% { opacity: 0.30; }
    }
    :host ::ng-deep .fov-cone { animation: fov-pulse 3s ease-in-out infinite; }
  `],
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapDiv') mapDiv!: ElementRef<HTMLDivElement>;

  private graphSvc = inject(GraphQueryService);
  private streamSvc = inject(StreamService);
  private facesSvc = inject(FacesService);

  // ── State ──────────────────────────────────────────────────────────────────
  mode = signal<MapMode>('live');
  cameras = signal<RtspSource[]>([]);
  activeSessions = signal<ActiveSession[]>([]);
  route = signal<RouteEntry[]>([]);
  anomalies = signal<RouteEntryWithAnomaly[]>([]);
  cooccurrences = signal<Cooccurrence[]>([]);
  graphAvailable = signal(false);
  loadingRoute = signal(false);
  routeError = signal('');
  searchInput = signal('');
  searchedName = signal('');
  hoursBack = 24;
  windowSeconds = 180;

  // ── Forensic person dropdown ───────────────────────────────────────────
  forensicPersons = signal<Person[]>([]);
  showForensicDropdown = signal(false);
  filteredForensicPersons = computed(() => {
    const q = this.searchInput().toLowerCase().trim();
    const list = this.forensicPersons();
    if (!q) return list;
    return list.filter(p => p.name.toLowerCase().includes(q));
  });

  // ── Tracking ──────────────────────────────────────────────────────────────
  enrolledPersons = signal<Person[]>([]);
  trackedPerson = signal<Person | null>(null);
  trackingResult = signal<TrackingResult | null>(null);
  trackingFilter = signal('');
  loadingPersons = signal(false);
  showTrackingFeed = signal(false);
  trackingFeedExpanded = signal(false);
  streamSources = signal<string[]>([]);
  trackingCameraIdx = signal(-1);
  trackingFeedUrl = computed(() => {
    const idx = this.trackingCameraIdx();
    if (idx < 0) return '';
    return `${this.streamSvc.viewUrl}?camera=${idx}`;
  });
  trackingFeedCamera = computed(() => {
    const result = this.trackingResult();
    return result?.live?.[0]?.camara ?? '';
  });

  // ── Hunt (aggressive tracking) ─────────────────────────────────────────
  huntResult = signal<HuntResult | null>(null);
  huntMosaicUrl = computed(() => {
    const hunt = this.huntResult();
    const sources = this.streamSources();
    if (!hunt || hunt.cameras.length === 0 || sources.length === 0) return '';
    // Map rtsp_url → stream index
    const indices = hunt.cameras
      .map(c => sources.indexOf(c.rtsp_url))
      .filter(i => i >= 0);
    if (indices.length === 0) return '';
    if (indices.length === 1) return `${this.streamSvc.viewUrl}?camera=${indices[0]}`;
    return `${this.streamSvc.viewUrl}?cameras=${indices.join(',')}`;
  });
  huntLiveCameras = computed(() => {
    const hunt = this.huntResult();
    return hunt ? hunt.cameras.filter(c => c.reason === 'live') : [];
  });
  huntSearchCameras = computed(() => {
    const hunt = this.huntResult();
    return hunt ? hunt.cameras.filter(c => c.reason !== 'live') : [];
  });
  huntStatus = computed<'live' | 'searching' | 'idle'>(() => {
    const hunt = this.huntResult();
    if (!hunt) return 'idle';
    if (hunt.live_count > 0) return 'live';
    if (hunt.cameras.length > 0) return 'searching';
    return 'idle';
  });

  // ── Playback ───────────────────────────────────────────────────────────────
  isPlaying = signal(false);
  playbackSpeed = signal(1);  // 1× 2× 5× 10×
  currentStep = signal(-1);   // -1 = not started
  anomalyCount = signal(0);

  // ── Computed ───────────────────────────────────────────────────────────────
  camerasWithCoords = computed(() =>
    this.cameras().filter(c => c.latitud != null && c.longitud != null)
  );
  camerasNoCoords = computed(() =>
    this.cameras().filter(c => c.latitud == null || c.longitud == null)
  );
  // Interior SVG view (cameras with floor-plan coordinates)
  viewLayer = signal<'exterior' | 'interior'>('exterior');
  camerasInterior = computed(() =>
    this.cameras().filter(c => c.posicion_x != null && c.posicion_y != null)
  );
  svgViewBox = computed(() => {
    const cams = this.camerasInterior();
    if (cams.length === 0) return '0 0 800 600';
    const xs = cams.map(c => c.posicion_x!);
    const ys = cams.map(c => c.posicion_y!);
    const pad = 80;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - minX;
    const h = Math.max(...ys) + pad - minY;
    return `${minX} ${minY} ${w} ${h}`;
  });
  interiorActiveCameraNames = computed(() =>
    new Set(this.activeSessions().map(s => s.camara))
  );
  interiorCameraTier = computed(() => {
    const tierRank: Record<string, number> = { green: 2, yellow: 1, red: 0 };
    const map = new Map<string, string>();
    for (const s of this.activeSessions()) {
      const t = s.tier ?? (s.enrollado ? 'green' : 'red');
      const prev = map.get(s.camara);
      if (!prev || (tierRank[t] ?? 0) > (tierRank[prev] ?? 0)) {
        map.set(s.camara, t);
      }
    }
    return map;
  });
  interiorRouteWithCoords = computed(() => {
    const base = this.anomalies().length > 0
      ? this.anomalies()
      : this.route().map(r => ({ ...r, is_anomaly: false, prev_camara: null, gap_seconds: null } as RouteEntryWithAnomaly));
    return base
      .map(e => {
        const cam = this.cameras().find(c => c.name === e.camara);
        return { ...e, _x: cam?.posicion_x as number | undefined, _y: cam?.posicion_y as number | undefined };
      })
      .filter(e => e._x != null && e._y != null);
  });
  svgRoutePolyline = computed(() =>
    this.interiorRouteWithCoords().map(e => `${e._x},${e._y}`).join(' ')
  );
  activeEnrolled = computed(() =>
    this.activeSessions().filter(s => s.tier === 'green')
  );
  activeYellow = computed(() =>
    this.activeSessions().filter(s => s.tier === 'yellow')
  );
  activeUnknown = computed(() =>
    this.activeSessions().filter(s => !s.tier || s.tier === 'red')
  );
  livePersonNames = computed(() =>
    new Set(this.activeSessions().filter(s => s.enrollado).map(s => s.persona))
  );
  filteredPersons = computed(() => {
    const f = this.trackingFilter().toLowerCase().trim();
    const list = this.enrolledPersons();
    if (!f) return list;
    return list.filter(p => p.name.toLowerCase().includes(f));
  });
  trackingLiveCameras = computed(() => {
    const h = this.huntResult();
    return h ? h.cameras.filter(c => c.reason === 'live').map(c => c.camara) : [];
  });
  trackingRecentCameras = computed(() => {
    const h = this.huntResult();
    return h ? h.cameras.filter(c => c.reason !== 'live').map(c => c.camara) : [];
  });

  // ── Leaflet internals ──────────────────────────────────────────────────────
  private map?: L.Map;
  private cameraMarkers = new Map<string, L.CircleMarker>(); // key = camera id
  private sessionLayers: L.Layer[] = [];
  private fovLines: L.Layer[] = [];
  private fovMap = new Map<string, L.Layer>();   // cam.id → pre-built cone
  private activeFov: L.Layer | null = null;      // currently hovered cone
  showAllFov = signal(false);
  private pollTimer?: ReturnType<typeof setInterval>;

  // ── Playback internals ─────────────────────────────────────────────────────
  private movingMarker?: L.Marker;
  private playTimer?: ReturnType<typeof setTimeout>;
  private animFrame?: number;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.initMap();
    this.loadCameras();
    this.checkGraphHealth();
  }

  ngOnDestroy(): void {
    this.stopPoll();
    this.stopPlayback();
    this.map?.remove();
  }

  // ── Map init ───────────────────────────────────────────────────────────────
  private initMap(): void {
    this.map = L.map(this.mapDiv.nativeElement, {
      center: [19.4326, -99.1332],
      zoom: 16,
      zoomControl: true,
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri',
      maxZoom: 22,
    });
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 22,
    });
    street.addTo(this.map);
    L.control.layers({ 'Calles': street, 'Satélite': satellite }, {}, { position: 'topright' }).addTo(this.map);

    // Dynamic tooltip visibility based on zoom
    this.map.on('zoomend', () => this.updateTooltipVisibility());
  }

  private loadCameras(): void {
    this.streamSvc.listSources().subscribe({
      next: cams => {
        this.cameras.set(cams);
        this.renderCameraMarkers();
        this.fitMap();
        // Start live mode by default
        this.startLive();
      },
    });
  }

  private renderCameraMarkers(): void {
    this.cameraMarkers.forEach(m => m.remove());
    this.cameraMarkers.clear();
    this.fovLines.forEach(l => l.remove());
    this.fovLines = [];
    this.fovMap.clear();
    this.activeFov = null;

    for (const cam of this.camerasWithCoords()) {
      const marker = L.circleMarker([cam.latitud!, cam.longitud!], {
        radius: 9,
        fillColor: '#3b82f6',
        color: '#1d4ed8',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      })
        .bindTooltip(cam.name, {
          permanent: false,
          direction: 'top',
          offset: [0, -12],
        })
        .addTo(this.map!);

      marker.bindPopup(this.buildCameraPopup(cam));
      this.cameraMarkers.set(cam.id, marker);

      // Build FOV cone (not added to map yet — shown on hover or toggle)
      if (cam.azimuth != null) {
        const cone = this.buildFovCone(cam);
        if (cone) {
          this.fovMap.set(cam.id, cone);
          if (this.showAllFov()) cone.addTo(this.map!);
        }
      }

      // Hover → show/hide individual cone
      marker.on('mouseover', () => {
        if (this.showAllFov()) return;
        const c = this.fovMap.get(cam.id);
        if (c) { c.addTo(this.map!); this.activeFov = c; }
      });
      marker.on('mouseout', () => {
        if (this.showAllFov()) return;
        if (this.activeFov) { this.activeFov.remove(); this.activeFov = null; }
      });
    }

    this.updateTooltipVisibility();
  }

  /** Build FOV cone polygon — geocercas style (smooth arc, 24 steps, 2.5D range). */
  private buildFovCone(cam: RtspSource): L.Layer | null {
    if (cam.latitud == null || cam.longitud == null || cam.azimuth == null) return null;

    const DEG = Math.PI / 180;
    const fov   = cam.fov_angulo ?? 70;
    const half  = fov / 2;
    const steps = 24;

    // Compute visual range in degrees (~metres / 111111)
    let rangeDeg: number;
    if (cam.inclinacion_angulo != null && cam.inclinacion_angulo > 2) {
      const h    = cam.altura_m ?? 3;
      const tilt = cam.inclinacion_angulo * DEG;
      const vfov = (fov / 1.778) * DEG;
      const tLow = tilt - vfov / 2;
      const dFar = tLow > 0.05 ? Math.min(h / Math.tan(tLow), 60) : 35;
      rangeDeg = dFar / 111111;
    } else {
      rangeDeg = 0.00035;  // ~35m default, same as geocercas
    }

    const pts: L.LatLngExpression[] = [[cam.latitud, cam.longitud]];
    for (let i = 0; i <= steps; i++) {
      const angle = cam.azimuth - half + (fov * i) / steps;
      const rad = ((90 - angle) * Math.PI) / 180;
      const dx = rangeDeg * Math.cos(rad);
      const dy = rangeDeg * Math.sin(rad);
      pts.push([cam.latitud + dy, cam.longitud + dx]);
    }
    pts.push([cam.latitud, cam.longitud]);

    return L.polygon(pts, {
      color: '#ef4444',
      weight: 1,
      fillColor: '#ef4444',
      fillOpacity: 0.18,
      className: 'fov-cone',
      interactive: false,
    });
  }

  toggleAllFov(): void {
    this.showAllFov.update(v => !v);
    if (this.showAllFov()) {
      this.fovMap.forEach(c => c.addTo(this.map!));
    } else {
      this.fovMap.forEach(c => c.remove());
    }
  }

  private updateTooltipVisibility(): void {
    if (!this.map) return;
    const zoom = this.map.getZoom();
    const show = zoom >= 19;
    this.cameraMarkers.forEach(m => {
      if (show) m.openTooltip(); else m.closeTooltip();
    });
  }

  private buildCameraPopup(cam: RtspSource): string {
    const piso = cam.piso != null ? `Piso ${cam.piso}` : '';
    const fov = cam.fov_angulo != null ? `FOV ${cam.fov_angulo}°` : '';
    const az = cam.azimuth != null ? `Azimuth ${cam.azimuth}°` : '';
    const meta = [piso, fov, az].filter(Boolean).join(' · ');
    return `<div class="text-xs">
      <p class="font-bold text-sm mb-1">${cam.name}</p>
      ${meta ? `<p class="text-gray-500">${meta}</p>` : ''}
      ${cam.observation ? `<p class="italic">${cam.observation}</p>` : ''}
    </div>`;
  }

  private fitMap(): void {
    const coords = this.camerasWithCoords();
    if (coords.length === 0) return;
    if (coords.length === 1) {
      this.map?.setView([coords[0].latitud!, coords[0].longitud!], 17);
      return;
    }
    const bounds = L.latLngBounds(
      coords.map(c => [c.latitud!, c.longitud!] as [number, number])
    );
    this.map?.fitBounds(bounds, { padding: [60, 60] });
  }

  // ── Mode switching ─────────────────────────────────────────────────────────
  setMode(m: MapMode): void {
    this.stopPoll();
    this.clearSessionLayers();
    this.resetMarkerColors();
    this.mode.set(m);
    if (m === 'live') this.startLive();
    if (m === 'tracking') this.loadEnrolledPersons();
    if (m === 'forensic') this.loadForensicPersons();
  }

  // ── LIVE MODE ──────────────────────────────────────────────────────────────
  private startLive(): void {
    this.pollLive();
    this.pollTimer = setInterval(() => this.pollLive(), 3000);
  }

  private pollLive(): void {
    this.graphSvc.getActive().subscribe({
      next: sessions => {
        this.activeSessions.set(sessions);
        this.renderLiveSessions(sessions);
        this.graphAvailable.set(true);
      },
      error: () => this.graphAvailable.set(false),
    });
  }

  private renderLiveSessions(sessions: ActiveSession[]): void {
    this.clearSessionLayers();
    this.resetMarkerColors();

    // Build a map of camera name → best tier (green > yellow > red)
    const tierRank: Record<string, number> = { green: 2, yellow: 1, red: 0 };
    const camBestTier = new Map<string, SessionTier>();
    for (const s of sessions) {
      const t = s.tier ?? (s.enrollado ? 'green' : 'red');
      const prev = camBestTier.get(s.camara);
      if (!prev || (tierRank[t] ?? 0) > (tierRank[prev] ?? 0)) {
        camBestTier.set(s.camara, t);
      }
    }

    const tierColors: Record<SessionTier, { fill: string; stroke: string; bg: string }> = {
      green:  { fill: '#22c55e', stroke: '#15803d', bg: 'rgba(34,197,94,0.9)' },
      yellow: { fill: '#f59e0b', stroke: '#d97706', bg: 'rgba(245,158,11,0.88)' },
      red:    { fill: '#ef4444', stroke: '#dc2626', bg: 'rgba(239,68,68,0.88)' },
    };

    for (const cam of this.camerasWithCoords()) {
      const tier = camBestTier.get(cam.name);
      if (!tier) continue;

      const marker = this.cameraMarkers.get(cam.id);
      if (!marker) continue;
      const colors = tierColors[tier];

      // Highlight active camera with tier color
      marker.setStyle({ fillColor: colors.fill, color: colors.stroke });

      // Outer pulse ring
      const pulse = L.circleMarker([cam.latitud!, cam.longitud!], {
        radius: 20,
        fillColor: colors.fill,
        color: colors.fill,
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(this.map!);
      this.sessionLayers.push(pulse);

      // Person label(s) on this camera
      const here = sessions.filter(s => s.camara === cam.name);
      const label = here
        .map(s => {
          const t = s.tier ?? (s.enrollado ? 'green' : 'red');
          if (t === 'green') return s.persona;
          if (t === 'yellow') return `~${s.persona.replace(/^~/, '')}`;
          return '?';
        })
        .slice(0, 3)
        .join(', ');
      if (label) {
        const icon = L.divIcon({
          html: `<div style="background:${colors.bg};color:#000;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">${label}</div>`,
          className: '',
          iconAnchor: [0, 28],
        });
        const labelMarker = L.marker([cam.latitud!, cam.longitud!], { icon }).addTo(this.map!);
        this.sessionLayers.push(labelMarker);
      }
    }
  }

  // ── FORENSIC MODE ──────────────────────────────────────────────────────────
  private loadForensicPersons(): void {
    this.facesSvc.listPersons().subscribe({
      next: res => this.forensicPersons.set(res.persons),
      error: () => this.forensicPersons.set([]),
    });
  }

  selectForensicPerson(person: Person): void {
    this.searchInput.set(person.name);
    this.showForensicDropdown.set(false);
    this.searchRoute();
  }

  searchRoute(): void {
    const name = this.searchInput().trim();
    if (!name) return;
    this.showForensicDropdown.set(false);
    this.searchedName.set(name);
    this.loadingRoute.set(true);
    this.routeError.set('');
    this.route.set([]);
    this.anomalies.set([]);
    this.cooccurrences.set([]);
    this.stopPlayback();
    this.currentStep.set(-1);
    this.clearSessionLayers();
    this.resetMarkerColors();

    // Load route + anomalies + co-occurrences
    this.graphSvc.getRoute(name, this.hoursBack).subscribe({
      next: entries => {
        this.route.set(entries);
        this.renderForensicRoute(entries);
        this.loadingRoute.set(false);

        // Anomaly detection (enriched route with topology check)
        this.graphSvc.getAnomalies(name, this.hoursBack).subscribe({
          next: enriched => {
            this.anomalies.set(enriched);
            this.anomalyCount.set(enriched.filter(e => e.is_anomaly).length);
            this.overlayAnomalyMarkers(enriched);
          },
        });

        // Co-occurrences
        this.graphSvc.getCooccurrences(name, this.windowSeconds, this.hoursBack).subscribe({
          next: co => this.cooccurrences.set(co),
        });
      },
      error: err => {
        this.loadingRoute.set(false);
        this.routeError.set(
          err.status === 404
            ? `No se encontraron sesiones para "${name}".`
            : 'Error al consultar el grafo.'
        );
      },
    });
  }

  private renderForensicRoute(entries: RouteEntry[]): void {
    this.clearSessionLayers();
    this.resetMarkerColors();

    const coords: [number, number][] = [];

    const tierBg: Record<string, string> = {
      green: '#22c55e', yellow: '#f59e0b', red: '#ef4444',
    };
    const tierBorder: Record<string, string> = {
      green: '#15803d', yellow: '#92400e', red: '#991b1b',
    };

    entries.forEach((entry, idx) => {
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) return;

      coords.push([cam.latitud, cam.longitud]);

      const tier = entry.tier ?? (entry.enrollado ? 'green' : 'red');
      const bg = tierBg[tier] ?? '#f59e0b';
      const border = tierBorder[tier] ?? '#92400e';

      // Highlight camera on map
      this.cameraMarkers.get(cam.id)?.setStyle({
        fillColor: bg,
        color: border,
      });

      // Numbered marker with tier color
      const numIcon = L.divIcon({
        html: `<div style="background:${bg};color:#000;border-radius:50%;width:22px;height:22px;
               display:flex;align-items:center;justify-content:center;font-weight:800;
               font-size:11px;border:2px solid ${border};box-shadow:0 2px 4px rgba(0,0,0,.5)">${idx + 1}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const tierLabel = tier === 'green' ? 'Identificado' : tier === 'yellow' ? 'Sospecha' : 'Desconocido';
      const m = L.marker([cam.latitud, cam.longitud], { icon: numIcon })
        .bindPopup(
          `<b>${idx + 1}. ${cam.name}</b><br/>
           <span style="font-size:11px">
             ${this.formatTs(entry.inicio)}<br/>
             Confianza: ${(entry.confianza * 100).toFixed(0)}%<br/>
             Nivel: <span style="color:${bg};font-weight:700">${tierLabel}</span><br/>
             Duración: ${this.formatDuration(entry.duracion_s)}
           </span>`
        )
        .addTo(this.map!);
      this.sessionLayers.push(m);
    });

    // Polyline connecting route
    if (coords.length > 1) {
      const line = L.polyline(coords, {
        color: '#f59e0b',
        weight: 3,
        opacity: 0.85,
        dashArray: '10 5',
      }).addTo(this.map!);
      this.sessionLayers.push(line);
      this.map?.fitBounds(line.getBounds(), { padding: [60, 60] });
    } else if (coords.length === 1) {
      this.map?.setView(coords[0], 17);
    }
  }

  jumpToSession(entry: RouteEntry): void {
    const cam = this.cameras().find(c => c.name === entry.camara);
    if (!cam || cam.latitud == null || cam.longitud == null) return;
    this.map?.setView([cam.latitud, cam.longitud], 18, { animate: true });
  }

  // ── TRACKING MODE ──────────────────────────────────────────────────────────
  private loadEnrolledPersons(): void {
    this.loadingPersons.set(true);
    this.facesSvc.listPersons().subscribe({
      next: res => {
        this.enrolledPersons.set(res.persons);
        this.loadingPersons.set(false);
      },
      error: () => this.loadingPersons.set(false),
    });
  }

  selectPersonToTrack(person: Person): void {
    this.trackedPerson.set(person);
    this.trackingResult.set(null);
    this.clearSessionLayers();
    this.resetMarkerColors();
    this.startTracking();
  }

  stopTracking(): void {
    this.stopPoll();
    this.trackedPerson.set(null);
    this.trackingResult.set(null);
    this.huntResult.set(null);
    this.showTrackingFeed.set(false);
    this.trackingFeedExpanded.set(false);
    this.trackingCameraIdx.set(-1);
    this.clearSessionLayers();
    this.resetMarkerColors();
  }

  private startTracking(): void {
    // Fetch source list once so we can map rtsp_url → camera index
    this.streamSvc.getStatus().subscribe({
      next: s => this.streamSources.set(s.sources),
      error: () => this.streamSources.set([]),
    });
    this.pollTracking();
    this.pollTimer = setInterval(() => this.pollTracking(), 2000);
  }

  private pollTracking(): void {
    const person = this.trackedPerson();
    if (!person) return;
    // Refresh active sessions for map overlay
    this.graphSvc.getActive().subscribe({
      next: sessions => this.activeSessions.set(sessions),
    });
    // Use hunt endpoint for aggressive tracking
    this.graphSvc.getHunt(person.name).subscribe({
      next: hunt => {
        this.huntResult.set(hunt);
        this.graphAvailable.set(true);

        // Also build a trackingResult for map rendering
        const live = hunt.cameras.filter(c => c.reason === 'live').map(c => ({
          camara: c.camara, rtsp_url: c.rtsp_url, inicio: 0,
          fin: null, duracion_s: null, confianza: c.confianza, tier: c.tier as SessionTier,
        }));
        const recent = hunt.cameras.filter(c => c.reason !== 'live').map(c => ({
          camara: c.camara, rtsp_url: c.rtsp_url, inicio: 0,
          fin: null, duracion_s: null, confianza: c.confianza, tier: c.tier as SessionTier,
        }));
        this.trackingResult.set({ persona: hunt.persona, live, recent });
        this.renderTracking({ persona: hunt.persona, live, recent });

        // Auto-show mosaic feed when there are cameras to watch
        if (hunt.cameras.length > 0) {
          // For camera index, use the first live camera if available
          if (hunt.live_count > 0) {
            const liveUrl = hunt.cameras[0].rtsp_url;
            const idx = this.streamSources().indexOf(liveUrl);
            if (idx !== this.trackingCameraIdx()) this.trackingCameraIdx.set(idx);
          } else {
            this.trackingCameraIdx.set(-1);
          }
          if (!this.showTrackingFeed()) this.showTrackingFeed.set(true);
        } else {
          if (this.showTrackingFeed()) this.showTrackingFeed.set(false);
        }
      },
      error: () => this.graphAvailable.set(false),
    });
  }

  private renderTracking(result: TrackingResult): void {
    this.clearSessionLayers();
    this.resetMarkerColors();

    const tierColors: Record<SessionTier, { fill: string; stroke: string; bg: string }> = {
      green:  { fill: '#22c55e', stroke: '#15803d', bg: 'rgba(34,197,94,0.92)' },
      yellow: { fill: '#f59e0b', stroke: '#d97706', bg: 'rgba(245,158,11,0.88)' },
      red:    { fill: '#ef4444', stroke: '#dc2626', bg: 'rgba(239,68,68,0.88)' },
    };

    // 1) Render LIVE cameras with tier-based colors
    for (const entry of result.live) {
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) continue;
      const tier: SessionTier = entry.tier ?? 'green';
      const colors = tierColors[tier];
      const marker = this.cameraMarkers.get(cam.id);
      if (marker) marker.setStyle({ fillColor: colors.fill, color: colors.stroke });

      // Pulse
      const pulse = L.circleMarker([cam.latitud, cam.longitud], {
        radius: 22,
        fillColor: colors.fill,
        color: colors.fill,
        weight: 1,
        fillOpacity: 0.15,
      }).addTo(this.map!);
      this.sessionLayers.push(pulse);

      // Label
      const conf = entry.confianza != null ? ` ${(entry.confianza * 100).toFixed(0)}%` : '';
      const icon = L.divIcon({
        html: `<div style="background:${colors.bg};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">EN VIVO${conf}</div>`,
        className: '',
        iconAnchor: [0, 30],
      });
      const lbl = L.marker([cam.latitud, cam.longitud], { icon }).addTo(this.map!);
      this.sessionLayers.push(lbl);
    }

    // 2) Render RECENT cameras with tier-based colors
    for (const entry of result.recent) {
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) continue;
      const tier: SessionTier = entry.tier ?? 'yellow';
      const colors = tierColors[tier];
      const marker = this.cameraMarkers.get(cam.id);
      if (marker) marker.setStyle({ fillColor: colors.fill, color: colors.stroke });

      const conf = entry.confianza != null ? `${(entry.confianza * 100).toFixed(0)}%` : '';
      const icon = L.divIcon({
        html: `<div style="background:${colors.bg};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">${conf} · ${this.formatTs(entry.fin ?? entry.inicio)}</div>`,
        className: '',
        iconAnchor: [0, 30],
      });
      const lbl = L.marker([cam.latitud, cam.longitud], { icon }).addTo(this.map!);
      this.sessionLayers.push(lbl);
    }

    // Auto-center on the best camera: live first, then recent
    const bestCamName = result.live[0]?.camara ?? result.recent[0]?.camara;
    if (bestCamName) {
      const cam = this.cameras().find(c => c.name === bestCamName);
      if (cam?.latitud != null && cam?.longitud != null) {
        this.map?.panTo([cam.latitud, cam.longitud], { animate: true, duration: 0.5 });
      }
    }
  }

  personPhotoUrl(person: Person): string {
    return this.facesSvc.photoUrl(person.id);
  }

  toggleTrackingFeed(): void {
    this.showTrackingFeed.update(v => !v);
    if (!this.showTrackingFeed()) this.trackingFeedExpanded.set(false);
  }

  toggleFeedExpanded(): void {
    this.trackingFeedExpanded.update(v => !v);
  }

  jumpToCamera(cameraName: string): void {
    const cam = this.cameras().find(c => c.name === cameraName);
    if (!cam || cam.latitud == null || cam.longitud == null) return;
    this.map?.setView([cam.latitud, cam.longitud], 18, { animate: true });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private clearSessionLayers(): void {
    this.sessionLayers.forEach(l => l.remove());
    this.sessionLayers = [];
  }

  private resetMarkerColors(): void {
    this.cameraMarkers.forEach(m =>
      m.setStyle({ fillColor: '#3b82f6', color: '#1d4ed8' })
    );
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private checkGraphHealth(): void {
    this.graphSvc.getHealth().subscribe({
      next: h => this.graphAvailable.set(h.memgraph),
      error: () => this.graphAvailable.set(false),
    });
  }

  // ── Anomaly overlay ────────────────────────────────────────────────────────
  private overlayAnomalyMarkers(entries: RouteEntryWithAnomaly[]): void {
    for (const entry of entries) {
      if (!entry.is_anomaly) continue;
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) continue;

      const icon = L.divIcon({
        html: `<div title="Salto anómalo desde ${entry.prev_camara}"
                    style="background:#ef4444;color:#fff;border-radius:50%;width:20px;height:20px;
                           display:flex;align-items:center;justify-content:center;font-weight:900;
                           font-size:13px;border:2px solid #991b1b;box-shadow:0 0 6px #ef4444">!</div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const m = L.marker([cam.latitud, cam.longitud], { icon })
        .bindPopup(
          `<b style="color:#ef4444">⚠ Salto anómalo</b><br/>
           <span style="font-size:11px">
             <b>${entry.prev_camara}</b> → <b>${entry.camara}</b><br/>
             Sin adyacencia definida en la topología.<br/>
             Gap: ${this.formatDuration(entry.gap_seconds)}
           </span>`
        )
        .addTo(this.map!);
      this.sessionLayers.push(m);
    }
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  togglePlayback(): void {
    if (this.isPlaying()) {
      this.pausePlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    const route = this.route();
    if (route.length < 2) return;

    this.isPlaying.set(true);
    const step = this.currentStep() < 0 || this.currentStep() >= route.length - 1
      ? 0
      : this.currentStep();
    this.playStep(step);
  }

  private playStep(idx: number): void {
    const route = this.route();
    if (idx >= route.length) {
      this.pausePlayback();
      return;
    }

    this.currentStep.set(idx);
    this.moveMarkerToStep(idx);

    if (idx < route.length - 1) {
      const gap = route[idx + 1].inicio - route[idx].inicio; // seconds
      const delay = Math.max(600, Math.min((gap * 1000) / this.playbackSpeed(), 4000));
      this.playTimer = setTimeout(() => this.playStep(idx + 1), delay);
    } else {
      // Reached the end
      setTimeout(() => this.pausePlayback(), 800);
    }
  }

  pausePlayback(): void {
    this.isPlaying.set(false);
    if (this.playTimer) clearTimeout(this.playTimer);
  }

  stopPlayback(): void {
    this.pausePlayback();
    this.movingMarker?.remove();
    this.movingMarker = undefined;
    this.currentStep.set(-1);
  }

  stepBack(): void {
    const next = Math.max(0, this.currentStep() - 1);
    this.pausePlayback();
    this.currentStep.set(next);
    this.moveMarkerToStep(next);
  }

  stepForward(): void {
    const next = Math.min(this.route().length - 1, this.currentStep() + 1);
    this.pausePlayback();
    this.currentStep.set(next);
    this.moveMarkerToStep(next);
  }

  setStep(idx: number): void {
    this.pausePlayback();
    this.currentStep.set(idx);
    this.moveMarkerToStep(idx);
  }

  private moveMarkerToStep(idx: number): void {
    const route = this.route();
    if (idx < 0 || idx >= route.length) return;

    const entry = route[idx];
    const cam = this.cameras().find(c => c.name === entry.camara);
    if (!cam || cam.latitud == null || cam.longitud == null) return;

    const latlng: [number, number] = [cam.latitud, cam.longitud];

    if (!this.movingMarker) {
      const icon = L.divIcon({
        html: `<div style="background:#22d3ee;border:3px solid #0891b2;border-radius:50%;
                           width:18px;height:18px;box-shadow:0 0 10px #22d3ee88"></div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      this.movingMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(this.map!);
    }

    // Animate marker smoothly from current to target
    const from = this.movingMarker.getLatLng();
    const to = L.latLng(latlng);
    const startTime = performance.now();
    const duration = 400;

    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      this.movingMarker?.setLatLng([lat, lng]);
      if (t < 1) this.animFrame = requestAnimationFrame(tick);
    };
    this.animFrame = requestAnimationFrame(tick);

    this.map?.panTo(latlng, { animate: true, duration: 0.4 });
  }

  switchView(layer: 'exterior' | 'interior'): void {
    this.viewLayer.set(layer);
  }

  fovEndPoint(cam: RtspSource): { x: number; y: number } | null {
    if (cam.posicion_x == null || cam.posicion_y == null || cam.azimuth == null) return null;
    const rad = ((cam.azimuth - 90) * Math.PI) / 180;
    const dist = 50;
    return { x: cam.posicion_x + dist * Math.cos(rad), y: cam.posicion_y + dist * Math.sin(rad) };
  }

  formatTs(ts: number): string {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatDuration(seconds: number | null): string {
    if (seconds == null) return 'activo';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  formatDiff(s: number): string {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
}
