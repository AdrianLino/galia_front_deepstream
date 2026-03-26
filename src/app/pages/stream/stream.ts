import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import '@lottiefiles/lottie-player';
import * as L from 'leaflet';
import { StreamService } from '../../core/services/stream.service';
import { AlertService } from '../../core/services/alert.service';
import { FaceSidebarComponent } from '../../shared/face-sidebar/face-sidebar.component';
import {
  StreamStatusResponse,
  RtspSource,
  RtspSourceCreate,
} from '../../core/models/stream.model';
import { FaceDisplayMode } from '../../core/models/alert.model';

export type ViewMode = 'mosaic' | 'single' | 'paged';
type HeightPreset = 'basement' | 'ceiling' | 'wall-high' | 'wall-mid' | 'turnstile' | 'custom';

@Component({
  selector: 'app-stream',
  imports: [CommonModule, FormsModule, FaceSidebarComponent],
  templateUrl: './stream.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    @keyframes fadeIn {
      0% { opacity: 0; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    .animate-zoom-fade {
      animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .animate-shimmer {
      animation: shimmer 2s infinite;
    }
  `]
})
export class StreamComponent implements OnInit, OnDestroy {
  private streamService = inject(StreamService);
  readonly alertService = inject(AlertService);

  /** Face display mode: realtime (OSD names), hybrid (boxes + list), list (list only) */
  readonly faceDisplayMode = this.alertService.faceDisplayMode;
  readonly showFaceSidebar = computed(() => this.faceDisplayMode() !== 'realtime' && this.showStream());
  readonly faceDisplayModes: Array<{ value: FaceDisplayMode; label: string; icon: string }> = [
    { value: 'realtime', label: 'Nombres en Video', icon: 'TV' },
    { value: 'hybrid', label: 'Híbrido', icon: 'HY' },
    { value: 'list', label: 'Solo Lista', icon: 'LI' },
  ];

  @ViewChild('addMapDiv') addMapDiv?: ElementRef<HTMLDivElement>;
  @ViewChild('largeMapDiv') largeMapDiv?: ElementRef<HTMLDivElement>;
  @ViewChild('interiorPicker') interiorPicker?: ElementRef<HTMLDivElement>;

  // ── Layout state ───────────────────────────────────────────────────────────
  sidebarCollapsed = signal(false);
  videoFullscreen = signal(false);
  @ViewChild('videoContainer') videoContainer?: ElementRef<HTMLDivElement>;

  // ── Pipeline state ────────────────────────────────────────────────────────
  status = signal<StreamStatusResponse | null>(null);
  loading = signal(false);
  loadingProgress = signal(0);
  loadingPhase = signal(0); // 0=preparando, 1=motores, 2=conectando, 3=listo
  loadingTip = signal('');
  private progressInterval?: ReturnType<typeof setInterval>;
  private tipInterval?: ReturnType<typeof setInterval>;

  readonly loadingPhases = [
    { label: 'Preparando pipeline' },
    { label: 'Cargando motores IA' },
    { label: 'Conectando cámaras' },
    { label: 'Listo' },
  ];

  private readonly tips = [
    'El motor TensorRT optimiza la inferencia para tu GPU',
    'Puedes seleccionar cámaras individuales después de iniciar',
    'El modo paginado se activa con más de 16 cámaras',
    'Face Recognition detecta rostros en tiempo real',
    'Usa pantalla completa para mejor visibilidad',
    'El panel lateral se puede ocultar para más espacio',
    'Los modelos se cargan una sola vez en memoria GPU',
    'Puedes cambiar entre vista mosaico y cámara individual',
  ];
  message = signal<string | null>(null);
  showStream = signal(false);
  streamConnecting = signal(false);
  streamRevision = signal(0);
  /** Sources count from the start() response — drives cameraIndices independently of status() */
  streamSourcesCount = signal(0);
  viewMode = signal<ViewMode>('mosaic');
  selectedCamera = signal<number>(0);
  outputMode: 'mjpeg' | 'rtsp' | 'display' = 'mjpeg';

  // ── Paged mosaic ───────────────────────────────────────────────────────
  mosaicPage = signal(1);
  readonly mosaicPerPage = 16;
  mosaicTotalPages = signal(1);
  mosaicPageNumbers = computed(() =>
    Array.from({ length: this.mosaicTotalPages() }, (_, i) => i + 1)
  );

  readonly viewUrl = this.streamService.viewUrl;

  private retryTimer?: ReturnType<typeof setTimeout>;
  private singleRetryTimer?: ReturnType<typeof setTimeout>;
  private switchDebounceTimer?: ReturnType<typeof setTimeout>;

  // ── Saved RTSP sources ────────────────────────────────────────────────────
  sources = signal<RtspSource[]>([]);
  sourcesLoading = signal(false);
  sourcesError = signal<string | null>(null);

  /** IDs of sources currently selected to stream */
  selectedIds = signal<Set<string>>(new Set());

  // Search & pagination
  searchQuery = signal('');
  readonly pageSize = 20;
  currentPage = signal(1);

  filteredSources = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.sources();
    return this.sources().filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rtsp_url.toLowerCase().includes(q) ||
        (s.observation ?? '').toLowerCase().includes(q) ||
        (s.group_name ?? '').toLowerCase().includes(q)
    );
  });

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSources().length / this.pageSize))
  );

  pagedSources = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredSources().slice(start, start + this.pageSize);
  });

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  groupedSources = computed(() => {
    const map = new Map<string, RtspSource[]>();
    // Group the paginated sources, not the entire filtered list, to avoid massive DOM rendering
    for (const src of this.pagedSources()) {
      const key = src.group_name?.trim() || 'Sin grupo';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(src);
    }
    return Array.from(map.entries()).map(([name, cameras]) => ({ name, cameras }));
  });

  // Add-source form
  showAddForm = signal(false);
  showAddFullscreen = signal(false);
  showLargeMap = signal(false);
  newName = '';
  newRtsp = '';
  newObservation = '';
  newGroupName = '';
  newLatitud: number | null = null;
  newLongitud: number | null = null;
  newPosX: number | null = null;
  newPosY: number | null = null;
  newAzimuth: number | null = null;
  newInclinacionAngulo: number | null = null;
  newFovAngulo: number | null = null;
  newPiso: number | null = null;
  newAlturaM: number | null = null;
  newHeightPreset: HeightPreset = 'ceiling';
  addError = signal<string | null>(null);
  addLoading = signal(false);

  // Editing
  editingId = signal<string | null>(null);
  editName = '';
  editRtsp = '';
  editObservation = '';
  editGroupName = '';
  editLatitud: number | null = null;
  editLongitud: number | null = null;
  editPosX: number | null = null;
  editPosY: number | null = null;
  editAzimuth: number | null = null;
  editInclinacionAngulo: number | null = null;
  editFovAngulo: number | null = null;
  editPiso: number | null = null;
  editAlturaM: number | null = null;
  editError = signal<string | null>(null);
  editLoading = signal(false);

  // Groups
  expandedGroups = signal<Set<string>>(new Set());

  // Add-form map helpers
  private addMap?: L.Map;
  private addMapMarker?: L.CircleMarker;
  private largeMap?: L.Map;
  private largeMapMarker?: L.CircleMarker;
  private readonly defaultAddMapCenter: L.LatLngExpression = [4.6097, -74.0817];
  private readonly satelliteTileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  private readonly streetTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  private readonly satelliteAttribution = 'Tiles © Esri';
  private readonly streetAttribution = '© OpenStreetMap';

  readonly heightPresets: Array<{ value: HeightPreset; label: string; meters: number | null }> = [
    { value: 'basement', label: 'Sotano/Piso inferior (0.0 m)', meters: 0 },
    { value: 'ceiling', label: 'Techo (2.8 m)', meters: 2.8 },
    { value: 'wall-high', label: 'Pared alta (2.4 m)', meters: 2.4 },
    { value: 'wall-mid', label: 'Pared media (1.8 m)', meters: 1.8 },
    { value: 'turnstile', label: 'Torniquete/Poste (1.2 m)', meters: 1.2 },
    { value: 'custom', label: 'Personalizado', meters: null },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────

  /** Full mosaic — 1 single connection, 100% GPU, zero CPU */
  fullMosaicUrl = computed(() => `${this.viewUrl}?_t=${this.streamRevision()}`);

  /** Single camera view — 1 connection */
  singleCameraUrl = computed(
    () => `${this.viewUrl}?camera=${this.selectedCamera()}&_t=${this.streamRevision()}`
  );

  /** Paged mosaic — shows mosaicPerPage cameras per page */
  pagedMosaicUrl = computed(
    () => `${this.viewUrl}?page=${this.mosaicPage()}&per_page=${this.mosaicPerPage}&_t=${this.streamRevision()}`
  );

  /** Unified stream URL — switches automatically between mosaic / single / paged.
   *  Using a single <img> avoids destroy/create cycles that leave zombie
   *  MJPEG connections while the browser tears down the old one. */
  currentStreamUrl = computed(() => {
    const mode = this.viewMode();
    if (mode === 'single') return this.singleCameraUrl();
    if (mode === 'paged') return this.pagedMosaicUrl();
    return this.fullMosaicUrl();
  });

  cameraIndices = computed(() => {
    const n = this.showStream()
      ? this.streamSourcesCount()
      : (this.status()?.sources_count ?? 0);
    return Array.from({ length: n }, (_, i) => i);
  });

  selectedSources = computed(() =>
    this.sources().filter((s) => this.selectedIds().has(s.id))
  );

  private _onFullscreenChange = () => {
    if (!document.fullscreenElement) this.videoFullscreen.set(false);
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.refreshStatus();
    this.loadSources();
    this.alertService.loadFaceDisplayMode();
    this.alertService.connectSSE();
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    this.addMap?.remove();
    this.largeMap?.remove();
    this.addMap = undefined;
    this.largeMap = undefined;
    this.addMapMarker = undefined;
    this.largeMapMarker = undefined;
    clearTimeout(this.singleRetryTimer);
    clearTimeout(this.switchDebounceTimer);
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.stopLoadingTips();
  }

  // ── Pipeline methods ──────────────────────────────────────────────────────
  refreshStatus() {
    this.streamService.getStatus().subscribe({
      next: (s) => {
        this.status.set(s);

        // Auto-reconnect: if the pipeline is already running with MJPEG,
        // show the stream immediately (e.g. after a page reload).
        if (
          s.status === 'running' &&
          s.output_mode === 'mjpeg' &&
          !this.showStream()
        ) {
          const count = s.sources_count ?? 0;
          this.streamSourcesCount.set(count);
          this.streamRevision.update((v) => v + 1);

          // Auto-paginate when many cameras
          const totalPages = Math.max(1, Math.ceil(count / this.mosaicPerPage));
          this.mosaicTotalPages.set(totalPages);
          if (count > this.mosaicPerPage) {
            this.mosaicPage.set(1);
            this.viewMode.set('paged');
          }

          // Small delay so the pipeline's pull-loop has a frame cached
          // before the <img> element fires its first HTTP request.
          setTimeout(() => this.showStream.set(true), 500);
        }
      },
      error: () => this.status.set(null),
    });
  }

  start() {
    const selected = this.selectedSources();
    const rtspSources = selected.length ? selected.map((s) => s.rtsp_url) : undefined;

    this.loading.set(true);
    this.message.set(null);
    this.showStream.set(false);
    this.streamConnecting.set(false);
    this.loadingProgress.set(0);
    this.loadingPhase.set(0);
    this.startLoadingTips();

    // Progreso no-lineal: rápido al inicio, lento al medio, se detiene en 88%
    const camCount = Math.max(selected.length, 1);
    let elapsed = 0;
    const updateIntervalMs = 150;

    this.progressInterval = setInterval(() => {
      elapsed += updateIntervalMs;
      // Curva logarítmica: rápido al inicio, desacelera gradualmente
      const rawProgress = 88 * (1 - Math.exp(-elapsed / (2500 + camCount * 800)));
      this.loadingProgress.set(Math.min(rawProgress, 88));

      // Cambiar fase según progreso
      if (rawProgress < 20) this.loadingPhase.set(0);
      else if (rawProgress < 55) this.loadingPhase.set(1);
      else this.loadingPhase.set(2);
    }, updateIntervalMs);

    this.streamService
      .start({
        rtsp_sources: rtspSources,
        config: { output_mode: this.outputMode },
      })
      .subscribe({
        next: (res) => {
          clearInterval(this.progressInterval);
          this.loadingProgress.set(92);
          this.loadingPhase.set(2);

          this.message.set(res.message);
          this.loading.set(false);
          this.refreshStatus();
          if (res.success && this.outputMode === 'mjpeg') {
            this.streamSourcesCount.set(res.sources_count);
            this.sidebarCollapsed.set(true); // Ocultar sidebar para ver cámaras completas
            this.waitForMjpeg();
          }
        },
        error: (err) => {
          clearInterval(this.progressInterval);
          this.stopLoadingTips();
          this.loadingProgress.set(0);
          this.loadingPhase.set(0);
          this.message.set(err?.error?.detail ?? 'Error al iniciar pipeline.');
          this.loading.set(false);
        },
      });
  }

  private startLoadingTips(): void {
    this.loadingTip.set(this.tips[Math.floor(Math.random() * this.tips.length)]);
    this.tipInterval = setInterval(() => {
      this.loadingTip.set(this.tips[Math.floor(Math.random() * this.tips.length)]);
    }, 4000);
  }

  private stopLoadingTips(): void {
    if (this.tipInterval) {
      clearInterval(this.tipInterval);
      this.tipInterval = undefined;
    }
  }

  private waitForMjpeg(): void {
    this.streamConnecting.set(true);
    this.loadingPhase.set(3);

    // Animar el progreso de 92 → 100 suavemente
    const finishStart = this.loadingProgress();
    const remaining = 100 - finishStart;
    let step = 0;
    const finishInterval = setInterval(() => {
      step++;
      const p = finishStart + remaining * (step / 8);
      this.loadingProgress.set(Math.min(p, 100));
      if (step >= 8) clearInterval(finishInterval);
    }, 120);

    setTimeout(() => {
      this.stopLoadingTips();
      this.streamConnecting.set(false);
      this.streamRevision.update((v) => v + 1);
      this.showStream.set(true);
    }, 1200);
  }

  stop() {
    this.streamConnecting.set(false);
    this.loading.set(true);
    this.streamService.stop().subscribe({
      next: (res) => {
        this.message.set(res.message);
        this.loading.set(false);
        this.showStream.set(false);
        this.viewMode.set('mosaic');
        this.refreshStatus();
      },
      error: (err) => {
        this.message.set(err?.error?.detail ?? 'Error al detener pipeline.');
        this.loading.set(false);
      },
    });
  }

  toggleStream() {
    if (!this.showStream()) {
      // Ensure cameraIndices is populated from the current status
      const count = this.status()?.sources_count ?? 0;
      this.streamSourcesCount.set(count);
      this.streamRevision.update((v) => v + 1);

      // Auto-paginate when many cameras
      const totalPages = Math.max(1, Math.ceil(count / this.mosaicPerPage));
      this.mosaicTotalPages.set(totalPages);
      if (count > this.mosaicPerPage) {
        this.mosaicPage.set(1);
        this.viewMode.set('paged');
      }
    }
    this.showStream.update((v) => !v);
  }

  setFaceDisplayMode(mode: FaceDisplayMode): void {
    this.alertService.setFaceDisplayMode(mode);
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleVideoFullscreen(): void {
    const el = this.videoContainer?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      this.videoFullscreen.set(false);
    } else {
      el.requestFullscreen().then(() => this.videoFullscreen.set(true));
    }
  }

  goMosaic() {
    clearTimeout(this.singleRetryTimer);
    // Bump revision so the single <img> gets a fresh URL, forcing the
    // browser to abort the old single-camera connection immediately.
    this.streamRevision.update((v) => v + 1);
    this.viewMode.set('mosaic');
  }

  goPagedMosaic(page?: number) {
    clearTimeout(this.singleRetryTimer);
    if (page !== undefined) this.mosaicPage.set(page);
    this.streamRevision.update((v) => v + 1);
    this.viewMode.set('paged');
  }

  nextMosaicPage() {
    const total = this.mosaicTotalPages();
    if (this.mosaicPage() < total) {
      this.mosaicPage.update((p) => p + 1);
      this.streamRevision.update((v) => v + 1);
    }
  }

  prevMosaicPage() {
    if (this.mosaicPage() > 1) {
      this.mosaicPage.update((p) => p - 1);
      this.streamRevision.update((v) => v + 1);
    }
  }

  goSingle(index: number) {
    clearTimeout(this.singleRetryTimer);
    clearTimeout(this.switchDebounceTimer);

    // Update UI immediately (highlight active button)
    this.selectedCamera.set(index);
    this.viewMode.set('single');

    // Debounce the actual stream URL change to avoid flooding the server
    // with MJPEG connections when the user clicks rapidly.
    this.switchDebounceTimer = setTimeout(() => {
      this.streamRevision.update((v) => v + 1);

      // Auto-retry: if the MJPEG stream doesn't deliver a frame within 3 s,
      // bump streamRevision to force the <img> to reconnect.
      this.singleRetryTimer = setTimeout(() => {
        const img = document.querySelector<HTMLImageElement>(
          'img[alt="Stream"]'
        );
        if (img && (!img.naturalWidth || img.naturalWidth === 0)) {
          this.streamRevision.update((v) => v + 1);
        }
      }, 3000);
    }, 250);
  }

  nextCamera() {
    const total = this.cameraIndices().length;
    if (total === 0) return;
    this.goSingle((this.selectedCamera() + 1) % total);
  }

  prevCamera() {
    const total = this.cameraIndices().length;
    if (total === 0) return;
    this.goSingle((this.selectedCamera() - 1 + total) % total);
  }

  /** Click on the mosaic image to jump to a single camera */
  onMosaicClick(event: MouseEvent) {
    const img = event.target as HTMLImageElement;
    if (!img) return;
    const totalAll = this.cameraIndices().length;
    if (totalAll <= 1) return;

    // In paged mode the visible grid has at most mosaicPerPage cameras
    const isPaged = this.viewMode() === 'paged';
    const pageOffset = isPaged ? (this.mosaicPage() - 1) * this.mosaicPerPage : 0;
    const visibleCount = isPaged
      ? Math.min(this.mosaicPerPage, totalAll - pageOffset)
      : totalAll;

    const rect = img.getBoundingClientRect();
    const natW = img.naturalWidth || 1;
    const natH = img.naturalHeight || 1;
    const scale = Math.min(rect.width / natW, rect.height / natH);
    const renderedW = natW * scale;
    const renderedH = natH * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;

    const x = event.clientX - rect.left - offsetX;
    const y = event.clientY - rect.top - offsetY;
    if (x < 0 || y < 0 || x > renderedW || y > renderedH) return;

    const [rows, cols] = this._calcGrid(visibleCount);
    const col = Math.floor((x / renderedW) * cols);
    const row = Math.floor((y / renderedH) * rows);
    const localIndex = row * cols + col;
    const globalIndex = pageOffset + localIndex;
    if (localIndex >= 0 && localIndex < visibleCount && globalIndex < totalAll) {
      this.goSingle(globalIndex);
    }
  }

  private _calcGrid(n: number): [number, number] {
    if (n <= 1) return [1, 1];
    if (n <= 2) return [1, 2];
    if (n <= 4) return [2, 2];
    if (n <= 6) return [2, 3];
    if (n <= 9) return [3, 3];
    if (n <= 12) return [3, 4];
    if (n <= 16) return [4, 4];
    const rows = Math.ceil(Math.sqrt(n));
    const cols = Math.ceil(n / rows);
    return [rows, cols];
  }

  /**
   * Called from (error) on any <img>. Waits 1.5 s then increments streamRevision
   * so all cameras get a fresh src and retry the connection.
   */
  onImgError(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.showStream()) {
        this.streamRevision.update((v) => v + 1);
      }
    }, 4000);
  }

  // ── RTSP Source management ────────────────────────────────────────────────
  loadSources() {
    this.sourcesLoading.set(true);
    this.sourcesError.set(null);
    this.streamService.listSources().subscribe({
      next: (list) => {
        this.sources.set(list);
        this.sourcesLoading.set(false);
      },
      error: () => {
        this.sourcesError.set('No se pudieron cargar las fuentes guardadas.');
        this.sourcesLoading.set(false);
      },
    });
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.currentPage.set(1);
  }

  goToPage(page: number) {
    this.currentPage.set(page);
  }

  toggleSelect(id: string) {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  selectAll() {
    this.selectedIds.set(new Set(this.sources().map((s) => s.id)));
  }

  clearSelection() {
    this.selectedIds.set(new Set());
  }

  // ── Group methods ─────────────────────────────────────────────────────────
  toggleGroup(name: string) {
    this.expandedGroups.update((set) => {
      const next = new Set(set);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  isGroupCollapsed(name: string): boolean {
    return !this.expandedGroups().has(name);
  }

  selectGroup(cameras: RtspSource[]) {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      const ids = cameras.map((c) => c.id);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  isGroupSelectionFull(cameras: RtspSource[]): boolean {
    return cameras.length > 0 && cameras.every((c) => this.selectedIds().has(c.id));
  }

  openAddForm() {
    this.newName = '';
    this.newRtsp = '';
    this.newObservation = '';
    this.newGroupName = '';
    this.newLatitud = null;
    this.newLongitud = null;
    this.newPosX = null;
    this.newPosY = null;
    this.newAzimuth = null;
    this.newInclinacionAngulo = null;
    this.newFovAngulo = null;
    this.newPiso = null;
    this.newHeightPreset = 'ceiling';
    this.newAlturaM = 2.8;
    this.addError.set(null);
    this.showAddForm.set(true);

    // Wait for DOM to render the map container before initializing Leaflet.
    setTimeout(() => this.initAddMap(), 0);
  }

  cancelAdd() {
    this.showAddFullscreen.set(false);
    this.showAddForm.set(false);
  }

  toggleAddFullscreen(): void {
    this.showAddFullscreen.update((value) => !value);
    setTimeout(() => this.addMap?.invalidateSize(), 0);
  }

  saveSource() {
    if (!this.newName.trim() || !this.newRtsp.trim()) {
      this.addError.set('Nombre y URL RTSP son obligatorios.');
      return;
    }
    const body: RtspSourceCreate = {
      name: this.newName.trim(),
      rtsp_url: this.newRtsp.trim(),
      observation: this.newObservation.trim() || undefined,
      group_name: this.newGroupName.trim() || undefined,
      latitud: this.newLatitud ?? undefined,
      longitud: this.newLongitud ?? undefined,
      posicion_x: this.newPosX ?? undefined,
      posicion_y: this.newPosY ?? undefined,
      azimuth: this.newAzimuth ?? undefined,
      inclinacion_angulo: this.newInclinacionAngulo ?? undefined,
      fov_angulo: this.newFovAngulo ?? undefined,
      piso: this.newPiso ?? undefined,
      altura_m: this.newAlturaM ?? undefined,
    };
    this.addLoading.set(true);
    this.addError.set(null);
    this.streamService.createSource(body).subscribe({
      next: (created) => {
        this.sources.update((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.addLoading.set(false);
        this.showAddForm.set(false);
        this.currentPage.set(1);
      },
      error: (err) => {
        this.addError.set(err?.error?.detail ?? 'Error al guardar la fuente.');
        this.addLoading.set(false);
      },
    });
  }

  startEdit(source: RtspSource) {
    this.editingId.set(source.id);
    this.editName = source.name;
    this.editRtsp = source.rtsp_url;
    this.editObservation = source.observation ?? '';
    this.editGroupName = source.group_name ?? '';
    this.editLatitud = source.latitud ?? null;
    this.editLongitud = source.longitud ?? null;
    this.editPosX = source.posicion_x ?? null;
    this.editPosY = source.posicion_y ?? null;
    this.editAzimuth = source.azimuth ?? null;
    this.editInclinacionAngulo = source.inclinacion_angulo ?? null;
    this.editFovAngulo = source.fov_angulo ?? null;
    this.editPiso = source.piso ?? null;
    this.editAlturaM = source.altura_m ?? null;
    this.editError.set(null);
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  saveEdit(id: string) {
    if (!this.editName.trim() || !this.editRtsp.trim()) {
      this.editError.set('Nombre y URL RTSP son obligatorios.');
      return;
    }
    this.editLoading.set(true);
    this.editError.set(null);
    this.streamService
      .updateSource(id, {
        name: this.editName.trim(),
        rtsp_url: this.editRtsp.trim(),
        observation: this.editObservation.trim() || undefined,
        group_name: this.editGroupName.trim() || undefined,
        latitud: this.editLatitud ?? undefined,
        longitud: this.editLongitud ?? undefined,
        posicion_x: this.editPosX ?? undefined,
        posicion_y: this.editPosY ?? undefined,
        azimuth: this.editAzimuth ?? undefined,
        inclinacion_angulo: this.editInclinacionAngulo ?? undefined,
        fov_angulo: this.editFovAngulo ?? undefined,
        piso: this.editPiso ?? undefined,
        altura_m: this.editAlturaM ?? undefined,
      })
      .subscribe({
        next: (updated) => {
          this.sources.update((list) =>
            list.map((s) => (s.id === id ? updated : s)).sort((a, b) => a.name.localeCompare(b.name))
          );
          this.editingId.set(null);
          this.editLoading.set(false);
        },
        error: (err) => {
          this.editError.set(err?.error?.detail ?? 'Error al actualizar la fuente.');
          this.editLoading.set(false);
        },
      });
  }

  deleteSource(id: string) {
    this.streamService.deleteSource(id).subscribe({
      next: () => {
        this.sources.update((list) => list.filter((s) => s.id !== id));
        this.selectedIds.update((set) => {
          const next = new Set(set);
          next.delete(id);
          return next;
        });
      },
      error: (err) => {
        this.sourcesError.set(err?.error?.detail ?? 'Error al eliminar la fuente.');
      },
    });
  }

  initAddMap(): void {
    const host = this.addMapDiv?.nativeElement;
    if (!host) return;

    if (!this.addMap) {
      this.addMap = L.map(host, {
        center: this.defaultAddMapCenter,
        zoom: 17,
        zoomControl: true,
      });

      const satAdd = L.tileLayer(this.satelliteTileUrl, { attribution: this.satelliteAttribution, maxZoom: 22 });
      const strAdd = L.tileLayer(this.streetTileUrl, { attribution: this.streetAttribution, maxZoom: 22 });
      satAdd.addTo(this.addMap);
      L.control.layers({ 'Satélite': satAdd, 'Calles': strAdd }, {}, { position: 'topright' }).addTo(this.addMap);

      this.addMap.on('click', (ev: L.LeafletMouseEvent) => {
        this.newLatitud = Number(ev.latlng.lat.toFixed(6));
        this.newLongitud = Number(ev.latlng.lng.toFixed(6));
        this.updateAddMapMarker();
      });
    }

    this.addMap.invalidateSize();
    this.updateAddMapMarker();
    if (this.newLatitud != null && this.newLongitud != null) {
      this.addMap.setView([this.newLatitud, this.newLongitud], Math.max(this.addMap.getZoom(), 17));
    }
  }

  openLargeMap(): void {
    this.showLargeMap.set(true);
    setTimeout(() => this.initLargeMap(), 0);
  }

  closeLargeMap(): void {
    this.showLargeMap.set(false);
  }

  initLargeMap(): void {
    const host = this.largeMapDiv?.nativeElement;
    if (!host) return;

    if (!this.largeMap) {
      this.largeMap = L.map(host, {
        center: this.defaultAddMapCenter,
        zoom: 18,
        zoomControl: true,
      });

      const satLarge = L.tileLayer(this.satelliteTileUrl, { attribution: this.satelliteAttribution, maxZoom: 22 });
      const strLarge = L.tileLayer(this.streetTileUrl, { attribution: this.streetAttribution, maxZoom: 22 });
      satLarge.addTo(this.largeMap);
      L.control.layers({ 'Satélite': satLarge, 'Calles': strLarge }, {}, { position: 'topright' }).addTo(this.largeMap);

      this.largeMap.on('click', (ev: L.LeafletMouseEvent) => {
        this.newLatitud = Number(ev.latlng.lat.toFixed(6));
        this.newLongitud = Number(ev.latlng.lng.toFixed(6));
        this.updateAddMapMarker();
      });
    }

    this.largeMap.invalidateSize();
    this.updateAddMapMarker();
    if (this.newLatitud != null && this.newLongitud != null) {
      this.largeMap.setView([this.newLatitud, this.newLongitud], Math.max(this.largeMap.getZoom(), 18));
    } else {
      this.largeMap.setView(this.defaultAddMapCenter, 18);
    }
  }

  useMyLocation(): void {
    if (!navigator.geolocation) {
      this.addError.set('Tu navegador no soporta geolocalizacion.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.newLatitud = Number(pos.coords.latitude.toFixed(6));
        this.newLongitud = Number(pos.coords.longitude.toFixed(6));
        this.updateAddMapMarker();
        if (this.addMap) this.addMap.setView([this.newLatitud, this.newLongitud], 18);
        if (this.largeMap) this.largeMap.setView([this.newLatitud, this.newLongitud], 19);
      },
      () => this.addError.set('No fue posible obtener tu ubicacion actual.')
    );
  }

  private updateAddMapMarker(): void {
    if (this.newLatitud == null || this.newLongitud == null) return;
    const latLng: L.LatLngExpression = [this.newLatitud, this.newLongitud];

    if (this.addMap) {
      if (!this.addMapMarker) {
        this.addMapMarker = L.circleMarker(latLng, {
          radius: 8,
          fillColor: '#2563eb',
          color: '#1d4ed8',
          weight: 2,
          fillOpacity: 0.9,
        }).addTo(this.addMap);
      } else {
        this.addMapMarker.setLatLng(latLng);
      }
    }

    if (this.largeMap) {
      if (!this.largeMapMarker) {
        this.largeMapMarker = L.circleMarker(latLng, {
          radius: 10,
          fillColor: '#2563eb',
          color: '#1d4ed8',
          weight: 2,
          fillOpacity: 0.9,
        }).addTo(this.largeMap);
      } else {
        this.largeMapMarker.setLatLng(latLng);
      }
    }
  }

  centerLargeMapOnMarker(): void {
    if (!this.largeMap || this.newLatitud == null || this.newLongitud == null) return;
    this.largeMap.setView([this.newLatitud, this.newLongitud], Math.max(this.largeMap.getZoom(), 19));
  }

  clearMapPoint(): void {
    this.newLatitud = null;
    this.newLongitud = null;
    if (this.addMapMarker) {
      this.addMapMarker.remove();
      this.addMapMarker = undefined;
    }
    if (this.largeMapMarker) {
      this.largeMapMarker.remove();
      this.largeMapMarker = undefined;
    }
    if (this.addMap) this.addMap.setView(this.defaultAddMapCenter, 17);
    if (this.largeMap) this.largeMap.setView(this.defaultAddMapCenter, 18);
  }

  onInteriorPickerClick(event: MouseEvent): void {
    const host = this.interiorPicker?.nativeElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const relX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const relY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));

    // Normalize to a 0..1000 floor coordinate space for easier cross-screen usage.
    this.newPosX = Number((relX * 1000).toFixed(1));
    this.newPosY = Number((relY * 1000).toFixed(1));
  }

  interiorMarkerStyle() {
    if (this.newPosX == null || this.newPosY == null) return null;
    return {
      left: `${(this.newPosX / 1000) * 100}%`,
      top: `${(this.newPosY / 1000) * 100}%`,
    };
  }

  setHeightPreset(preset: HeightPreset): void {
    this.newHeightPreset = preset;
    const selected = this.heightPresets.find((p) => p.value === preset);
    if (selected && selected.meters != null) this.newAlturaM = selected.meters;
  }

  updateAzimuthFromPointer(event: PointerEvent): void {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    const host = event.currentTarget as HTMLElement | null;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = event.clientX - centerX;
    const deltaY = centerY - event.clientY;
    const angle = (Math.atan2(deltaX, deltaY) * 180) / Math.PI;
    const normalized = (angle + 360) % 360;

    this.newAzimuth = Math.round(normalized);
  }

  updatePitchFromPointer(event: PointerEvent): void {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    const host = event.currentTarget as HTMLElement | null;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height * 0.68;
    const deltaX = event.clientX - centerX;
    const deltaY = centerY - event.clientY;
    const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

    this.newInclinacionAngulo = Math.round(this.clamp(angle, -90, 90));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  azimuthPreviewTransform(): string {
    const az = this.newAzimuth ?? 0;
    const normalized = ((az % 360) + 360) % 360;
    return `rotate(${normalized - 90}deg)`;
  }

  pitchPreviewTransform(): string {
    const pitch = this.clamp(this.newInclinacionAngulo ?? 0, -90, 90);
    return `rotate(${-pitch}deg)`;
  }
}
