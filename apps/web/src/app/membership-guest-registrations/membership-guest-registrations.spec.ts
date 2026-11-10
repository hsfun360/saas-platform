import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MembershipGuestRegistrationsComponent } from './membership-guest-registrations';
import {
  MembershipGuestService, GuestRegistration, GuestRegistrationPayload, GuestHostFacts, GuestPassFacts,
} from '../services/membership-guest.service';

// Behaviour tests for Guest Registration: the row chip, the "mobile or email"
// contact rule, the barred host, and the single-dialog hand-over (registering
// a guest moves the SAME dialog from the form to the pass view - two swapped
// instances would dismiss the pass at once, the bug memberships.spec.ts pins).

const TODAY = '2026-11-10';

function registration(over: Partial<GuestRegistration>): GuestRegistration {
  return {
    id: 'r1', registrationNo: 'GR-000001', visitDate: TODAY, status: 'registered', passState: 'valid', channel: 'desk',
    guest: { id: 'g1', name: 'Lim Mei Ling', mobile: '+60123456789', email: null, identityNo: null, remarks: null },
    host: { memberId: 'm1', memberNo: 'A0018', name: 'Ahmad Faizal' },
    passSentAt: null, passSentVia: null, passSentTo: null, arrivedAt: null, cancelledAt: null, cancelReason: null,
    remarks: null, createdAt: '2026-11-10T02:00:00Z', canModify: true,
    ...over,
  };
}

const PASS: GuestPassFacts = {
  passUrl: 'https://app.example.com/guest-pass/abc',
  qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  whatsappUrl: 'https://wa.me/60123456789?text=hello',
  shareText: 'hello',
};

describe('MembershipGuestRegistrationsComponent', () => {
  let fixture: ComponentFixture<MembershipGuestRegistrationsComponent>;
  let component: MembershipGuestRegistrationsComponent;
  let created: GuestRegistrationPayload[];
  let hostFacts: GuestHostFacts;

  const serviceStub = {
    list: () => of({
      registrations: [
        registration({}),
        registration({ id: 'r2', registrationNo: 'GR-000002', status: 'arrived', arrivedAt: '2026-11-10T03:00:00Z' }),
        registration({ id: 'r3', registrationNo: 'GR-000003', visitDate: '2026-11-20', passState: 'upcoming' }),
        registration({ id: 'r4', registrationNo: 'GR-000004', visitDate: '2026-11-05', passState: 'expired' }),
        registration({ id: 'r5', registrationNo: 'GR-000005', status: 'cancelled', passState: 'cancelled', cancelReason: 'Host cancelled' }),
      ],
      statuses: [{ key: 'registered', label: 'Registered' }, { key: 'arrived', label: 'Arrived' }, { key: 'cancelled', label: 'Cancelled' }],
      today: TODAY,
      numberingMode: 'auto' as const,
    }),
    host: () => of(hostFacts),
    searchGuests: () => of({ guests: [] }),
    create: (payload: GuestRegistrationPayload) => {
      created.push(payload);
      return of({ message: 'Lim Mei Ling registered.', registration: registration({ id: 'r9', registrationNo: 'GR-000009' }), pass: PASS });
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

  beforeEach(async () => {
    created = [];
    hostFacts = {
      host: { memberId: 'm1', memberNo: 'A0018', name: 'Ahmad Faizal', statusLabel: 'Active', actionControl: 'allow' },
      allowance: { allowance: 4, used: 1, remaining: 3 },
      visitDate: TODAY,
    };
    await TestBed.configureTestingModule({
      imports: [MembershipGuestRegistrationsComponent],
      providers: [provideRouter([]), { provide: MembershipGuestService, useValue: serviceStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(MembershipGuestRegistrationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });

  it('reads each row\'s chip from its status and the pass date, and offers Mark arrived only today', () => {
    const chips = queryAll('.data-card .status-chip').map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Expected today', 'Arrived', 'Registered', 'Did not arrive', 'Cancelled']);
    expect(query('.ggr-count')?.textContent).toContain('1 expected today');
    expect(query('.ggr-count')?.textContent).toContain('1 arrived today');

    const cards = queryAll('.data-card');
    expect(cards[0].textContent).toContain('Mark arrived');
    expect(cards[2].textContent).not.toContain('Mark arrived');
    // An expired or cancelled registration has no actions at all.
    expect(cards[3].querySelector('.data-row__actions')).toBeNull();
    expect(cards[4].querySelector('.data-row__actions')).toBeNull();
  });

  it('refuses to save a guest with neither a mobile nor an email', async () => {
    component.openAdd();
    fixture.detectChanges();
    await settle();

    type('#ggrMemberNo', 'A0018');
    type('#ggrName', 'Lim Mei Ling');
    const form = query<HTMLFormElement>('#ggrForm');
    const submit = new Event('submit', { cancelable: true });
    form?.dispatchEvent(submit);
    fixture.detectChanges();

    expect(submit.defaultPrevented).toBe(true);
    expect(created.length).toBe(0);
    expect(query('#ggrContactErr')?.textContent).toContain('mobile number or an email');
    // Without an email the "Email the pass" switch is off and inert.
    expect(component.form.controls.sendEmail.disabled).toBe(true);
    expect(component.form.getRawValue().sendEmail).toBe(false);
  });

  it('turns the email switch back on once an address is keyed in, and names the outcome on the button', async () => {
    component.openAdd();
    fixture.detectChanges();
    await settle();

    expect(query('.dlg__footer button[type="submit"]')?.textContent?.trim()).toBe('Register guest');
    type('#ggrEmail', 'mei@example.com');
    fixture.detectChanges();

    expect(component.form.controls.sendEmail.enabled).toBe(true);
    expect(component.form.getRawValue().sendEmail).toBe(true);
    expect(query('.dlg__footer button[type="submit"]')?.textContent?.trim()).toBe('Register and email pass');
  });

  it('shows the host\'s allowance and blocks Save for a barred member', async () => {
    component.openAdd();
    fixture.detectChanges();
    await settle();

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
    component.openAdd();
    fixture.detectChanges();
    await settle();

    type('#ggrMemberNo', 'A0018');
    type('#ggrName', 'Lim Mei Ling');
    component.form.controls.guest.controls.mobile.setValue('+60123456789');
    fixture.detectChanges();
    query<HTMLFormElement>('#ggrForm')?.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

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
});
