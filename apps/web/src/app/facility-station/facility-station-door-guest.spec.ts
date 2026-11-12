import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilityStationComponent } from './facility-station';
import { FacilityStationService, PassShare, ServePanel, ServeTile, StationDay, StationRegistration } from '../services/facility-station.service';

// Behaviour tests for the guest WITHOUT a pass (slice 6c): the member is at
// the counter, the desk adds the guest in the member's panel - a mobile or an
// email registers them (a day pass to hand over), a name alone is served by
// name with the member - and the panel then serves that guest. The party is
// served one person at a time, stepping between the member and the guests.

function tile(over: Partial<ServeTile>): ServeTile {
  return {
    utilityItemId: 'towel', code: 'TOWEL', description: 'Towel', iconUrl: null, behaviour: 'quantity',
    fee: null, allowed: true, reason: null, held: 0, limit: 2, dueDays: 0, freeUnits: [], suggestedUnitId: null,
    ...over,
  };
}

function panel(over: Partial<ServePanel>): ServePanel {
  return {
    kind: 'member', person: { name: 'Ahmad Faizal' }, host: { memberId: 'm1', memberNo: 'M001', name: 'Ahmad Faizal' },
    pass: null, guests: [], door: { passEnabled: true, contactRequired: false },
    standingWarning: null, holding: [], usedToday: [], tiles: [tile({})],
    bill: null, undoMinutes: 5, clubNow: { date: '2026-11-12', time: '09:52' },
    ...over,
  };
}

const share: PassShare = {
  guestRegistrationId: 'g9', registrationNo: 'GR00009', passUrl: 'https://club/guest-pass/abc', qrDataUrl: 'data:image/png;base64,AAAA',
  whatsappUrl: 'https://wa.me/60123456789?text=hello', canEmail: false, sentVia: null,
};

describe('FacilityStationComponent - the guest without a pass, with the member', () => {
  let fixture: ComponentFixture<FacilityStationComponent>;
  let component: FacilityStationComponent;
  let scans: unknown[];
  let added: unknown[];
  let issues: Record<string, unknown>[];
  let removed: string[];
  let sent: unknown[];
  let saved: unknown[];
  let memberPanel: ServePanel;

  const guestOnPass = panel({ kind: 'guest', person: { name: 'Tan Wei Ming' }, pass: { id: 'g9', registrationNo: 'GR00009', visitDate: '2026-11-12', arrivedAt: '2026-11-12T01:52:00Z', firstScan: false, createdHere: true }, guests: [], door: null });
  const guestByName = panel({ kind: 'guest', person: { name: 'Lim Ah Kow' }, pass: null, guests: [], door: null });

  const day: StationDay = { date: '2026-11-12', dayType: 'weekday', clubNow: { date: '2026-11-12', time: '09:52' }, checkInOpenMinutes: 30, types: [], utilityItems: [] };

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(host().querySelectorAll('button')).find((b) => b.textContent?.replace(/\s+/g, ' ').includes(text));
  }

  async function openMember(): Promise<void> {
    component.scanForm.setValue({ code: 'M001' });
    component.submitScan();
    await settle();
  }

  beforeEach(async () => {
    scans = [];
    added = [];
    issues = [];
    removed = [];
    sent = [];
    saved = [];
    memberPanel = panel({});
    const service = {
      meta: () => of({ participantTypes: [{ key: 'guest', label: 'Guest', baseIdentity: 'guest' }], registrationStatuses: [], issueStatuses: [], returnConditions: [], unitStatuses: [], limits: { maxGuestsPerRegistration: 50, maxIssueQuantity: 500 } }),
      today: () => of(day),
      scan: (body: { guestRegistrationId?: string; guestName?: string }) => {
        scans.push(body);
        return of({ panel: body.guestRegistrationId ? guestOnPass : body.guestName ? guestByName : memberPanel });
      },
      addDoorGuest: (body: { mobile: string | null; email: string | null }) => {
        added.push(body);
        return body.mobile || body.email
          ? of({ message: "Tan Wei Ming is registered as Ahmad Faizal's guest - pass GR00009.", warnings: [], panel: guestOnPass, share })
          : of({ message: "Lim Ah Kow is served as Ahmad Faizal's guest, by name - no pass.", warnings: [], panel: guestByName, share: null });
      },
      issue: (body: Record<string, unknown>) => { issues.push(body); return of({ message: 'issued', issueId: 'r1', warnings: [], panel: guestByName }); },
      doorPass: () => of({ share }),
      sendDoorPass: (id: string, via: string) => { sent.push([id, via]); return of({ message: 'Recorded.', share: { ...share, sentVia: via } }); },
      removeDoorGuest: (id: string) => { removed.push(id); return of({ message: 'Tan Wei Ming is removed - pass GR00009 is cancelled.', panel: memberPanel }); },
      saveGuests: (id: string, guests: unknown) => { saved.push([id, guests]); return of({ message: 'Guests saved.', warnings: [] }); },
    };
    await TestBed.configureTestingModule({
      imports: [FacilityStationComponent],
      providers: [provideRouter([]), { provide: FacilityStationService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityStationComponent);
    component = fixture.componentInstance;
    await settle();
  });

  it('offers Add guest in the member\'s panel and says what a name alone will do before it is pressed', async () => {
    await openMember();
    expect(host().textContent).toContain('A guest without one is added here, while Ahmad Faizal is at the counter.');
    button('Add guest')?.click();
    await settle();
    expect(component.dlgMode()).toBe('addGuest');
    // The name field takes the keyboard: the guest is keyed without a click.
    expect(document.activeElement).toBe(host().querySelector('#stGuestName'));
    expect(host().querySelectorAll('app-dialog').length).toBe(1);
    expect(host().textContent).toContain('Add a guest of Ahmad Faizal');
    component.guestForm.patchValue({ name: 'Lim Ah Kow' });
    await settle();
    expect(host().textContent).toContain('With a name only the guest gets no pass');
    expect(button('Serve by name')).toBeDefined();
    component.guestForm.patchValue({ mobile: '+60123456789' });
    await settle();
    expect(host().textContent).toContain('The guest is registered and gets a day pass');
    expect(button('Register and serve')).toBeDefined();
  });

  it('registers a guest keyed with a mobile, serves that guest and shows the pass to hand over', async () => {
    await openMember();
    component.openAddGuest();
    component.guestForm.setValue({ name: ' Tan Wei Ming ', mobile: '+60123456789', email: '' });
    await settle();
    const event = new Event('submit', { cancelable: true, bubbles: true });
    (host().querySelector('#stAddGuest') as HTMLFormElement).dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(added).toEqual([{ memberNo: 'M001', name: 'Tan Wei Ming', mobile: '+60123456789', email: null }]);
    expect(component.dlgMode()).toBe('serve');
    expect(host().textContent).toContain('Serve Tan Wei Ming');
    expect(host().textContent).toContain('pass GR00009');
    const pass = host().querySelector('.st-pass');
    expect(pass?.textContent).toContain('Pass GR00009 - hand it to Tan Wei Ming');
    expect(pass?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(pass?.querySelector('a[href^="https://wa.me/"]')?.textContent).toContain('Share via WhatsApp');
    expect(pass?.textContent).toContain('Not sent yet.');
    // Sharing over WhatsApp is recorded against the pass.
    component.passSent('whatsapp');
    await settle();
    expect(sent).toEqual([['g9', 'whatsapp']]);
    expect(host().querySelector('.st-pass')?.textContent).toContain('Sent by WhatsApp.');
  });

  it('serves a guest keyed with a name only by name: the bare dialling code is no mobile, and a tap names the guest', async () => {
    await openMember();
    component.openAddGuest();
    component.guestForm.setValue({ name: 'Lim Ah Kow', mobile: '+60', email: '' });
    component.submitAddGuest();
    await settle();
    expect(added).toEqual([{ memberNo: 'M001', name: 'Lim Ah Kow', mobile: null, email: null }]);
    expect(host().textContent).toContain('no pass - served by name, with the member');
    expect(host().querySelector('.st-pass')).toBeNull();
    button('Issue 1 TOWEL')?.click();
    await settle();
    expect(issues).toEqual([{ utilityItemId: 'towel', utilityUnitId: null, quantity: 1, guestRegistrationId: null, memberNo: 'M001', guestName: 'Lim Ah Kow', panel: true }]);
  });

  it('refuses a name alone when the club asks for a contact, before anything is sent', async () => {
    memberPanel = panel({ door: { passEnabled: true, contactRequired: true } });
    await openMember();
    component.openAddGuest();
    component.guestForm.setValue({ name: 'Lim Ah Kow', mobile: '+60', email: '' });
    await settle();
    expect(host().textContent).toContain('The club registers every guest at the station: key in a mobile number or an email.');
    const submit = Array.from(host().querySelectorAll('button[type="submit"]')).find((b) => b.getAttribute('form') === 'stAddGuest') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // A name alone cannot be served here: the button names the only way in.
    expect(submit.textContent).toContain('Register and serve');
    component.submitAddGuest();
    await settle();
    expect(added).toEqual([]);
    expect(component.dlgMode()).toBe('addGuest');
  });

  it('says the club issues no passes at the station when door passes are off', async () => {
    memberPanel = panel({ door: { passEnabled: false, contactRequired: false } });
    await openMember();
    component.openAddGuest();
    component.guestForm.setValue({ name: 'Lim Ah Kow', mobile: '+60123456789', email: '' });
    await settle();
    expect(host().textContent).toContain('the club issues no passes at the station');
    expect(button('Serve by name')).toBeDefined();
  });

  it('steps Back from Add guest to the member\'s panel without adding anyone', async () => {
    await openMember();
    component.openAddGuest();
    await settle();
    button('Back')?.click();
    await settle();
    expect(component.dlgMode()).toBe('serve');
    expect(component.panel()?.kind).toBe('member');
    expect(added).toEqual([]);
  });

  it('serves the party one person at a time: a listed guest by the pass or by name, and back to the member', async () => {
    memberPanel = panel({ guests: [{ name: 'Tan Wei Ming', guestRegistrationId: 'g9', holding: 1 }, { name: 'Lim Ah Kow', guestRegistrationId: null, holding: 0 }] });
    await openMember();
    expect(button('Tan Wei Ming - holding 1')).toBeDefined();
    button('Tan Wei Ming')?.click();
    await settle();
    expect(scans[scans.length - 1]).toEqual({ guestRegistrationId: 'g9' });
    expect(component.panel()?.person.name).toBe('Tan Wei Ming');
    button('Serve Ahmad Faizal')?.click();
    await settle();
    expect(scans[scans.length - 1]).toEqual({ memberNo: 'M001' });
    expect(component.panel()?.kind).toBe('member');
    button('Lim Ah Kow')?.click();
    await settle();
    expect(scans[scans.length - 1]).toEqual({ memberNo: 'M001', guestName: 'Lim Ah Kow' });
    expect(component.panel()?.pass).toBeNull();
    expect(component.panel()?.kind).toBe('guest');
  });

  it('removes a guest added by mistake after a confirmation that states the outcome, and returns to the member', async () => {
    memberPanel = panel({ guests: [{ name: 'Tan Wei Ming', guestRegistrationId: 'g9', holding: 0 }] });
    await openMember();
    button('Tan Wei Ming')?.click();
    await settle();
    button('Added by mistake - remove')?.click();
    await settle();
    const confirm = component.confirmAction();
    expect(confirm?.message).toContain('Pass GR00009 is cancelled and stops working');
    expect(confirm?.message).toContain("no longer counts on Ahmad Faizal's monthly guest allowance");
    confirm?.run();
    await settle();
    expect(removed).toEqual(['g9']);
    expect(component.panel()?.kind).toBe('member');
    expect(component.successMessage()).toContain('is removed');
  });

  it('does not offer to remove a guest who has taken something, or a pass the front desk registered', async () => {
    component.panel.set({ ...guestOnPass, usedToday: [], holding: [], pass: { ...guestOnPass.pass!, createdHere: false } });
    expect(component.guestRemovable()).toBe(false);
    component.panel.set(guestOnPass);
    expect(component.guestRemovable()).toBe(true);
  });

  it('sends an entry\'s guest lines with their identity: a mobile registers the guest, a line on a pass keeps it', async () => {
    const registration: StationRegistration = {
      id: 'reg1', registrationNo: 'REG-00001', patron: { id: 'p1', name: 'Ahmad Faizal', memberNo: 'M001', patronType: 'member' }, facilityTypeId: 't1', facilityId: null, facility: null,
      bookingSlotId: null, registrationDate: '2026-11-12', timeIn: '2026-11-12T01:00:00Z', timeOut: null, dayType: 'weekday', guestCount: 1, status: 'in', billId: null, bill: null, remarks: null,
      guests: [{ id: 'l1', patronId: null, participantType: 'guest', name: 'Tan Wei Ming', memberNo: null, guestVisitId: 'v1', sortOrder: 1, guestRegistrationId: 'g9', passCreatedHere: true }],
    };
    component.openGuests(registration);
    await settle();
    expect(host().textContent).toContain('On a guest pass - counted once today.');
    component.addGuest();
    component.guestLines.at(1).patchValue({ name: 'Wong Mei', mobile: '+60166666666' });
    component.addGuest();
    component.guestLines.at(2).patchValue({ name: 'Plain Name', mobile: '+60' });
    component.submitGuests();
    await settle();
    expect(saved).toEqual([['reg1', [
      { participantType: 'guest', name: 'Tan Wei Ming', guestRegistrationId: 'g9' },
      { participantType: 'guest', name: 'Wong Mei', mobile: '+60166666666', email: null },
      { participantType: 'guest', name: 'Plain Name', mobile: null, email: null },
    ]]]);
  });
});
