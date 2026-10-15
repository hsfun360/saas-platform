import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfRainCheck } from './golf-frontdesk.service';

export interface GolfRainCheckListing {
  rainChecks: GolfRainCheck[];
  statuses: MembershipStatusOption[];
}

// Rain Checks - standalone menu (2026-10-15): every rain check the club has
// issued in one listing (issued / redeemed / expired / cancelled) with Cancel
// on an issued one. Issue and redeem happen on the Tee Time Sheet. Behind
// the Golf entitlement + '/golf/rain-checks' on the API.
@Injectable({ providedIn: 'root' })
export class GolfRainCheckService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/rain-checks`;

  list(filter: { dateFrom?: string; dateTo?: string; status?: string }): Observable<GolfRainCheckListing> {
    let params = new HttpParams();
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.status) params = params.set('status', filter.status);
    return this.http.get<GolfRainCheckListing>(this.base, { params });
  }

  cancel(id: string, reason: string): Observable<{ message: string; rainCheck: GolfRainCheck }> {
    return this.http.post<{ message: string; rainCheck: GolfRainCheck }>(`${this.base}/${id}/cancel`, { reason });
  }
}
