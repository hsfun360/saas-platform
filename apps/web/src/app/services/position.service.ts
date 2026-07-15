import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Position, PositionDefault } from '../models/auth.models';

// Position - subscriber-owned position ladder (rank: higher = more senior).
// Maintenance (Tenant Admin) lives under /auth/account/positions; the active
// list for pickers is /positions (any workspace user). Enable/disable rather
// than delete. "Load defaults" seeds the standard Staff/Supervisor/Manager
// ladder after a preview-and-select dialog.
@Injectable({ providedIn: 'root' })
export class PositionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every position of the caller's account (most senior first).
  listAll(): Observable<Position[]> {
    return this.http.get<Position[]>(`${this.apiUrl}/auth/account/positions`);
  }

  create(payload: { positionCode: string; description?: string | null; rank: number }): Observable<{ message: string; position: Position }> {
    return this.http.post<{ message: string; position: Position }>(`${this.apiUrl}/auth/account/positions`, payload);
  }

  update(id: string, patch: Partial<Position>): Observable<{ message: string; position: Position }> {
    return this.http.patch<{ message: string; position: Position }>(`${this.apiUrl}/auth/account/positions/${id}`, patch);
  }

  // The bundled defaults, flagged with which codes already exist (preview).
  getDefaults(): Observable<PositionDefault[]> {
    return this.http.get<PositionDefault[]>(`${this.apiUrl}/auth/account/positions/defaults`);
  }

  // Create the selected bundled defaults; existing codes are never overwritten.
  seed(codes: string[]): Observable<{ message: string; created: number; skipped: number }> {
    return this.http.post<{ message: string; created: number; skipped: number }>(`${this.apiUrl}/auth/account/positions/seed`, { codes });
  }

  // Any workspace user: active positions for assignment pickers.
  listActive(): Observable<Position[]> {
    return this.http.get<Position[]>(`${this.apiUrl}/positions`);
  }
}
