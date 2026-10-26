import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';
import { FacilityBillSummary, FacilityParticipantTypeOption } from './facility-booking.service';

// Control Station (structures approved 2026-10-26, slice 3): the day's
// picture per facility type (booked slots to check in, entries against the
// live capacity, issues and units), and the desk actions - check-in, entry
// with guests, sign-out, guests, issue, return, unit clear, end of day.

export interface StationMeta {
  participantTypes: FacilityParticipantTypeOption[];
  registrationStatuses: MembershipStatusOption[];
  issueStatuses: MembershipStatusOption[];
  returnConditions: MembershipStatusOption[];
  unitStatuses: MembershipStatusOption[];
  limits: { maxGuestsPerRegistration: number; maxIssueQuantity: number };
}

export interface StationPatron {
  id: string;
  name: string;
  memberNo: string | null;
  patronType?: 'member' | 'other';
}

export interface StationUnit {
  id: string;
  code: string;
  name: string;
  location: string | null;
  capacity: number | null;
  isActive: boolean;
  unitStatus: 'available' | 'issued' | 'out-of-service';
  currentIssueId: string | null;
}

export interface StationGuest {
  id: string;
  patronId: string | null;
  participantType: string;
  name: string;
  memberNo: string | null;
  guestVisitId: string | null;
  sortOrder: number;
}

export interface StationRegistration {
  id: string;
  registrationNo: string;
  patron: StationPatron | null;
  facilityTypeId: string;
  facilityId: string | null;
  facility: { id: string; code: string; name: string } | null;
  bookingSlotId: string | null;
  registrationDate: string;
  timeIn: string;
  timeOut: string | null;
  dayType: string;
  guestCount: number;
  status: 'in' | 'out';
  billId: string | null;
  bill: FacilityBillSummary | null;
  remarks: string | null;
  guests: StationGuest[];
}

export interface StationSlot {
  slotId: string;
  bookingId: string;
  bookingNo: string | null;
  bookingStatus: string | null;
  facility: { id: string; code: string; name: string } | null;
  startTime: string;
  endTime: string;
  slotStatus: string;
  booker: StationPatron | null;
  participants: { id: string; name: string; memberNo: string | null; participantType: string; isHost: boolean }[];
  checkInState: 'early' | 'open' | 'closed' | 'checked-in';
  registration: StationRegistration | null;
  bill: FacilityBillSummary | null;
}

export interface StationIssue {
  id: string;
  patron: StationPatron | null;
  facilityTypeId: string;
  facilityId: string | null;
  facility: { id: string; code: string; name: string } | null;
  registrationId: string | null;
  quantity: number;
  issuedAt: string;
  dueBack: string;
  overdue: boolean;
  returnedAt: string | null;
  returnedQuantity: number | null;
  returnCondition: string | null;
  status: 'issued' | 'returned' | 'lost';
  feeBillId: string | null;
  bill: FacilityBillSummary | null;
  remarks: string | null;
}

export interface StationType {
  id: string;
  code: string;
  description: string;
  usageMode: 'slot' | 'entry' | 'issue';
  iconUrl: string | null;
  capacity: number | null;
  trackUnits: boolean;
  maxIssuePerPatron: number;
  issueDueDays: number;
  entryRequiresBooking: boolean;
  guestsAllowed: boolean;
  memberGuestsAllowed: boolean;
  maxGuestsPerBooking: number | null;
  hours: { open: string | null; close: string | null } | null;
  isOpenNow: boolean;
  units: StationUnit[];
  // slot mode
  slots?: StationSlot[];
  // entry mode
  liveCount?: number;
  registrations?: StationRegistration[];
  // issue mode
  outCount?: number;
  issues?: StationIssue[];
}

export interface StationDay {
  date: string;
  dayType: 'weekday' | 'weekend';
  clubNow: { date: string; time: string };
  checkInOpenMinutes: number;
  types: StationType[];
}

export interface StationGuestLine {
  participantType: string;
  memberNo?: string | null;
  name?: string | null;
  identityNo?: string | null;
  mobile?: string | null;
  email?: string | null;
}

export interface StationActionResult {
  message: string;
  registrationId?: string;
  issueId?: string;
  warnings?: string[];
  standingWarning?: string | null;
  signedOut?: number;
  overdue?: number;
}

@Injectable({ providedIn: 'root' })
export class FacilityStationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/station`;

  meta(): Observable<StationMeta> {
    return this.http.get<StationMeta>(`${this.base}/meta`);
  }

  today(date?: string | null): Observable<StationDay> {
    const params = date ? new HttpParams().set('date', date) : new HttpParams();
    return this.http.get<StationDay>(`${this.base}/today`, { params });
  }

  checkIn(bookingSlotId: string, droppedParticipantIds: string[]): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/check-ins`, { bookingSlotId, droppedParticipantIds });
  }

  register(payload: { facilityTypeId: string; facilityId?: string | null; memberNo: string; guests: StationGuestLine[]; remarks?: string | null }): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/registrations`, payload);
  }

  signOut(registrationId: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/registrations/${registrationId}/sign-out`, {});
  }

  saveGuests(registrationId: string, guests: StationGuestLine[]): Observable<StationActionResult> {
    return this.http.put<StationActionResult>(`${this.base}/registrations/${registrationId}/guests`, { guests });
  }

  issue(payload: { facilityTypeId: string; facilityId?: string | null; quantity?: number; memberNo: string; registrationId?: string | null; remarks?: string | null }): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/issues`, payload);
  }

  returnIssue(issueId: string, payload: { condition: string; returnedQuantity?: number | null; remarks?: string | null }): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/issues/${issueId}/return`, payload);
  }

  clearUnit(unitId: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/units/${unitId}/clear`, {});
  }

  endOfDay(facilityTypeId: string | null, date: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/end-of-day`, { facilityTypeId, date });
  }
}
