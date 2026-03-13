import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HealthResponse } from '../models/health.model';

import { environment } from '../../../environments/environment';

const API = environment.apiV1;

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
