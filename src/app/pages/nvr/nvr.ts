import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NvrService } from '../../core/services/nvr.service';
import { CameraInfo, NVRScanResponse } from '../../core/models/nvr.model';

@Component({
  selector: 'app-nvr',
  imports: [CommonModule, FormsModule],
  templateUrl: './nvr.html',
})
export class NvrComponent {
  private nvrService = inject(NvrService);

  ip = '';
  port: number | null = null;
  username = '';
  password = '';

  result = signal<NVRScanResponse | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  scan() {
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    const body: Record<string, unknown> = {};
    if (this.ip) body['ip'] = this.ip;
    if (this.port) body['port'] = this.port;
    if (this.username) body['username'] = this.username;
    if (this.password) body['password'] = this.password;

    this.nvrService.scan(body).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Error al escanear NVR.');
        this.loading.set(false);
      },
    });
  }

  copyRtspList(cameras: CameraInfo[]) {
    const list = cameras.map((c) => c.rtsp_url).join('\n');
    navigator.clipboard.writeText(list);
  }
}
