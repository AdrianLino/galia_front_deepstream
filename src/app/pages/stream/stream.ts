import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StreamService } from '../../core/services/stream.service';
import {
  StreamStatusResponse,
  RtspSource,
  RtspSourceCreate,
} from '../../core/models/stream.model';

export type ViewMode = 'mosaic' | 'single';

@Component({
  selector: 'app-stream',
  imports: [CommonModule, FormsModule],
  templateUrl: './stream.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  `]
})
export class StreamComponent implements OnInit {
  private streamService = inject(StreamService);

  // ── Pipeline state ────────────────────────────────────────────────────────
  status = signal<StreamStatusResponse | null>(null);
  loading = signal(false);
  message = signal<string | null>(null);
  showStream = signal(false);
  streamConnecting = signal(false);
  streamRevision = signal(0);
  /** Sources count from the start() response — drives cameraIndices independently of status() */
  streamSourcesCount = signal(0);
  viewMode = signal<ViewMode>('mosaic');
  selectedCamera = signal<number>(0);
  outputMode: 'mjpeg' | 'rtsp' | 'display' = 'mjpeg';

  readonly viewUrl = this.streamService.viewUrl;

  private retryTimer?: ReturnType<typeof setTimeout>;

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
  newName = '';
  newRtsp = '';
  newObservation = '';
  newGroupName = '';
  newLatitud: number | null = null;
  newLongitud: number | null = null;
  newPosX: number | null = null;
  newPosY: number | null = null;
  newAzimuth: number | null = null;
  newFovAngulo: number | null = null;
  newPiso: number | null = null;
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
  editFovAngulo: number | null = null;
  editPiso: number | null = null;
  editError = signal<string | null>(null);
  editLoading = signal(false);

  // Groups
  collapsedGroups = signal<Set<string>>(new Set());

  // ── Computed ──────────────────────────────────────────────────────────────

  /** Full mosaic — 1 single connection, 100% GPU, zero CPU */
  fullMosaicUrl = computed(() => `${this.viewUrl}?_t=${this.streamRevision()}`);

  /** Single camera view — 1 connection */
  singleCameraUrl = computed(
    () => `${this.viewUrl}?camera=${this.selectedCamera()}&_t=${this.streamRevision()}`
  );

  cameraIndices = computed(() => {
    const n = this.showStream()
      ? this.streamSourcesCount()
      : (this.status()?.sources_count ?? 0);
    return Array.from({ length: n }, (_, i) => i);
  });

  selectedSources = computed(() =>
    this.sources().filter((s) => this.selectedIds().has(s.id))
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.refreshStatus();
    this.loadSources();
  }

  // ── Pipeline methods ──────────────────────────────────────────────────────
  refreshStatus() {
    this.streamService.getStatus().subscribe({
      next: (s) => this.status.set(s),
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

    this.streamService
      .start({
        rtsp_sources: rtspSources,
        config: { output_mode: this.outputMode },
      })
      .subscribe({
        next: (res) => {
          this.message.set(res.message);
          this.loading.set(false);
          this.refreshStatus();
          if (res.success && this.outputMode === 'mjpeg') {
            this.streamSourcesCount.set(res.sources_count);
            this.waitForMjpeg();
          }
        },
        error: (err) => {
          this.message.set(err?.error?.detail ?? 'Error al iniciar pipeline.');
          this.loading.set(false);
        },
      });
  }

  private waitForMjpeg(): void {
    this.streamConnecting.set(true);
    setTimeout(() => {
      this.streamConnecting.set(false);
      this.streamRevision.update((v) => v + 1);
      this.showStream.set(true);
    }, 1000);
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
    }
    this.showStream.update((v) => !v);
  }

  goMosaic() {
    this.viewMode.set('mosaic');
  }

  goSingle(index: number) {
    this.selectedCamera.set(index);
    this.viewMode.set('single');
  }

  nextCamera() {
    const total = this.cameraIndices().length;
    if (total === 0) return;
    this.selectedCamera.update((c) => (c + 1) % total);
  }

  prevCamera() {
    const total = this.cameraIndices().length;
    if (total === 0) return;
    this.selectedCamera.update((c) => (c - 1 + total) % total);
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
    }, 1500);
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
    this.collapsedGroups.update((set) => {
      const next = new Set(set);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  isGroupCollapsed(name: string): boolean {
    return this.collapsedGroups().has(name);
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
    this.newFovAngulo = null;
    this.newPiso = null;
    this.addError.set(null);
    this.showAddForm.set(true);
  }

  cancelAdd() {
    this.showAddForm.set(false);
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
      fov_angulo: this.newFovAngulo ?? undefined,
      piso: this.newPiso ?? undefined,
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
    this.editFovAngulo = source.fov_angulo ?? null;
    this.editPiso = source.piso ?? null;
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
        fov_angulo: this.editFovAngulo ?? undefined,
        piso: this.editPiso ?? undefined,
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
}
