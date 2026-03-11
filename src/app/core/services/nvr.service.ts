import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NVRScanRequest, NVRScanResponse } from '../models/nvr.model';

const API = 'http://172.16.83.111:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class NvrService {
  private http = inject(HttpClient);

  scan(body: NVRScanRequest = {}): Observable<NVRScanResponse> {
    return this.http.post<NVRScanResponse>(`${API}/nvr/scan`, body);
  }
}
