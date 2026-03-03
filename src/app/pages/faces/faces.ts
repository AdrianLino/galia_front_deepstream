import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacesService } from '../../core/services/faces.service';
import { AddPersonResponse, IdentifyResponse } from '../../core/models/face.model';

@Component({
  selector: 'app-faces',
  imports: [CommonModule, FormsModule],
  templateUrl: './faces.html',
})
export class FacesComponent {
  private facesService = inject(FacesService);

  // Register
  registerName = '';
  registerFile: File | null = null;
  registerResult = signal<AddPersonResponse | null>(null);
  registerLoading = signal(false);

  // Identify
  identifyFile: File | null = null;
  identifyResult = signal<IdentifyResponse | null>(null);
  identifyLoading = signal(false);

  onRegisterFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.registerFile = input.files?.[0] ?? null;
  }

  onIdentifyFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.identifyFile = input.files?.[0] ?? null;
  }

  register() {
    if (!this.registerName.trim() || !this.registerFile) return;
    this.registerLoading.set(true);
    this.registerResult.set(null);
    this.facesService.register(this.registerName.trim(), this.registerFile).subscribe({
      next: (res) => {
        this.registerResult.set(res);
        this.registerLoading.set(false);
      },
      error: (err) => {
        this.registerResult.set({ success: false, detail: err?.error?.detail ?? 'Error al registrar.' });
        this.registerLoading.set(false);
      },
    });
  }

  identify() {
    if (!this.identifyFile) return;
    this.identifyLoading.set(true);
    this.identifyResult.set(null);
    this.facesService.identify(this.identifyFile).subscribe({
      next: (res) => {
        this.identifyResult.set(res);
        this.identifyLoading.set(false);
      },
      error: (err) => {
        this.identifyResult.set({ success: false, detections: [], message: err?.error?.detail ?? 'Error al identificar.' });
        this.identifyLoading.set(false);
      },
    });
  }
}
