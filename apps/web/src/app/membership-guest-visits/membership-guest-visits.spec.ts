import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MembershipGuestVisitsComponent } from './membership-guest-visits';
import { MembershipGuestService, GuestVisitLine, GuestVisitsReport } from '../services/membership-guest.service';

// Behaviour tests for the Guest Visits enquiry: the default period, the two
// groupings, and the note that explains a visit count lower than its lines.

function line(over: Partial<GuestVisitLine>): GuestVisitLine {
  return {
    id: 'l1', visitDate: '2026-11-10', memberId: 'm1', memberNo: 'A0018', memberName: 'Ahmad Faizal',
    guestId: 'g1', guestName: 'Lim Mei Ling', guestCount: 1, sourceModule: 'membership', sourceLabel: 'Guest Registration', reference: 'GR-000001',
    ...over,
  };
}

const DESK = line({});
const COURT = line({ id: 'l2', sourceModule: 'facility', sourceLabel: 'Facility', reference: null });

const REPORT: GuestVisitsReport = {
  dateFrom: '2026-11-01', dateTo: '2026-11-10', capped: false, lineCount: 2, totalVisits: 1,
  // The same guest at the desk and on a court booking that day: 2 lines, 1 visit.
  byMember: [{ memberId: 'm1', memberNo: 'A0018', memberName: 'Ahmad Faizal', visits: 1, lines: [DESK, COURT] }],
  byGuest: [{ guestId: 'g1', guestName: 'Lim Mei Ling', visits: 1, hosts: 1, lines: [DESK, COURT] }],
};

describe('MembershipGuestVisitsComponent', () => {
  let fixture: ComponentFixture<MembershipGuestVisitsComponent>;
  let component: MembershipGuestVisitsComponent;
  let asked: { dateFrom: string; dateTo: string; memberNo?: string }[];

  const serviceStub = {
    visits: (filter: { dateFrom: string; dateTo: string; memberNo?: string }) => {
      asked.push(filter);
      return of(REPORT);
    },
  };

  function text(selector: string): string {
    return (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  beforeEach(async () => {
    asked = [];
    await TestBed.configureTestingModule({
      imports: [MembershipGuestVisitsComponent],
      providers: [provideRouter([]), { provide: MembershipGuestService, useValue: serviceStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(MembershipGuestVisitsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('asks for this month to date by default and reloads when a member is keyed in', () => {
    expect(asked.length).toBe(1);
    expect(asked[0].dateFrom.endsWith('-01')).toBe(true);
    expect(asked[0].dateFrom.slice(0, 7)).toBe(asked[0].dateTo.slice(0, 7));
    expect(asked[0].memberNo).toBeUndefined();

    component.setMemberNo(' A0018 ');
    expect(asked[1].memberNo).toBe('A0018');
  });

  it('groups by host member, then by guest, with the visit count on the chip', () => {
    expect(text('.ggv-count')).toContain('1 guest visit by 1 member');
    expect(text('.data-card__title')).toBe('A0018 - Ahmad Faizal');
    expect(text('.data-card .status-chip')).toBe('1 visit');

    component.setGroupBy('guest');
    fixture.detectChanges();
    expect(text('.data-card__title')).toBe('Lim Mei Ling');
    expect(text('.data-card__subline')).toBe('Brought by 1 member');
  });

  it('opens a card to its lines and explains why two lines make one visit', () => {
    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.data-row__actions button');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.click();
    fixture.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.ggv-line').length).toBe(2);
    expect(text('.ggv-line__party')).toBe('Lim Mei Ling');
    expect(text('.ggv-line__source')).toBe('Guest Registration GR-000001');
    expect(text('.ggv-note')).toContain('2 lines make 1 visit');
  });
});
