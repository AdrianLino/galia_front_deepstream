import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacesService } from '../../core/services/faces.service';
import { AlertService } from '../../core/services/alert.service';
import { FaceResult, IdentifyResponse, Person, PersonFolder } from '../../core/models/face.model';

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

  // Folders
  folders = signal<PersonFolder[]>([]);
  selectedFolderId = signal<number | null | 'all'>('all'); // 'all' = show all, null = sin carpeta
  folderCreating = signal(false);
  newFolderName = '';
  showNewFolderInput = signal(false);
  editingFolderId = signal<number | null>(null);
  editingFolderName = '';
  moveMenuPersonId = signal<string | null>(null); // person whose move menu is open

  // Pagination for persons
  searchQuery = signal('');
  readonly pageSize = 18; // 3 rows of 6 cols
  currentPage = signal(1);

  filteredPersons = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    let list = this.persons();
    // Apply folder filter
    const fid = this.selectedFolderId();
    if (fid !== 'all') {
      list = list.filter((p) => (p.folder_id ?? null) === fid);
    }
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
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
  registerAlertLevel: 'normal' | 'watch' | 'critical' = 'normal';
  registerFolderId: number | null = null;
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

  @HostListener('document:click')
  onDocumentClick() {
    this.moveMenuPersonId.set(null);
  }

  ngOnInit() {
    this.loadPersons();
    this.loadFolders();
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

  // ── Folders ─────────────────────────────────────────────────────────────────

  loadFolders() {
    this.svc.listFolders().subscribe({
      next: (res) => this.folders.set(res.folders),
    });
  }

  selectFolder(folderId: number | null | 'all') {
    this.selectedFolderId.set(folderId);
    this.currentPage.set(1);
  }

  folderPersonCount(folderId: number | null): number {
    return this.persons().filter((p) => (p.folder_id ?? null) === folderId).length;
  }

  startNewFolder() {
    this.showNewFolderInput.set(true);
    this.newFolderName = '';
  }

  cancelNewFolder() {
    this.showNewFolderInput.set(false);
    this.newFolderName = '';
  }

  createFolder() {
    const name = this.newFolderName.trim();
    if (!name) return;
    this.folderCreating.set(true);
    this.svc.createFolder(name).subscribe({
      next: () => {
        this.folderCreating.set(false);
        this.showNewFolderInput.set(false);
        this.newFolderName = '';
        this.loadFolders();
      },
      error: (err) => {
        alert(err?.error?.detail ?? 'Error al crear carpeta.');
        this.folderCreating.set(false);
      },
    });
  }

  startEditFolder(folder: PersonFolder, event: Event) {
    event.stopPropagation();
    this.editingFolderId.set(folder.id);
    this.editingFolderName = folder.name;
  }

  cancelEditFolder() {
    this.editingFolderId.set(null);
    this.editingFolderName = '';
  }

  saveEditFolder(folder: PersonFolder) {
    const name = this.editingFolderName.trim();
    if (!name || name === folder.name) { this.cancelEditFolder(); return; }
    this.svc.renameFolder(folder.id, name).subscribe({
      next: () => { this.cancelEditFolder(); this.loadFolders(); },
      error: (err) => alert(err?.error?.detail ?? 'Error al renombrar carpeta.'),
    });
  }

  deleteFolder(folder: PersonFolder, event: Event) {
    event.stopPropagation();
    if (!confirm(`¿Eliminar carpeta "${folder.name}"? Las personas dentro quedarán sin carpeta.`)) return;
    this.svc.deleteFolder(folder.id).subscribe({
      next: () => {
        if (this.selectedFolderId() === folder.id) this.selectedFolderId.set('all');
        this.loadFolders();
        this.loadPersons();
      },
      error: (err) => alert(err?.error?.detail ?? 'Error al eliminar carpeta.'),
    });
  }

  toggleMoveMenu(personId: string, event: Event) {
    event.stopPropagation();
    this.moveMenuPersonId.set(this.moveMenuPersonId() === personId ? null : personId);
  }

  movePersonToFolder(person: Person, folderId: number | null) {
    this.moveMenuPersonId.set(null);
    if ((person.folder_id ?? null) === folderId) return;
    this.svc.moveToFolder(person.id, folderId).subscribe({
      next: () => this.loadPersons(),
      error: (err) => alert(err?.error?.detail ?? 'Error al mover persona.'),
    });
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
      this.svc.register(this.registerName.trim(), this.registerFiles[0], this.registerAlertLevel, this.registerFolderId).subscribe({
        next: (res) => {
          this.registerMsg.set(`"${res.name}" registrado. Score detección: ${res.detection_score}`);
          this.registerLoading.set(false);
          this.registerName = '';
          this.registerAlertLevel = 'normal';
          this.registerFolderId = null;
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
            await lastValueFrom(this.svc.register(name, file, this.registerAlertLevel, this.registerFolderId));
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
    this.registerAlertLevel = 'normal';
    this.registerFolderId = null;
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
