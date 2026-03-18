import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const API = `${environment.apiV1}/backup`;

export type BackupSection = 'personas' | 'camaras' | 'geocercas' | 'alertas';

export interface ImportResult {
  status: string;
  imported: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private http = inject(HttpClient);

  /** Download full backup as a blob */
  exportAll(): Observable<Blob> {
    return this.http.get(`${API}/export`, { responseType: 'blob' });
  }

  /** Download a single section backup as a blob */
  exportSection(section: BackupSection): Observable<Blob> {
    return this.http.get(`${API}/export/${section}`, { responseType: 'blob' });
  }

  /** Upload a full backup ZIP */
  importAll(file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ImportResult>(`${API}/import`, form);
  }

  /** Upload a ZIP for a single section */
  importSection(section: BackupSection, file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ImportResult>(`${API}/import/${section}`, form);
  }
}
