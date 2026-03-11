import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  DeleteResponse,
  IdentifyResponse,
  Person,
  PersonsListResponse,
  RegisterResponse,
  RenameResponse,
} from '../models/face.model';

const API = 'http://172.16.83.111:8000/api/v1/faces';

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
}
