import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// One cancellation-notice / no-show penalty raised against a booker
// (golf.NoShowCharge): pending (not on the ledger yet) / posted (AR invoice
// arDocNo) / waived (reason).
export interface GolfNoShowChargeRow {
  id: string;
  bookingProfileId: string;
  bookingNo: string;
  playDate: string;
  chargeReason: 'no-show' | 'late-cancel';
  bookerGolferId: string;
  bookerName: string;
  bookerMemberNo: string | null;
  playerNames: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: 'pending' | 'posted' | 'waived';
  arDocNo: string | null;
  postedAt: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  remarks: string | null;
  createdAt: string;
  canModify?: boolean;
}

export interface GolfNoShowChargeListing {
  charges: GolfNoShowChargeRow[];
  statuses: MembershipStatusOption[];
  reasons: MembershipStatusOption[];
}

// No-show Charges - standalone menu (2026-10-06): every penalty in one
// listing with Post / Waive, grantable without the tee-sheet or booking
// screens. Behind the Golf entitlement + '/golf/no-show-charges' on the API.
@Injectable({ providedIn: 'root' })
export class GolfNoShowChargeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/no-show-charges`;

  list(filter: { dateFrom?: string; dateTo?: string; status?: string }): Observable<GolfNoShowChargeListing> {
    let params = new HttpParams();
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.status) params = params.set('status', filter.status);
    return this.http.get<GolfNoShowChargeListing>(this.base, { params });
  }

  // Retry posting a pending charge to the booker's AR account.
  post(id: string): Observable<{ message: string; charge: GolfNoShowChargeRow }> {
    return this.http.post<{ message: string; charge: GolfNoShowChargeRow }>(`${this.base}/${id}/post`, {});
  }

  waive(id: string, reason: string): Observable<{ message: string; charge: GolfNoShowChargeRow }> {
    return this.http.post<{ message: string; charge: GolfNoShowChargeRow }>(`${this.base}/${id}/waive`, { reason });
  }
}
