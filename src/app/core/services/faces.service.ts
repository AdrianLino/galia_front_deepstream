import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  DeleteResponse,
  FoldersListResponse,
  IdentifyResponse,
  Person,
  PersonFolder,
  PersonsListResponse,
  RegisterResponse,
  RenameResponse,
} from '../models/face.model';

import { environment } from '../../../environments/environment';

const API = `${environment.apiV1}/faces`;

@Injectable({ providedIn: 'root' })
export class FacesService {
  private http = inject(HttpClient);

  listPersons(): Observable<PersonsListResponse> {
    return this.http.get<PersonsListResponse>(`${API}/persons`);
  }

  getPerson(id: string): Observable<Person> {
    return this.http.get<Person>(`${API}/persons/${id}`);
  }

  photoUrl(id: string): string {
    return `${API}/persons/${id}/photo`;
  }

  register(name: string, imageFile: File): Observable<RegisterResponse> {
    const form = new FormData();
    form.append('name', name);
    form.append('image', imageFile);
    return this.http.post<RegisterResponse>(`${API}/register`, form);
  }

  rename(id: string, newName: string): Observable<RenameResponse> {
    return this.http.put<RenameResponse>(`${API}/persons/${id}/rename`, { new_name: newName });
  }

  delete(id: string): Observable<DeleteResponse> {
    return this.http.delete<DeleteResponse>(`${API}/persons/${id}`);
  }

  identify(imageFile: File): Observable<IdentifyResponse> {
    const form = new FormData();
    form.append('image', imageFile);
    return this.http.post<IdentifyResponse>(`${API}/identify`, form);
  }

  // ── Folders ──────────────────────────────────────────────────────────────

  listFolders(): Observable<FoldersListResponse> {
    return this.http.get<FoldersListResponse>(`${API}/folders`);
  }

  createFolder(name: string): Observable<PersonFolder> {
    return this.http.post<PersonFolder>(`${API}/folders`, { name });
  }

  renameFolder(id: number, name: string): Observable<PersonFolder> {
    return this.http.put<PersonFolder>(`${API}/folders/${id}`, { name });
  }

  deleteFolder(id: number): Observable<any> {
    return this.http.delete(`${API}/folders/${id}`);
  }

  moveToFolder(personId: string, folderId: number | null): Observable<Person> {
    return this.http.put<Person>(`${API}/persons/${personId}/folder`, { folder_id: folderId });
  }
}
