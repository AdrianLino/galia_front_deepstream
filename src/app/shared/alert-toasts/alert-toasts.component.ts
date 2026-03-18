import { Component, inject } from '@angular/core';
import { AlertService } from '../../core/services/alert.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-alert-toasts',
  standalone: true,
  template: `
    <!-- Fixed toast container — right edge, below navbar -->
    <div class="fixed top-20 right-4 z-[9999] flex flex-col gap-3 w-[380px] max-h-[calc(100vh-6rem)] overflow-y-auto pointer-events-none custom-scrollbar">
      @for (toast of alertSvc.toasts(); track toast.alert_id) {
        <div class="pointer-events-auto animate-slide-in-right rounded-xl shadow-2xl border overflow-hidden backdrop-blur-md transition-all"
             [class]="toast.alert_level === 'critical'
               ? 'bg-red-950/90 border-red-500/60 shadow-red-900/40'
               : 'bg-yellow-950/90 border-yellow-500/50 shadow-yellow-900/30'">

          <!-- Color bar top -->
          <div class="h-1 w-full"
               [class]="toast.alert_level === 'critical' ? 'bg-red-500' : 'bg-yellow-500'"></div>

          <div class="px-4 py-3">
            <!-- Header row: icon + title + close -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full flex items-center justify-center"
                     [class]="toast.alert_level === 'critical'
                       ? 'bg-red-500/30 text-red-400'
                       : 'bg-yellow-500/30 text-yellow-400'">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <span class="text-[10px] font-black uppercase tracking-widest"
                      [class]="toast.alert_level === 'critical' ? 'text-red-400' : 'text-yellow-400'">
                  {{ toast.alert_level === 'critical' ? 'ALERTA CRÍTICA' : 'PERSONA EN VIGILANCIA' }}
                </span>
              </div>
              <button (click)="dismiss(toast.alert_id)"
                      class="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Body: photo + info -->
            <div class="flex items-center gap-3">
              <!-- Person photo -->
              <div class="w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2"
                   [class]="toast.alert_level === 'critical' ? 'border-red-500/50' : 'border-yellow-500/40'">
                @if (toast.person_id) {
                  <img [src]="photoUrl(toast.person_id)"
                       [alt]="toast.person_name"
                       class="w-full h-full object-cover"
                       (error)="$event.target['style'].display='none'" />
                }
                <div class="w-full h-full flex items-center justify-center bg-gray-800">
                  <svg class="w-7 h-7 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate leading-tight">
                  {{ toast.person_name }}
                </p>
                <div class="flex items-center gap-1.5 mt-1">
                  <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  <span class="text-xs text-gray-300 truncate">{{ toast.camera_name || 'Cámara desconocida' }}</span>
                </div>
                <div class="flex items-center gap-3 mt-1">
                  <span class="text-[10px] text-gray-400">
                    {{ (toast.confidence * 100).toFixed(0) }}% confianza
                  </span>
                  <span class="text-[10px] text-gray-500">
                    {{ formatTime(toast.timestamp) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Progress bar (auto dismiss timer) -->
            <div class="mt-2 h-0.5 w-full rounded-full overflow-hidden"
                 [class]="toast.alert_level === 'critical' ? 'bg-red-900/50' : 'bg-yellow-900/50'">
              <div class="h-full rounded-full animate-shrink-bar"
                   [class]="toast.alert_level === 'critical' ? 'bg-red-500' : 'bg-yellow-500'"
                   [style.animation-duration]="toast.alert_level === 'critical' ? '15s' : '10s'">
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-in-right {
      0% { opacity: 0; transform: translateX(100px) scale(0.95); }
      100% { opacity: 1; transform: translateX(0) scale(1); }
    }
    .animate-slide-in-right {
      animation: slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes shrink-bar {
      0% { width: 100%; }
      100% { width: 0%; }
    }
    .animate-shrink-bar {
      animation: shrink-bar linear forwards;
    }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
  `]
})
export class AlertToastsComponent {
  alertSvc = inject(AlertService);

  private readonly facesApi = `${environment.apiV1}/faces`;

  photoUrl(personId: string): string {
    return `${this.facesApi}/persons/${personId}/photo`;
  }

  dismiss(alertId: number): void {
    this.alertSvc.dismissToast(alertId);
  }

  formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { return ts; }
  }
}
