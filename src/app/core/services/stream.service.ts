import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  StreamStartRequest,
  StreamStartResponse,
  StreamStatusResponse,
  StreamStopResponse,
} from '../models/stream.model';

const API = 'http://localhost:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class StreamService {
  private http = inject(HttpClient);

  readonly viewUrl = `${API}/stream/view`;

  start(body: StreamStartRequest): Observable<StreamStartResponse> {
    return this.http.post<StreamStartResponse>(`${API}/stream/start`, body);
  }

  stop(): Observable<StreamStopResponse> {
    return this.http.post<StreamStopResponse>(`${API}/stream/stop`, {});
  }

  getStatus(): Observable<StreamStatusResponse> {
    return this.http.get<StreamStatusResponse>(`${API}/stream/status`);
  }
}
