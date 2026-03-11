import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HealthResponse } from '../models/health.model';

const API = 'http://172.16.83.111:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private http = inject(HttpClient);

  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${API}/system/health`);
  }

  syncMilvus(): Observable<unknown> {
    return this.http.post(`${API}/system/sync-milvus`, {});
  }
}
