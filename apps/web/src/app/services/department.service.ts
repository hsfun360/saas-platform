import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Department } from '../models/auth.models';

// Department - subscriber-owned reference data. Maintenance (Tenant Admin)
// lives under /auth/account/departments; the active list for pickers (User
// Management assignment) is /departments (any workspace user).
// Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every department of the caller's account.
  listAll(): Observable<Department[]> {
    return this.http.get<Department[]>(`${this.apiUrl}/auth/account/departments`);
  }

  create(payload: { departmentCode: string; description?: string | null }): Observable<{ message: string; department: Department }> {
    return this.http.post<{ message: string; department: Department }>(`${this.apiUrl}/auth/account/departments`, payload);
  }

  update(id: string, patch: Partial<Department>): Observable<{ message: string; department: Department }> {
    return this.http.patch<{ message: string; department: Department }>(`${this.apiUrl}/auth/account/departments/${id}`, patch);
  }

  // Any workspace user: active departments for assignment pickers.
  listActive(): Observable<Department[]> {
    return this.http.get<Department[]>(`${this.apiUrl}/departments`);
  }
}
