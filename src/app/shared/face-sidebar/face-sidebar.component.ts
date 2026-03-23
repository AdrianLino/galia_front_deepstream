import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertService } from '../../core/services/alert.service';
import { FaceIdentifiedPayload } from '../../core/models/alert.model';

@Component({
  selector: 'app-face-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Face Identification Sidebar -->
    <div class="flex flex-col h-full bg-gray-800 border-l border-gray-700/50 overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 bg-gray-850 flex-shrink-0">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span class="text-sm font-bold text-white">Identificaciones</span>
          @if (identifications().length > 0) {
            <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">
              {{ identifications().length }}
            </span>
          }
        </div>
        @if (identifications().length > 0) {
          <button (click)="clear()" class="text-[10px] text-gray-400 hover:text-red-400 transition-colors" title="Limpiar lista">
            Limpiar
          </button>
        }
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto custom-scrollbar">
        @if (identifications().length === 0) {
          <div class="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
            <svg class="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <p class="text-xs">Esperando identificaciones...</p>
            <p class="text-[10px] mt-1 text-gray-600">Los rostros aparecerán aquí cuando sean reconocidos</p>
          </div>
        } @else {
          @for (item of identifications(); track item.track_id + '_' + item.timestamp) {
            <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700/30 hover:bg-gray-750 transition-colors"
                 [class.bg-red-900/10]="item.person_name === 'Desconocido'"
                 [class.bg-yellow-900/10]="item.person_name.startsWith('~')">

              <!-- Thumbnail -->
              <div class="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700 border border-gray-600/50">
                @if (item.thumbnail) {
                  <img [src]="alertService.identificationThumbnailUrl(item.thumbnail)"
                       (error)="$event.target.style.display='none'"
                       class="w-full h-full object-cover" alt="" />
                } @else {
                  <div class="w-full h-full flex items-center justify-center">
                    <svg class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                  </div>
                }
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold truncate"
                    [class.text-white]="!isUnknown(item.person_name)"
                    [class.text-red-400]="item.person_name === 'Desconocido'"
                    [class.text-yellow-400]="item.person_name.startsWith('~')">
                    {{ displayName(item.person_name) }}
                  </span>
                  @if (!isUnknown(item.person_name)) {
                    <span class="w-2 h-2 rounded-full flex-shrink-0"
                      [class.bg-green-400]="item.confidence >= 0.6"
                      [class.bg-yellow-400]="item.confidence >= 0.4 && item.confidence < 0.6"
                      [class.bg-red-400]="item.confidence < 0.4">
                    </span>
                  }
                </div>
                <div class="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>{{ item.camera_name || 'Cam' + item.source_id }}</span>
                  <span>&middot;</span>
                  <span>{{ formatTime(item.timestamp) }}</span>
                  @if (!isUnknown(item.person_name)) {
                    <span>&middot;</span>
                    <span class="text-blue-400">{{ (item.confidence * 100).toFixed(0) }}%</span>
                  }
                </div>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 2px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    .bg-gray-750 { background-color: #2d3748; }
    .bg-gray-850 { background-color: #1a202c; }
  `],
})
export class FaceSidebarComponent {
  readonly alertService = inject(AlertService);
  readonly identifications = this.alertService.identifications;

  clear(): void {
    this.alertService.clearIdentifications();
  }

  formatTime(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  }

  isUnknown(name: string): boolean {
    return name === 'Desconocido' || name.startsWith('~');
  }

  displayName(name: string): string {
    if (name.startsWith('~')) {
      return name.substring(1) + ' ?';
    }
    return name;
  }
}
