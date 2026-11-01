import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RemoteAccessList } from '../models/auth.models';

// System Setup -> Access Requests (2026-11-01): the time-boxed exceptions to
// the registered-workstation lock. Every decision answers with the fresh
// three-group list, so the screen never guesses.
@Injectable({ providedIn: 'root' })
export class RemoteAccessService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/account/remote-access`;

  list(): Observable<RemoteAccessList> {
    return this.http.get<RemoteAccessList>(this.base);
  }

  approve(id: string, days: number, note: string | null): Observable<RemoteAccessList & { message: string }> {
    return this.http.post<RemoteAccessList & { message: string }>(`${this.base}/${encodeURIComponent(id)}/approve`, { days, note });
  }

  reject(id: string, note: string | null): Observable<RemoteAccessList & { message: string }> {
    return this.http.post<RemoteAccessList & { message: string }>(`${this.base}/${encodeURIComponent(id)}/reject`, { note });
  }

  // Grant in advance, without a request.
  grant(userId: string, days: number, note: string | null): Observable<RemoteAccessList & { message: string }> {
    return this.http.post<RemoteAccessList & { message: string }>(`${this.base}/grants`, { userId, days, note });
  }

  revoke(id: string): Observable<RemoteAccessList & { message: string }> {
    return this.http.delete<RemoteAccessList & { message: string }>(`${this.base}/${encodeURIComponent(id)}`);
  }
}
