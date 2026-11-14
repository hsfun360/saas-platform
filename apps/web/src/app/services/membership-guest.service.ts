import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

export type GuestRegistrationStatus = 'registered' | 'arrived' | 'cancelled';
// What the pass shows today (derived by the API from the club's own date).
export type GuestPassState = 'valid' | 'upcoming' | 'expired' | 'cancelled';
export type GuestPassVia = 'email' | 'whatsapp';

// Who a registration is for: a member's guest, or a visiting member of an
// affiliated / reciprocal club (and the guests that visitor brings).
export type PatronGroup = 'guest' | 'affiliate' | 'reciprocal';

// The person on a registration. `id` is the membership.Guest id; it is null
// for the visiting member a letter of introduction names.
export interface Guest {
  id: string | null;
  name: string;
  mobile: string | null;
  email: string | null;
  identityNo: string | null;
  remarks: string | null;
}

// A returning guest in the search list, with how often they came.
export interface GuestMatch extends Guest {
  id: string;
  visits: number;
  lastVisit: string | null;
}

export interface GuestHost {
  memberId: string;
  memberNo: string;
  name: string;
}

// The host as the desk sees them before saving: standing + the month's allowance.
export interface GuestHostFacts {
  host: GuestHost & { statusLabel: string | null; actionControl: 'allow' | 'warning' | 'barred' };
  // allowance null = no limit; remaining null with it.
  allowance: { allowance: number | null; used: number; remaining: number | null } | null;
  visitDate: string;
}

// The letter of introduction and the home club behind an affiliated /
// reciprocal registration.
export interface RegistrationVisit {
  id: string;
  visitNo: string;
  visitorName: string;
  visitorMemberNo: string;
  visitDate: string;
  lastDay: string;
}
export interface RegistrationClub {
  id: string;
  code: string;
  name: string;
  kind: 'affiliate' | 'reciprocal';
}

// One person, one date = one day pass (membership.GuestRegistration).
export interface GuestRegistration {
  id: string;
  registrationNo: string;
  visitDate: string;
  status: GuestRegistrationStatus;
  passState: GuestPassState;
  channel: string;
  patronGroup: PatronGroup;
  patronLabel: string;
  // A guest the visiting member brought (never the visitor's own row).
  accompanying: boolean;
  // "Guest of Ahmad Faizal (A0018)" / "Member of Royal Selangor Golf Club (RS-1234)".
  relation: string;
  // The person, whichever group.
  guest: Guest | null;
  // The host member of a member's guest; null on the other groups.
  host: GuestHost | null;
  visit: RegistrationVisit | null;
  club: RegistrationClub | null;
  canCancel: boolean;
  // The visitor's own live row of today takes the guests they bring.
  canAddGuest: boolean;
  passSentAt: string | null;
  passSentVia: GuestPassVia | null;
  passSentTo: string | null;
  arrivedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  remarks: string | null;
  createdAt: string;
  canModify?: boolean;
}

export interface GuestDetailsPayload {
  name: string;
  mobile: string | null;
  email: string | null;
  identityNo: string | null;
}

export interface GuestRegistrationPayload {
  memberNo: string;
  visitDate: string;
  registrationNo?: string;
  // A returning guest picked from the search; absent for a new guest.
  guestId?: string;
  guest: GuestDetailsPayload;
  remarks: string | null;
  sendEmail: boolean;
}

// What the desk hands over: the link, its QR code and the WhatsApp
// click-to-chat link (null when the guest has no mobile).
export interface GuestPassFacts {
  passUrl: string;
  qrDataUrl: string;
  whatsappUrl: string | null;
  shareText: string;
}

// A visiting member the counter may receive today: a confirmed letter (or one
// already running) valid today, whose visitor has not registered yet today.
export interface ExpectedVisit {
  id: string;
  visitNo: string;
  visitorName: string;
  visitorMemberNo: string;
  club: RegistrationClub | null;
  visitDate: string;
  lastDay: string;
  datesText: string;
  facilitiesText: string;
  // The first time at the counter: the letter itself is sighted too.
  firstDay: boolean;
  letterSightedOn: string | null;
  daysAttended: number;
}

// A club a walk-up may come from; `needsApproval` = no pass on the spot.
export interface WalkUpClub {
  id: string;
  code: string;
  name: string;
  kind: 'affiliate' | 'reciprocal';
  needsApproval: boolean;
  maxGuestsPerVisit: number | null;
}

export interface ReceivePayload {
  letterSighted: boolean;
  idSighted: boolean;
  registrationNo?: string;
  remarks?: string | null;
}

export interface WalkUpPayload {
  affiliatedClubId: string;
  visitorName: string;
  visitorMemberNo: string;
  visitorIdentityNo: string | null;
  visitorMobile: string | null;
  visitorEmail: string | null;
  loiReference: string | null;
  // The letter's last day when it covers several (empty = today only).
  visitDateTo: string | null;
  sports: string | null;
  dining: string | null;
  other: string | null;
  remarks: string | null;
  registrationNo?: string;
  letterSighted: boolean;
  idSighted: boolean;
}

export interface GuestRegistrationList {
  registrations: GuestRegistration[];
  statuses: MembershipStatusOption[];
  groups: { key: PatronGroup; label: string }[];
  expectedVisits: ExpectedVisit[];
  clubs: WalkUpClub[];
  // The club's own date ('YYYY-MM-DD').
  today: string;
  numberingMode: 'auto' | 'manual' | null;
}

// The public pass page (no login; the token in the link is the credential).
export interface PublicGuestPass {
  clubName: string;
  clubLogo: string | null;
  registrationNo: string;
  guestName: string;
  hostName: string;
  patronGroup: PatronGroup;
  patronLabel: string;
  // "Guest of Ahmad Faizal" / "Member of Royal Selangor Golf Club".
  relationText: string;
  visitDate: string;
  state: GuestPassState;
  stateLabel: string;
  arrivedAt: string | null;
  qrDataUrl: string | null;
}

// One line of the guest-usage ledger, any module.
export interface GuestVisitLine {
  id: string;
  visitDate: string;
  memberId: string;
  memberNo: string;
  memberName: string;
  guestId: string | null;
  guestName: string;
  guestCount: number;
  sourceModule: string;
  sourceLabel: string;
  reference: string | null;
}

export interface GuestVisitsByMember {
  memberId: string;
  memberNo: string;
  memberName: string;
  visits: number;
  lines: GuestVisitLine[];
}

export interface GuestVisitsByGuest {
  guestId: string;
  guestName: string;
  visits: number;
  hosts: number;
  lines: GuestVisitLine[];
}

export interface GuestVisitsReport {
  dateFrom: string;
  dateTo: string;
  capped: boolean;
  lineCount: number;
  totalVisits: number;
  byMember: GuestVisitsByMember[];
  byGuest: GuestVisitsByGuest[];
}

type RegistrationResult = { message: string; registration: GuestRegistration };
type IssuedResult = RegistrationResult & { pass: GuestPassFacts };

// The Registration Counter (a member's guest, a visiting affiliated or
// reciprocal member and the guests they bring), the day pass and the Guest
// Visits enquiry (Membership Management). Behind the Membership entitlement
// and the '/membership/registration-counter' / '/membership/guest-visits'
// grants; the pass page itself is public.
@Injectable({ providedIn: 'root' })
export class MembershipGuestService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/guest-registrations`;

  list(filter: { dateFrom?: string; dateTo?: string; status?: string; group?: string }): Observable<GuestRegistrationList> {
    let params = new HttpParams();
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.group) params = params.set('group', filter.group);
    return this.http.get<GuestRegistrationList>(this.base, { params });
  }

  // The host member's standing and guest allowance in the month of the date.
  host(memberNo: string, visitDate: string): Observable<GuestHostFacts> {
    const params = new HttpParams().set('memberNo', memberNo).set('visitDate', visitDate);
    return this.http.get<GuestHostFacts>(`${this.base}/host`, { params });
  }

  // Returning guests by name, mobile, email or identity number.
  searchGuests(q: string): Observable<{ guests: GuestMatch[] }> {
    return this.http.get<{ guests: GuestMatch[] }>(`${this.base}/guests`, { params: new HttpParams().set('q', q) });
  }

  create(payload: GuestRegistrationPayload): Observable<IssuedResult> {
    return this.http.post<IssuedResult>(this.base, payload);
  }

  // A visiting member registers for TODAY on their letter and gets the day
  // pass (letter and ID sighted the first time, the ID on a later day).
  receiveVisit(visitId: string, payload: ReceivePayload): Observable<IssuedResult> {
    return this.http.post<IssuedResult>(`${this.base}/visits/${visitId}/receive`, payload);
  }

  // A walk-up with no letter on file. `issued` false = recorded only (the
  // arrangement needs approval, or the letter could not be confirmed).
  walkUp(payload: WalkUpPayload): Observable<{ message: string; issued: boolean; registration?: GuestRegistration; pass?: GuestPassFacts }> {
    return this.http.post<{ message: string; issued: boolean; registration?: GuestRegistration; pass?: GuestPassFacts }>(`${this.base}/walk-ups`, payload);
  }

  // A pass for a guest the visiting member brought (on the visitor's own
  // registration of today).
  addVisitorGuest(registrationId: string, payload: { guestId?: string; guest: GuestDetailsPayload; remarks: string | null; sendEmail: boolean; registrationNo?: string }): Observable<IssuedResult> {
    return this.http.post<IssuedResult>(`${this.base}/${registrationId}/guests`, payload);
  }

  // Correct the person's details or the remarks (who they come with and the
  // date are fixed; a visiting member keeps the name of the letter).
  update(id: string, payload: { guest: GuestDetailsPayload; remarks: string | null }): Observable<RegistrationResult> {
    return this.http.put<RegistrationResult>(`${this.base}/${id}`, payload);
  }

  cancel(id: string, reason: string): Observable<RegistrationResult> {
    return this.http.put<RegistrationResult>(`${this.base}/${id}/cancel`, { reason });
  }

  arrive(id: string): Observable<RegistrationResult> {
    return this.http.put<RegistrationResult>(`${this.base}/${id}/arrive`, {});
  }

  pass(id: string): Observable<{ registration: GuestRegistration; pass: GuestPassFacts }> {
    return this.http.get<{ registration: GuestRegistration; pass: GuestPassFacts }>(`${this.base}/${id}/pass`);
  }

  // 'email' queues the pass email; 'whatsapp' records that the desk shared it.
  sendPass(id: string, via: GuestPassVia): Observable<RegistrationResult> {
    return this.http.put<RegistrationResult>(`${this.base}/${id}/send`, { via });
  }

  // The registration behind a scanned (or pasted) pass.
  scan(code: string): Observable<{ registration: GuestRegistration }> {
    return this.http.put<{ registration: GuestRegistration }>(`${this.base}/scan`, { code });
  }

  // PUBLIC: what the pass page shows.
  publicPass(token: string): Observable<PublicGuestPass> {
    return this.http.get<PublicGuestPass>(`${environment.apiUrl}/membership/guest-pass/${token}`);
  }

  // Every confirmed guest visit in the range, all modules, grouped.
  visits(filter: { dateFrom: string; dateTo: string; memberNo?: string }): Observable<GuestVisitsReport> {
    let params = new HttpParams().set('dateFrom', filter.dateFrom).set('dateTo', filter.dateTo);
    if (filter.memberNo) params = params.set('memberNo', filter.memberNo);
    return this.http.get<GuestVisitsReport>(`${environment.apiUrl}/membership/guest-visits`, { params });
  }
}
