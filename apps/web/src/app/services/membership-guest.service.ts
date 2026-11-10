import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

export type GuestRegistrationStatus = 'registered' | 'arrived' | 'cancelled';
// What the pass shows today (derived by the API from the club's own date).
export type GuestPassState = 'valid' | 'upcoming' | 'expired' | 'cancelled';
export type GuestPassVia = 'email' | 'whatsapp';

// The guest person (membership.Guest).
export interface Guest {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  identityNo: string | null;
  remarks: string | null;
}

// A returning guest in the search list, with how often they came.
export interface GuestMatch extends Guest {
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

// One guest, one host member, one date = one day pass (membership.GuestRegistration).
export interface GuestRegistration {
  id: string;
  registrationNo: string;
  visitDate: string;
  status: GuestRegistrationStatus;
  passState: GuestPassState;
  channel: string;
  guest: Guest | null;
  host: GuestHost | null;
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

export interface GuestRegistrationList {
  registrations: GuestRegistration[];
  statuses: MembershipStatusOption[];
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

// Guest Registration + the day pass + the Guest Visits enquiry (Membership
// Management). Behind the Membership entitlement and the
// '/membership/guest-registrations' / '/membership/guest-visits' grants; the
// pass page itself is public.
@Injectable({ providedIn: 'root' })
export class MembershipGuestService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/guest-registrations`;

  list(filter: { dateFrom?: string; dateTo?: string; status?: string }): Observable<GuestRegistrationList> {
    let params = new HttpParams();
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.status) params = params.set('status', filter.status);
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

  create(payload: GuestRegistrationPayload): Observable<RegistrationResult & { pass: GuestPassFacts }> {
    return this.http.post<RegistrationResult & { pass: GuestPassFacts }>(this.base, payload);
  }

  // Correct the guest's details or the remarks (host and date are fixed).
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
