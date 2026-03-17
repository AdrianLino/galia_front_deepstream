import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ActiveSession, Cooccurrence, GraphHealth, RouteEntry, RouteEntryWithAnomaly, TrackingResult } from '../models/graph.model';

import { environment } from '../../../environments/environment';

const API = environment.graphApi;

@Injectable({ providedIn: 'root' })
export class GraphQueryService {
  private http = inject(HttpClient);

  getHealth(): Observable<GraphHealth> {
    return this.http.get<GraphHealth>(`${API}/health`);
  }

  getActive(): Observable<ActiveSession[]> {
    return this.http.get<ActiveSession[]>(`${API}/active`);
  }

  getRoute(personName: string, hoursBack = 24, limit = 200): Observable<RouteEntry[]> {
    return this.http.get<RouteEntry[]>(
      `${API}/route/${encodeURIComponent(personName)}`,
      { params: { hours_back: hoursBack, limit } }
    );
  }

  getCooccurrences(personName: string, windowSeconds = 180, hoursBack = 24): Observable<Cooccurrence[]> {
    return this.http.get<Cooccurrence[]>(
      `${API}/cooccurrences/${encodeURIComponent(personName)}`,
      { params: { window_seconds: windowSeconds, hours_back: hoursBack } }
    );
  }

  getAnomalies(personName: string, hoursBack = 24): Observable<RouteEntryWithAnomaly[]> {
    return this.http.get<RouteEntryWithAnomaly[]>(
      `${API}/anomalies/${encodeURIComponent(personName)}`,
      { params: { hours_back: hoursBack } }
    );
  }

  getTracking(personName: string, recentMinutes = 10): Observable<TrackingResult> {
    return this.http.get<TrackingResult>(
      `${API}/track/${encodeURIComponent(personName)}`,
      { params: { recent_minutes: recentMinutes } }
    );
  }
}
