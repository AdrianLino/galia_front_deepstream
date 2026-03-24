import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AlertService } from '../../core/services/alert.service';
import { AlertEvent } from '../../core/models/alert.model';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50 shadow-lg px-6 py-3 flex items-center justify-between transition-all w-full h-16">
      
      <!-- Logo Section -->
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <span class="font-black text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">GALIA</span>
      </div>

      <!-- Navigation Links -->
      <div class="flex items-center gap-1.5 p-1 bg-gray-800/50 rounded-xl border border-gray-700/30">
        <a routerLink="/dashboard" routerLinkActive="bg-gray-700 text-white shadow-sm" [routerLinkActiveOptions]="{exact: true}"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
           Dashboard
        </a>
        <a routerLink="/stream" routerLinkActive="bg-blue-600 text-white shadow-md shadow-blue-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
           Stream
        </a>
        <a routerLink="/video" routerLinkActive="bg-pink-600 text-white shadow-md shadow-pink-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 4v16l13-8z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>
           Video
        </a>
        <a routerLink="/faces" routerLinkActive="bg-purple-600 text-white shadow-md shadow-purple-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
           Faces
        </a>

        <a routerLink="/map" routerLinkActive="bg-cyan-600 text-white shadow-md shadow-cyan-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7"/></svg>
           Mapa
        </a>
        <a routerLink="/geocercas" routerLinkActive="bg-orange-600 text-white shadow-md shadow-orange-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
           Geocercas
        </a>
        <a routerLink="/face-history" routerLinkActive="bg-indigo-600 text-white shadow-md shadow-indigo-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
           Historial
        </a>
      </div>

      <!-- Right Side: Alert Bell + User -->
      <div class="flex items-center gap-3 relative">

        <!-- Alert Bell -->
        <button (click)="toggleHistoryPanel()"
                class="relative w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                [class]="alertSvc.unreadCount() > 0
                  ? 'bg-red-600/20 text-red-400 border border-red-500/50 animate-pulse'
                  : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          @if (alertSvc.unreadCount() > 0) {
            <span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {{ alertSvc.unreadCount() > 99 ? '99+' : alertSvc.unreadCount() }}
            </span>
          }
        </button>

        <!-- ───── History Dropdown Panel ───── -->
        @if (showPanel()) {
          <div class="absolute right-0 top-12 w-[440px] max-h-[560px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">

            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 shrink-0">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span class="text-sm font-bold text-white">Historial de Alertas</span>
              </div>
              <div class="flex items-center gap-2">
                @if (alertSvc.historyAlerts().length > 0) {
                  <button (click)="acknowledgeAll()"
                          class="text-[10px] font-semibold text-gray-400 hover:text-green-400 transition-colors px-2 py-1 rounded hover:bg-green-500/10">
                    ✓ Marcar todas leídas
                  </button>
                }
                <button (click)="alertSvc.loadHistory()"
                        class="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700/50"
                        [class.animate-spin]="alertSvc.historyLoading()">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Alert list (scrollable) -->
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              @if (alertSvc.historyLoading()) {
                <div class="px-4 py-8 text-center">
                  <div class="inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin"></div>
                  <p class="text-xs text-gray-500 mt-2">Cargando historial…</p>
                </div>
              } @else if (alertSvc.historyAlerts().length === 0) {
                <div class="px-4 py-10 text-center">
                  <svg class="w-10 h-10 mx-auto text-gray-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p class="text-sm text-gray-500">Sin alertas registradas</p>
                </div>
              } @else {
                @for (alert of alertSvc.historyAlerts(); track alert.id) {
                  <div class="px-4 py-3 border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors"
                       [class.opacity-50]="alert.acknowledged">

                    <div class="flex items-start gap-3">
                      <!-- Person photo -->
                      <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 border-2"
                           [class]="alert.alert_level === 'critical' ? 'border-red-500/50' : 'border-yellow-500/40'">
                        @if (alert.person_id) {
                          <img [src]="alertSvc.personPhotoUrl(alert.person_id)"
                               [alt]="alert.person_name"
                               class="w-full h-full object-cover"
                               (error)="$event.target['style'].display='none'" />
                        }
                        <div class="w-full h-full flex items-center justify-center bg-gray-800">
                          <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        </div>
                      </div>

                      <!-- Info -->
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-bold text-white truncate">{{ alert.person_name }}</span>
                          <span class="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                                [class]="alert.alert_level === 'critical'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-yellow-500/20 text-yellow-400'">
                            {{ alert.alert_level === 'critical' ? 'CRÍTICO' : 'VIGILAR' }}
                          </span>
                          @if (alert.acknowledged) {
                            <span class="text-[9px] text-green-500 font-semibold">✓</span>
                          }
                        </div>
                        <div class="flex items-center gap-1.5 mt-0.5">
                          <svg class="w-3 h-3 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                          </svg>
                          <span class="text-xs text-gray-400 truncate">{{ alert.camera_name || 'Cámara desconocida' }}</span>
                          <span class="text-[10px] text-gray-500">&middot; {{ (alert.confidence * 100).toFixed(0) }}%</span>
                        </div>
                        <div class="flex items-center gap-3 mt-1">
                          <span class="text-[10px] text-gray-500">{{ formatTime(alert.created_at) }}</span>

                          <!-- Clip button (if available) -->
                          @if (alert.clip_path) {
                            <button (click)="playClip(alert)"
                                    class="flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Ver clip 10s
                            </button>
                          } @else {
                            <span class="text-[10px] text-gray-600 italic">Sin clip</span>
                          }

                          <!-- Acknowledge button -->
                          @if (!alert.acknowledged) {
                            <button (click)="acknowledgeOne(alert.id)"
                                    class="text-[10px] font-semibold text-gray-500 hover:text-green-400 transition-colors">
                              ✓ Ack
                            </button>
                          }
                        </div>
                      </div>
                    </div>

                    <!-- Inline video player -->
                    @if (playingClipId() === alert.id) {
                      <div class="mt-2 rounded-lg overflow-hidden border border-gray-700 bg-black">
                        <video [src]="alertSvc.clipUrl(alert.id)"
                               controls autoplay
                               class="w-full max-h-48 rounded-lg"
                               (ended)="playingClipId.set(null)">
                        </video>
                      </div>
                    }
                  </div>
                }
              }
            </div>
          </div>
        }

        <a routerLink="/settings" routerLinkActive="ring-2 ring-blue-500"
           class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors"
           title="Configuración">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </a>
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-500 border border-gray-600 flex items-center justify-center cursor-pointer shadow-sm">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        </div>
      </div>
    </nav>

    <!-- Click-outside overlay to close panel -->
    @if (showPanel()) {
      <div class="fixed inset-0 z-40" (click)="showPanel.set(false)"></div>
    }
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
  `]
})
export class NavComponent implements OnInit, OnDestroy {
  alertSvc = inject(AlertService);

  showPanel = signal(false);
  playingClipId = signal<number | null>(null);

  ngOnInit() {
    this.alertSvc.connectSSE();
  }

  ngOnDestroy() {
    this.alertSvc.disconnectSSE();
  }

  toggleHistoryPanel(): void {
    const opening = !this.showPanel();
    this.showPanel.set(opening);
    if (opening) {
      this.alertSvc.markRead();
      this.alertSvc.loadHistory();
    } else {
      this.playingClipId.set(null);
    }
  }

  acknowledgeOne(alertId: number): void {
    this.alertSvc.acknowledgeAlert(alertId).subscribe(() => {
      this.alertSvc.loadHistory();
    });
  }

  acknowledgeAll(): void {
    this.alertSvc.acknowledgeAll().subscribe(() => {
      this.alertSvc.loadHistory();
    });
  }

  playClip(alert: AlertEvent): void {
    this.playingClipId.set(
      this.playingClipId() === alert.id ? null : alert.id
    );
  }

  formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Ahora mismo';
      if (diffMins < 60) return `Hace ${diffMins} min`;

      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `Hace ${diffHrs}h`;

      return d.toLocaleDateString('es-MX', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch { return ts; }
  }
}
