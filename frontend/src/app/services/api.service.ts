import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UploadResponse {
  success: boolean;
  chunksProcessed: number;
}

export interface AskResponse {
  answer: string;
  sourcesCount: number;
}

export interface ApiError {
  error: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  uploadPdf(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('pdf', file);
    return this.http.post<UploadResponse>('/upload', formData);
  }

  ask(question: string): Observable<AskResponse> {
    return this.http.post<AskResponse>('/ask', { question });
  }
}
