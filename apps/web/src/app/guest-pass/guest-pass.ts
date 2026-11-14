import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { MembershipGuestService, PublicGuestPass } from '../services/membership-guest.service';

// The digital DAY PASS (/guest-pass/:token; structure approved 2026-11-10,
// one pass for every patron group since 2026-11-14). Public route, outside
// the shell: the random token in the link is the credential - the holder has
// no login. The page shows who the pass is for, how they come to the club (a
// member's guest, or a visiting member of an affiliated or reciprocal club),
// the date and the LIVE state read from the server on every open (valid
// today / not yet valid / expired / cancelled), so an old screenshot never
// passes for a valid pass at the desk. It shows no contact details and no
// membership number.
@Component({
  selector: 'app-guest-pass',
  standalone: true,
  imports: [LocalDatePipe],
  templateUrl: './guest-pass.html',
  styleUrls: ['../shared/auth-card.css', './guest-pass.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestPassComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(MembershipGuestService);

  readonly loading = signal(true);
  readonly pass = signal<PublicGuestPass | null>(null);
  readonly invalidMessage = signal('');
  // "Guest pass" for a member's guest, "Day pass" for a visiting member.
  readonly title = computed(() => {
    const p = this.pass();
    return p && !this.isGuestPass(p) ? 'Day pass' : 'Guest pass';
  });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') || '';
    if (!token) {
      this.loading.set(false);
      this.invalidMessage.set('This pass link is incomplete. Please use the link the club sent you.');
      return;
    }
    this.service.publicPass(token).subscribe({
      next: (p) => {
        this.pass.set(p);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.invalidMessage.set(err.status === 429
          ? 'Too many requests. Please try again in a few minutes.'
          : 'This pass link is not valid. Please ask the club or your host for a new one.');
      },
    });
  }

  // A member's guest (a pass issued before the patron groups has none set).
  isGuestPass(p: PublicGuestPass): boolean {
    return !p.patronGroup || p.patronGroup === 'guest';
  }

  // "Guest of Ahmad Faizal" / "Member of Royal Selangor Golf Club".
  relation(p: PublicGuestPass): string {
    return p.relationText || `Guest of ${p.hostName}`;
  }

  stateIcon(state: PublicGuestPass['state']): string {
    switch (state) {
      case 'valid': return 'verified';
      case 'upcoming': return 'event';
      case 'expired': return 'event_busy';
      default: return 'block';
    }
  }

  stateClass(state: PublicGuestPass['state']): string {
    if (state === 'valid') return 'auth-alert--success';
    if (state === 'upcoming') return 'auth-alert--neutral';
    return 'auth-alert--danger';
  }
}
