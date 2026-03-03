import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacesService } from '../../core/services/faces.service';
import { FaceResult, IdentifyResponse, Person } from '../../core/models/face.model';

type Tab = 'persons' | 'register' | 'identify';

@Component({
  selector: 'app-faces',
  imports: [CommonModule, FormsModule],
  templateUrl: './faces.html',
})
export class FacesComponent implements OnInit, OnDestroy {
  private svc = inject(FacesService);

  activeTab = signal<Tab>('persons');

  // Persons list + name lookup map
  persons = signal<Person[]>([]);
  listLoading = signal(false);
  private personsByName = new Map<string, Person>();

  // Edit (rename)
  editingId = signal<string | null>(null);
  editingName = '';
  editLoading = signal(false);
  editError = signal<string | null>(null);

  // Delete
  deleteLoading = signal<string | null>(null);

  // Register
  registerName = '';
  registerFile: File | null = null;
  registerLoading = signal(false);
  registerMsg = signal<string | null>(null);
  registerError = signal<string | null>(null);

  // Identify
  identifyFile: File | null = null;
  identifyPreviewUrl = signal<string | null>(null);
  identifyLoading = signal(false);
  identifyResult = signal<IdentifyResponse | null>(null);
  identifyError = signal<string | null>(null);
  private _previewObjectUrl: string | null = null;

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

  // ── Register ────────────────────────────────────────────────────────────────

  onRegisterFile(e: Event) {
    this.registerFile = (e.target as HTMLInputElement).files?.[0] ?? null;
  }

  register() {
    if (!this.registerName.trim() || !this.registerFile) return;
    this.registerLoading.set(true);
    this.registerMsg.set(null);
    this.registerError.set(null);
    this.svc.register(this.registerName.trim(), this.registerFile).subscribe({
      next: (res) => {
        this.registerMsg.set(`"${res.name}" registrado. Score detección: ${res.detection_score}`);
        this.registerLoading.set(false);
        this.registerName = '';
        this.registerFile = null;
        this.loadPersons();
      },
      error: (err) => { this.registerError.set(err?.error?.detail ?? 'Error al registrar.'); this.registerLoading.set(false); },
    });
  }

  // ── Identify ────────────────────────────────────────────────────────────────

  onIdentifyFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.identifyFile = file;
    this.identifyResult.set(null);
    this.identifyError.set(null);
    this._revokePreview();
    if (file) {
      this._previewObjectUrl = URL.createObjectURL(file);
      this.identifyPreviewUrl.set(this._previewObjectUrl);
    } else {
      this.identifyPreviewUrl.set(null);
    }
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
