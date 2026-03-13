import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NVRScanRequest, NVRScanResponse } from '../models/nvr.model';

import { environment } from '../../../environments/environment';

const API = environment.apiV1;

@Injectable({ providedIn: 'root' })
export class NvrService {
  private http = inject(HttpClient);

  scan(body: NVRScanRequest = {}): Observable<NVRScanResponse> {
    return this.http.post<NVRScanResponse>(`${API}/nvr/scan`, body);
  }
}
