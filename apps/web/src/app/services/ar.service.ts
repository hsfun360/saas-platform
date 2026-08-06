import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ArAccount,
  ArAccountMeta,
  ArDebtor,
  ArDebtorListResult,
  ArDebtorsMeta,
  ArInterestDetail,
  ArInterestGeneration,
  ArOtherDebtor,
  ArSetting,
  ArStatementCategory,
  ArStatementDetail,
  ArStatementRun,
  ArStatementRunPreview,
  ArStatementSummary,
} from '../models/ar.models';

// Account Receivable (slice 1): the shared Debtor Listing (all three debtor
// types in one query), ledger-account maintenance, and the Other Debtor party
// master. The membership-side backfill utility also lives here - it is an AR
// operations task even though its endpoint sits on the producer.
@Injectable({ providedIn: 'root' })
export class ArService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/ar`;

  meta(): Observable<ArDebtorsMeta> {
    return this.http.get<ArDebtorsMeta>(`${this.base}/debtors/meta`);
  }

  // Server-side search + pagination (party masters are searched server-side
  // through the membership seam; the browser only ever receives one page).
  listDebtors(opts: { q?: string; type?: string; status?: string; offset?: number } = {}): Observable<ArDebtorListResult> {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.type) params = params.set('type', opts.type);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<ArDebtorListResult>(`${this.base}/debtors`, { params });
  }

  updateDebtor(id: string, payload: Record<string, unknown>): Observable<{ message: string; debtor: ArDebtor }> {
    return this.http.patch<{ message: string; debtor: ArDebtor }>(`${this.base}/debtors/${id}`, payload);
  }

  getOtherDebtor(id: string): Observable<{ otherDebtor: ArOtherDebtor }> {
    return this.http.get<{ otherDebtor: ArOtherDebtor }>(`${this.base}/other-debtors/${id}`);
  }

  createOtherDebtor(payload: Record<string, unknown>): Observable<{ message: string; otherDebtor: ArOtherDebtor }> {
    return this.http.post<{ message: string; otherDebtor: ArOtherDebtor }>(`${this.base}/other-debtors`, payload);
  }

  updateOtherDebtor(id: string, payload: Record<string, unknown>): Observable<{ message: string; otherDebtor: ArOtherDebtor }> {
    return this.http.patch<{ message: string; otherDebtor: ArOtherDebtor }>(`${this.base}/other-debtors/${id}`, payload);
  }

  // Producer-side utility: enqueue provisioning for every currently-active
  // contract/nominee (idempotent; for data that predates the AR module).
  backfillDebtors(): Observable<{ message: string; memberships: number; nominees: number }> {
    return this.http.post<{ message: string; memberships: number; nominees: number }>(
      `${environment.apiUrl}/membership/debtor-backfill`, {},
    );
  }

  // --- Debtor account (slice 2: document ledger) ---

  account(debtorId: string): Observable<ArAccount> {
    return this.http.get<ArAccount>(`${this.base}/debtors/${debtorId}/account`);
  }

  accountMeta(debtorId: string): Observable<ArAccountMeta> {
    return this.http.get<ArAccountMeta>(`${this.base}/debtors/${debtorId}/account/meta`);
  }

  postLedger(debtorId: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string }> {
    return this.http.post<{ message: string; id: string; docNo: string }>(`${this.base}/debtors/${debtorId}/ledger`, payload);
  }

  postReceipt(debtorId: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string }> {
    return this.http.post<{ message: string; id: string; docNo: string }>(`${this.base}/debtors/${debtorId}/receipts`, payload);
  }

  postRefund(debtorId: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string }> {
    return this.http.post<{ message: string; id: string; docNo: string }>(`${this.base}/debtors/${debtorId}/refunds`, payload);
  }

  postDeposit(debtorId: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string }> {
    return this.http.post<{ message: string; id: string; docNo: string }>(`${this.base}/debtors/${debtorId}/deposits`, payload);
  }

  convertDeposit(depositId: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string }> {
    return this.http.post<{ message: string; id: string; docNo: string }>(`${this.base}/deposits/${depositId}/convert`, payload);
  }

  voidLedger(id: string, payload: Record<string, unknown> = {}): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/ledger/${id}/void`, payload);
  }

  voidReceipt(id: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/receipts/${id}/void`, {});
  }

  voidDeposit(id: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/deposits/${id}/void`, {});
  }

  // Reconciliation: verify every materialized balance against the documents;
  // fix=true repairs drifted counters to the computed truth.
  reconcile(fix: boolean): Observable<{
    message: string;
    checked: Record<string, number>;
    discrepancies: Array<{ type: string; ref: string; field: string; expected: string; actual: string; fixed: boolean }>;
  }> {
    return this.http.post<{
      message: string;
      checked: Record<string, number>;
      discrepancies: Array<{ type: string; ref: string; field: string; expected: string; actual: string; fixed: boolean }>;
    }>(`${this.base}/reconcile`, { fix });
  }

  // --- Interest run (slice 3) ---

  generateInterest(payload: { month: string; cutoffDate: string; ratePercent: number; graceDays: number }):
    Observable<{ message: string; generated: number; skippedExisting: number; totalInterest: string }> {
    return this.http.post<{ message: string; generated: number; skippedExisting: number; totalInterest: string }>(
      `${this.base}/interest-generations`, payload,
    );
  }

  listInterest(month: string): Observable<{ generations: ArInterestGeneration[] }> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get<{ generations: ArInterestGeneration[] }>(`${this.base}/interest-generations`, { params });
  }

  getInterest(id: string): Observable<{ generation: ArInterestGeneration; details: ArInterestDetail[] }> {
    return this.http.get<{ generation: ArInterestGeneration; details: ArInterestDetail[] }>(`${this.base}/interest-generations/${id}`);
  }

  confirmInterest(ids: string[]): Observable<{ message: string; results: Array<{ id: string; ok: boolean; message: string }> }> {
    return this.http.post<{ message: string; results: Array<{ id: string; ok: boolean; message: string }> }>(
      `${this.base}/interest-generations/confirm`, { ids },
    );
  }

  cancelInterest(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/interest-generations/${id}/cancel`, {});
  }

  // --- AR settings + statement generation (its own screen) ---

  getArSetting(): Observable<{ setting: ArSetting }> {
    return this.http.get<{ setting: ArSetting }>(`${this.base}/settings`);
  }

  saveArSetting(setting: ArSetting): Observable<{ message: string; setting: ArSetting }> {
    return this.http.put<{ message: string; setting: ArSetting }>(`${this.base}/settings`, setting);
  }

  previewStatementRun(payload: {
    month: string; periodStart: string; periodEnd: string; categories: ArStatementCategory[];
  }): Observable<ArStatementRunPreview> {
    return this.http.post<ArStatementRunPreview>(`${this.base}/statement-runs/preview`, payload);
  }

  createStatementRun(payload: {
    month: string; periodStart: string; periodEnd: string; categories: ArStatementCategory[];
  }): Observable<{ message: string; run: ArStatementRun }> {
    return this.http.post<{ message: string; run: ArStatementRun }>(`${this.base}/statement-runs`, payload);
  }

  processStatementRun(id: string, resume = false): Observable<{ run: ArStatementRun }> {
    return this.http.post<{ run: ArStatementRun }>(`${this.base}/statement-runs/${id}/process`, { resume });
  }

  cancelStatementRun(id: string): Observable<{ message: string; run: ArStatementRun }> {
    return this.http.post<{ message: string; run: ArStatementRun }>(`${this.base}/statement-runs/${id}/cancel`, {});
  }

  listStatementRuns(): Observable<{ runs: ArStatementRun[] }> {
    return this.http.get<{ runs: ArStatementRun[] }>(`${this.base}/statement-runs`);
  }

  // --- Statement listing (its own screen) ---

  listStatements(month: string, category = ''): Observable<{ statements: ArStatementSummary[] }> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    if (category) params = params.set('category', category);
    return this.http.get<{ statements: ArStatementSummary[] }>(`${this.base}/statements`, { params });
  }

  getStatement(id: string): Observable<ArStatementDetail> {
    return this.http.get<ArStatementDetail>(`${this.base}/statements/${id}`);
  }

  voidStatement(id: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/statements/${id}/void`, {});
  }
}
