import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';
import { FacilityBillSummary, FacilityParticipantTypeOption } from './facility-booking.service';

// Control Station (structures approved 2026-10-26, slice 3): the day's
// picture per facility type (booked slots to check in, entries against the
// live capacity), the utility items the station hands out (slice 6a,
// 2026-11-11: lockers, towels and showers are Utility Items with their own
// master, no longer facility types), and the desk actions - check-in, entry
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
}

// A numbered unit of a utility item on the station's board (locker L014).
export interface StationUtilityUnit {
  id: string;
  code: string;
  location: string | null;
  isActive: boolean;
  unitStatus: 'available' | 'issued' | 'out-of-service';
  currentIssueId: string | null;
  remarks: string | null;
}

export interface StationGuest {
  id: string;
  patronId: string | null;
  participantType: string;
  name: string;
  memberNo: string | null;
  guestVisitId: string | null;
  sortOrder: number;
  // Slice 6c: the day pass behind the line, and whether the station created it.
  guestRegistrationId?: string | null;
  passCreatedHere?: boolean;
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
  // Slice 4: booked, past start + grace, not checked in.
  noShowEligible?: boolean;
  registration: StationRegistration | null;
  bill: FacilityBillSummary | null;
}

export interface StationIssue {
  id: string;
  // The RESPONSIBLE member; the holder is that member unless holderName
  // names a guest served on the pass (slice 6b).
  patron: StationPatron | null;
  holderName?: string | null;
  guestRegistrationId?: string | null;
  utilityItemId: string;
  utilityUnitId: string | null;
  unit: { id: string; code: string; location: string | null } | null;
  registrationId: string | null;
  quantity: number;
  issuedAt: string;
  dueBack: string;
  overdue: boolean;
  returnedAt: string | null;
  returnedQuantity: number | null;
  returnCondition: string | null;
  // 'used' = a use-only item, closed at issue.
  status: 'issued' | 'returned' | 'lost' | 'used';
  feeBillId: string | null;
  bill: FacilityBillSummary | null;
  remarks: string | null;
}

export interface StationType {
  id: string;
  code: string;
  description: string;
  usageMode: 'slot' | 'entry';
  iconUrl: string | null;
  capacity: number | null;
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
}

// A utility item on the station: 'units' = numbered units issued and
// returned one by one, 'quantity' = pieces issued and counted back, 'use' =
// a use recorded with nothing to return.
export interface StationUtilityItem {
  id: string;
  code: string;
  description: string;
  iconUrl: string | null;
  behaviour: 'units' | 'quantity' | 'use';
  trackUnits: boolean;
  returnRequired: boolean;
  stockQuantity: number | null;
  maxPerPerson: number;
  dueDays: number;
  guestsAllowed: boolean;
  requiresEntry: boolean;
  // The fee an issue bills today (before tax; null amount = no price in
  // force), or null for a free item.
  fee?: { code: string; description: string | null; unitAmount: number | null } | null;
  units: StationUtilityUnit[];
  outCount: number;
  usedCount: number;
  issues: StationIssue[];
}

// Slice 5b: one of the day's class sessions on the station's Classes view.
export interface StationClassSession {
  id: string;
  classId: string;
  class: { id: string; code: string; description: string; enrolmentMode: 'session' | 'term'; walkInAllowed: boolean; visitorsAllowed: boolean } | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  venue: { id: string; code: string; name: string } | null;
  instructor: { id: string; code: string; name: string } | null;
  capacity: number;
  seatsTaken: number;
  status: 'scheduled' | 'held' | 'cancelled';
  heldAt: string | null;
  remarks: string | null;
}

export interface StationDay {
  date: string;
  dayType: 'weekday' | 'weekend';
  clubNow: { date: string; time: string };
  checkInOpenMinutes: number;
  noShowControlled?: boolean;
  noShowGraceMinutes?: number | null;
  types: StationType[];
  // Slice 6a: what the station hands out.
  utilityItems?: StationUtilityItem[];
  // Slice 5b: the day's class sessions while classes are switched on.
  classesEnabled?: boolean;
  classSessions?: StationClassSession[];
}

export interface StationGuestLine {
  participantType: string;
  memberNo?: string | null;
  name?: string | null;
  identityNo?: string | null;
  mobile?: string | null;
  email?: string | null;
  // The day pass the line already stands on (kept when the lines are saved again).
  guestRegistrationId?: string | null;
}

// ---- slice 6b: scan and serve ----

// One utility item in the Serve panel: whether the person may take it now
// (and why not), what it bills, and the free units of a numbered item.
export interface ServeTile {
  utilityItemId: string;
  code: string;
  description: string;
  iconUrl: string | null;
  behaviour: 'units' | 'quantity' | 'use';
  fee: { code: string; description: string | null; unitAmount: number | null } | null;
  allowed: boolean;
  reason: string | null;
  held: number;
  limit: number;
  dueDays: number;
  freeUnits: { id: string; code: string; location: string | null }[];
  suggestedUnitId: string | null;
}

// What the person holds or used today, with the item it is of.
export interface ServeRow extends StationIssue {
  item: { id: string; code: string; description: string; behaviour: 'units' | 'quantity' | 'use' } | null;
  undoable: boolean;
}

// What the desk needs to hand a guest's pass over (slice 6c).
export interface PassShare {
  guestRegistrationId: string;
  registrationNo: string;
  passUrl: string;
  qrDataUrl: string;
  whatsappUrl: string | null;
  canEmail: boolean;
  sentVia: string | null;
}

// A guest served under a member today: on a pass, or by name.
export interface ServeGuest {
  name: string;
  guestRegistrationId: string | null;
  holding: number;
}

// The Serve panel of one person: a guest on a pass (the host is the
// responsible member), a guest served by name with the member (slice 6c:
// kind 'guest' with no pass), or a member on their own number.
export interface ServePanel {
  kind: 'guest' | 'member';
  person: { name: string };
  host: { memberId: string; memberNo: string; name: string };
  // createdHere = the station registered this pass, so it may take it back.
  pass: { id: string; registrationNo: string; visitDate: string; arrivedAt: string | null; firstScan: boolean; createdHere?: boolean } | null;
  // A member's panel: the guests served under them, and how a guest keyed
  // at the station is served (Facility Specification's two door switches).
  guests?: ServeGuest[];
  door?: { passEnabled: boolean; contactRequired: boolean } | null;
  standingWarning: string | null;
  holding: ServeRow[];
  usedToday: ServeRow[];
  tiles: ServeTile[];
  bill: FacilityBillSummary | null;
  undoMinutes: number;
  clubNow: { date: string; time: string };
}

export interface StationActionResult {
  message: string;
  // The redrawn Serve panel, when the request asked for it.
  panel?: ServePanel | null;
  registrationId?: string;
  issueId?: string;
  warnings?: string[];
  standingWarning?: string | null;
  // The pass of a guest the station just registered (slice 6c).
  share?: PassShare | null;
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

  // The holder is the member (memberNo), a guest on a pass
  // (guestRegistrationId) or a guest served by name with the member (memberNo
  // with guestName); `panel` asks for the redrawn Serve panel.
  issue(payload: { utilityItemId: string; utilityUnitId?: string | null; quantity?: number; memberNo?: string | null; guestRegistrationId?: string | null; guestName?: string | null; registrationId?: string | null; remarks?: string | null; panel?: boolean }): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/issues`, payload);
  }

  returnIssue(issueId: string, payload: { condition: string; returnedQuantity?: number | null; remarks?: string | null; panel?: boolean }): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/issues/${issueId}/return`, payload);
  }

  // Slice 6b: what was scanned or keyed (a pass link, a pass token or a
  // member number) opens the Serve panel; the ids redraw it.
  scan(payload: { code?: string; guestRegistrationId?: string | null; memberNo?: string | null; guestName?: string | null }): Observable<{ panel: ServePanel }> {
    return this.http.post<{ panel: ServePanel }>(`${this.base}/scan`, payload);
  }

  // Slice 6c: the member is at the counter with a guest who holds no pass.
  // Keyed with a mobile or an email the guest is registered and holds a pass
  // from then on; keyed with a name, the guest is served by name. Answers
  // the guest's panel (and the pass to hand over).
  addDoorGuest(payload: { memberNo: string; name: string; mobile?: string | null; email?: string | null }): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/door-guests`, payload);
  }

  doorPass(guestRegistrationId: string): Observable<{ share: PassShare }> {
    return this.http.get<{ share: PassShare }>(`${this.base}/door-guests/${guestRegistrationId}/pass`);
  }

  // Email the pass, or record that the desk shared it over its own WhatsApp.
  sendDoorPass(guestRegistrationId: string, via: 'email' | 'whatsapp'): Observable<{ message: string; share: PassShare }> {
    return this.http.post<{ message: string; share: PassShare }>(`${this.base}/door-guests/${guestRegistrationId}/send`, { via });
  }

  // A guest added by mistake: the pass the station registered is cancelled.
  removeDoorGuest(guestRegistrationId: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/door-guests/${guestRegistrationId}/remove`, {});
  }

  // A wrong tap, inside the undo window.
  undoIssue(issueId: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/issues/${issueId}/undo`, {});
  }

  clearUnit(unitId: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/units/${unitId}/clear`, {});
  }

  // Slice 4: mark booked slots past their grace as no-show (charges raised after commit).
  markNoShows(slotIds: string[]): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/no-shows`, { slotIds });
  }

  endOfDay(facilityTypeId: string | null, date: string): Observable<StationActionResult> {
    return this.http.post<StationActionResult>(`${this.base}/end-of-day`, { facilityTypeId, date });
  }

  // Slice 5b: a walk-in seat in one of today's class sessions.
  enrolWalkIn(payload: { classId: string; sessionId: string; memberNo?: string | null; visitor?: { name: string } | null }): Observable<StationActionResult & { enrolmentId?: string; billId?: string | null }> {
    return this.http.post<StationActionResult & { enrolmentId?: string; billId?: string | null }>(`${this.base}/class-enrolments`, payload);
  }
}
