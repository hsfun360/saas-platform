import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FacilityStationComponent } from './facility-station';
import { FacilityStationService, ServeEntry, ServePanel, StationDay } from '../services/facility-station.service';

// Behaviour tests for entering a facility from the Serve panel (slice 6d):
// each entry tile states what a tap will do before it is tapped (the price,
// the count it will reach, or why it cannot be tapped), a tap admits ONE
// person and redraws the panel, a person who is inside is shown so with
// Sign out where the entry is theirs, and sign-out says what is still out.

function entry(over: Partial<ServeEntry>): ServeEntry {
  return {
    facilityTypeId: 'pool', code: 'POOL', description: 'Pool', iconUrl: null, liveCount: 12, capacity: 40, willReach: 13,
    fee: { code: 'POOLFEE', description: 'Pool entry', unitAmount: 10 }, allowed: true, reason: null, inside: null, hostInside: false, guestTypes: [],
    ...over,
  };
}

function panel(over: Partial<ServePanel>): ServePanel {
  return {
    kind: 'member', person: { name: 'Ahmad Faizal' }, host: { memberId: 'm1', memberNo: 'M001', name: 'Ahmad Faizal' },
    pass: null, guests: [], door: { passEnabled: true, contactRequired: false },
    standingWarning: null, holding: [], usedToday: [], tiles: [], entries: [entry({})],
    bill: null, undoMinutes: 5, clubNow: { date: '2026-11-12', time: '09:52' },
    ...over,
  };
}

const guestPass = { id: 'g9', registrationNo: 'GR00009', visitDate: '2026-11-12', arrivedAt: '2026-11-12T01:52:00Z', firstScan: false, createdHere: true };

describe('FacilityStationComponent - entering a facility from the panel', () => {
  let fixture: ComponentFixture<FacilityStationComponent>;
  let component: FacilityStationComponent;
  let scans: unknown[];
  let admitted: Record<string, unknown>[];
  let signedOut: string[];
  let nextPanel: ServePanel;
  let afterAdmit: ServePanel;
  let admitFails: string | null;

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

  function entryTiles(): Element[] {
    const heading = Array.from(host().querySelectorAll('h3.dlg-section')).find((h) => h.textContent?.trim() === 'Enter a facility');
    return heading?.nextElementSibling ? Array.from(heading.nextElementSibling.querySelectorAll('.st-tile')) : [];
  }

  async function open(): Promise<void> {
    component.scanForm.setValue({ code: 'M001' });
    component.submitScan();
    await settle();
  }

  beforeEach(async () => {
    scans = [];
    admitted = [];
    signedOut = [];
    nextPanel = panel({});
    afterAdmit = panel({ entries: [entry({ liveCount: 13, willReach: 14, allowed: false, inside: { registrationId: 'reg1', registrationNo: 'REG-00001', timeIn: '2026-11-12T01:53:00Z', guestCount: 2, own: true }, hostInside: true })] });
    admitFails = null;
    const service = {
      meta: () => of({ participantTypes: [], registrationStatuses: [], issueStatuses: [], returnConditions: [], unitStatuses: [], limits: { maxGuestsPerRegistration: 50, maxIssueQuantity: 500 } }),
      today: () => of(day),
      scan: (body: unknown) => { scans.push(body); return of({ panel: nextPanel }); },
      admit: (body: Record<string, unknown>) => {
        admitted.push(body);
        return admitFails
          ? throwError(() => ({ error: { message: admitFails } }))
          : of({ message: 'Ahmad Faizal is in POOL (REG-00001) - 13 of 40 inside.', registrationId: 'reg1', warnings: [], standingWarning: null, panel: afterAdmit });
      },
      signOut: (id: string) => { signedOut.push(id); return of({ message: 'REG-00001 signed out. Still out: L003 (Tan Wei Ming), TOWEL (Ahmad Faizal).', stillOut: [] }); },
    };
    await TestBed.configureTestingModule({
      imports: [FacilityStationComponent],
      providers: [provideRouter([]), { provide: FacilityStationService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityStationComponent);
    component = fixture.componentInstance;
    await settle();
  });

  it('states what a tap will do: the price and the count it will reach, or why the facility cannot be entered', async () => {
    nextPanel = panel({ entries: [
      entry({}),
      entry({ facilityTypeId: 'gym', code: 'GYM', description: 'Gym', fee: null, capacity: null, willReach: 5 }),
      entry({ facilityTypeId: 'sauna', code: 'SAUNA', description: 'Sauna', allowed: false, reason: 'Full - 8 of 8 inside.' }),
    ] });
    await open();
    const tiles = entryTiles();
    expect(tiles.length).toBe(3);
    expect(tiles[0].textContent).toContain('10.00 before tax');
    expect(tiles[0].textContent).toContain('13 of 40 inside after this');
    expect(tiles[0].textContent).toContain('Admit to POOL');
    expect(tiles[1].textContent).toContain('No fee');
    expect(tiles[1].textContent).toContain('5 inside after this');
    expect(tiles[2].textContent).toContain('Full - 8 of 8 inside.');
    expect(tiles[2].querySelector('button')).toBeNull();
  });

  it('shows no entry section when the club has no entry facility', async () => {
    nextPanel = panel({ entries: [] });
    await open();
    expect(host().textContent).not.toContain('Enter a facility');
  });

  it('admits the member on a tap and redraws the panel: inside, with Sign out naming the guests who leave with them', async () => {
    await open();
    button('Admit to POOL')?.click();
    await settle();
    expect(admitted).toEqual([{ facilityTypeId: 'pool', guestRegistrationId: null, memberNo: 'M001', panel: true }]);
    expect(component.successMessage()).toContain('Ahmad Faizal is in POOL (REG-00001) - 13 of 40 inside.');
    const tile = entryTiles()[0];
    expect(tile.textContent).toContain('Inside');
    expect(tile.textContent).toContain('REG-00001');
    expect(tile.textContent).toContain('Sign out with 2 guests');
    expect(tile.textContent).not.toContain('Admit to POOL');
  });

  it('says why and redraws the panel when the tap is refused (another desk filled the last place)', async () => {
    await open();
    admitFails = 'Full - 40 of 40 inside.';
    button('Admit to POOL')?.click();
    await settle();
    expect(component.errorMessage()).toBe('Full - 40 of 40 inside.');
    // The panel is read again for the person being served.
    expect(scans[scans.length - 1]).toEqual({ guestRegistrationId: null, memberNo: 'M001' });
  });

  it('admits a guest on the pass, at the guest price on the host\'s bill, noting the host is not inside', async () => {
    nextPanel = panel({ kind: 'guest', person: { name: 'Tan Wei Ming' }, pass: guestPass, guests: [], door: null, entries: [entry({ fee: { code: 'GUESTFEE', description: 'Guest fee', unitAmount: 4 } })] });
    await open();
    const tile = entryTiles()[0];
    expect(tile.textContent).toContain("4.00 before tax, on Ahmad Faizal's bill");
    expect(tile.textContent).toContain('13 of 40 inside after this · Ahmad Faizal is not inside');
    expect(tile.querySelector('select')).toBeNull();
    button('Admit to POOL')?.click();
    await settle();
    expect(admitted).toEqual([{ facilityTypeId: 'pool', guestRegistrationId: 'g9', memberNo: null, panel: true }]);
  });

  it('sends the visitor-guest type the desk picked when the club keeps more than one', async () => {
    nextPanel = panel({ kind: 'guest', person: { name: 'Lim Ah Kow' }, pass: null, guests: [], door: null, entries: [entry({ hostInside: true, guestTypes: [{ code: 'guest', description: 'Guest / Visitor' }, { code: 'CHILD', description: 'Child guest' }] })] });
    await open();
    const select = entryTiles()[0].querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-label')).toBe('Guest type for POOL');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['Guest / Visitor', 'Child guest']);
    select.value = 'CHILD';
    select.dispatchEvent(new Event('change'));
    button('Admit to POOL')?.click();
    await settle();
    expect(admitted).toEqual([{ facilityTypeId: 'pool', guestRegistrationId: null, memberNo: 'M001', guestName: 'Lim Ah Kow', participantType: 'CHILD', panel: true }]);
  });

  it('shows a guest on the host\'s entry as inside, signing out with the host and not alone', async () => {
    nextPanel = panel({ kind: 'guest', person: { name: 'Tan Wei Ming' }, pass: guestPass, guests: [], door: null, entries: [entry({ allowed: false, hostInside: true, inside: { registrationId: 'reg1', registrationNo: 'REG-00001', timeIn: '2026-11-12T01:53:00Z', guestCount: 1, own: false } })] });
    await open();
    const tile = entryTiles()[0];
    expect(tile.textContent).toContain('Inside');
    expect(tile.textContent).toContain('signs out with Ahmad Faizal');
    expect(tile.querySelector('button')).toBeNull();
    expect(tile.classList.contains('st-tile--off')).toBe(false);
  });

  it('signs the entry out from the panel, says what the party still holds and reads the panel again', async () => {
    nextPanel = afterAdmit;
    await open();
    const before = scans.length;
    button('Sign out with 2 guests')?.click();
    await settle();
    expect(signedOut).toEqual(['reg1']);
    expect(component.successMessage()).toBe('REG-00001 signed out. Still out: L003 (Tan Wei Ming), TOWEL (Ahmad Faizal).');
    expect(scans.length).toBe(before + 1);
    expect(component.dlgMode()).toBe('serve');
  });
});
