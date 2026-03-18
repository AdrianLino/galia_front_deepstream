import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackupService, BackupSection } from '../../core/services/backup.service';

interface SectionInfo {
  key: BackupSection;
  label: string;
  desc: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-950 text-white p-8">
      <div class="max-w-5xl mx-auto">

        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-black tracking-tight flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            Configuración
          </h1>
          <p class="text-gray-400 mt-1">Importar y exportar datos del sistema</p>
        </div>

        <!-- ═══ FULL BACKUP ═══ -->
        <div class="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 mb-8">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-xl font-bold flex items-center gap-2">
                <svg class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
                </svg>
                Backup Completo
              </h2>
              <p class="text-sm text-gray-400 mt-0.5">Exportar o importar todos los datos del sistema en un solo archivo ZIP</p>
            </div>
          </div>

          <div class="flex gap-3">
            <!-- Export All -->
            <button (click)="exportAll()"
                    [disabled]="exporting()"
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all
                           bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30">
              @if (exporting()) {
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Generando…
              } @else {
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Exportar Todo
              }
            </button>

            <!-- Import All -->
            <button (click)="importInput.click()"
                    [disabled]="importing()"
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all
                           bg-gray-700 hover:bg-gray-600 border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
              @if (importing()) {
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Importando…
              } @else {
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Importar Backup
              }
            </button>
            <input #importInput type="file" accept=".zip" class="hidden"
                   (change)="onImportAll($event)"/>
          </div>

          <!-- Status message -->
          @if (statusMsg()) {
            <div class="mt-4 px-4 py-2.5 rounded-lg text-sm font-medium"
                 [class]="statusOk() ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/30'">
              {{ statusMsg() }}
            </div>
          }
        </div>

        <!-- ═══ PER-SECTION ═══ -->
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
          Exportar / Importar por Sección
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          @for (sec of sections; track sec.key) {
            <div class="bg-gray-900 border border-gray-700/50 rounded-xl p-5 hover:border-gray-600 transition-colors">
              <div class="flex items-start gap-3 mb-4">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                     [style.background]="sec.color + '22'"
                     [style.color]="sec.color">
                  <span class="text-xl" [innerHTML]="sec.icon"></span>
                </div>
                <div>
                  <h3 class="font-bold text-base">{{ sec.label }}</h3>
                  <p class="text-xs text-gray-400 mt-0.5">{{ sec.desc }}</p>
                </div>
              </div>

              <div class="flex gap-2">
                <button (click)="exportSection(sec.key)"
                        [disabled]="sectionExporting() === sec.key"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                        [style.background]="sec.color + '20'"
                        [style.color]="sec.color"
                        [class.opacity-50]="sectionExporting() === sec.key">
                  @if (sectionExporting() === sec.key) {
                    <div class="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                  } @else {
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  }
                  Exportar
                </button>
                <button (click)="triggerSectionImport(sec.key)"
                        [disabled]="sectionImporting() === sec.key"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all
                               bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                        [class.opacity-50]="sectionImporting() === sec.key">
                  @if (sectionImporting() === sec.key) {
                    <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  } @else {
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                  }
                  Importar
                </button>
              </div>

              <!-- Section status -->
              @if (sectionStatus()[sec.key]; as msg) {
                <div class="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium"
                     [class]="sectionStatusOk()[sec.key]
                       ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                       : 'bg-red-500/10 text-red-400 border border-red-500/30'">
                  {{ msg }}
                </div>
              }
            </div>
          }
        </div>

        <!-- File structure legend -->
        <div class="mt-8 bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 class="text-sm font-bold text-gray-300 mb-3">Estructura del archivo exportado</h3>
          <pre class="text-xs text-gray-500 font-mono leading-relaxed">backup_YYYYMMDD_HHMMSS/
├── manifest.json
├── personas/
│   ├── personas.json        ← Datos de personas registradas
│   ├── fotos/               ← Imágenes de rostros (*.jpg)
│   └── embeddings.json      ← Vectores faciales (caché local)
├── camaras/
│   ├── rtsp_sources.json    ← Cámaras RTSP y su configuración
│   └── adjacencias.json     ← Topología entre cámaras
├── geocercas/
│   └── spatial_nodes.json   ← Nodos espaciales jerárquicos
└── alertas/
    └── alert_events.json    ← Historial de alertas</pre>
        </div>

      </div>
    </div>
  `,
})
export class SettingsComponent {
  private backupSvc = inject(BackupService);

  sections: SectionInfo[] = [
    { key: 'personas',   label: 'Personas / Caras',     desc: 'Perfiles, fotos de rostro y embeddings faciales',   icon: '👤', color: '#a855f7' },
    { key: 'camaras',    label: 'Cámaras RTSP',         desc: 'Fuentes RTSP, configuración y topología',           icon: '📹', color: '#3b82f6' },
    { key: 'geocercas',  label: 'Geocercas',            desc: 'Nodos espaciales, polígonos y planos',              icon: '📍', color: '#f97316' },
    { key: 'alertas',    label: 'Alertas',              desc: 'Historial completo de eventos de alerta',           icon: '🔔', color: '#ef4444' },
  ];

  exporting = signal(false);
  importing = signal(false);
  statusMsg = signal<string | null>(null);
  statusOk = signal(true);

  sectionExporting = signal<BackupSection | null>(null);
  sectionImporting = signal<BackupSection | null>(null);
  sectionStatus = signal<Record<string, string>>({});
  sectionStatusOk = signal<Record<string, boolean>>({});

  private pendingSection: BackupSection | null = null;

  exportAll(): void {
    this.exporting.set(true);
    this.statusMsg.set(null);
    this.backupSvc.exportAll().subscribe({
      next: (blob) => {
        this.downloadBlob(blob, 'backup_completo.zip');
        this.exporting.set(false);
        this.statusMsg.set('✓ Backup completo descargado correctamente');
        this.statusOk.set(true);
      },
      error: (err) => {
        this.exporting.set(false);
        this.statusMsg.set('✗ Error al generar backup: ' + (err.error?.detail || err.message));
        this.statusOk.set(false);
      },
    });
  }

  exportSection(section: BackupSection): void {
    this.sectionExporting.set(section);
    this.clearSectionStatus(section);
    this.backupSvc.exportSection(section).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `backup_${section}.zip`);
        this.sectionExporting.set(null);
        this.setSectionStatus(section, `✓ ${section} exportado`, true);
      },
      error: (err) => {
        this.sectionExporting.set(null);
        this.setSectionStatus(section, '✗ Error: ' + (err.error?.detail || err.message), false);
      },
    });
  }

  onImportAll(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    this.importing.set(true);
    this.statusMsg.set(null);
    this.backupSvc.importAll(file).subscribe({
      next: (res) => {
        this.importing.set(false);
        const summary = Object.entries(res.imported)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        this.statusMsg.set(`✓ Importación completa — ${summary}`);
        this.statusOk.set(true);
      },
      error: (err) => {
        this.importing.set(false);
        this.statusMsg.set('✗ Error al importar: ' + (err.error?.detail || err.message));
        this.statusOk.set(false);
      },
    });
  }

  triggerSectionImport(section: BackupSection): void {
    this.pendingSection = section;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file && this.pendingSection) {
        this.doImportSection(this.pendingSection, file);
      }
    };
    input.click();
  }

  private doImportSection(section: BackupSection, file: File): void {
    this.sectionImporting.set(section);
    this.clearSectionStatus(section);
    this.backupSvc.importSection(section, file).subscribe({
      next: (res) => {
        this.sectionImporting.set(null);
        const count = Object.values(res.imported)[0] ?? 0;
        this.setSectionStatus(section, `✓ ${count} registros importados`, true);
      },
      error: (err) => {
        this.sectionImporting.set(null);
        this.setSectionStatus(section, '✗ Error: ' + (err.error?.detail || err.message), false);
      },
    });
  }

  // ── private helpers ──────────────────────────────────────────────────

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private setSectionStatus(section: string, msg: string, ok: boolean): void {
    this.sectionStatus.update(s => ({ ...s, [section]: msg }));
    this.sectionStatusOk.update(s => ({ ...s, [section]: ok }));
  }

  private clearSectionStatus(section: string): void {
    this.sectionStatus.update(s => {
      const copy = { ...s };
      delete copy[section];
      return copy;
    });
  }
}
