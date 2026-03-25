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
  batchCurrentFile = signal<string>('');
  batchResults = signal<{ name: string; ok: boolean; error?: string; isDuplicate?: boolean; existingName?: string; existingId?: string; fileIndex?: number; existingRegisteredAt?: string; newPhotoDate?: string; updating?: boolean }[]>([]);

  // Duplicate face warning
  duplicateWarning = signal<{
    existingName: string;
    existingId: string;
    similarity: number;
    message: string;
    existingPhotoUrl: string;
    newPhotoUrl: string;
    existingRegisteredAt: string | null;
    newPhotoDate: string | null;
  } | null>(null);

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
    this._clearBatchPreviews();
  }

  private _clearBatchPreviews() {
    this._batchPreviewCache.forEach(url => URL.revokeObjectURL(url));
    this._batchPreviewCache.clear();
    const dup = this.duplicateWarning();
    if (dup?.newPhotoUrl) URL.revokeObjectURL(dup.newPhotoUrl);
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
    this.duplicateWarning.set(null);

    // Si es un solo archivo
    if (this.registerFiles.length === 1) {
      this.svc.register(this.registerName.trim(), this.registerFiles[0], this.registerAlertLevel, this.registerFolderId).subscribe({
        next: (res) => {
          if (res.duplicate_warning) {
            const newPhotoUrl = URL.createObjectURL(this.registerFiles[0]);
            this.duplicateWarning.set({
              existingName: res.existing_name!,
              existingId: res.existing_id!,
              similarity: res.similarity!,
              message: res.message,
              existingPhotoUrl: this.svc.photoUrl(res.existing_id!),
              newPhotoUrl,
              existingRegisteredAt: res.existing_registered_at ?? null,
              newPhotoDate: res.new_photo_date ?? null,
            });
            this.registerLoading.set(false);
            return;
          }
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
    this.batchResults.set([]);
    this.batchCurrentFile.set('');
    
    let successCount = 0;
    let failCount = 0;
    let dupCount = 0;
    const results: { name: string; ok: boolean; error?: string; isDuplicate?: boolean; existingName?: string; existingId?: string; fileIndex?: number; existingRegisteredAt?: string; newPhotoDate?: string }[] = [];

    for (let i = 0; i < this.registerFiles.length; i++) {
        const file = this.registerFiles[i];
        
        let name = file.name;
        const lastDot = name.lastIndexOf('.');
        if (lastDot > 0) name = name.substring(0, lastDot);
        
        this.batchCurrentFile.set(name);
        
        try {
            const res = await lastValueFrom(this.svc.register(name, file, this.registerAlertLevel, this.registerFolderId));
            if (res.duplicate_warning) {
                dupCount++;
                results.push({
                  name, ok: false, isDuplicate: true, fileIndex: i,
                  existingName: res.existing_name,
                  existingId: res.existing_id,
                  existingRegisteredAt: res.existing_registered_at,
                  newPhotoDate: res.new_photo_date,
                  error: `Duplicado: similar a "${res.existing_name}" (${((res.similarity ?? 0) * 100).toFixed(0)}%)`,
                });
            } else {
                successCount++;
                results.push({ name, ok: true });
            }
        } catch (e: any) {
            failCount++;
            const errMsg = e?.error?.detail ?? `Error en archivo ${file.name}`;
            results.push({ name, ok: false, error: errMsg });
        }
        
        this.batchProgress.set(i + 1);
        this.batchResults.set([...results]);
    }
    
    this.registerLoading.set(false);
    // Keep files if there are duplicates so user can force-register them
    if (dupCount === 0) {
      this.registerFiles = [];
      this.registerAlertLevel = 'normal';
      this.registerFolderId = null;
    }
    this.batchCurrentFile.set('');
    this.loadPersons();
    
    if (failCount === 0 && dupCount === 0) {
        this.registerMsg.set(`¡Se registraron ${successCount} rostros exitosamente!`);
        this.batchProgress.set(0);
        this.batchTotal.set(0);
        this.batchResults.set([]);
    } else if (dupCount > 0 && failCount === 0 && successCount === 0) {
        this.registerError.set(`Se omitieron ${dupCount} fotos por ser duplicados de personas ya registradas (ver detalle).`);
    } else if (successCount > 0) {
        const parts = [`${successCount} exitosos`];
        if (dupCount > 0) parts.push(`${dupCount} duplicados omitidos`);
        if (failCount > 0) parts.push(`${failCount} rechazados`);
        this.registerError.set(`Registro parcial: ${parts.join(', ')} (ver detalle abajo).`);
    } else {
        this.registerError.set(`Todas las ${failCount + dupCount} fotos fueron rechazadas o duplicadas (ver detalle abajo).`);
    }
  }

  /** Register as new person, ignoring the duplicate warning */
  forceRegisterNew() {
    if (this.registerFiles.length === 0) return;
    this.registerLoading.set(true);
    this.duplicateWarning.set(null);
    this.registerMsg.set(null);
    this.registerError.set(null);

    this.svc.register(this.registerName.trim(), this.registerFiles[0], this.registerAlertLevel, this.registerFolderId, true).subscribe({
      next: (res) => {
        this.registerMsg.set(`"${res.name}" registrado como persona nueva. Score: ${res.detection_score}`);
        this.registerLoading.set(false);
        this.registerName = '';
        this.registerAlertLevel = 'normal';
        this.registerFolderId = null;
        this.registerFiles = [];
        this.loadPersons();
      },
      error: (err) => { this.registerError.set(err?.error?.detail ?? 'Error al registrar.'); this.registerLoading.set(false); },
    });
  }

  /** Update existing person's photo instead of creating a duplicate */
  updateExistingPerson() {
    const dup = this.duplicateWarning();
    if (!dup || this.registerFiles.length === 0) return;
    this.registerLoading.set(true);
    this.duplicateWarning.set(null);
    this.registerMsg.set(null);
    this.registerError.set(null);

    this.svc.register(dup.existingName, this.registerFiles[0], this.registerAlertLevel, this.registerFolderId, true).subscribe({
      next: (res) => {
        this.registerMsg.set(`Foto de "${dup.existingName}" actualizada exitosamente. Score: ${res.detection_score}`);
        this.registerLoading.set(false);
        this.registerName = '';
        this.registerAlertLevel = 'normal';
        this.registerFolderId = null;
        this.registerFiles = [];
        this.loadPersons();
      },
      error: (err) => { this.registerError.set(err?.error?.detail ?? 'Error al actualizar.'); this.registerLoading.set(false); },
    });
  }

  /** Cancel duplicate warning and go back to the form */
  cancelDuplicateWarning() {
    const dup = this.duplicateWarning();
    if (dup?.newPhotoUrl) URL.revokeObjectURL(dup.newPhotoUrl);
    this.duplicateWarning.set(null);
  }

  /** Force-register a batch duplicate as a new person */
  batchForceRegister(result: { name: string; fileIndex?: number; updating?: boolean }) {
    if (result.fileIndex == null || !this.registerFiles[result.fileIndex]) return;
    
    // Set loading state for this specific item
    const loadingUpdated = this.batchResults().map(r => r === result ? { ...r, updating: true } : r);
    this.batchResults.set(loadingUpdated);

    const file = this.registerFiles[result.fileIndex];
    this.svc.register(result.name, file, this.registerAlertLevel, this.registerFolderId, true).subscribe({
      next: () => {
        const updated = this.batchResults().map(r =>
          r.name === result.name ? { ...r, ok: true, isDuplicate: false, error: undefined, updating: false } : r
        );
        this.batchResults.set(updated);
        this.loadPersons();
      },
      error: (err) => {
        const updated = this.batchResults().map(r =>
          r.name === result.name ? { ...r, error: err?.error?.detail ?? 'Error al forzar registro.', updating: false } : r
        );
        this.batchResults.set(updated);
      },
    });
  }

  /** Update existing person's photo from a batch duplicate */
  batchUpdateExisting(result: { name: string; existingName?: string; fileIndex?: number; updating?: boolean }) {
    if (result.fileIndex == null || !this.registerFiles[result.fileIndex] || !result.existingName) return;

    // Set loading state for this specific item
    const loadingUpdated = this.batchResults().map(r => r === result ? { ...r, updating: true } : r);
    this.batchResults.set(loadingUpdated);

    const file = this.registerFiles[result.fileIndex];
    this.svc.register(result.existingName, file, this.registerAlertLevel, this.registerFolderId, true).subscribe({
      next: () => {
        const updated = this.batchResults().map(r =>
          r.name === result.name ? { ...r, ok: true, isDuplicate: false, error: undefined, updating: false } : r
        );
        this.batchResults.set(updated);
        this.loadPersons();
      },
      error: (err) => {
        const updated = this.batchResults().map(r =>
          r.name === result.name ? { ...r, error: err?.error?.detail ?? 'Error al actualizar.', updating: false } : r
        );
        this.batchResults.set(updated);
      },
    });
  }

  /** Dismiss a batch duplicate — remove it from results */
  batchDismissDuplicate(result: { name: string }) {
    this.batchResults.set(this.batchResults().filter(r => r !== result));
  }

  // --- Mass Batch Actions ---
  batchConfirmAction = signal<'update' | 'force' | 'delete' | null>(null);
  batchActionLoading = signal<boolean>(false);

  setBatchConfirmAction(action: 'update' | 'force' | 'delete' | null) {
    this.batchConfirmAction.set(action);
  }

  async executeBatchAction() {
    const action = this.batchConfirmAction();
    if (!action) return;

    this.batchActionLoading.set(true);
    const duplicates = this.batchResults().filter(r => r.isDuplicate && r.fileIndex != null);

    if (action === 'delete') {
      const remaining = this.batchResults().filter(r => !r.isDuplicate);
      this.batchResults.set(remaining);
      this.batchActionLoading.set(false);
      this.batchConfirmAction.set(null);
      return;
    }

    // Para update y force
    for (const dup of duplicates) {
      if (dup.fileIndex == null || !this.registerFiles[dup.fileIndex]) continue;
      
      // Marcar este item específico como 'updating'
      this.batchResults.set(this.batchResults().map(r => r.name === dup.name ? { ...r, updating: true } : r));
      
      try {
        const file = this.registerFiles[dup.fileIndex];
        const nameToUse = (action === 'update' && dup.existingName) ? dup.existingName : dup.name;
        
        await lastValueFrom(this.svc.register(nameToUse, file, this.registerAlertLevel, this.registerFolderId, true));
        
        // Éxito: quitar flag de isDuplicate y poner ok
        this.batchResults.set(this.batchResults().map(r => 
          r.name === dup.name ? { ...r, updating: false, ok: true, isDuplicate: false, error: undefined } : r
        ));
      } catch (err: any) {
        // Error: mantener isDuplicate pero mostrar error
        this.batchResults.set(this.batchResults().map(r => 
          r.name === dup.name ? { ...r, updating: false, error: err?.error?.detail ?? `Error al ${action === 'update' ? 'actualizar' : 'registrar'}` } : r
        ));
      }
    }

    this.loadPersons();
    this.batchActionLoading.set(false);
    this.batchConfirmAction.set(null);
  }

  /** Helper to get object URL for a batch file (cached) */
  private _batchPreviewCache = new Map<number, string>();
  getBatchFilePreview(r: { fileIndex?: number }): string | null {
    if (r.fileIndex == null || !this.registerFiles[r.fileIndex]) return null;
    if (!this._batchPreviewCache.has(r.fileIndex)) {
      this._batchPreviewCache.set(r.fileIndex, URL.createObjectURL(this.registerFiles[r.fileIndex]));
    }
    return this._batchPreviewCache.get(r.fileIndex)!;
  }

  /** Helper to get existing person photo URL */
  getExistingPhotoUrl(id: string): string {
    return this.svc.photoUrl(id);
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
