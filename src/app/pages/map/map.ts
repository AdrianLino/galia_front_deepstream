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
import { ActiveSession, Cooccurrence, RouteEntry, RouteEntryWithAnomaly, TrackingResult } from '../../core/models/graph.model';
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
  searchInput = '';
  searchedName = signal('');
  hoursBack = 24;
  windowSeconds = 180;

  // ── Tracking ──────────────────────────────────────────────────────────────
  enrolledPersons = signal<Person[]>([]);
  trackedPerson = signal<Person | null>(null);
  trackingResult = signal<TrackingResult | null>(null);
  trackingFilter = '';
  loadingPersons = signal(false);

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
    this.activeSessions().filter(s => s.enrollado)
  );
  activeUnknown = computed(() =>
    this.activeSessions().filter(s => !s.enrollado)
  );
  filteredPersons = computed(() => {
    const f = this.trackingFilter.toLowerCase().trim();
    const list = this.enrolledPersons();
    if (!f) return list;
    return list.filter(p => p.name.toLowerCase().includes(f));
  });
  trackingLiveCameras = computed(() => {
    const r = this.trackingResult();
    return r ? r.live.map(c => c.camara) : [];
  });
  trackingRecentCameras = computed(() => {
    const r = this.trackingResult();
    return r ? r.recent.map(c => c.camara) : [];
  });

  // ── Leaflet internals ──────────────────────────────────────────────────────
  private map?: L.Map;
  private cameraMarkers = new Map<string, L.CircleMarker>(); // key = camera id
  private sessionLayers: L.Layer[] = [];
  private fovLines: L.Layer[] = [];
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
          permanent: true,
          direction: 'top',
          offset: [0, -12],
        })
        .addTo(this.map!);

      marker.bindPopup(this.buildCameraPopup(cam));
      this.cameraMarkers.set(cam.id, marker);

      // FOV direction line
      if (cam.azimuth != null) {
        const line = this.buildFovLine(cam);
        if (line) this.fovLines.push(line);
      }
    }
  }

  private buildFovLine(cam: RtspSource): L.Polyline | null {
    if (cam.latitud == null || cam.longitud == null || cam.azimuth == null) return null;
    // Convert azimuth (0=North, clockwise) to math angle
    const rad = ((cam.azimuth - 90) * Math.PI) / 180;
    const dist = 0.00025; // ~25 m in degrees
    const endLat = cam.latitud + dist * Math.sin(rad) * -1;
    const endLng = cam.longitud + dist * Math.cos(rad);
    return L.polyline(
      [[cam.latitud, cam.longitud], [endLat, endLng]],
      { color: '#60a5fa', weight: 2, opacity: 0.55, dashArray: '5 4' }
    ).addTo(this.map!);
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

    // Build a set of camera names that are currently active
    const activeNames = new Set(sessions.map(s => s.camara));

    for (const cam of this.camerasWithCoords()) {
      if (!activeNames.has(cam.name)) continue;

      const marker = this.cameraMarkers.get(cam.id);
      if (!marker) continue;

      // Highlight active camera
      marker.setStyle({ fillColor: '#22c55e', color: '#15803d' });

      // Outer pulse ring
      const pulse = L.circleMarker([cam.latitud!, cam.longitud!], {
        radius: 20,
        fillColor: '#22c55e',
        color: '#22c55e',
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(this.map!);
      this.sessionLayers.push(pulse);

      // Person label(s) on this camera
      const here = sessions.filter(s => s.camara === cam.name);
      const label = here
        .map(s => s.enrollado ? s.persona : '?')
        .slice(0, 3)
        .join(', ');
      if (label) {
        const icon = L.divIcon({
          html: `<div style="background:rgba(34,197,94,0.9);color:#000;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">${label}</div>`,
          className: '',
          iconAnchor: [0, 28],
        });
        const labelMarker = L.marker([cam.latitud!, cam.longitud!], { icon }).addTo(this.map!);
        this.sessionLayers.push(labelMarker);
      }
    }
  }

  // ── FORENSIC MODE ──────────────────────────────────────────────────────────
  searchRoute(): void {
    const name = this.searchInput.trim();
    if (!name) return;
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

    entries.forEach((entry, idx) => {
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) return;

      coords.push([cam.latitud, cam.longitud]);

      // Highlight camera on map
      this.cameraMarkers.get(cam.id)?.setStyle({
        fillColor: '#f59e0b',
        color: '#d97706',
      });

      // Numbered marker
      const numIcon = L.divIcon({
        html: `<div style="background:#f59e0b;color:#000;border-radius:50%;width:22px;height:22px;
               display:flex;align-items:center;justify-content:center;font-weight:800;
               font-size:11px;border:2px solid #92400e;box-shadow:0 2px 4px rgba(0,0,0,.5)">${idx + 1}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const m = L.marker([cam.latitud, cam.longitud], { icon: numIcon })
        .bindPopup(
          `<b>${idx + 1}. ${cam.name}</b><br/>
           <span style="font-size:11px">
             ${this.formatTs(entry.inicio)}<br/>
             Confianza: ${(entry.confianza * 100).toFixed(0)}%<br/>
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
    this.clearSessionLayers();
    this.resetMarkerColors();
  }

  private startTracking(): void {
    this.pollTracking();
    this.pollTimer = setInterval(() => this.pollTracking(), 3000);
  }

  private pollTracking(): void {
    const person = this.trackedPerson();
    if (!person) return;
    this.graphSvc.getTracking(person.name).subscribe({
      next: result => {
        this.trackingResult.set(result);
        this.renderTracking(result);
        this.graphAvailable.set(true);
      },
      error: () => this.graphAvailable.set(false),
    });
  }

  private renderTracking(result: TrackingResult): void {
    this.clearSessionLayers();
    this.resetMarkerColors();

    // 1) Render LIVE cameras (green — person is here right now)
    for (const entry of result.live) {
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) continue;
      const marker = this.cameraMarkers.get(cam.id);
      if (marker) marker.setStyle({ fillColor: '#22c55e', color: '#15803d' });

      // Pulse
      const pulse = L.circleMarker([cam.latitud, cam.longitud], {
        radius: 22,
        fillColor: '#22c55e',
        color: '#22c55e',
        weight: 1,
        fillOpacity: 0.15,
      }).addTo(this.map!);
      this.sessionLayers.push(pulse);

      // Label
      const conf = entry.confianza != null ? ` ${(entry.confianza * 100).toFixed(0)}%` : '';
      const icon = L.divIcon({
        html: `<div style="background:rgba(34,197,94,0.92);color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">EN VIVO${conf}</div>`,
        className: '',
        iconAnchor: [0, 30],
      });
      const lbl = L.marker([cam.latitud, cam.longitud], { icon }).addTo(this.map!);
      this.sessionLayers.push(lbl);
    }

    // 2) Render RECENT cameras (amber — last seen, sorted by confidence)
    for (const entry of result.recent) {
      const cam = this.cameras().find(c => c.name === entry.camara);
      if (!cam || cam.latitud == null || cam.longitud == null) continue;
      const marker = this.cameraMarkers.get(cam.id);
      if (marker) marker.setStyle({ fillColor: '#f59e0b', color: '#d97706' });

      const conf = entry.confianza != null ? `${(entry.confianza * 100).toFixed(0)}%` : '';
      const icon = L.divIcon({
        html: `<div style="background:rgba(245,158,11,0.88);color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">${conf} · ${this.formatTs(entry.fin ?? entry.inicio)}</div>`,
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
