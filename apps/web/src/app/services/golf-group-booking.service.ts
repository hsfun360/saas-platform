import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// Group / Tournament Booking (user decisions 2026-10-07, slice 1): the
// header (organiser, size), its play days (each a course + START FORMAT),
// the reserved flights per day, the roster and the draw. Behind the Golf
// entitlement + '/golf/group-bookings' on the API.

export type GolfStartFormat = 'traditional' | 'two-tee' | 'shotgun' | 'modified-shotgun';
export type GolfGroupBookingType = 'group' | 'tournament';
export type GolfOrganiserKind = 'other' | 'member' | 'none';

export interface GolfGroupCourseOption {
  id: string;
  courseCode: string;
  description: string | null;
  label: string;
  firstNineCode: string | null;
  secondNineCode: string | null;
}

export interface GolfGroupBookingMeta {
  bookingTypes: MembershipStatusOption[];
  startFormats: MembershipStatusOption[];
  holdFormats: string[];
  playerTypes: MembershipStatusOption[];
  holesOptions: number[];
  statuses: MembershipStatusOption[];
  playDayStatuses: MembershipStatusOption[];
  rosterStatuses: MembershipStatusOption[];
  defaultCapacity: number;
  maxFlightsPerDay: number;
  courses: GolfGroupCourseOption[];
  otherDebtors: { id: string; code: string; name: string }[];
}

export interface GolfGroupFlightPlayer {
  playerId: string;
  groupPlayerId: string | null;
  playerName: string;
  memberNo: string | null;
  playerType: string;
  status: string;
  registrationNo: string | null;
  crossTime: string | null;
}

export interface GolfGroupFlight {
  id: string;
  groupPlayDayId: string;
  unitCourseId: string;
  teeTime: string;
  startHole: number | null;
  startSequence: number;
  flightLabel: string;
  capacity: number;
  sortOrder: number;
  players: GolfGroupFlightPlayer[];
}

export interface GolfGroupPlayDay {
  id: string;
  playDate: string;
  courseId: string;
  courseLabel: string | null;
  firstNineCode: string | null;
  secondNineCode: string | null;
  holes: number;
  startFormat: GolfStartFormat;
  startTime: string;
  blockUntil: string | null;
  startHoles: number[] | null;
  waves: number;
  remarks: string | null;
  status: 'planned' | 'played' | 'cancelled';
  flights: GolfGroupFlight[];
  drawnCount: number;
  seatCount: number;
}

export interface GolfGroupRosterPlayer {
  id: string;
  golferId: string | null;
  playerName: string;
  memberNo: string | null;
  playerType: 'member' | 'member-guest' | 'guest';
  handicap: number | null;
  teamName: string | null;
  contactMobile: string | null;
  remarks: string | null;
  sortOrder: number;
  status: 'listed' | 'withdrawn';
  drawn: Record<string, string>;
}

export interface GolfGroupBookingHeader {
  id: string;
  bookingNo: string;
  bookingType: GolfGroupBookingType;
  groupName: string | null;
  organiserName: string | null;
  debtorType: string | null;
  debtorSourceId: string | null;
  bookerMemberNo: string | null;
  contactPerson: string | null;
  contactMobile: string | null;
  expectedPlayers: number | null;
  playDate: string;
  playDateTo: string | null;
  remarks: string | null;
  status: string;
  cancelReason: string | null;
  canModify?: boolean;
}

export interface GolfGroupBookingRow extends GolfGroupBookingHeader {
  dayCount: number;
  courses: string[];
  rosterCount: number;
}

export interface GolfGroupBooking extends GolfGroupBookingHeader {
  days: GolfGroupPlayDay[];
  roster: GolfGroupRosterPlayer[];
  rosterCount: number;
}

export interface GolfGroupDayPayload {
  playDate: string;
  courseId: string;
  holes: number;
  startFormat: GolfStartFormat;
  startTime: string;
  blockUntil?: string | null;
  startHoles?: number[] | null;
  waves?: number;
  remarks?: string | null;
}

export interface GolfGroupHeaderPayload {
  bookingType: GolfGroupBookingType;
  groupName: string;
  organiserKind: GolfOrganiserKind;
  otherDebtorId?: string;
  memberNo?: string;
  organiserName?: string;
  contactPerson?: string;
  contactMobile?: string;
  expectedPlayers?: number | null;
  remarks?: string;
  bookingNo?: string;
}

export interface GolfGroupRosterLine {
  playerType: 'member' | 'member-guest' | 'guest';
  memberNo?: string;
  playerName?: string;
  handicap?: number | null;
  teamName?: string;
  contactMobile?: string;
  remarks?: string;
  status?: 'listed' | 'withdrawn';
}

type Saved = { message: string; booking: GolfGroupBooking };

@Injectable({ providedIn: 'root' })
export class GolfGroupBookingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/group-bookings`;

  meta(): Observable<GolfGroupBookingMeta> {
    return this.http.get<GolfGroupBookingMeta>(`${this.base}/meta`);
  }

  list(filter: { dateFrom?: string; dateTo?: string; status?: string }): Observable<{ bookings: GolfGroupBookingRow[]; bookingTypes: MembershipStatusOption[]; statuses: MembershipStatusOption[] }> {
    let params = new HttpParams();
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.status) params = params.set('status', filter.status);
    return this.http.get<{ bookings: GolfGroupBookingRow[]; bookingTypes: MembershipStatusOption[]; statuses: MembershipStatusOption[] }>(this.base, { params });
  }

  get(id: string): Observable<{ booking: GolfGroupBooking }> {
    return this.http.get<{ booking: GolfGroupBooking }>(`${this.base}/${id}`);
  }

  create(payload: GolfGroupHeaderPayload & { days: GolfGroupDayPayload[] }): Observable<Saved> {
    return this.http.post<Saved>(this.base, payload);
  }

  update(id: string, payload: GolfGroupHeaderPayload): Observable<Saved> {
    return this.http.put<Saved>(`${this.base}/${id}`, payload);
  }

  cancel(id: string, reason: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${id}/cancel`, { reason });
  }

  addDay(id: string, day: GolfGroupDayPayload): Observable<Saved> {
    return this.http.post<Saved>(`${this.base}/${id}/days`, day);
  }

  updateDay(id: string, dayId: string, day: GolfGroupDayPayload): Observable<Saved> {
    return this.http.put<Saved>(`${this.base}/${id}/days/${dayId}`, day);
  }

  removeDay(id: string, dayId: string): Observable<Saved> {
    return this.http.delete<Saved>(`${this.base}/${id}/days/${dayId}`);
  }

  // Sequential formats: { count }; shotgun formats: { doubleHoles, waveGapMinutes }.
  generateFlights(id: string, dayId: string, payload: { count?: number; capacity?: number; doubleHoles?: number[]; waveGapMinutes?: number }): Observable<Saved> {
    return this.http.post<Saved>(`${this.base}/${id}/days/${dayId}/flights/generate`, payload);
  }

  removeFlight(id: string, dayId: string, flightId: string): Observable<Saved> {
    return this.http.delete<Saved>(`${this.base}/${id}/days/${dayId}/flights/${flightId}`);
  }

  draw(id: string, dayId: string, payload: { assignments: { groupPlayerId: string; groupFlightId: string | null }[]; auto?: boolean }): Observable<Saved> {
    return this.http.put<Saved>(`${this.base}/${id}/days/${dayId}/draw`, payload);
  }

  addPlayers(id: string, players: GolfGroupRosterLine[]): Observable<Saved> {
    return this.http.post<Saved>(`${this.base}/${id}/players`, { players });
  }

  updatePlayer(id: string, playerId: string, line: GolfGroupRosterLine): Observable<Saved> {
    return this.http.put<Saved>(`${this.base}/${id}/players/${playerId}`, line);
  }

  removePlayer(id: string, playerId: string): Observable<Saved> {
    return this.http.delete<Saved>(`${this.base}/${id}/players/${playerId}`);
  }
}
