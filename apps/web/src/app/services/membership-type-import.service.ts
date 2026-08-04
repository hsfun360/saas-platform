import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { TypeImportBatchDetail, TypeImportBatchSummary, TypeImportMigrateResult } from '../models/auth.models';

// Membership Type import: Excel -> staging mid-tables -> selective migration.
@Injectable({ providedIn: 'root' })
export class MembershipTypeImportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/type-imports`;

  template(): Observable<Blob> {
    return this.http.get(`${this.base}/template`, { responseType: 'blob' });
  }

  list(): Observable<TypeImportBatchSummary[]> {
    return this.http.get<TypeImportBatchSummary[]>(this.base);
  }

  get(id: string): Observable<TypeImportBatchDetail> {
    return this.http.get<TypeImportBatchDetail>(`${this.base}/${id}`);
  }

  upload(file: File): Observable<{ message: string; batch: TypeImportBatchDetail }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{ message: string; batch: TypeImportBatchDetail }>(this.base, form);
  }

  migrate(id: string, rowIds: string[]):
    Observable<{ message: string; results: TypeImportMigrateResult[]; batch: TypeImportBatchDetail }> {
    return this.http.post<{ message: string; results: TypeImportMigrateResult[]; batch: TypeImportBatchDetail }>(
      `${this.base}/${id}/migrate`, { rowIds });
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
