import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VideoService } from '../../core/services/video.service';
import {
  AskResponse,
  ForensicEvent,
  VideoEventsResponse,
  VideoListItem,
  VideoStatus,
} from '../../core/models/video.model';

@Component({
  selector: 'app-video',
  imports: [CommonModule, FormsModule],
  templateUrl: './video.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  `]
})
export class VideoComponent implements OnInit, OnDestroy {
  private videoService = inject(VideoService);

  // Upload
  uploadFile: File | null = null;
  uploading = signal(false);
  uploadMsg = signal<string | null>(null);
  uploadError = signal<string | null>(null);

  // Video list
  videos = signal<VideoListItem[]>([]);
  listLoading = signal(false);

  // Selected video
  selectedVideo = signal<VideoStatus | null>(null);
  selectedEvents = signal<ForensicEvent[]>([]);
  eventsLoading = signal(false);
  pollingId: ReturnType<typeof setInterval> | null = null;

  // Q&A
  question = '';
  askResult = signal<AskResponse | null>(null);
  askLoading = signal(false);

  // Delete
  deleteMsg = signal<string | null>(null);

  ngOnInit() {
    this.loadList();
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files?.[0] ?? null;
    this.uploadMsg.set(null);
    this.uploadError.set(null);
  }

  upload() {
    if (!this.uploadFile) return;
    this.uploading.set(true);
    this.uploadMsg.set(null);
    this.uploadError.set(null);

    this.videoService.upload(this.uploadFile).subscribe({
      next: (res) => {
        this.uploading.set(false);
        this.uploadMsg.set(`Video recibido (ID: ${res.video_id}). Procesando en background…`);
        this.loadList();
        this.selectById(res.video_id);
      },
      error: (err) => {
        this.uploading.set(false);
        this.uploadError.set(err?.error?.detail ?? 'Error al subir video.');
      },
    });
  }

  loadList() {
    this.listLoading.set(true);
    this.videoService.list().subscribe({
      next: (res) => {
        this.videos.set(res.videos);
        this.listLoading.set(false);
      },
      error: () => this.listLoading.set(false),
    });
  }

  selectById(id: number) {
    this.stopPolling();
    this.selectedEvents.set([]);
    this.askResult.set(null);
    this.deleteMsg.set(null);

    this.videoService.getStatus(id).subscribe({
      next: (s) => {
        this.selectedVideo.set(s);
        if (s.status === 'processing') {
          this.startPolling(id);
        } else if (s.status === 'done') {
          this.loadEvents(id);
        }
      },
    });
  }

  startPolling(id: number) {
    this.pollingId = setInterval(() => {
      this.videoService.getStatus(id).subscribe({
        next: (s) => {
          this.selectedVideo.set(s);
          if (s.status !== 'processing') {
            this.stopPolling();
            this.loadList();
            if (s.status === 'done') this.loadEvents(id);
          }
        },
      });
    }, 5000);
  }

  stopPolling() {
    if (this.pollingId !== null) {
      clearInterval(this.pollingId);
      this.pollingId = null;
    }
  }

  loadEvents(id: number) {
    this.eventsLoading.set(true);
    this.videoService.getEvents(id).subscribe({
      next: (res) => {
        this.selectedEvents.set(res.events);
        this.eventsLoading.set(false);
      },
      error: () => this.eventsLoading.set(false),
    });
  }

  ask() {
    const vid = this.selectedVideo();
    if (!vid || !this.question.trim()) return;
    this.askLoading.set(true);
    this.askResult.set(null);
    this.videoService.ask(vid.video_id, this.question.trim()).subscribe({
      next: (res) => {
        this.askResult.set(res);
        this.askLoading.set(false);
      },
      error: (err) => {
        this.askResult.set({
          video_id: vid.video_id,
          question: this.question,
          answer: err?.error?.detail ?? 'Error al procesar la pregunta.',
          context_segments: 0,
        });
        this.askLoading.set(false);
      },
    });
  }

  deleteSelected() {
    const vid = this.selectedVideo();
    if (!vid) return;
    if (!confirm(`¿Eliminar video #${vid.video_id}?`)) return;

    this.videoService.delete(vid.video_id).subscribe({
      next: () => {
        this.selectedVideo.set(null);
        this.selectedEvents.set([]);
        this.deleteMsg.set(`Video #${vid.video_id} eliminado.`);
        this.loadList();
      },
      error: (err) => {
        this.deleteMsg.set(err?.error?.detail ?? 'Error al eliminar.');
      },
    });
  }

  downloadUrl(id: number): string {
    return this.videoService.downloadUrl(id);
  }

  formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  statusClass(status: string): string {
    if (status === 'done') return 'text-green-400';
    if (status === 'error') return 'text-red-400';
    return 'text-yellow-400';
  }
}
