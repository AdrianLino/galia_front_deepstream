import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  SpatialNode,
  SpatialNodeCreate,
  SpatialNodeUpdate,
  SpatialNodeWithBreadcrumb,
  CameraAssignment,
} from '../models/spatial.model';
import { RtspSource } from '../models/stream.model';

const API = 'http://172.16.83.111:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class SpatialService {
  private http = inject(HttpClient);

  listNodes(parentId?: string): Observable<SpatialNode[]> {
    let params = new HttpParams();
    if (parentId) {
      params = params.set('parent_id', parentId);
    }
    return this.http.get<SpatialNode[]>(`${API}/spatial/nodes`, { params });
  }

  getNode(nodeId: string): Observable<SpatialNodeWithBreadcrumb> {
    return this.http.get<SpatialNodeWithBreadcrumb>(`${API}/spatial/nodes/${nodeId}`);
  }

  createNode(body: SpatialNodeCreate): Observable<SpatialNode> {
    return this.http.post<SpatialNode>(`${API}/spatial/nodes`, body);
  }

  updateNode(nodeId: string, body: SpatialNodeUpdate): Observable<SpatialNode> {
    return this.http.put<SpatialNode>(`${API}/spatial/nodes/${nodeId}`, body);
  }

  deleteNode(nodeId: string): Observable<void> {
    return this.http.delete<void>(`${API}/spatial/nodes/${nodeId}`);
  }

  listNodeCameras(nodeId: string, recursive = false): Observable<RtspSource[]> {
    const params = recursive ? '?recursive=true' : '';
    return this.http.get<RtspSource[]>(`${API}/spatial/nodes/${nodeId}/cameras${params}`);
  }

  assignCamera(nodeId: string, sourceId: string): Observable<RtspSource> {
    const body: CameraAssignment = { source_id: sourceId };
    return this.http.post<RtspSource>(`${API}/spatial/nodes/${nodeId}/cameras`, body);
  }

  unassignCamera(nodeId: string, sourceId: string): Observable<void> {
    return this.http.delete<void>(`${API}/spatial/nodes/${nodeId}/cameras/${sourceId}`);
  }
}
