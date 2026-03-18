import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacesService } from '../../core/services/faces.service';
import { AlertService } from '../../core/services/alert.service';
import { FaceResult, IdentifyResponse, Person } from '../../core/models/face.model';

type Tab = 'persons' | 'register' | 'identify';

@Component({
  selector: 'app-faces',
  imports: [CommonModule, FormsModule],
  templateUrl: './faces.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  `]
})
export class FacesComponent implements OnInit, OnDestroy {
  private svc = inject(FacesService);
  private alertSvc = inject(AlertService);

  activeTab = signal<Tab>('persons');

  // Persons list + name lookup map
  persons = signal<Person[]>([]);
  listLoading = signal(false);
  private personsByName = new Map<string, Person>();

  // Pagination for persons
  searchQuery = signal('');
  readonly pageSize = 18; // 3 rows of 6 cols
  currentPage = signal(1);

  filteredPersons = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.persons();
    return this.persons().filter((p) => p.name.toLowerCase().includes(q));
  });

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPersons().length / this.pageSize))
  );

  pagedPersons = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredPersons().slice(start, start + this.pageSize);
  });

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.currentPage.set(1);
  }

  goToPage(page: number) {
    this.currentPage.set(page);
  }

  // Edit (rename)
  editingId = signal<string | null>(null);
  editingName = '';
  editLoading = signal(false);
  editError = signal<string | null>(null);

  // Delete
  deleteLoading = signal<string | null>(null);

  // Register
  registerName = '';
  registerFiles: File[] = [];
  isDragging = signal(false);
  registerLoading = signal(false);
  registerMsg = signal<string | null>(null);
  registerError = signal<string | null>(null);
  batchProgress = signal<number>(0);
  batchTotal = signal<number>(0);

  // Identify
  identifyFile: File | null = null;
  identifyPreviewUrl = signal<string | null>(null);
  identifyLoading = signal(false);
  identifyResult = signal<IdentifyResponse | null>(null);
  identifyError = signal<string | null>(null);
  private _previewObjectUrl: string | null = null;

  // Image metadata for bounding boxes
  imageWidth = signal<number>(0);
  imageHeight = signal<number>(0);
  isExpanded = signal<boolean>(false);
  Math = Math; // To use Math in template

  ngOnInit() {
    this.loadPersons();
  }

  ngOnDestroy() {
    this._revokePreview();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    if (tab === 'persons') this.loadPersons();
  }

  // ── Persons list ────────────────────────────────────────────────────────────

  loadPersons() {
    this.listLoading.set(true);
    this.svc.listPersons().subscribe({
      next: (res) => {
        this.persons.set(res.persons);
        this.personsByName.clear();
        for (const p of res.persons) {
          this.personsByName.set(p.name.toLowerCase(), p);
        }
        this.listLoading.set(false);
      },
      error: () => this.listLoading.set(false),
    });
  }

  photoUrl(id: string): string {
    return this.svc.photoUrl(id);
  }

  /** Returns the registered Person for a matched face name, or null. */
  matchedPerson(faceName: string): Person | null {
    return this.personsByName.get(faceName.toLowerCase()) ?? null;
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  startEdit(person: Person) {
    this.editingId.set(person.id);
    this.editingName = person.name;
    this.editError.set(null);
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editError.set(null);
  }

  saveEdit(person: Person) {
    const newName = this.editingName.trim();
    if (!newName || newName === person.name) { this.cancelEdit(); return; }
    this.editLoading.set(true);
    this.editError.set(null);
    this.svc.rename(person.id, newName).subscribe({
      next: () => { this.editLoading.set(false); this.editingId.set(null); this.loadPersons(); },
      error: (err) => { this.editError.set(err?.error?.detail ?? 'Error al renombrar.'); this.editLoading.set(false); },
    });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  deletePerson(person: Person) {
    if (!confirm(`¿Eliminar a "${person.name}" de todos los registros?`)) return;
    this.deleteLoading.set(person.id);
    this.svc.delete(person.id).subscribe({
      next: () => { this.deleteLoading.set(null); this.loadPersons(); },
      error: (err) => { alert(err?.error?.detail ?? 'Error al eliminar.'); this.deleteLoading.set(null); },
    });
  }

  // ── Alert Level (Watchlist) ─────────────────────────────────────────────────

  cycleAlertLevel(person: Person) {
    const cycle: Record<string, 'normal' | 'watch' | 'critical'> = {
      normal: 'watch',
      watch: 'critical',
      critical: 'normal',
    };
    const next = cycle[person.alert_level || 'normal'] || 'watch';
    this.alertSvc.setAlertLevel(person.id, next).subscribe({
      next: () => this.loadPersons(),
      error: (err) => alert(err?.error?.detail ?? 'Error al cambiar nivel de alerta.'),
    });
  }

  // ── Register ────────────────────────────────────────────────────────────────

  onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(false);
    
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      this.handleFiles(Array.from(e.dataTransfer.files));
    }
  }

  onRegisterFile(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.registerFiles = [];
      return;
    }
    this.handleFiles(Array.from(input.files));
  }

  private handleFiles(files: File[]) {
    // Filter only images if needed: files.filter(f => f.type.startsWith('image/'))
    this.registerFiles = files;
    
    if (this.registerFiles.length === 1 && !this.registerName.trim()) {
      const fileName = this.registerFiles[0].name;
      const lastDotIndex = fileName.lastIndexOf('.');
      this.registerName = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    } else if (this.registerFiles.length > 1) {
      this.registerName = ''; // Limpiar si es batch
    }
  }

  async register() {
    if (this.registerFiles.length === 0) return;
    if (this.registerFiles.length === 1 && !this.registerName.trim()) return;

    this.registerLoading.set(true);
    this.registerMsg.set(null);
    this.registerError.set(null);

    // Si es un solo archivo
    if (this.registerFiles.length === 1) {
      this.svc.register(this.registerName.trim(), this.registerFiles[0]).subscribe({
        next: (res) => {
          this.registerMsg.set(`"${res.name}" registrado. Score detección: ${res.detection_score}`);
          this.registerLoading.set(false);
          this.registerName = '';
          this.registerFiles = [];
          this.loadPersons();
        },
        error: (err) => { this.registerError.set(err?.error?.detail ?? 'Error al registrar.'); this.registerLoading.set(false); },
      });
      return;
    }

    // Si son múltiples archivos (Batch upload)
    this.batchTotal.set(this.registerFiles.length);
    this.batchProgress.set(0);
    
    let successCount = 0;
    let failCount = 0;
    let lastError = null;

    for (let i = 0; i < this.registerFiles.length; i++) {
        const file = this.registerFiles[i];
        
        let name = file.name;
        const lastDot = name.lastIndexOf('.');
        if (lastDot > 0) name = name.substring(0, lastDot);
        
        try {
            await lastValueFrom(this.svc.register(name, file));
            successCount++;
        } catch (e: any) {
            failCount++;
            lastError = e?.error?.detail ?? `Error en archivo ${file.name}`;
            console.error('Error subiendo', file.name, e);
        }
        
        this.batchProgress.set(i + 1);
    }
    
    this.registerLoading.set(false);
    this.registerFiles = [];
    this.batchProgress.set(0);
    this.batchTotal.set(0);
    this.loadPersons();
    
    if (failCount === 0) {
        this.registerMsg.set(`¡Se registraron ${successCount} rostros exitosamente!`);
    } else if (successCount > 0) {
        this.registerError.set(`Registro parcial: ${successCount} exitosos, ${failCount} fallidos. Último error: ${lastError}`);
    } else {
        this.registerError.set(`Error al registrar todos los ${failCount} archivos. Último error: ${lastError}`);
    }
  }

  // ── Identify ────────────────────────────────────────────────────────────────

  onIdentifyFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.identifyFile = file;
    this.identifyResult.set(null);
    this.identifyError.set(null);
    this.imageWidth.set(0);
    this.imageHeight.set(0);
    this._revokePreview();
    if (file) {
      this._previewObjectUrl = URL.createObjectURL(file);
      this.identifyPreviewUrl.set(this._previewObjectUrl);
    } else {
      this.identifyPreviewUrl.set(null);
    }
  }

  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.imageWidth.set(img.naturalWidth);
    this.imageHeight.set(img.naturalHeight);
  }

  toggleExpand() {
    this.isExpanded.update(v => !v);
  }

  identify() {
    if (!this.identifyFile) return;
    this.identifyLoading.set(true);
    this.identifyResult.set(null);
    this.identifyError.set(null);
    this.svc.identify(this.identifyFile).subscribe({
      next: (res) => { this.identifyResult.set(res); this.identifyLoading.set(false); },
      error: (err) => { this.identifyError.set(err?.error?.detail ?? 'Error al identificar.'); this.identifyLoading.set(false); },
    });
  }

  faceClass(face: FaceResult): string {
    return face.identified ? 'border-green-500' : 'border-gray-600';
  }

  private _revokePreview() {
    if (this._previewObjectUrl) {
      URL.revokeObjectURL(this._previewObjectUrl);
      this._previewObjectUrl = null;
    }
  }
}
