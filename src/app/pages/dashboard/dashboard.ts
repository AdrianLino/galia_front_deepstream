import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HealthService } from '../../core/services/health.service';
import { HealthResponse } from '../../core/models/health.model';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.html',
})
export class DashboardComponent implements OnInit {
  private healthService = inject(HealthService);

  health = signal<HealthResponse | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  syncMsg = signal<string | null>(null);

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.error.set(null);
    this.healthService.getHealth().subscribe({
      next: (data) => {
        this.health.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo conectar con el backend.');
        this.loading.set(false);
      },
    });
  }

  syncMilvus() {
    this.syncMsg.set(null);
    this.healthService.syncMilvus().subscribe({
      next: () => this.syncMsg.set('Sincronización completada.'),
      error: () => this.syncMsg.set('Error al sincronizar.'),
    });
  }
}
