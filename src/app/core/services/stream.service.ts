import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  StreamStartRequest,
  StreamStartResponse,
  StreamStatusResponse,
  StreamStopResponse,
  RtspSource,
  RtspSourceCreate,
  RtspSourceUpdate,
} from '../models/stream.model';

import { environment } from '../../../environments/environment';

const API = environment.apiV1;

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

  // ── RTSP Source management ──────────────────────────────────────────────

  listSources(): Observable<RtspSource[]> {
    return this.http.get<RtspSource[]>(`${API}/stream/sources`);
  }

  createSource(body: RtspSourceCreate): Observable<RtspSource> {
    return this.http.post<RtspSource>(`${API}/stream/sources`, body);
  }

  updateSource(id: string, body: RtspSourceUpdate): Observable<RtspSource> {
    return this.http.put<RtspSource>(`${API}/stream/sources/${id}`, body);
  }

  deleteSource(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/stream/sources/${id}`);
  }
}
