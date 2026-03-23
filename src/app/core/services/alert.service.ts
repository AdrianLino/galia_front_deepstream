import { inject, Injectable, NgZone, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AlertEvent,
  AlertEventList,
  AlertLevel,
  AlertSSEPayload,
  FaceDisplayMode,
  FaceIdentifiedPayload,
  WatchlistResponse,
} from '../models/alert.model';
import { environment } from '../../../environments/environment';

const API = `${environment.apiV1}/alerts`;
const STREAM_API = `${environment.apiV1}/stream`;

@Injectable({ providedIn: 'root' })
export class AlertService {
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  /** Live alerts received via SSE (newest first, max 100 kept in memory). */
  readonly liveAlerts = signal<AlertSSEPayload[]>([]);

  /** Visible toast notifications (auto-dismissed). */
  readonly toasts = signal<AlertSSEPayload[]>([]);

  /** Persisted alert history fetched from backend. */
  readonly historyAlerts = signal<AlertEvent[]>([]);

  /** Whether history is currently loading. */
  readonly historyLoading = signal(false);

  /** Count of unread live alerts. */
  readonly unreadCount = signal(0);

  /** Whether SSE is connected. */
  readonly connected = signal(false);

  /** Face identifications received via SSE (newest first, max 200). */
  readonly identifications = signal<FaceIdentifiedPayload[]>([]);

  /** Current face display mode. */
  readonly faceDisplayMode = signal<FaceDisplayMode>('realtime');

  private eventSource: EventSource | null = null;
  private toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // ── Watchlist management ────────────────────────────────────────────────

  getWatchlist(): Observable<WatchlistResponse> {
    return this.http.get<WatchlistResponse>(`${API}/watchlist`);
  }

  setAlertLevel(personId: string, level: AlertLevel): Observable<any> {
    return this.http.put(`${API}/persons/${personId}/level`, { alert_level: level });
  }

  // ── Alert history ─────────────────────────────────────────────────────

  getAlertEvents(limit = 50, offset = 0, acknowledged?: boolean): Observable<AlertEventList> {
    let url = `${API}/events?limit=${limit}&offset=${offset}`;
    if (acknowledged !== undefined) {
      url += `&acknowledged=${acknowledged}`;
    }
    return this.http.get<AlertEventList>(url);
  }

  acknowledgeAlert(alertId: number): Observable<any> {
    return this.http.post(`${API}/events/${alertId}/ack`, {});
  }

  acknowledgeAll(): Observable<any> {
    return this.http.post(`${API}/events/ack-all`, {});
  }

  // ── History management ────────────────────────────────────────────────

  loadHistory(limit = 50): void {
    this.historyLoading.set(true);
    this.getAlertEvents(limit).subscribe({
      next: (res) => {
        this.historyAlerts.set(res.alerts);
        this.historyLoading.set(false);
      },
      error: () => this.historyLoading.set(false),
    });
  }

  /** Build the URL to stream a 10-second clip for an alert. */
  clipUrl(alertId: number): string {
    return `${API}/events/${alertId}/clip`;
  }

  /** Build the URL for the detection thumbnail (captured face at alert time). */
  thumbnailUrl(alertId: number): string {
    return `${API}/events/${alertId}/thumbnail`;
  }

  /** Build the URL for a person's face photo. */
  personPhotoUrl(personId: string): string {
    return `${environment.apiV1}/faces/persons/${personId}/photo`;
  }

  // ── Toast management ──────────────────────────────────────────────────

  dismissToast(alertId: number): void {
    this.toasts.update((list) => list.filter((t) => t.alert_id !== alertId));
    const timer = this.toastTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.toastTimers.delete(alertId);
    }
  }

  private pushToast(payload: AlertSSEPayload): void {
    // Max 6 visible toasts at once
    this.toasts.update((list) => {
      const updated = [payload, ...list];
      // If too many, remove the oldest
      if (updated.length > 6) {
        const removed = updated.pop()!;
        this.toastTimers.delete(removed.alert_id);
      }
      return updated;
    });

    // Auto-dismiss: critical = 15s, watch = 10s
    const duration = payload.alert_level === 'critical' ? 15000 : 10000;
    const timer = setTimeout(() => {
      this.zone.run(() => this.dismissToast(payload.alert_id));
    }, duration);
    this.toastTimers.set(payload.alert_id, timer);
  }

  // ── SSE real-time stream ──────────────────────────────────────────────

  connectSSE(): void {
    if (this.eventSource) return; // already connected

    this.eventSource = new EventSource(`${API}/stream`);

    this.eventSource.onopen = () => {
      this.zone.run(() => this.connected.set(true));
    };

    this.eventSource.onmessage = (event) => {
      this.zone.run(() => {
        try {
          const data = JSON.parse(event.data);
          if (data.event_type === 'face_identified') {
            // Face identification event → add or update in identifications list
            const payload: FaceIdentifiedPayload = data;
            const current = this.identifications();
            // If same track_id exists, replace it (e.g. Desconocido → identified)
            const idx = current.findIndex(item => item.track_id === payload.track_id);
            if (idx >= 0) {
              const updated = [...current];
              updated.splice(idx, 1);
              this.identifications.set([payload, ...updated].slice(0, 200));
            } else {
              this.identifications.set([payload, ...current].slice(0, 200));
            }
          } else {
            // Alert event → existing behavior
            const payload: AlertSSEPayload = data;
            const current = this.liveAlerts();
            this.liveAlerts.set([payload, ...current].slice(0, 100));
            this.unreadCount.update((c) => c + 1);
            this.pushToast(payload);
          }
        } catch {
          // ignore malformed messages
        }
      });
    };

    this.eventSource.onerror = () => {
      this.zone.run(() => this.connected.set(false));
      // Auto-reconnect after 5 seconds
      this.eventSource?.close();
      this.eventSource = null;
      setTimeout(() => this.connectSSE(), 5000);
    };
  }

  disconnectSSE(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.connected.set(false);
  }

  markRead(): void {
    this.unreadCount.set(0);
  }

  // ── Face display mode ─────────────────────────────────────────────────

  loadFaceDisplayMode(): void {
    this.http.get<{ mode: FaceDisplayMode }>(`${STREAM_API}/face-display-mode`).subscribe({
      next: (res) => this.faceDisplayMode.set(res.mode),
      error: () => {},
    });
  }

  setFaceDisplayMode(mode: FaceDisplayMode): void {
    this.faceDisplayMode.set(mode);
    this.http.put(`${STREAM_API}/face-display-mode`, { mode }).subscribe({
      error: () => {},
    });
  }

  /** Build URL for an identification thumbnail. */
  identificationThumbnailUrl(filename: string): string {
    return `${STREAM_API}/identifications/thumbnail/${filename}`;
  }

  clearIdentifications(): void {
    this.identifications.set([]);
  }
}
