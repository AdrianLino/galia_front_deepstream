import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ActiveSession, Cooccurrence, GraphHealth, RouteEntry } from '../models/graph.model';

const API = 'http://172.16.83.111:8003';

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
}
