import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Golf Front Desk - registration, billing and settlement for a play day.

export interface FrontDeskRegistration {
  id: string;
  registrationNo: string;
  bookingId: string | null;
  bookingPlayerId: string | null;
  courseId: string;
  playDate: string;
  teeTime: string;
  crossTime: string | null;
  holes: number;
  golferId: string;
  playerType: string;
  playerName: string;
  memberNo: string | null;
  status: string;
}

export interface FrontDeskBillSummary {
  id: string;
  billNo: string;
  status: string;
  totalAmount: number;
}

export interface FrontDeskEntry {
  kind: 'booked' | 'walkin';
  bookingId?: string;
  bookingNo?: string;
  bookingPlayerId?: string;
  playerType: string;
  playerName: string;
  memberNo: string | null;
  holes: number;
  registration: FrontDeskRegistration | null;
  bill: FrontDeskBillSummary | null;
}

export interface FrontDeskFlight {
  courseId: string;
  courseCode: string | null;
  courseDescription: string | null;
  teeTime: string;
  holes: number;
  entries: FrontDeskEntry[];
}

export interface FrontDeskTile {
  id: string;
  transactionType: string;
  chargeType: string;
  golferType: string | null;
  description: string | null;
  iconUrl: string | null;
  allowPriceOverride: boolean;
}

export interface FrontDeskTender {
  id: string;
  paymentType: string;
  paymentClass: string;
  description: string | null;
  iconUrl: string | null;
}

export interface FrontDeskMeta {
  tiles: FrontDeskTile[];
  paymentTypes: FrontDeskTender[];
  courses: { id: string; courseCode: string; description?: string | null }[];
  playerTypes: { key: string; label: string }[];
  holesOptions: number[];
}

export interface GolfBillItemRow {
  id: string;
  sortOrder: number;
  transactionTypeId: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  priceOverridden: boolean;
  packageGroupId: string | null;
  packageRole: string | null;
  taxSchemeCode: string | null;
  taxAmount: number;
  ieFlag: string | null;
  payable: number;
}

export interface GolfBillPaymentRow {
  id: string;
  sortOrder: number;
  paymentTypeId: string;
  paymentClass: string;
  amount: number;
  reference: string | null;
  arDocNo: string | null;
}

export interface GolfBillDoc {
  id: string;
  billNo: string;
  registrationPlayerId: string;
  billDate: string;
  status: string;
  totalAmount: number;
  taxTotal: number;
  remarks: string | null;
  items: GolfBillItemRow[];
  payments: GolfBillPaymentRow[];
}

export interface WalkInPayload {
  playDate: string;
  courseId: string;
  teeTime: string;
  holes: number;
  playerType: string;
  memberNo?: string;
  guest?: { name?: string; identityNo?: string; mobile?: string; email?: string };
}

export interface GuestIdentityPayload {
  name?: string;
  identityNo?: string;
  mobile?: string;
  email?: string;
}

@Injectable({ providedIn: 'root' })
export class GolfFrontDeskService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/front-desk`;

  day(playDate: string): Observable<{ playDate: string; flights: FrontDeskFlight[] }> {
    return this.http.get<{ playDate: string; flights: FrontDeskFlight[] }>(`${this.base}/day`, { params: { playDate } });
  }

  meta(): Observable<FrontDeskMeta> {
    return this.http.get<FrontDeskMeta>(`${this.base}/meta`);
  }

  registerBooked(bookingPlayerId: string, guest?: GuestIdentityPayload): Observable<{ message: string; registration: FrontDeskRegistration }> {
    return this.http.post<{ message: string; registration: FrontDeskRegistration }>(`${this.base}/registrations`, { bookingPlayerId, guest });
  }

  registerWalkIn(walkIn: WalkInPayload): Observable<{ message: string; registration: FrontDeskRegistration }> {
    return this.http.post<{ message: string; registration: FrontDeskRegistration }>(`${this.base}/registrations`, { walkIn });
  }

  cancelRegistration(id: string, reason: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/registrations/${id}/cancel`, { reason });
  }

  openBill(registrationId: string): Observable<{ bill: GolfBillDoc; warnings: string[] }> {
    return this.http.post<{ bill: GolfBillDoc; warnings: string[] }>(`${this.base}/registrations/${registrationId}/bills`, {});
  }

  getBill(billId: string): Observable<{ bill: GolfBillDoc; registration: FrontDeskRegistration | null }> {
    return this.http.get<{ bill: GolfBillDoc; registration: FrontDeskRegistration | null }>(`${this.base}/bills/${billId}`);
  }

  addItem(billId: string, transactionTypeId: string, quantity: number): Observable<{ bill: GolfBillDoc }> {
    return this.http.post<{ bill: GolfBillDoc }>(`${this.base}/bills/${billId}/items`, { transactionTypeId, quantity });
  }

  updateItem(billId: string, itemId: string, patch: { quantity?: number; unitAmount?: number }): Observable<{ bill: GolfBillDoc }> {
    return this.http.put<{ bill: GolfBillDoc }>(`${this.base}/bills/${billId}/items/${itemId}`, patch);
  }

  removeItem(billId: string, itemId: string): Observable<{ bill: GolfBillDoc }> {
    return this.http.delete<{ bill: GolfBillDoc }>(`${this.base}/bills/${billId}/items/${itemId}`);
  }

  settle(billId: string, payments: { paymentTypeId: string; amount: number; reference?: string }[]): Observable<{ message: string; bill: GolfBillDoc }> {
    return this.http.post<{ message: string; bill: GolfBillDoc }>(`${this.base}/bills/${billId}/settle`, { payments });
  }

  voidBill(billId: string, reason: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/bills/${billId}/void`, { reason });
  }
}
