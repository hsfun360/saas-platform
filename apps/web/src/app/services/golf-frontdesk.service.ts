import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Golf Front Desk - registration, billing and settlement for a play day.

// A registered player's registration view - the golf.Player starting-nine
// record plus its pair-derived crossTime/holes (revamp 2026-09-29).
export interface FrontDeskRegistration {
  id: string;
  registrationNo: string;
  bookingProfileId: string | null;
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
  bookingProfileId?: string | null;
  bookingNo?: string | null;
  playerId: string;
  playerType: string;
  playerName: string;
  memberNo: string | null;
  holes: number;
  registration: FrontDeskRegistration | null;
  bill: FrontDeskBillSummary | null;
}

// One row of a course's tee sheet: capacity + occupancy + closure state with
// the players overlaid. `offGrid` marks entries whose time is no longer on
// the tee-time set (still shown, never bookable).
export interface FrontDeskFlight {
  teeTime: string;
  maxPlayers: number | null;
  isFrontDesk: boolean;
  crossoverOnly: boolean;
  closed: boolean;
  seatsTaken: number;
  seatsLeft: number;
  crossCount: number;
  offGrid?: boolean;
  entries: FrontDeskEntry[];
}

export interface FrontDeskCourseSheet {
  courseId: string;
  courseCode: string;
  courseDescription: string | null;
  // Derived nine pairing for the card header, e.g. 'E1 → E2' (null when the
  // course's nines are missing) - never keyed into the description.
  rotation: string | null;
  operating: boolean;
  flights: FrontDeskFlight[];
}

export interface FrontDeskDay {
  playDate: string;
  dayType: string;
  courses: FrontDeskCourseSheet[];
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

// Seat-dot colours (Golf Specification): one dot per player on the sheet,
// coloured by how far through the day they are; blank outline = free seat.
export interface TeeSheetColors {
  booked: string;
  registered: string;
  billed: string;
  settled: string;
}

export interface FrontDeskMeta {
  tiles: FrontDeskTile[];
  paymentTypes: FrontDeskTender[];
  courses: { id: string; courseCode: string; description?: string | null }[];
  playerTypes: { key: string; label: string }[];
  holesOptions: number[];
  teeSheetColors?: TeeSheetColors;
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
  playerId: string;
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

  day(playDate: string): Observable<FrontDeskDay> {
    return this.http.get<FrontDeskDay>(`${this.base}/day`, { params: { playDate } });
  }

  registerFlight(payload: { playDate: string; courseId: string; teeTime: string; bookingProfileId?: string }): Observable<{
    message: string;
    registered: { playerName: string; registrationNo: string }[];
    skipped: { playerName: string; reason: string }[];
  }> {
    return this.http.post<{
      message: string;
      registered: { playerName: string; registrationNo: string }[];
      skipped: { playerName: string; reason: string }[];
    }>(`${this.base}/register-flight`, payload);
  }

  meta(): Observable<FrontDeskMeta> {
    return this.http.get<FrontDeskMeta>(`${this.base}/meta`);
  }

  registerBooked(playerId: string, guest?: GuestIdentityPayload): Observable<{ message: string; registration: FrontDeskRegistration }> {
    return this.http.post<{ message: string; registration: FrontDeskRegistration }>(`${this.base}/registrations`, { playerId, guest });
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
