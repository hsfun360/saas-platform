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
  ArDocListResult,
  ArExchangeRate,
  ArExchangeRateMeta,
  ArInterestDetail,
  ArInterestGeneration,
  ArOtherDebtor,
  ArSetting,
  ArSettingResponse,
  ArStatementCategory,
  ArTransactionTypeMeta,
  ArTransactionTypeRow,
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
  listDebtors(opts: { q?: string; type?: string; status?: string; offset?: number; sort?: string; dir?: string } = {}): Observable<ArDebtorListResult> {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.type) params = params.set('type', opts.type);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    if (opts.sort) params = params.set('sort', opts.sort);
    if (opts.dir) params = params.set('dir', opts.dir);
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

  // --- AR Transaction screens (per-document-type menus; invoice first) ---

  // Debtor picker for the entry dialogs - the Debtor Listing search under a
  // gate any transaction menu satisfies.
  debtorOptions(q: string): Observable<ArDebtorListResult> {
    let params = new HttpParams().set('status', 'active');
    if (q) params = params.set('q', q);
    return this.http.get<ArDebtorListResult>(`${this.base}/debtor-options`, { params });
  }

  listInvoices(opts: { month?: string; q?: string; status?: string; offset?: number } = {}): Observable<ArDocListResult> {
    let params = new HttpParams();
    if (opts.month) params = params.set('month', opts.month);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<ArDocListResult>(`${this.base}/invoices`, { params });
  }

  postInvoice(payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string | null }> {
    return this.http.post<{ message: string; id: string; docNo: string | null }>(`${this.base}/invoices`, payload);
  }

  updateInvoice(id: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string | null }> {
    return this.http.patch<{ message: string; id: string; docNo: string | null }>(`${this.base}/invoices/${id}`, payload);
  }

  submitInvoice(id: string): Observable<{ message: string; id: string; docNo?: string; status: string }> {
    return this.http.post<{ message: string; id: string; docNo?: string; status: string }>(`${this.base}/invoices/${id}/submit`, {});
  }

  voidInvoice(id: string, reason: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/invoices/${id}/void`, { reason });
  }

  // Credit Note lifecycle (same shape as invoices; own menu/grants).
  listCreditNotes(opts: { month?: string; q?: string; status?: string; offset?: number } = {}): Observable<ArDocListResult> {
    let params = new HttpParams();
    if (opts.month) params = params.set('month', opts.month);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<ArDocListResult>(`${this.base}/credit-notes`, { params });
  }

  postCreditNote(payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string | null }> {
    return this.http.post<{ message: string; id: string; docNo: string | null }>(`${this.base}/credit-notes`, payload);
  }

  updateCreditNote(id: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string | null }> {
    return this.http.patch<{ message: string; id: string; docNo: string | null }>(`${this.base}/credit-notes/${id}`, payload);
  }

  submitCreditNote(id: string): Observable<{ message: string; id: string; docNo?: string; status: string }> {
    return this.http.post<{ message: string; id: string; docNo?: string; status: string }>(`${this.base}/credit-notes/${id}/submit`, {});
  }

  voidCreditNote(id: string, reason: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/credit-notes/${id}/void`, { reason });
  }

  // Official Receipt lifecycle (drafts post directly on submit - no workflow).
  listReceipts(opts: { month?: string; q?: string; status?: string; offset?: number } = {}): Observable<ArDocListResult> {
    let params = new HttpParams();
    if (opts.month) params = params.set('month', opts.month);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<ArDocListResult>(`${this.base}/receipts`, { params });
  }

  createReceipt(payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string | null }> {
    return this.http.post<{ message: string; id: string; docNo: string | null }>(`${this.base}/receipts`, payload);
  }

  updateReceipt(id: string, payload: Record<string, unknown>): Observable<{ message: string; id: string; docNo: string | null }> {
    return this.http.patch<{ message: string; id: string; docNo: string | null }>(`${this.base}/receipts/${id}`, payload);
  }

  submitReceipt(id: string): Observable<{ message: string; id: string; docNo?: string; status: string }> {
    return this.http.post<{ message: string; id: string; docNo?: string; status: string }>(`${this.base}/receipts/${id}/submit`, {});
  }

  voidReceipt(id: string, reason?: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/receipts/${id}/void`, reason ? { reason } : {});
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

  getArSetting(): Observable<ArSettingResponse> {
    return this.http.get<ArSettingResponse>(`${this.base}/settings`);
  }

  saveArSetting(setting: Partial<ArSetting>): Observable<{ message: string; setting: ArSetting }> {
    return this.http.put<{ message: string; setting: ArSetting }>(`${this.base}/settings`, setting);
  }

  // --- Transaction Type master (AR-owned catalog since 2026-08-15) ---

  transactionTypeMeta(): Observable<ArTransactionTypeMeta> {
    return this.http.get<ArTransactionTypeMeta>(`${this.base}/transaction-types/meta`);
  }

  transactionTypeTaxSchemes(): Observable<{ schemes: { taxSchemeCode: string; name: string | null }[]; countrySet: boolean }> {
    return this.http.get<{ schemes: { taxSchemeCode: string; name: string | null }[]; countrySet: boolean }>(`${this.base}/transaction-types/tax-schemes`);
  }

  listTransactionTypes(): Observable<ArTransactionTypeRow[]> {
    return this.http.get<ArTransactionTypeRow[]>(`${this.base}/transaction-types`);
  }

  createTransactionType(payload: Record<string, unknown>): Observable<{ message: string; transactionType: ArTransactionTypeRow }> {
    return this.http.post<{ message: string; transactionType: ArTransactionTypeRow }>(`${this.base}/transaction-types`, payload);
  }

  updateTransactionType(id: string, payload: Record<string, unknown>): Observable<{ message: string; transactionType: ArTransactionTypeRow }> {
    return this.http.put<{ message: string; transactionType: ArTransactionTypeRow }>(`${this.base}/transaction-types/${id}`, payload);
  }

  setTransactionTypeActive(id: string, isActive: boolean): Observable<{ message: string; transactionType: ArTransactionTypeRow }> {
    return this.http.patch<{ message: string; transactionType: ArTransactionTypeRow }>(`${this.base}/transaction-types/${id}`, { isActive });
  }

  // --- Exchange Rates (multicurrency step 1, 2026-08-21) ---

  exchangeRateMeta(): Observable<ArExchangeRateMeta> {
    return this.http.get<ArExchangeRateMeta>(`${this.base}/exchange-rates/meta`);
  }

  listExchangeRates(): Observable<ArExchangeRate[]> {
    return this.http.get<ArExchangeRate[]>(`${this.base}/exchange-rates`);
  }

  createExchangeRate(payload: { currencyCode: string; effectiveDate: string; rate: number }): Observable<{ message: string; exchangeRate: ArExchangeRate }> {
    return this.http.post<{ message: string; exchangeRate: ArExchangeRate }>(`${this.base}/exchange-rates`, payload);
  }

  updateExchangeRate(id: string, payload: { effectiveDate: string; rate: number }): Observable<{ message: string; exchangeRate: ArExchangeRate }> {
    return this.http.put<{ message: string; exchangeRate: ArExchangeRate }>(`${this.base}/exchange-rates/${id}`, payload);
  }

  deleteExchangeRate(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/exchange-rates/${id}`);
  }

  // The SAVED layout options rendered on a dummy statement (screen preview).
  previewStatementLayout(): Observable<Blob> {
    return this.http.get(`${this.base}/settings/statement-preview`, { responseType: 'blob' });
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

  getStatementRun(id: string): Observable<{ run: ArStatementRun }> {
    return this.http.get<{ run: ArStatementRun }>(`${this.base}/statement-runs/${id}`);
  }

  resumeStatementRun(id: string): Observable<{ message: string; run: ArStatementRun }> {
    return this.http.post<{ message: string; run: ArStatementRun }>(`${this.base}/statement-runs/${id}/resume`, {});
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

  // Server-rendered Statement of Account PDF (frozen snapshots only). Fetched
  // through HttpClient so the auth interceptor applies, then saved as a blob.
  downloadStatementPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/statements/${id}/pdf`, { responseType: 'blob' });
  }
}
