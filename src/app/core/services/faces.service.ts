import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AddPersonResponse, IdentifyResponse } from '../models/face.model';

const API = 'http://localhost:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class FacesService {
  private http = inject(HttpClient);

  register(name: string, imageFile: File): Observable<AddPersonResponse> {
    const form = new FormData();
    form.append('name', name);
    form.append('image', imageFile);
    return this.http.post<AddPersonResponse>(`${API}/faces/register`, form);
  }

  identify(imageFile: File): Observable<IdentifyResponse> {
    const form = new FormData();
    form.append('image', imageFile);
    return this.http.post<IdentifyResponse>(`${API}/faces/identify`, form);
  }
}
