import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ImportBatchDetail, ImportBatchSummary, ImportMigrateResult } from '../models/auth.models';

// Membership import: Excel -> staging mid-tables -> selective migration.
@Injectable({ providedIn: 'root' })
export class MembershipImportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/imports`;

  template(): Observable<Blob> {
    return this.http.get(`${this.base}/template`, { responseType: 'blob' });
  }

  list(): Observable<ImportBatchSummary[]> {
    return this.http.get<ImportBatchSummary[]>(this.base);
  }

  get(id: string): Observable<ImportBatchDetail> {
    return this.http.get<ImportBatchDetail>(`${this.base}/${id}`);
  }

  upload(file: File): Observable<{ message: string; batch: ImportBatchDetail }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{ message: string; batch: ImportBatchDetail }>(this.base, form);
  }

  migrate(id: string, membershipRowIds: string[]):
    Observable<{ message: string; results: ImportMigrateResult[]; batch: ImportBatchDetail }> {
    return this.http.post<{ message: string; results: ImportMigrateResult[]; batch: ImportBatchDetail }>(
      `${this.base}/${id}/migrate`, { membershipRowIds });
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
