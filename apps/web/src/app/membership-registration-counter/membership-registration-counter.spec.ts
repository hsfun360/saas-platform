import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MembershipRegistrationCounterComponent } from './membership-registration-counter';
import {
  MembershipGuestService, GuestRegistration, GuestRegistrationPayload, GuestHostFacts, GuestPassFacts, ExpectedVisit, WalkUpClub,
  ReceivePayload, WalkUpPayload, GuestDetailsPayload,
} from '../services/membership-guest.service';

// Behaviour tests for the Registration Counter: the row chip, the "mobile or
// email" contact rule, the barred host, the class picker, receiving a
// visiting member (letter and ID the first day, the ID after), the walk-up
// that needs approval, a visitor's own guest, and the single-dialog hand-over
// (issuing a pass moves the SAME dialog on to the pass view - two swapped
// instances would dismiss the pass at once, the bug memberships.spec.ts pins).

const TODAY = '2026-11-14';

function registration(over: Partial<GuestRegistration>): GuestRegistration {
  return {
    id: 'r1', registrationNo: 'GR-000001', visitDate: TODAY, status: 'registered', passState: 'valid', channel: 'desk',
    patronGroup: 'guest', patronLabel: "Member's guest", accompanying: false, relation: 'Guest of Ahmad Faizal (A0018)',
    guest: { id: 'g1', name: 'Lim Mei Ling', mobile: '+60123456789', email: null, identityNo: null, remarks: null },
    host: { memberId: 'm1', memberNo: 'A0018', name: 'Ahmad Faizal' }, visit: null, club: null,
    canCancel: true, canAddGuest: false,
    passSentAt: null, passSentVia: null, passSentTo: null, arrivedAt: null, cancelledAt: null, cancelReason: null,
    remarks: null, createdAt: '2026-11-14T02:00:00Z', canModify: true,
    ...over,
  };
}

const CLUB = { id: 'c1', code: 'RSGC', name: 'Royal Selangor Golf Club', kind: 'reciprocal' as const };
const LETTER = { id: 'v1', visitNo: 'V-000007', visitorName: 'John Tan', visitorMemberNo: 'RS-1234', visitDate: TODAY, lastDay: '2026-11-16' };

// The visiting member's own row of today (born arrived).
const VISITOR_ROW = registration({
  id: 'r6', registrationNo: 'GR-000006', status: 'arrived', arrivedAt: '2026-11-14T01:00:00Z',
  patronGroup: 'reciprocal', patronLabel: 'Reciprocal member', relation: 'Member of Royal Selangor Golf Club (RS-1234)',
  guest: { id: null, name: 'John Tan', mobile: null, email: null, identityNo: null, remarks: null },
  host: null, visit: LETTER, club: CLUB, canAddGuest: true,
});

function expected(over: Partial<ExpectedVisit>): ExpectedVisit {
  return {
    id: 'v2', visitNo: 'V-000008', visitorName: 'Mary Wong', visitorMemberNo: 'RS-2222', club: CLUB,
    visitDate: TODAY, lastDay: '2026-11-16', datesText: '14 Nov 2026 to 16 Nov 2026', facilitiesText: 'Sports: gym',
    firstDay: true, letterSightedOn: null, daysAttended: 0,
    ...over,
  };
}

const CLUBS: WalkUpClub[] = [
  { ...CLUB, needsApproval: false, maxGuestsPerVisit: 2 },
  { id: 'c2', code: 'MGA', name: 'Malaysian Golf Association', kind: 'affiliate', needsApproval: true, maxGuestsPerVisit: null },
];

const PASS: GuestPassFacts = {
  passUrl: 'https://app.example.com/guest-pass/abc',
  qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  whatsappUrl: 'https://wa.me/60123456789?text=hello',
  shareText: 'hello',
};

describe('MembershipRegistrationCounterComponent', () => {
  let fixture: ComponentFixture<MembershipRegistrationCounterComponent>;
  let component: MembershipRegistrationCounterComponent;
  let created: GuestRegistrationPayload[];
  let received: { visitId: string; payload: ReceivePayload }[];
  let walkUps: WalkUpPayload[];
  let visitorGuests: { registrationId: string; guest: GuestDetailsPayload }[];
  let hostFacts: GuestHostFacts;

  const serviceStub = {
    list: () => of({
      registrations: [
        registration({}),
        registration({ id: 'r2', registrationNo: 'GR-000002', status: 'arrived', arrivedAt: '2026-11-14T03:00:00Z' }),
        registration({ id: 'r3', registrationNo: 'GR-000003', visitDate: '2026-11-20', passState: 'upcoming' }),
        registration({ id: 'r4', registrationNo: 'GR-000004', visitDate: '2026-11-05', passState: 'expired', canCancel: false }),
        registration({ id: 'r5', registrationNo: 'GR-000005', status: 'cancelled', passState: 'cancelled', cancelReason: 'Host cancelled', canCancel: false }),
        VISITOR_ROW,
      ],
      statuses: [{ key: 'registered', label: 'Registered' }, { key: 'arrived', label: 'Arrived' }, { key: 'cancelled', label: 'Cancelled' }],
      groups: [{ key: 'guest' as const, label: "Member's guest" }, { key: 'affiliate' as const, label: 'Affiliated member' }, { key: 'reciprocal' as const, label: 'Reciprocal member' }],
      expectedVisits: [expected({}), expected({ id: 'v3', visitNo: 'V-000009', visitorName: 'Peter Lim', visitorMemberNo: 'RS-3333', firstDay: false, letterSightedOn: '2026-11-13', daysAttended: 1 })],
      clubs: CLUBS,
      today: TODAY,
      numberingMode: 'auto' as const,
    }),
    host: () => of(hostFacts),
    searchGuests: () => of({ guests: [] }),
    create: (payload: GuestRegistrationPayload) => {
      created.push(payload);
      return of({ message: 'Lim Mei Ling registered.', registration: registration({ id: 'r9', registrationNo: 'GR-000009' }), pass: PASS });
    },
    receiveVisit: (visitId: string, payload: ReceivePayload) => {
      received.push({ visitId, payload });
      return of({ message: 'Mary Wong received.', registration: { ...VISITOR_ROW, id: 'r10', registrationNo: 'GR-000010' }, pass: PASS });
    },
    walkUp: (payload: WalkUpPayload) => {
      walkUps.push(payload);
      return of({ message: 'Visit V-000011 recorded and submitted for approval - no pass is issued until it is approved.', issued: false });
    },
    addVisitorGuest: (registrationId: string, payload: { guest: GuestDetailsPayload }) => {
      visitorGuests.push({ registrationId, guest: payload.guest });
      return of({
        message: 'Lim registered as John Tan\'s guest.',
        registration: registration({ id: 'r11', registrationNo: 'GR-000011', status: 'arrived', patronGroup: 'reciprocal', accompanying: true, relation: 'Guest of John Tan (Royal Selangor Golf Club)', host: null, visit: LETTER, club: CLUB }),
        pass: PASS,
      });
    },
  };

  async function settle(ms = 50): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function query<T extends Element>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  }

  function queryAll(selector: string): Element[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
  }

  function type(selector: string, value: string): void {
    const input = query<HTMLInputElement>(selector);
    if (!input) throw new Error(`no field ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function tick(selector: string): void {
    const box = query<HTMLInputElement>(selector);
    if (!box) throw new Error(`no tick box ${selector}`);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
  }

  function submit(selector: string): Event {
    const event = new Event('submit', { cancelable: true });
    query<HTMLFormElement>(selector)?.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  // "New registration" -> a member's guest.
  async function openGuestForm(): Promise<void> {
    component.openNew();
    fixture.detectChanges();
    component.pickGuestClass();
    fixture.detectChanges();
    await settle();
  }

  beforeEach(async () => {
    created = [];
    received = [];
    walkUps = [];
    visitorGuests = [];
    hostFacts = {
      host: { memberId: 'm1', memberNo: 'A0018', name: 'Ahmad Faizal', statusLabel: 'Active', actionControl: 'allow' },
      allowance: { allowance: 4, used: 1, remaining: 3 },
      visitDate: TODAY,
    };
    await TestBed.configureTestingModule({
      imports: [MembershipRegistrationCounterComponent],
      providers: [provideRouter([]), { provide: MembershipGuestService, useValue: serviceStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(MembershipRegistrationCounterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });

  it('reads each row\'s chip from its status and the pass date, and offers Mark arrived only today', () => {
    const cards = queryAll('.data-list:not(.ggr-expected) .data-card');
    const chips = cards.map((c) => c.querySelector('.status-chip')?.textContent?.trim());
    expect(chips).toEqual(['Expected today', 'Arrived', 'Registered', 'Did not arrive', 'Cancelled', 'Arrived']);

    expect(cards[0].textContent).toContain('Mark arrived');
    expect(cards[2].textContent).not.toContain('Mark arrived');
    // An expired or cancelled registration has no actions at all.
    expect(cards[3].querySelector('.data-row__actions')).toBeNull();
    expect(cards[4].querySelector('.data-row__actions')).toBeNull();
    // Each row says how the person comes to the club.
    expect(cards[0].textContent).toContain('Guest of Ahmad Faizal (A0018)');
    expect(cards[5].textContent).toContain('Member of Royal Selangor Golf Club (RS-1234)');
  });

  it('lists the visiting members expected today above the registrations and counts them as expected', () => {
    const waiting = queryAll('.ggr-expected .data-card');
    expect(waiting.length).toBe(2);
    expect(waiting[0].textContent).toContain('V-000008 - Mary Wong');
    expect(waiting[0].querySelector('.status-chip')?.textContent?.trim()).toBe('Expected');
    expect(waiting[1].querySelector('.status-chip')?.textContent?.trim()).toBe('Expected - day 2');
    expect(waiting[0].textContent).toContain('Receive');
    // One member's guest registered for today + two letters valid today.
    expect(query('.ggr-count')?.textContent).toContain('3 expected today');
    expect(query('.ggr-count')?.textContent).toContain('2 arrived today');
  });

  it('refuses to save a guest with neither a mobile nor an email', async () => {
    await openGuestForm();

    type('#ggrMemberNo', 'A0018');
    type('#ggrName', 'Lim Mei Ling');
    const event = submit('#ggrForm');

    expect(event.defaultPrevented).toBe(true);
    expect(created.length).toBe(0);
    expect(query('#ggrContactErr')?.textContent).toContain('mobile number or an email');
    // Without an email the "Email the pass" switch is off and inert.
    expect(component.form.controls.sendEmail.disabled).toBe(true);
    expect(component.form.getRawValue().sendEmail).toBe(false);
  });

  it('turns the email switch back on once an address is keyed in, and names the outcome on the button', async () => {
    await openGuestForm();

    expect(query('.dlg__footer button[type="submit"]')?.textContent?.trim()).toBe('Register guest');
    type('#ggrEmail', 'mei@example.com');
    fixture.detectChanges();

    expect(component.form.controls.sendEmail.enabled).toBe(true);
    expect(component.form.getRawValue().sendEmail).toBe(true);
    expect(query('.dlg__footer button[type="submit"]')?.textContent?.trim()).toBe('Register and email pass');
  });

  it('shows the host\'s allowance and blocks Save for a barred member', async () => {
    await openGuestForm();

    type('#ggrMemberNo', 'A0018');
    component.lookupHost();
    fixture.detectChanges();
    expect(query('#ggrHostFacts')?.textContent).toContain('Ahmad Faizal (A0018)');
    expect(query('#ggrHostFacts')?.textContent).toContain('1 of 4 guest visits used');
    expect(query<HTMLButtonElement>('.dlg__footer button[type="submit"]')?.disabled).toBe(false);

    hostFacts = { ...hostFacts, host: { ...hostFacts.host, statusLabel: 'Suspended', actionControl: 'barred' } };
    component.lookupHost();
    fixture.detectChanges();
    expect(query('#ggrHostFacts')?.textContent).toContain('barred');
    expect(query<HTMLButtonElement>('.dlg__footer button[type="submit"]')?.disabled).toBe(true);
  });

  it('registers the guest and moves the SAME dialog on to the pass view - and it stays open', async () => {
    await openGuestForm();

    type('#ggrMemberNo', 'A0018');
    type('#ggrName', 'Lim Mei Ling');
    component.form.controls.guest.controls.mobile.setValue('+60123456789');
    fixture.detectChanges();
    submit('#ggrForm');

    expect(created.length).toBe(1);
    expect(created[0].memberNo).toBe('A0018');
    expect(created[0].visitDate).toBe(TODAY);
    expect(created[0].guest).toEqual({ name: 'Lim Mei Ling', mobile: '+60123456789', email: null, identityNo: null });
    expect(created[0].sendEmail).toBe(false);

    expect(component.dialogMode()).toBe('pass');
    expect(queryAll('app-dialog').length).toBe(1);
    expect(query('#ggrForm')).toBeNull();
    expect(query('.ggr-pass__qr')).toBeTruthy();

    // Give a dialog-swap history race time to fire; the pass must still be there.
    await settle(100);
    expect(component.dialogMode()).toBe('pass');
    expect(query('.ggr-pass__qr')).toBeTruthy();
    const whatsapp = queryAll('.ggr-pass__actions a').find((a) => a.textContent?.includes('Share via WhatsApp')) as HTMLAnchorElement;
    expect(whatsapp.getAttribute('href')).toBe(PASS.whatsappUrl);
    expect(whatsapp.getAttribute('rel')).toBe('noopener');
  });

  it('asks who is at the counter first, and lists today\'s letters for a visiting member', async () => {
    component.openNew();
    fixture.detectChanges();
    await settle();

    const picks = queryAll('.dlg-pick');
    expect(picks.map((p) => p.querySelector('strong')?.textContent)).toEqual(["Member's guest", 'Visiting member']);
    expect(queryAll('app-dialog').length).toBe(1);

    (picks[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.dialogMode()).toBe('visit');
    expect(queryAll('.ggr-matches .ggr-match').length).toBe(2);

    type('#ggrVisitFind', 'peter');
    fixture.detectChanges();
    const matches = queryAll('.ggr-matches .ggr-match');
    expect(matches.length).toBe(1);
    expect(matches[0].textContent).toContain('Peter Lim');
    expect(matches[0].textContent).toContain('day 2');
  });

  it('receives a visiting member only with the letter and the ID sighted on the first day, then hands the pass over', async () => {
    component.openReceive(expected({}));
    fixture.detectChanges();
    await settle();

    expect(component.dialogMode()).toBe('receive');
    expect(queryAll('.ggr-tick').length).toBe(2);

    // Only the ID ticked: nothing is issued.
    tick('.ggr-tick input[formControlName="idSighted"]');
    const refused = submit('#ggrReceiveForm');
    expect(refused.defaultPrevented).toBe(true);
    expect(received.length).toBe(0);
    expect(component.errorMessage()).toContain('letter of introduction');

    tick('.ggr-tick input[formControlName="letterSighted"]');
    submit('#ggrReceiveForm');
    expect(received).toEqual([{ visitId: 'v2', payload: { letterSighted: true, idSighted: true, remarks: null } }]);

    expect(component.dialogMode()).toBe('pass');
    expect(queryAll('app-dialog').length).toBe(1);
    await settle(100);
    expect(component.dialogMode()).toBe('pass');
    expect(query('.ggr-pass__qr')).toBeTruthy();
    // A letter of several days: the pass is for today only.
    expect(query('.ggr-pass__side')?.textContent).toContain('register here again on each further day');
  });

  it('asks only for the ID on a later day of the same letter', async () => {
    component.openReceive(expected({ firstDay: false, letterSightedOn: '2026-11-13', daysAttended: 1 }));
    fixture.detectChanges();
    await settle();

    expect(queryAll('.ggr-tick').length).toBe(1);
    expect(query('#ggrReceiveForm')?.textContent).toContain('Day 2 at the counter');
    tick('.ggr-tick input[formControlName="idSighted"]');
    submit('#ggrReceiveForm');
    expect(received.length).toBe(1);
    expect(received[0].payload.idSighted).toBe(true);
  });

  it('records a walk-up from a club that needs approval without issuing a pass', async () => {
    component.openNew();
    component.pickVisitorClass();
    component.openWalkUp();
    fixture.detectChanges();
    await settle();

    component.walkForm.patchValue({ affiliatedClubId: 'c2', visitorName: 'Siti Aminah', visitorMemberNo: 'MGA-77' });
    component.onWalkClubChange();
    fixture.detectChanges();
    expect(query('#ggrWalkForm')?.textContent).toContain('need approval');
    expect(query('.dlg__footer button[type="submit"]')?.textContent?.trim()).toBe('Record and submit for approval');

    // The letter and the ID are sighted before anything is recorded.
    submit('#ggrWalkForm');
    expect(walkUps.length).toBe(0);
    expect(component.errorMessage()).toContain('letter of introduction');

    component.walkForm.patchValue({ letterSighted: true, idSighted: true });
    submit('#ggrWalkForm');
    expect(walkUps.length).toBe(1);
    expect(walkUps[0].affiliatedClubId).toBe('c2');
    expect(walkUps[0].visitorName).toBe('Siti Aminah');
    expect(walkUps[0].visitDateTo).toBeNull();

    // Recorded only: the dialog closes on the message, no pass view.
    expect(component.dialogMode()).toBeNull();
    expect(component.successMessage()).toContain('submitted for approval');
  });

  it('registers a guest of the visiting member on the visitor\'s own row, with no host member to key', async () => {
    const cards = queryAll('.data-list:not(.ggr-expected) .data-card');
    expect(cards[5].textContent).toContain('GR-000006 - John Tan');

    component.openGuestOf(VISITOR_ROW);
    fixture.detectChanges();
    await settle();

    expect(query('#ggrMemberNo')).toBeNull();
    expect(query('#ggrForm .ggr-verify')?.textContent).toContain('John Tan');
    expect(query('#ggrForm .ggr-verify')?.textContent).toContain('Royal Selangor Golf Club');

    type('#ggrName', 'Lim');
    component.form.controls.guest.controls.mobile.setValue('+60129998888');
    fixture.detectChanges();
    submit('#ggrForm');

    expect(created.length).toBe(0);
    expect(visitorGuests).toEqual([{ registrationId: 'r6', guest: { name: 'Lim', mobile: '+60129998888', email: null, identityNo: null } }]);
    expect(component.dialogMode()).toBe('pass');
  });

  it('keeps the name of the letter and asks for no contact detail when a visiting member is edited', async () => {
    component.openEdit(VISITOR_ROW);
    fixture.detectChanges();
    await settle();

    expect(component.form.controls.guest.controls.name.disabled).toBe(true);
    // No mobile and no email, yet the form is valid: the pass can be shown at the counter.
    expect(component.form.controls.guest.valid).toBe(true);

    // A member's guest still needs one of the two.
    component.closeDialog();
    component.openEdit(registration({ guest: { id: 'g1', name: 'Lim Mei Ling', mobile: null, email: null, identityNo: null, remarks: null } }));
    fixture.detectChanges();
    expect(component.form.controls.guest.controls.name.enabled).toBe(true);
    expect(component.form.controls.guest.hasError('contact')).toBe(true);
  });
});
