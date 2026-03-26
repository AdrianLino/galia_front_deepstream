import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FaceHistoryService,
  FaceHistoryItem,
  FaceHistoryPerson,
  FaceSearchResult,
} from '../../core/services/face-history.service';

@Component({
  selector: 'app-face-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-[calc(100vh-3rem)] overflow-y-auto p-3 space-y-3">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <h1 class="text-base font-black text-white tracking-tight">Historial de Rostros</h1>
            <p class="text-xs text-gray-400">{{ total() }} registros totales</p>
          </div>
        </div>
        <button (click)="reload()"
                class="px-3 py-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors flex items-center gap-1.5"
                [class.animate-spin]="loading()">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Actualizar
        </button>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-3 bg-gray-800/50 rounded-lg border border-gray-700/40 p-3">

        <!-- Face search button -->
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Buscar por rostro</label>
          <input #faceInput type="file" accept="image/jpeg,image/png" class="hidden"
                 (change)="onFaceFileSelected($event)"/>
          <button (click)="faceInput.click()"
                  class="px-3 py-1 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5"
                  [class]="faceSearchMode()
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700'"
                  [disabled]="faceSearching()">
            @if (faceSearching()) {
              <div class="w-3.5 h-3.5 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>
              Buscando…
            } @else {
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <svg class="w-3.5 h-3.5 -ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 11.75a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zm6 0a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.23-2.98 5.21-5.37C11.07 8.33 14.05 10 17.42 10c.78 0 1.53-.09 2.25-.26.21.71.33 1.47.33 2.26 0 4.41-3.59 8-8 8z"/>
              </svg>
              Subir cara
            }
          </button>
        </div>

        <!-- Person dropdown -->
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Persona</label>
          <select [(ngModel)]="filterPerson"
                  (ngModelChange)="applyFilters()"
                  [disabled]="faceSearchMode() === 'unknown'"
                  class="bg-gray-900 border border-gray-700 rounded-lg text-xs text-white px-2 py-1 min-w-[160px] focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50">
            <option value="">Todas</option>
            @for (p of persons(); track p.person_name) {
              <option [value]="p.person_name">{{ p.person_name }} ({{ p.count }})</option>
            }
          </select>
        </div>

        <!-- Date from -->
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Desde</label>
          <input type="datetime-local" [(ngModel)]="filterFrom" (change)="applyFilters()"
                 class="bg-gray-900 border border-gray-700 rounded-lg text-xs text-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
        </div>

        <!-- Date to -->
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hasta</label>
          <input type="datetime-local" [(ngModel)]="filterTo" (change)="applyFilters()"
                 class="bg-gray-900 border border-gray-700 rounded-lg text-xs text-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
        </div>

        <!-- Clear -->
        @if (filterPerson || filterFrom || filterTo || faceSearchMode()) {
          <button (click)="clearFilters()"
                  class="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors">
            Limpiar filtros
          </button>
        }
      </div>

      <!-- Face search result banner -->
      @if (faceSearchMode()) {
        <div class="rounded-lg border p-3 flex items-center gap-3"
             [class]="faceSearchMode() === 'known'
               ? 'bg-green-900/30 border-green-600/40'
               : 'bg-amber-900/30 border-amber-600/40'">
          @if (faceSearchPreview()) {
            <img [src]="faceSearchPreview()" class="w-10 h-10 rounded-lg object-cover border border-gray-600"/>
          }
          <div class="flex-1 min-w-0">
            @if (faceSearchMode() === 'known') {
              <p class="text-xs font-bold text-green-400">
                Coincidencia encontrada: {{ faceSearchPersonName() }}
              </p>
              <p class="text-[10px] text-green-400/70">
                Confianza: {{ (faceSearchConfidence() * 100).toFixed(0) }}% — Mostrando registros de esta persona
              </p>
            } @else {
              <p class="text-xs font-bold text-amber-400">
                Persona no registrada — {{ total() }} apariciones encontradas en desconocidos
              </p>
              <p class="text-[10px] text-amber-400/70">
                Se comparó el rostro contra recortes de personas no identificadas
              </p>
            }
          </div>
          <button (click)="clearFaceSearch()"
                  class="px-2.5 py-1 text-xs font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors">
            ✕ Quitar
          </button>
        </div>
      }

      <!-- Table -->
      <div class="bg-gray-800/40 rounded-lg border border-gray-700/40 overflow-hidden">
        @if (loading()) {
          <div class="py-10 text-center">
            <div class="inline-block w-6 h-6 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin"></div>
            <p class="text-xs text-gray-500 mt-2">
              {{ faceSearching() ? 'Comparando rostros…' : 'Cargando historial…' }}
            </p>
          </div>
        } @else if (items().length === 0) {
          <div class="py-10 text-center">
            <svg class="w-10 h-10 mx-auto text-gray-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-xs text-gray-500">Sin registros</p>
          </div>
        } @else {
          <table class="w-full text-xs">
            <thead>
              <tr class="text-[9px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                <th class="px-3 py-2 text-left">Rostro</th>
                <th class="px-3 py-2 text-left">Persona</th>
                <th class="px-3 py-2 text-center">Confianza</th>
                <th class="px-3 py-2 text-left">Cámara</th>
                <th class="px-3 py-2 text-left">Fecha / Hora</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr class="border-b border-gray-800/40 hover:bg-gray-700/20 transition-colors">
                  <!-- Thumbnail -->
                  <td class="px-3 py-1.5">
                    @if (item.thumbnail_path) {
                      <img [src]="svc.thumbnailUrl(item.thumbnail_path)"
                           class="w-8 h-8 rounded-lg object-cover border border-gray-700 cursor-pointer hover:scale-110 transition-transform"
                           (click)="expandedItem.set(item)"
                           (error)="$event.target['style'].display='none'"
                           loading="lazy"/>
                    } @else {
                      <div class="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                        <svg class="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    }
                  </td>
                  <!-- Name -->
                  <td class="px-3 py-1.5">
                    <span class="font-bold"
                          [class]="item.person_name === 'Desconocido' ? 'text-red-400' : isUncertain(item) ? 'text-yellow-400' : 'text-green-400'">
                      {{ displayName(item) }}
                    </span>
                  </td>
                  <!-- Confidence -->
                  <td class="px-3 py-1.5 text-center">
                    <span class="inline-flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full"
                            [class]="item.confidence >= 0.6 ? 'bg-green-400' : item.confidence >= 0.4 ? 'bg-yellow-400' : 'bg-red-400'"></span>
                      <span class="text-gray-300 font-mono text-xs">{{ (item.confidence * 100).toFixed(0) }}%</span>
                    </span>
                  </td>
                  <!-- Camera -->
                  <td class="px-3 py-1.5 text-gray-400">{{ item.camera_name || 'Cámara ' + item.source_id }}</td>
                  <!-- Date -->
                  <td class="px-3 py-1.5 text-gray-400 text-[10px]">{{ formatDate(item.created_at) }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Pagination -->
      @if (totalPages() > 1) {
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500">
            Mostrando {{ offset() + 1 }}–{{ Math.min(offset() + pageSize, total()) }} de {{ total() }}
          </span>
          <div class="flex items-center gap-1">
            <button (click)="goPage(currentPage() - 1)" [disabled]="currentPage() <= 1"
                    class="px-2.5 py-1 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              ← Anterior
            </button>
            @for (pg of visiblePages(); track pg) {
              <button (click)="goPage(pg)"
                      class="w-8 h-8 text-xs rounded-lg border transition-colors"
                      [class]="pg === currentPage()
                        ? 'border-indigo-500 bg-indigo-600 text-white font-bold'
                        : 'border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'">
                {{ pg }}
              </button>
            }
            <button (click)="goPage(currentPage() + 1)" [disabled]="currentPage() >= totalPages()"
                    class="px-2.5 py-1 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Siguiente →
            </button>
          </div>
        </div>
      }
    </div>

    <!-- Lightbox -->
    @if (expandedItem()) {
      <div class="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center" (click)="expandedItem.set(null)">
        <div class="relative max-w-lg" (click)="$event.stopPropagation()">
          @if (expandedItem()!.thumbnail_path) {
            <img [src]="svc.thumbnailUrl(expandedItem()!.thumbnail_path!)"
                 class="rounded-xl shadow-2xl max-h-[70vh] w-auto"/>
          }
          <div class="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur rounded-b-xl px-4 py-2 flex items-center justify-between">
            <span class="text-sm font-bold"
                  [class]="expandedItem()!.person_name === 'Desconocido' ? 'text-red-400' : isUncertain(expandedItem()!) ? 'text-yellow-400' : 'text-green-400'">
              {{ displayName(expandedItem()!) }}
            </span>
            <span class="text-xs text-gray-300">{{ (expandedItem()!.confidence * 100).toFixed(0) }}% · {{ expandedItem()!.camera_name }}</span>
          </div>
          <button (click)="expandedItem.set(null)"
                  class="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gray-800 border border-gray-600 text-white flex items-center justify-center hover:bg-red-600 transition-colors text-sm">
            ✕
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    select option { background: #111827; color: #fff; }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(1); }
  `]
})
export class FaceHistoryComponent implements OnInit {
  readonly svc = inject(FaceHistoryService);
  readonly Math = Math;

  readonly items = signal<FaceHistoryItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly persons = signal<FaceHistoryPerson[]>([]);
  readonly expandedItem = signal<FaceHistoryItem | null>(null);

  /** Face search state */
  readonly faceSearching = signal(false);
  readonly faceSearchMode = signal<'known' | 'unknown' | null>(null);
  readonly faceSearchPersonName = signal('');
  readonly faceSearchConfidence = signal(0);
  readonly faceSearchPreview = signal<string | null>(null);
  private faceSearchIds: number[] = [];

  filterPerson = '';
  filterFrom = '';
  filterTo = '';
  readonly pageSize = 50;

  readonly currentPage = signal(1);
  readonly offset = computed(() => (this.currentPage() - 1) * this.pageSize);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  ngOnInit(): void {
    this.loadPersons();
    this.loadData();
  }

  reload(): void {
    if (this.faceSearchMode()) return;
    this.loadPersons();
    this.loadData();
  }

  applyFilters(): void {
    if (this.faceSearchMode() === 'unknown') return;
    this.currentPage.set(1);
    this.loadData();
  }

  clearFilters(): void {
    this.clearFaceSearch();
    this.filterPerson = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.currentPage.set(1);
    this.loadData();
  }

  goPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    if (this.faceSearchMode() === 'unknown') {
      // Paginate locally over the face search results
      this.paginateUnknownResults();
    } else {
      this.loadData();
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  /** ~name with confidence >= 25% counts as identified */
  isUncertain(item: FaceHistoryItem): boolean {
    return item.person_name.startsWith('~') && item.confidence < 0.25;
  }

  displayName(item: FaceHistoryItem): string {
    if (item.person_name.startsWith('~')) {
      const base = item.person_name.substring(1);
      return item.confidence >= 0.25 ? base : base + ' ?';
    }
    return item.person_name;
  }

  /** Handle face image selection */
  onFaceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    // Show preview
    const reader = new FileReader();
    reader.onload = () => this.faceSearchPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    this.faceSearching.set(true);
    this.loading.set(true);
    this.svc.searchByFace(file).subscribe({
      next: (res) => {
        this.faceSearching.set(false);
        this.handleFaceSearchResult(res);
      },
      error: (err) => {
        this.faceSearching.set(false);
        this.loading.set(false);
        const msg = err.error?.detail || 'Error al buscar por rostro';
        alert(msg);
      },
    });
  }

  /** Clear face search and return to normal mode */
  clearFaceSearch(): void {
    this.faceSearchMode.set(null);
    this.faceSearchPersonName.set('');
    this.faceSearchConfidence.set(0);
    this.faceSearchPreview.set(null);
    this.faceSearchIds = [];
    this._allUnknownItems = [];
  }

  private handleFaceSearchResult(res: FaceSearchResult): void {
    if (res.match_type === 'known' && res.person_name) {
      // Known person — auto-filter by name
      this.faceSearchMode.set('known');
      this.faceSearchPersonName.set(res.person_name);
      this.faceSearchConfidence.set(res.confidence);
      this.filterPerson = res.person_name;
      this.currentPage.set(1);
      this.loadData();
    } else if (res.match_type === 'unknown' && res.items.length > 0) {
      // Unknown person — show matching records directly
      this.faceSearchMode.set('unknown');
      this.faceSearchConfidence.set(0);
      this._allUnknownItems = res.items;
      this.total.set(res.total);
      this.currentPage.set(1);
      this.paginateUnknownResults();
      this.loading.set(false);
    } else {
      // No match
      this.loading.set(false);
      this.faceSearchMode.set(null);
      this.faceSearchPreview.set(null);
      const hint = (res as any).closest_hint;
      if (hint) {
        alert(`No se encontró coincidencia.\nLa persona más parecida registrada es: ${hint} (${(res.confidence * 100).toFixed(0)}%)`);
      } else {
        alert('No se encontró coincidencia con ningún rostro en el historial.');
      }
    }
  }

  /** All unknown items from face search (for client-side pagination) */
  private _allUnknownItems: FaceHistoryItem[] = [];

  private paginateUnknownResults(): void {
    const start = this.offset();
    const end = start + this.pageSize;
    this.items.set(this._allUnknownItems.slice(start, end));
  }

  private loadData(): void {
    this.loading.set(true);
    this.svc
      .list({
        limit: this.pageSize,
        offset: this.offset(),
        person_name: this.filterPerson || undefined,
        date_from: this.filterFrom ? new Date(this.filterFrom).toISOString() : undefined,
        date_to: this.filterTo ? new Date(this.filterTo).toISOString() : undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private loadPersons(): void {
    this.svc.persons().subscribe({
      next: (list) => this.persons.set(list),
    });
  }
}
