import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StreamService } from '../../core/services/stream.service';
import { StreamStatusResponse } from '../../core/models/stream.model';

export type ViewMode = 'mosaic' | 'single';

@Component({
  selector: 'app-stream',
  imports: [CommonModule, FormsModule],
  templateUrl: './stream.html',
})
export class StreamComponent implements OnInit {
  private streamService = inject(StreamService);

  status = signal<StreamStatusResponse | null>(null);
  loading = signal(false);
  message = signal<string | null>(null);
  showStream = signal(false);

  /** Current view mode: 'mosaic' shows all cameras, 'single' shows one expanded */
  viewMode = signal<ViewMode>('mosaic');

  /** Index of the camera being viewed in single mode */
  selectedCamera = signal<number>(0);

  rtspInput = '';
  outputMode: 'mjpeg' | 'rtsp' | 'display' = 'mjpeg';

  readonly viewUrl = this.streamService.viewUrl;

  /** URL for the single-camera view */
  singleCameraUrl = computed(() =>
    `${this.viewUrl}?camera=${this.selectedCamera()}`
  );

  /** Array of camera indices [0, 1, 2, ...] from current status */
  cameraIndices = computed(() => {
    const s = this.status();
    if (!s || !s.sources_count) return [];
    return Array.from({ length: s.sources_count }, (_, i) => i);
  });

  /** Grid columns class based on number of cameras */
  gridColsClass = computed(() => {
    const n = this.cameraIndices().length;
    if (n <= 1) return 'grid-cols-1';
    if (n <= 4) return 'grid-cols-2';
    if (n <= 9) return 'grid-cols-3';
    return 'grid-cols-4';
  });

  get rtspSources(): string[] {
    return this.rtspInput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  ngOnInit() {
    this.refreshStatus();
  }

  refreshStatus() {
    this.streamService.getStatus().subscribe({
      next: (s) => this.status.set(s),
      error: () => this.status.set(null),
    });
  }

  start() {
    this.loading.set(true);
    this.message.set(null);
    this.streamService
      .start({
        rtsp_sources: this.rtspSources.length ? this.rtspSources : undefined,
        config: { output_mode: this.outputMode },
      })
      .subscribe({
        next: (res) => {
          this.message.set(res.message);
          this.loading.set(false);
          this.refreshStatus();
          if (res.success && this.outputMode === 'mjpeg') this.showStream.set(true);
        },
        error: (err) => {
          this.message.set(err?.error?.detail ?? 'Error al iniciar pipeline.');
          this.loading.set(false);
        },
      });
  }

  stop() {
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
    this.showStream.update((v) => !v);
  }

  /** Switch to mosaic view (all cameras) */
  goMosaic() {
    this.viewMode.set('mosaic');
  }

  /** Switch to single-camera expanded view */
  goSingle(index: number) {
    this.selectedCamera.set(index);
    this.viewMode.set('single');
  }

  /** Navigate to next camera in single mode */
  nextCamera() {
    const total = this.cameraIndices().length;
    if (total === 0) return;
    this.selectedCamera.update((c) => (c + 1) % total);
  }

  /** Navigate to previous camera in single mode */
  prevCamera() {
    const total = this.cameraIndices().length;
    if (total === 0) return;
    this.selectedCamera.update((c) => (c - 1 + total) % total);
  }

  /** Build MJPEG URL for a specific camera index */
  cameraUrl(index: number): string {
    return `${this.viewUrl}?camera=${index}`;
  }
}
