import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Golfers master (/golf/golfers) - the maintenance surface for the
// golf-owned handicap fields on the Golfer identity (index + status), which
// the handicap-control rules read. Identity rows are created lazily by the
// booking/front-desk flows; this screen edits only what golf owns.

export interface Golfer {
  id: string;
  golferType: 'member' | 'other';
  name: string;
  memberNo: string | null;
  handicapIndex: number | null;
  handicapStatus: 'established' | 'provisional' | 'beginner' | null;
  remarks: string | null;
  isActive: boolean;
  canModify?: boolean;
}

export interface GolferListResponse {
  golfers: Golfer[];
  golferTypes: { key: string; label: string }[];
  handicapStatuses: { key: string; label: string }[];
}

@Injectable({ providedIn: 'root' })
export class GolfGolferService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/golfers`;

  list(): Observable<GolferListResponse> {
    return this.http.get<GolferListResponse>(this.base);
  }

  update(id: string, patch: {
    handicapIndex?: number | null;
    handicapStatus?: string | null;
    remarks?: string | null;
    isActive?: boolean;
  }): Observable<{ message: string; golfer: Golfer }> {
    return this.http.patch<{ message: string; golfer: Golfer }>(`${this.base}/${id}`, patch);
  }
}
