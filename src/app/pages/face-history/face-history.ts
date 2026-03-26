import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FaceHistoryService,
  FaceHistoryItem,
  FaceHistoryPerson,
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

        <!-- Person dropdown -->
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Persona</label>
          <select [(ngModel)]="filterPerson"
                  (ngModelChange)="applyFilters()"
                  class="bg-gray-900 border border-gray-700 rounded-lg text-xs text-white px-2 py-1 min-w-[160px] focus:outline-none focus:ring-1 focus:ring-indigo-500">
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
        @if (filterPerson || filterFrom || filterTo) {
          <button (click)="clearFilters()"
                  class="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors">
            Limpiar filtros
          </button>
        }
      </div>

      <!-- Table -->
      <div class="bg-gray-800/40 rounded-lg border border-gray-700/40 overflow-hidden">
        @if (loading()) {
          <div class="py-10 text-center">
            <div class="inline-block w-6 h-6 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin"></div>
            <p class="text-xs text-gray-500 mt-2">Cargando historial…</p>
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
    this.loadPersons();
    this.loadData();
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadData();
  }

  clearFilters(): void {
    this.filterPerson = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.currentPage.set(1);
    this.loadData();
  }

  goPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadData();
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
