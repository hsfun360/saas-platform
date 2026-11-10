import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { MembershipGuestService, GuestVisitsReport, GuestVisitLine } from '../services/membership-guest.service';

// One card of the enquiry, whichever way it is grouped.
interface VisitGroup {
  key: string;
  title: string;
  subline: string;
  visits: number;
  lines: GuestVisitLine[];
}

// A member card's second line: how many different known guests the lines name.
// Lines without a guest record (a facility booking holds only a name) are not
// people the ledger can tell apart, so they are left out of this count.
function knownGuestsLabel(lines: GuestVisitLine[]): string {
  const known = new Set(lines.map((l) => l.guestId).filter((id): id is string => !!id)).size;
  return known ? `${known} known guest${known === 1 ? '' : 's'}` : '';
}

// Membership Management -> Guest Visits (/membership/guest-visits; structure
// approved 2026-11-10). A read-only enquiry over the guest-usage ledger: how
// many guests each member brought in a period, across every module (desk
// registrations, facility bookings; golf when it is wired), and how often
// each known guest came. A known guest counts once per host per day, so a
// group's visit count can be lower than its number of lines.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-membership-guest-visits',
  standalone: true,
  imports: [CommonModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, LocalDatePipe],
  templateUrl: './membership-guest-visits.html',
  styleUrls: ['./membership-guest-visits.css'],
})
export class MembershipGuestVisitsComponent implements OnInit {
  private readonly service = inject(MembershipGuestService);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly report = signal<GuestVisitsReport | null>(null);

  // Server-side filters: the period (this month to date by default) and an
  // optional host member; client-side search and grouping.
  readonly dateFrom = signal(`${localDateOnly().slice(0, 8)}01`);
  readonly dateTo = signal(localDateOnly());
  readonly memberNo = signal('');
  readonly groupBy = signal<'member' | 'guest'>('member');
  readonly search = signal('');
  readonly openKeys = signal<Record<string, boolean>>({});

  readonly groups = computed<VisitGroup[]>(() => {
    const r = this.report();
    if (!r) return [];
    if (this.groupBy() === 'guest') {
      return r.byGuest.map((g) => ({
        key: `g:${g.guestId}`,
        title: g.guestName,
        subline: `Brought by ${g.hosts} member${g.hosts === 1 ? '' : 's'}`,
        visits: g.visits,
        lines: g.lines,
      }));
    }
    return r.byMember.map((m) => ({
      key: `m:${m.memberId}`,
      title: `${m.memberNo} - ${m.memberName}`,
      subline: knownGuestsLabel(m.lines),
      visits: m.visits,
      lines: m.lines,
    }));
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.groups();
    if (!q) return rows;
    return rows.filter((g) =>
      g.title.toLowerCase().includes(q)
      || g.lines.some((l) => l.guestName.toLowerCase().includes(q) || l.memberNo.toLowerCase().includes(q) || l.memberName.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.service.visits({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), memberNo: this.memberNo().trim() || undefined }).subscribe({
      next: (res) => {
        this.report.set(res);
        this.openKeys.set({});
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.report.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to load guest visits.');
      },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setMemberNo(v: string): void { this.memberNo.set(v); this.load(); }
  setGroupBy(v: string): void { this.groupBy.set(v === 'guest' ? 'guest' : 'member'); this.openKeys.set({}); }
  clearSearch(): void { this.search.set(''); }

  isOpen(key: string): boolean {
    return this.openKeys()[key] === true;
  }

  toggle(key: string): void {
    this.openKeys.update((m) => ({ ...m, [key]: !m[key] }));
  }

  // The other party on a line: the guest under a member, the host under a guest.
  lineParty(l: GuestVisitLine): string {
    return this.groupBy() === 'guest' ? `${l.memberNo} - ${l.memberName}` : l.guestName;
  }
}
