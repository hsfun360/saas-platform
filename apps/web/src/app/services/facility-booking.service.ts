import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// Facility Bookings (structures approved 2026-10-25, sub-slice 2b): the DAY
// GRID of one slot-booked facility type (facilities across, slots down) ->
// claim a run of slots (a short-lived lock group with a countdown) -> key the
// booker and the roster -> confirm. Every rule is re-validated server-side at
// save; the screen mirrors them from the context and the type facts.

export type FacilityCellState = 'open' | 'front-desk' | 'closed' | 'past' | 'locked' | 'mine' | 'booked';

export interface FacilityBookingTypeFacts {
  id: string;
  code: string;
  description: string;
  minParticipants: number;
  maxParticipants: number | null;
  maxSlotsPerDayWeekday: number;
  maxSlotsPerDayWeekend: number;
  maxConsecutiveSlots: number;
  advanceBookingDays: number | null;
  guestsAllowed: boolean;
  memberGuestsAllowed: boolean;
  maxGuestsPerBooking: number | null;
  hostMustBePresent: boolean;
  requiresApproval: boolean;
}

export interface FacilityParticipantTypeOption extends MembershipStatusOption {
  baseIdentity: 'member' | 'member-guest' | 'guest';
  requiresApproval: boolean;
}

export interface FacilityBookingMeta {
  facilityTypes: FacilityBookingTypeFacts[];
  participantTypes: FacilityParticipantTypeOption[];
  statuses: MembershipStatusOption[];
  slotStatuses: MembershipStatusOption[];
  channels: MembershipStatusOption[];
  limits: { maxSlotsPerBooking: number; maxParticipantsPerBooking: number; maxLockMinutes: number; searchLimit: number };
  setting: {
    guestControlEnabled: boolean;
    noShowControlEnabled: boolean;
    cancellationNoticeHours: number;
    bookingLockMinutes: number;
    allowSameDayBooking: boolean;
    advanceBookingDays: number;
  };
}

export interface FacilityBookingContext {
  member: {
    memberId: string;
    memberNo: string;
    name: string;
    email: string | null;
    membershipTypeId: string | null;
    membershipTypeCategory: string | null;
    statusLabel: string | null;
    actionControl: 'allow' | 'warning' | 'barred';
  };
  barred: boolean;
  warning: string | null;
  window: { dateFrom: string; dateTo: string; effectiveDays: number; hours: number };
  guestAllowance: { allowance: number | null; used: number; remaining: number | null } | null;
  heldSlots: number;
  // Slice 4: an active booking suspension on the booking date (null when none).
  suspension?: { toDate: string; reason: string | null } | null;
}

export interface FacilityGridSlot {
  slotNumber: number;
  startTime: string; // 'HH:MM'
  endTime: string;
  isFrontDesk: boolean;
}

export interface FacilityGridCell {
  slotNumber: number;
  startTime: string;
  endTime: string;
  state: FacilityCellState;
  bookingId: string | null;
  bookingNo: string | null;
  bookingStatus: string | null;
  slotStatus: string | null;
  bookerName: string | null;
  lockGroupId: string | null;
  lockExpiresAt: string | null;
}

export interface FacilityGridColumn {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isIndoor: boolean;
  isFloodlit: boolean;
  cells: FacilityGridCell[];
}

export interface FacilityAvailability {
  facilityType: FacilityBookingTypeFacts;
  date: string;
  dayType: 'weekday' | 'weekend';
  clubNow: { date: string; time: string };
  slotSet: { id: string; description: string | null; dayScope: string; effectiveDate: string; slotMinutes: number } | null;
  slots: FacilityGridSlot[];
  columns: FacilityGridColumn[];
  lockMinutes: number;
  window: { dateFrom: string; dateTo: string };
}

export interface FacilitySlotClaim {
  groupId: string;
  expiresAt: string;
  lockMinutes: number;
  facility: { id: string; code: string; name: string };
  facilityType: FacilityBookingTypeFacts;
  bookingDate: string;
  dayType: 'weekday' | 'weekend';
  slots: FacilityGridSlot[];
}

export interface FacilityParticipantLine {
  participantType: string;
  memberNo?: string | null;
  name?: string | null;
  identityNo?: string | null;
  mobile?: string | null;
  email?: string | null;
}

export interface FacilityBookingCreatePayload {
  lockGroupId: string;
  booker: { kind: 'member' | 'visitor'; memberNo?: string | null; name?: string | null; identityNo?: string | null; mobile?: string | null; email?: string | null };
  participants: FacilityParticipantLine[];
  hostMemberNo?: string | null;
  contactMobile?: string | null;
  contactEmail?: string | null;
  remarks?: string | null;
  bookingNo?: string | null;
}

export interface FacilityBookingParticipant {
  id: string;
  patronId: string | null;
  participantType: string;
  name: string;
  memberNo: string | null;
  isHost: boolean;
  guestVisitId: string | null;
  sortOrder: number;
}

export interface FacilityBookingSlotRow {
  id: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  slotNumber: number;
  sessionId: string | null;
  dayType: string;
  status: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
}

export interface FacilityCancelVerdict {
  controlled: boolean;
  late: boolean;
  noticeHours: number;
  minutesLeft: number;
}

export interface FacilityBookingRow {
  id: string;
  bookingNo: string;
  facilityTypeId: string;
  facilityType: { id: string; code: string; description: string } | null;
  bookingDate: string | null;
  startTime: string | null;
  endTime: string | null;
  facilities: string[];
  booker: { id: string; patronType: 'member' | 'other'; name: string; memberNo: string | null; mobile: string | null; email: string | null; identityNo: string | null } | null;
  contactMobile: string | null;
  contactEmail: string | null;
  remarks: string | null;
  status: 'booked' | 'pending-approval' | 'cancelled';
  channel: string;
  workflowInstanceId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  isLateCancel: boolean;
  createdAt: string;
  canModify?: boolean;
  slots: FacilityBookingSlotRow[];
  participants: FacilityBookingParticipant[];
  cancelVerdict?: FacilityCancelVerdict | null;
  // The live (open or settled) bill, when one exists.
  bill?: FacilityBillSummary | null;
}

// ---- slice 2c: the bill on a booking ----

export interface FacilityBillSummary {
  id: string;
  billNo: string;
  status: 'open' | 'settled' | 'voided';
  totalAmount: number;
}

export interface FacilityBillItemRow {
  id: string;
  sortOrder: number;
  transactionTypeId: string;
  bookingSlotId: string | null;
  bookingParticipantId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  priceOverridden: boolean;
  taxSchemeCode: string | null;
  taxAmount: number;
  ieFlag: string | null;
  payable: number;
}

export interface FacilityBillPaymentRow {
  id: string;
  sortOrder: number;
  paymentTypeId: string;
  paymentClass: string;
  amount: number;
  reference: string | null;
  arDocId: string | null;
  arDocNo: string | null;
  debtorType: string | null;
}

export interface FacilityBillDoc {
  id: string;
  billNo: string;
  bookingId: string;
  patronId: string;
  billDate: string;
  status: 'open' | 'settled' | 'voided';
  totalAmount: number;
  taxTotal: number;
  remarks: string | null;
  settledAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  canModify?: boolean;
  items: FacilityBillItemRow[];
  payments: FacilityBillPaymentRow[];
}

// A desk billing tile (an active facility transaction type of this type or of none).
export interface FacilityBillTile {
  id: string;
  transactionType: string;
  description: string;
  chargeType: string;
  feeBasis: string;
  participantType: string | null;
  allowPriceOverride: boolean;
  iconUrl: string | null;
}

export interface FacilityTenderOption {
  id: string;
  paymentType: string;
  paymentClass: string;
  description: string;
  iconUrl: string | null;
}

export interface FacilityOtherDebtorRef {
  id: string;
  code: string | null;
  name: string;
}

// What the bill screen renders: the bill, its booking facts, the tiles, the tenders, the AR Other Debtors.
export interface FacilityBillScreen {
  bill: FacilityBillDoc;
  booking: {
    id: string;
    // 'booking' | 'registration' | 'issue' - what the bill hangs off (slice 3).
    kind?: 'booking' | 'registration' | 'issue';
    bookingNo: string | null;
    status: string;
    bookingDate: string | null;
    startTime: string | null;
    endTime: string | null;
    facilityType: { id: string; code: string; description: string } | null;
    facilities: string[];
    booker: { id: string; patronType: 'member' | 'other'; name: string; memberNo: string | null } | null;
    slots: number;
    participants: { id: string; name: string; participantType: string }[];
  };
  tiles: FacilityBillTile[];
  tenders: FacilityTenderOption[];
  otherDebtors: FacilityOtherDebtorRef[];
  warnings: string[];
  message?: string;
}

export interface FacilityPaymentLine {
  paymentTypeId: string;
  amount: number;
  reference?: string | null;
  otherDebtorId?: string | null;
}

export interface FacilityCancelPreview extends FacilityCancelVerdict {
  pending: boolean;
  slots: number;
  guestVisits: number;
  // Slice 4: inside the notice with the control on.
  action?: 'charge' | 'refuse';
  refused?: boolean;
  bookerIsMember?: boolean;
  charge?: { unpriced?: boolean; reason?: string; description?: string; quantity: number; unitAmount?: number; amount?: number; taxAmount?: number; totalAmount?: number } | null;
}

@Injectable({ providedIn: 'root' })
export class FacilityBookingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/bookings`;

  meta(): Observable<FacilityBookingMeta> {
    return this.http.get<FacilityBookingMeta>(`${this.base}/meta`);
  }

  // A member keyed at the desk: standing, window for the type, guest allowance, slots held that day.
  context(memberNo: string, facilityTypeId: string, date: string): Observable<FacilityBookingContext> {
    const params = new HttpParams({ fromObject: { memberNo, facilityTypeId, date } });
    return this.http.get<FacilityBookingContext>(`${this.base}/context`, { params });
  }

  availability(facilityTypeId: string, date: string): Observable<FacilityAvailability> {
    const params = new HttpParams({ fromObject: { facilityTypeId, date } });
    return this.http.get<FacilityAvailability>(`${this.base}/availability`, { params });
  }

  // Claim a run of slots on one facility; an existing groupId REPLACES that group's claim.
  claim(payload: { facilityId: string; bookingDate: string; startTimes: string[]; groupId?: string | null }): Observable<FacilitySlotClaim> {
    return this.http.post<FacilitySlotClaim>(`${this.base}/locks`, payload);
  }

  release(groupId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/locks/${groupId}`);
  }

  list(date: string, facilityTypeId?: string | null): Observable<{ bookings: FacilityBookingRow[] }> {
    let params = new HttpParams().set('date', date);
    if (facilityTypeId) params = params.set('facilityTypeId', facilityTypeId);
    return this.http.get<{ bookings: FacilityBookingRow[] }>(this.base, { params });
  }

  search(q: string): Observable<{ bookings: FacilityBookingRow[] }> {
    return this.http.get<{ bookings: FacilityBookingRow[] }>(`${this.base}/search`, { params: new HttpParams().set('q', q) });
  }

  create(payload: FacilityBookingCreatePayload): Observable<{ message: string; booking: FacilityBookingRow }> {
    return this.http.post<{ message: string; booking: FacilityBookingRow }>(this.base, payload);
  }

  get(id: string): Observable<FacilityBookingRow> {
    return this.http.get<FacilityBookingRow>(`${this.base}/${id}`);
  }

  cancelPreview(id: string): Observable<FacilityCancelPreview> {
    return this.http.get<FacilityCancelPreview>(`${this.base}/${id}/cancel-preview`);
  }

  cancel(id: string, reason: string | null, waive?: { waiveCharge: boolean; waiveReason: string | null }): Observable<{ message: string; booking: FacilityBookingRow }> {
    return this.http.post<{ message: string; booking: FacilityBookingRow }>(`${this.base}/${id}/cancel`, { reason, ...(waive || {}) });
  }

  saveParticipants(id: string, payload: { participants: FacilityParticipantLine[]; hostMemberNo?: string | null }): Observable<{ message: string; booking: FacilityBookingRow }> {
    return this.http.put<{ message: string; booking: FacilityBookingRow }>(`${this.base}/${id}/participants`, payload);
  }

  // ---- the bill (slice 2c) ----

  // Open the booking's bill (the default fees auto-charge) or fetch the live one.
  openBill(bookingId: string, billNo?: string | null): Observable<FacilityBillScreen> {
    return this.http.post<FacilityBillScreen>(`${this.base}/${bookingId}/bill`, { billNo: billNo || null });
  }

  getBill(billId: string): Observable<FacilityBillScreen> {
    return this.http.get<FacilityBillScreen>(`${environment.apiUrl}/facility/bills/${billId}`);
  }

  addBillItem(billId: string, transactionTypeId: string, quantity: number): Observable<{ bill: FacilityBillDoc }> {
    return this.http.post<{ bill: FacilityBillDoc }>(`${environment.apiUrl}/facility/bills/${billId}/items`, { transactionTypeId, quantity });
  }

  // Presence matters: an absent key leaves the value unchanged.
  updateBillItem(billId: string, itemId: string, patch: { quantity?: number; unitAmount?: number }): Observable<{ bill: FacilityBillDoc }> {
    return this.http.put<{ bill: FacilityBillDoc }>(`${environment.apiUrl}/facility/bills/${billId}/items/${itemId}`, patch);
  }

  removeBillItem(billId: string, itemId: string): Observable<{ bill: FacilityBillDoc }> {
    return this.http.delete<{ bill: FacilityBillDoc }>(`${environment.apiUrl}/facility/bills/${billId}/items/${itemId}`);
  }

  settleBill(billId: string, payments: FacilityPaymentLine[]): Observable<{ message: string; bill: FacilityBillDoc }> {
    return this.http.post<{ message: string; bill: FacilityBillDoc }>(`${environment.apiUrl}/facility/bills/${billId}/settle`, { payments });
  }

  voidBill(billId: string, reason: string | null): Observable<{ message: string; bill: FacilityBillDoc }> {
    return this.http.post<{ message: string; bill: FacilityBillDoc }>(`${environment.apiUrl}/facility/bills/${billId}/void`, { reason });
  }
}
