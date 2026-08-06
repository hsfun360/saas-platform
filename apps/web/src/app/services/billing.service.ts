import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { BillingSchedule, BillingScheduleItem } from '../models/billing.models';

// Membership fee runs (Billing Schedules): generate into holding, review the
// items, post selectively - one AR Invoice per posted item.
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/billing-schedules`;
  private readonly itemsBase = `${environment.apiUrl}/membership/billing-schedule-items`;

  generate(payload: { billingType: string; month: string; docDate: string; trxDate: string }):
    Observable<{ message: string; schedule: BillingSchedule; warnings: string[] }> {
    return this.http.post<{ message: string; schedule: BillingSchedule; warnings: string[] }>(this.base, payload);
  }

  list(month: string): Observable<{ schedules: BillingSchedule[] }> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get<{ schedules: BillingSchedule[] }>(this.base, { params });
  }

  get(id: string): Observable<{ schedule: BillingSchedule; items: BillingScheduleItem[] }> {
    return this.http.get<{ schedule: BillingSchedule; items: BillingScheduleItem[] }>(`${this.base}/${id}`);
  }

  post(id: string, itemIds: string[]):
    Observable<{ message: string; results: Array<{ id: string; ok: boolean; message: string }>; schedule: BillingSchedule }> {
    return this.http.post<{ message: string; results: Array<{ id: string; ok: boolean; message: string }>; schedule: BillingSchedule }>(
      `${this.base}/${id}/post`, { itemIds },
    );
  }

  cancel(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${id}/cancel`, {});
  }

  setItemStatus(itemId: string, status: 'pending' | 'skipped'): Observable<{ message: string; item: BillingScheduleItem }> {
    return this.http.patch<{ message: string; item: BillingScheduleItem }>(`${this.itemsBase}/${itemId}`, { status });
  }
}
