import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AskResponse,
  ProcessVideoResponse,
  VideoEventsResponse,
  VideoListResponse,
  VideoStatus,
} from '../models/video.model';

const API = 'http://localhost:8001/api/v1';

@Injectable({ providedIn: 'root' })
export class VideoService {
  private http = inject(HttpClient);

  upload(file: File): Observable<ProcessVideoResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ProcessVideoResponse>(`${API}/video/process`, form);
  }

  getStatus(videoId: number): Observable<VideoStatus> {
    return this.http.get<VideoStatus>(`${API}/video/${videoId}/status`);
  }

  list(limit = 50): Observable<VideoListResponse> {
    return this.http.get<VideoListResponse>(`${API}/video/list?limit=${limit}`);
  }

  getEvents(videoId: number): Observable<VideoEventsResponse> {
    return this.http.get<VideoEventsResponse>(`${API}/video/${videoId}/events`);
  }

  ask(videoId: number, question: string): Observable<AskResponse> {
    return this.http.post<AskResponse>(`${API}/video/${videoId}/ask`, { question });
  }

  delete(videoId: number): Observable<unknown> {
    return this.http.delete(`${API}/video/${videoId}`);
  }

  downloadUrl(videoId: number): string {
    return `${API}/video/${videoId}/download`;
  }
}
