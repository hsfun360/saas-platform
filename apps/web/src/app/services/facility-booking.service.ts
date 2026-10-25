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
}

export interface FacilityCancelPreview extends FacilityCancelVerdict {
  pending: boolean;
  slots: number;
  guestVisits: number;
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

  cancel(id: string, reason: string | null): Observable<{ message: string; booking: FacilityBookingRow }> {
    return this.http.post<{ message: string; booking: FacilityBookingRow }>(`${this.base}/${id}/cancel`, { reason });
  }

  saveParticipants(id: string, payload: { participants: FacilityParticipantLine[]; hostMemberNo?: string | null }): Observable<{ message: string; booking: FacilityBookingRow }> {
    return this.http.put<{ message: string; booking: FacilityBookingRow }>(`${this.base}/${id}/participants`, payload);
  }
}
