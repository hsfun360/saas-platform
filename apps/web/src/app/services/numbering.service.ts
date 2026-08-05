import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { NumberingScheme, NumberingSchemeMeta } from '../models/auth.models';

// Which module's numbering table a screen instance maintains (split 2026-08-05:
// each product owns its schemes; the route provides the module).
export type NumberingModule = 'membership' | 'ar';

// Numbering Control - per-company document numbering config, maintained per
// owning module (/membership/numbering, /ar/numbering). Consumed by products
// via the server-side numbering gateway.
@Injectable({ providedIn: 'root' })
export class NumberingService {
  private readonly http = inject(HttpClient);

  private base(module: NumberingModule): string {
    return `${environment.apiUrl}/${module}/numbering-schemes`;
  }

  meta(module: NumberingModule): Observable<NumberingSchemeMeta> {
    return this.http.get<NumberingSchemeMeta>(`${this.base(module)}/meta`);
  }

  list(module: NumberingModule): Observable<NumberingScheme[]> {
    return this.http.get<NumberingScheme[]>(this.base(module));
  }

  create(module: NumberingModule, payload: Partial<NumberingScheme>): Observable<{ message: string; scheme: NumberingScheme }> {
    return this.http.post<{ message: string; scheme: NumberingScheme }>(this.base(module), payload);
  }

  update(module: NumberingModule, id: string, payload: Partial<NumberingScheme>): Observable<{ message: string; scheme: NumberingScheme }> {
    return this.http.patch<{ message: string; scheme: NumberingScheme }>(`${this.base(module)}/${id}`, payload);
  }
}
