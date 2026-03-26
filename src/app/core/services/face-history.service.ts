import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const API = `${environment.apiV1}/face-history`;

export interface FaceHistoryItem {
  id: number;
  track_id: number;
  person_name: string;
  confidence: number;
  camera_name: string | null;
  source_id: number;
  thumbnail_path: string | null;
  created_at: string;
}

export interface FaceHistoryResponse {
  items: FaceHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface FaceHistoryPerson {
  person_name: string;
  count: number;
  last_seen: string;
}

export interface FaceSearchResult {
  match_type: 'known' | 'unknown' | 'none';
  person_name: string | null;
  confidence: number;
  closest_hint?: string | null;
  items: FaceHistoryItem[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class FaceHistoryService {
  private http = inject(HttpClient);

  list(opts: {
    limit?: number;
    offset?: number;
    person_name?: string;
    date_from?: string;
    date_to?: string;
  } = {}): Observable<FaceHistoryResponse> {
    let params = new HttpParams();
    if (opts.limit) params = params.set('limit', opts.limit);
    if (opts.offset !== undefined) params = params.set('offset', opts.offset);
    if (opts.person_name) params = params.set('person_name', opts.person_name);
    if (opts.date_from) params = params.set('date_from', opts.date_from);
    if (opts.date_to) params = params.set('date_to', opts.date_to);
    return this.http.get<FaceHistoryResponse>(API, { params });
  }

  persons(): Observable<FaceHistoryPerson[]> {
    return this.http.get<FaceHistoryPerson[]>(`${API}/persons`);
  }

  searchByFace(imageFile: File, threshold?: number): Observable<FaceSearchResult> {
    const fd = new FormData();
    fd.append('image', imageFile);
    let params = new HttpParams();
    if (threshold !== undefined) params = params.set('threshold', threshold);
    return this.http.post<FaceSearchResult>(`${API}/search-by-face`, fd, { params });
  }

  clearAll(): Observable<{ deleted: number; thumbnails_deleted: number }> {
    return this.http.delete<{ deleted: number; thumbnails_deleted: number }>(API);
  }

  thumbnailUrl(path: string): string {
    return `${environment.apiV1}/stream/identifications/thumbnail/${path}`;
  }
}
