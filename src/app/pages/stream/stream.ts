import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StreamService } from '../../core/services/stream.service';
import { StreamStatusResponse } from '../../core/models/stream.model';

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

  rtspInput = '';
  outputMode: 'mjpeg' | 'rtsp' | 'display' = 'mjpeg';

  readonly viewUrl = this.streamService.viewUrl;

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
}
