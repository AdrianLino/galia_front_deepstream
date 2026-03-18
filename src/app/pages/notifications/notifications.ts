import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../core/services/alert.service';
import { AlertEvent, AlertLevel } from '../../core/models/alert.model';
import { environment } from '../../../environments/environment';

type Tab = 'history' | 'watchlist';
type FilterLevel = 'all' | 'critical' | 'watch';
type FilterAck = 'all' | 'pending' | 'acknowledged';

@Component({
  selector: 'app-notifications',
  imports: [CommonModule, FormsModule],
  templateUrl: './notifications.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  `]
})
export class NotificationsComponent implements OnInit {
  private alertSvc = inject(AlertService);

  readonly facesApi = `${environment.apiV1}/faces`;

  activeTab = signal<Tab>('history');

  // ── History ──────────────────────────────────────────
  alerts = signal<AlertEvent[]>([]);
  loading = signal(false);
  filterLevel = signal<FilterLevel>('all');
  filterAck = signal<FilterAck>('all');
  playingClipId = signal<number | null>(null);
  selectedAlert = signal<AlertEvent | null>(null);

  // ── Watchlist ────────────────────────────────────────
  watchlist = signal<any[]>([]);
  watchlistLoading = signal(false);

  ngOnInit() {
    this.loadAlerts();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'watchlist') this.loadWatchlist();
    if (tab === 'history') this.loadAlerts();
  }

  // ── Alert History ────────────────────────────────────

  loadAlerts(): void {
    this.loading.set(true);
    const ack = this.filterAck() === 'pending' ? false
              : this.filterAck() === 'acknowledged' ? true
              : undefined;

    this.alertSvc.getAlertEvents(200, 0, ack).subscribe({
      next: (res) => {
        let filtered = res.alerts;
        if (this.filterLevel() === 'critical') {
          filtered = filtered.filter(a => a.alert_level === 'critical');
        } else if (this.filterLevel() === 'watch') {
          filtered = filtered.filter(a => a.alert_level === 'watch');
        }
        this.alerts.set(filtered);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  acknowledgeOne(id: number): void {
    this.alertSvc.acknowledgeAlert(id).subscribe(() => this.loadAlerts());
  }

  acknowledgeAll(): void {
    this.alertSvc.acknowledgeAll().subscribe(() => this.loadAlerts());
  }

  toggleClip(alert: AlertEvent): void {
    this.playingClipId.set(
      this.playingClipId() === alert.id ? null : alert.id
    );
  }

  clipUrl(alertId: number): string {
    return this.alertSvc.clipUrl(alertId);
  }

  photoUrl(personId: string): string {
    return `${this.facesApi}/persons/${personId}/photo`;
  }

  thumbnailUrl(alertId: number): string {
    return this.alertSvc.thumbnailUrl(alertId);
  }

  openDetail(alert: AlertEvent): void {
    this.selectedAlert.set(alert);
    this.playingClipId.set(null);
  }

  closeDetail(): void {
    this.selectedAlert.set(null);
    this.playingClipId.set(null);
  }

  // ── Watchlist ────────────────────────────────────────

  loadWatchlist(): void {
    this.watchlistLoading.set(true);
    this.alertSvc.getWatchlist().subscribe({
      next: (res) => {
        this.watchlist.set(res.persons);
        this.watchlistLoading.set(false);
      },
      error: () => this.watchlistLoading.set(false),
    });
  }

  cycleAlertLevel(person: any): void {
    const cycle: Record<string, AlertLevel> = {
      normal: 'watch',
      watch: 'critical',
      critical: 'normal',
    };
    const next = cycle[person.alert_level] || 'watch';
    this.alertSvc.setAlertLevel(person.id, next).subscribe(() => {
      this.loadWatchlist();
    });
  }

  removeFromWatchlist(person: any): void {
    this.alertSvc.setAlertLevel(person.id, 'normal').subscribe(() => {
      this.loadWatchlist();
    });
  }

  // ── Helpers ──────────────────────────────────────────

  formatDate(ts: string): string {
    try {
      return new Date(ts).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return ts; }
  }

  relativeTime(ts: string): string {
    try {
      const diff = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Ahora mismo';
      if (mins < 60) return `Hace ${mins} min`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `Hace ${hrs}h`;
      const days = Math.floor(hrs / 24);
      return `Hace ${days}d`;
    } catch { return ts; }
  }

  pendingCount(): number {
    return this.alerts().filter(a => !a.acknowledged).length;
  }
}
