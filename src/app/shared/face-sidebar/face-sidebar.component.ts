import { Component, computed, inject, signal } from '@angular/core';
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
          @if (filteredIdentifications().length > 0) {
            <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">
              {{ filteredIdentifications().length }}
            </span>
          }
        </div>
        @if (identifications().length > 0) {
          <button (click)="clear()" class="text-[10px] text-gray-400 hover:text-red-400 transition-colors" title="Limpiar lista">
            Limpiar
          </button>
        }
      </div>

      <!-- Search / Filter -->
      @if (identifications().length > 0) {
        <div class="relative px-3 py-2 border-b border-gray-700/50 bg-gray-800 flex-shrink-0">
          <div class="relative">
            <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text"
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
              (focus)="showDropdown.set(true)"
              placeholder="Filtrar por persona..."
              class="w-full pl-8 pr-8 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30" />
            @if (searchQuery() || selectedPerson()) {
              <button (click)="clearFilter()"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            }
          </div>

          <!-- Dropdown list of unique names -->
          @if (showDropdown() && matchingNames().length > 0 && !selectedPerson()) {
            <div class="absolute left-3 right-3 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
              @for (entry of matchingNames(); track entry.name) {
                <button (click)="selectPerson(entry.name)"
                  class="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-gray-750 transition-colors border-b border-gray-800 last:border-0">
                  <span class="truncate"
                    [class.text-white]="entry.name !== 'Desconocido' && !entry.name.startsWith('~')"
                    [class.text-red-400]="entry.name === 'Desconocido'"
                    [class.text-yellow-400]="entry.name.startsWith('~')">
                    {{ displayName(entry.name) }}
                  </span>
                  <span class="text-[10px] text-gray-500 ml-2 flex-shrink-0">{{ entry.count }}</span>
                </button>
              }
            </div>
          }

          <!-- Active filter chip -->
          @if (selectedPerson()) {
            <div class="flex items-center gap-1.5 mt-1.5">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <span class="truncate max-w-[140px]">{{ displayName(selectedPerson()!) }}</span>
                <button (click)="clearFilter()" class="hover:text-white ml-0.5">&times;</button>
              </span>
            </div>
          }
        </div>
      }

      <!-- List -->
      <div class="flex-1 overflow-y-auto custom-scrollbar" (click)="showDropdown.set(false)">
        @if (filteredIdentifications().length === 0) {
          <div class="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
            <svg class="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            @if (selectedPerson()) {
              <p class="text-xs">Sin resultados para "{{ displayName(selectedPerson()!) }}"</p>
            } @else {
              <p class="text-xs">Esperando identificaciones...</p>
              <p class="text-[10px] mt-1 text-gray-600">Los rostros aparecerán aquí cuando sean reconocidos</p>
            }
          </div>
        } @else {
          @for (item of filteredIdentifications(); track item.track_id + '_' + item.timestamp) {
            <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700/30 hover:bg-gray-750 transition-colors"
                 [class.bg-red-900/10]="item.person_name === 'Desconocido'"
                 [class.bg-yellow-900/10]="item.person_name.startsWith('~')">

              <!-- Thumbnail (click to expand) -->
              <div class="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700 border border-gray-600/50 cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all"
                   (click)="item.thumbnail ? expandImage(item) : null">
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

      <!-- Lightbox Modal -->
      @if (expandedItem()) {
        <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
             (click)="closeExpand()">
          <div class="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4"
               (click)="$event.stopPropagation()">
            <!-- Close button -->
            <button (click)="closeExpand()"
              class="absolute -top-2 -right-2 z-10 w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-red-600 text-white rounded-full border border-gray-600 shadow-xl transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <!-- Expanded image -->
            <img [src]="alertService.identificationThumbnailUrl(expandedItem()!.thumbnail!)"
                 class="max-w-[85vw] max-h-[75vh] object-contain rounded-xl border-2 border-gray-600 shadow-2xl" alt="" />
            <!-- Info below image -->
            <div class="bg-gray-900/90 backdrop-blur rounded-lg px-5 py-3 border border-gray-700 text-center shadow-xl">
              <p class="text-lg font-bold"
                [class.text-white]="!isUnknown(expandedItem()!.person_name)"
                [class.text-red-400]="expandedItem()!.person_name === 'Desconocido'"
                [class.text-yellow-400]="expandedItem()!.person_name.startsWith('~')">
                {{ displayName(expandedItem()!.person_name) }}
              </p>
              <p class="text-xs text-gray-400 mt-1">
                {{ expandedItem()!.camera_name || 'Cam' + expandedItem()!.source_id }}
                &middot; {{ formatTime(expandedItem()!.timestamp) }}
                @if (!isUnknown(expandedItem()!.person_name)) {
                  &middot; <span class="text-blue-400">{{ (expandedItem()!.confidence * 100).toFixed(1) }}%</span>
                }
              </p>
            </div>
          </div>
        </div>
      }
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
  readonly expandedItem = signal<FaceIdentifiedPayload | null>(null);

  // Filter state
  readonly searchQuery = signal('');
  readonly selectedPerson = signal<string | null>(null);
  readonly showDropdown = signal(false);

  /** Unique person names from current identifications, filtered by search query */
  readonly matchingNames = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const counts = new Map<string, number>();
    for (const item of this.identifications()) {
      const name = item.person_name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    if (!q) return entries;
    return entries.filter(e =>
      this.displayName(e.name).toLowerCase().includes(q)
    );
  });

  /** Identifications filtered by selected person */
  readonly filteredIdentifications = computed(() => {
    const person = this.selectedPerson();
    if (!person) return this.identifications();
    return this.identifications().filter(i => i.person_name === person);
  });

  clear(): void {
    this.alertService.clearIdentifications();
    this.clearFilter();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.selectedPerson.set(null);
    this.showDropdown.set(true);
  }

  selectPerson(name: string): void {
    this.selectedPerson.set(name);
    this.searchQuery.set('');
    this.showDropdown.set(false);
  }

  clearFilter(): void {
    this.searchQuery.set('');
    this.selectedPerson.set(null);
    this.showDropdown.set(false);
  }

  expandImage(item: FaceIdentifiedPayload): void {
    this.expandedItem.set(item);
  }

  closeExpand(): void {
    this.expandedItem.set(null);
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
