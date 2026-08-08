import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// In-app notifications (the header bell). Backed by the Notification service's
// user-scoped endpoints; long-running background jobs (statement runs today)
// notify their initiator here. The shell loads on boot and polls lazily.
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkRoute: string | null;
  readAt: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/notifications`;

  readonly items = signal<AppNotification[]>([]);
  readonly unread = signal(0);

  // Silent refresh - the bell must never surface an error of its own.
  load(): void {
    this.http.get<{ unread: number; notifications: AppNotification[] }>(`${this.base}/my`).subscribe({
      next: (res) => {
        this.items.set(res.notifications);
        this.unread.set(res.unread);
      },
      error: () => {},
    });
  }

  markRead(id: string): void {
    const target = this.items().find((n) => n.id === id);
    if (!target || target.readAt) return;
    // Optimistic: settle locally, then persist.
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    this.unread.update((c) => Math.max(0, c - 1));
    this.http.patch(`${this.base}/${id}/read`, {}).subscribe({ error: () => {} });
  }

  markAllRead(): void {
    if (!this.unread()) return;
    this.items.update((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    this.unread.set(0);
    this.http.post(`${this.base}/read-all`, {}).subscribe({ error: () => {} });
  }
}
