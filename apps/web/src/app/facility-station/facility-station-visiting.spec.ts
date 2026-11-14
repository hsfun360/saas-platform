import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilityStationComponent } from './facility-station';
import { FacilityStationService, ServeEntry, ServePanel, ServeTile, StationDay, StationIssue, StationRegistration } from '../services/facility-station.service';

// Behaviour tests for slice 7 (step 7a): the day pass of a VISITING member of
// an affiliated or reciprocal club opens the same Serve panel in their own
// name, a tap issues on that pass, their panel lists the guests they brought
// but adds none, the guest's panel steps back by the visiting member's own
// pass, and the day board tags what a visiting member holds.

function tile(over: Partial<ServeTile>): ServeTile {
  return {
    utilityItemId: 'towel', code: 'TOWEL', description: 'Towel', iconUrl: null, behaviour: 'quantity',
    fee: { code: 'TOWELFEE', description: 'Towel fee', unitAmount: 3 }, allowed: true, reason: null, held: 0, limit: 2,
    freeUnits: [], suggestedUnitId: null,
    ...over,
  };
}

const visit = {
  id: 'v1', visitNo: 'L261100004', patronGroup: 'reciprocal' as const, label: 'Reciprocal member', name: 'Lim Chee Keong', memberNo: 'S-1024',
  club: { code: 'SAUJANA', name: 'Saujana Golf' }, ownPassId: 'gr7',
};

function visitingPanel(over: Partial<ServePanel>): ServePanel {
  return {
    kind: 'visiting', person: { name: 'Lim Chee Keong' }, host: { memberId: null, memberNo: null, name: 'Lim Chee Keong' }, visit,
    pass: { id: 'gr7', registrationNo: 'GR00007', visitDate: '2026-11-14', arrivedAt: '2026-11-14T01:00:00Z', firstScan: false, createdHere: false, removable: false },
    guests: [{ name: 'E2E Companion', guestRegistrationId: 'gr8', holding: 0 }], door: null,
    standingWarning: null, holding: [], usedToday: [],
    tiles: [tile({}), tile({ utilityItemId: 'sauna', code: 'SAUNA', description: 'Sauna', behaviour: 'use', fee: null, allowed: false, reason: 'Not for visiting members.', limit: 0 })],
    entries: [], bill: null, undoMinutes: 5, clubNow: { date: '2026-11-14', time: '09:10' },
    ...over,
  };
}

const guestPanel: ServePanel = visitingPanel({
  kind: 'guest', person: { name: 'E2E Companion' }, guests: [],
  pass: { id: 'gr8', registrationNo: 'GR00008', visitDate: '2026-11-14', arrivedAt: '2026-11-14T01:05:00Z', firstScan: false, createdHere: false, removable: false },
});

describe('FacilityStationComponent - a visiting member of an affiliated or reciprocal club', () => {
  let fixture: ComponentFixture<FacilityStationComponent>;
  let component: FacilityStationComponent;
  let scans: unknown[];
  let issues: Record<string, unknown>[];
  let admissions: Record<string, unknown>[];
  let nextPanel: ServePanel;

  const held: StationIssue = {
    id: 'r1', patron: { id: 'p9', name: 'Lim Chee Keong', memberNo: null, patronType: 'reciprocal' }, holderName: null, guestRegistrationId: null,
    utilityItemId: 'towel', utilityUnitId: null, unit: null, registrationId: null, quantity: 1,
    issuedAt: '2026-11-14T01:10:00Z', dueBack: '2026-11-14T15:59:00Z', overdue: false, returnedAt: null, returnedQuantity: null, returnCondition: null,
    status: 'issued', feeBillId: null, bill: null, remarks: null,
  };

  const day: StationDay = {
    date: '2026-11-14', dayType: 'weekend', clubNow: { date: '2026-11-14', time: '09:10' }, checkInOpenMinutes: 30, types: [],
    utilityItems: [{
      id: 'towel', code: 'TOWEL', description: 'Towel', iconUrl: null, behaviour: 'quantity', trackUnits: false, returnRequired: true,
      stockQuantity: 200, maxPerPerson: 2, guestsAllowed: true, visitingMembersAllowed: true, requiresEntry: false, fee: null,
      units: [], outCount: 1, usedCount: 0, issues: [held],
    }],
  };

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

  async function scan(p: ServePanel): Promise<void> {
    nextPanel = p;
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
  }

  beforeEach(async () => {
    scans = [];
    issues = [];
    admissions = [];
    nextPanel = visitingPanel({});
    const service = {
      meta: () => of({ participantTypes: [], registrationStatuses: [], issueStatuses: [], returnConditions: [], unitStatuses: [], limits: { maxGuestsPerRegistration: 50, maxIssueQuantity: 500 } }),
      today: () => of(day),
      scan: (body: unknown) => { scans.push(body); return of({ panel: nextPanel }); },
      issue: (body: Record<string, unknown>) => { issues.push(body); return of({ message: '1 TOWEL issued to Lim Chee Keong.', issueId: 'r2', warnings: [], panel: nextPanel }); },
      admit: (body: Record<string, unknown>) => { admissions.push(body); return of({ message: 'Lim Chee Keong is in POOL (REG-00009) - 4 of 30 inside.', registrationId: 'reg9', warnings: [], panel: nextPanel }); },
    };
    await TestBed.configureTestingModule({
      imports: [FacilityStationComponent],
      providers: [provideRouter([]), { provide: FacilityStationService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityStationComponent);
    component = fixture.componentInstance;
    await settle();
  });

  it('opens the Serve panel in the visiting member\'s own name, with their club, their pass and their patron group', async () => {
    await scan(visitingPanel({}));
    expect(component.dlgMode()).toBe('serve');
    const who = host().querySelector('.st-who');
    expect(who?.textContent).toContain('Lim Chee Keong');
    expect(who?.textContent).toContain('Reciprocal member of Saujana Golf (S-1024)');
    expect(who?.textContent).toContain('pass GR00007');
    expect(who?.querySelector('.status-chip')?.textContent?.trim()).toBe('Reciprocal member');
    // Never read as a member of this club.
    expect(who?.textContent).not.toContain('Member null');
  });

  it('bills the visiting member in their own name and says why a closed item cannot be tapped', async () => {
    await scan(visitingPanel({}));
    const tiles = Array.from(host().querySelectorAll('.st-tile'));
    expect(tiles[0].textContent).toContain('3.00 before tax');
    expect(tiles[0].textContent).not.toContain("'s bill");
    expect(tiles[1].textContent).toContain('Not for visiting members.');
    expect(tiles[1].querySelector('button')).toBeNull();
  });

  it('issues on the visiting member\'s own pass, never on a member number', async () => {
    await scan(visitingPanel({}));
    button('Issue 1 TOWEL')?.click();
    await settle();
    expect(issues).toEqual([{ utilityItemId: 'towel', utilityUnitId: null, quantity: 1, guestRegistrationId: 'gr7', memberNo: null, panel: true }]);
  });

  it('lists the guests the visiting member brought and adds none at the station', async () => {
    await scan(visitingPanel({}));
    expect(button('E2E Companion')).toBeDefined();
    expect(button('Add guest')).toBeUndefined();
    expect(host().textContent).toContain('registered at the Registration Counter');
    button('E2E Companion')?.click();
    await settle();
    expect(scans[scans.length - 1]).toEqual({ guestRegistrationId: 'gr8' });
  });

  it('serves the guest a visiting member brought under that member, and steps back by their own pass', async () => {
    await scan(guestPanel);
    const who = host().querySelector('.st-who');
    expect(who?.textContent).toContain('Guest of Lim Chee Keong (Saujana Golf)');
    expect(who?.querySelector('.status-chip')?.textContent?.trim()).toBe('Guest');
    expect(host().querySelector('.st-tile')?.textContent).toContain("3.00 before tax, on Lim Chee Keong's bill");
    button('Serve Lim Chee Keong')?.click();
    await settle();
    expect(scans[scans.length - 1]).toEqual({ guestRegistrationId: 'gr7' });
  });

  it('offers no step back when the visiting member holds no pass of their own today', async () => {
    await scan({ ...guestPanel, visit: { ...visit, ownPassId: null } });
    expect(button('Serve Lim Chee Keong')).toBeUndefined();
  });

  // ---- step 7b: entering a facility on the pass ----

  function entry(over: Partial<ServeEntry>): ServeEntry {
    return {
      facilityTypeId: 'pool', code: 'POOL', description: 'Pool', iconUrl: null, liveCount: 3, capacity: 30, willReach: 4,
      fee: { code: 'POOLFEE', description: 'Pool entry', unitAmount: 25 }, allowed: true, reason: null, inside: null, hostInside: false, guestTypes: [],
      ...over,
    };
  }

  it('admits the visiting member on their own pass, at their own price, in their own name', async () => {
    await scan(visitingPanel({ entries: [entry({}), entry({ facilityTypeId: 'gym', code: 'GYM', description: 'Gym', fee: null, allowed: false, reason: 'GYM is not open to visiting members.' })] }));
    expect(Array.from(host().querySelectorAll('h3.dlg-section')).map((h) => h.textContent?.trim())).toContain('Enter a facility');
    const tiles = Array.from(host().querySelectorAll('.st-tile')).filter((t) => t.querySelector('.st-tile__icon')?.textContent?.trim() === 'login');
    expect(tiles[0].textContent).toContain('25.00 before tax');
    expect(tiles[0].textContent).not.toContain("'s bill");
    expect(tiles[1].textContent).toContain('GYM is not open to visiting members.');
    expect(tiles[1].querySelector('button')).toBeNull();
    button('Admit to POOL')?.click();
    await settle();
    expect(admissions).toEqual([{ facilityTypeId: 'pool', guestRegistrationId: 'gr7', memberNo: null, panel: true }]);
  });

  it('says a price is missing for the visiting member where the club has not set one', async () => {
    await scan(visitingPanel({ entries: [entry({ fee: { code: 'POOLFEE', description: 'Pool entry', unitAmount: null }, allowed: false, reason: 'POOLFEE has no price today.' })] }));
    const tile = Array.from(host().querySelectorAll('.st-tile')).find((t) => t.textContent?.includes('POOL'));
    expect(tile?.textContent).toContain('POOLFEE has no price today.');
    expect(tile?.querySelector('button')).toBeNull();
  });

  it('keeps the guest out until the visiting member is inside, and bills the guest fee to the visiting member', async () => {
    await scan({ ...guestPanel, entries: [entry({ fee: { code: 'GUESTFEE', description: 'Guest fee', unitAmount: 10 }, allowed: false, reason: 'Lim Chee Keong must enter POOL first.' })] });
    let tile = Array.from(host().querySelectorAll('.st-tile')).find((t) => t.textContent?.includes('POOL'));
    expect(tile?.textContent).toContain('Lim Chee Keong must enter POOL first.');
    await scan({ ...guestPanel, entries: [entry({ fee: { code: 'GUESTFEE', description: 'Guest fee', unitAmount: 10 }, hostInside: true })] });
    tile = Array.from(host().querySelectorAll('.st-tile')).find((t) => t.textContent?.includes('POOL'));
    expect(tile?.textContent).toContain("10.00 before tax, on Lim Chee Keong's bill");
    button('Admit to POOL')?.click();
    await settle();
    expect(admissions[0]).toEqual({ facilityTypeId: 'pool', guestRegistrationId: 'gr8', memberNo: null, panel: true });
  });

  it('signs the visiting member out with the guests on their entry', async () => {
    await scan(visitingPanel({ entries: [entry({ allowed: false, inside: { registrationId: 'reg9', registrationNo: 'REG-00009', timeIn: '2026-11-14T01:20:00Z', guestCount: 1, own: true } })] }));
    expect(button('Sign out with 1 guest')).toBeDefined();
  });

  it('shows a visiting member\'s entry on the day board with their tag and no guest editing', async () => {
    const reg: StationRegistration = {
      id: 'reg9', registrationNo: 'REG-00009', patron: { id: 'p9', name: 'Lim Chee Keong', memberNo: null, patronType: 'reciprocal' }, facilityTypeId: 'pool', facilityId: null, facility: null,
      bookingSlotId: null, registrationDate: '2026-11-14', timeIn: '2026-11-14T01:20:00Z', timeOut: null, dayType: 'weekend', guestCount: 1, hostPresent: true,
      status: 'in', billId: null, bill: null, remarks: null, guests: [{ id: 'g1', patronId: null, participantType: 'guest', name: 'E2E Companion', memberNo: null, guestVisitId: null, sortOrder: 1 }],
    };
    const member: StationRegistration = { ...reg, id: 'reg8', registrationNo: 'REG-00008', patron: { id: 'p1', name: 'Ahmad Faizal', memberNo: 'M001', patronType: 'member' }, guests: [], guestCount: 0 };
    day.types = [{
      id: 'pool', code: 'POOL', description: 'Pool', usageMode: 'entry', iconUrl: null, capacity: 30, entryRequiresBooking: false, guestsAllowed: true, memberGuestsAllowed: true,
      visitingMembersAllowed: true, maxGuestsPerBooking: null, hours: null, isOpenNow: true, units: [], liveCount: 3, registrations: [reg, member],
    }];
    try {
      fixture = TestBed.createComponent(FacilityStationComponent);
      component = fixture.componentInstance;
      await settle();
      component.setType('pool');
      await settle();
      const cards = Array.from(host().querySelectorAll('.data-card'));
      const visiting = cards.find((c) => c.textContent?.includes('Lim Chee Keong'));
      const own = cards.find((c) => c.textContent?.includes('Ahmad Faizal'));
      expect(visiting?.textContent).toContain('(reciprocal member)');
      expect(visiting?.textContent).toContain('Sign out');
      expect(visiting?.querySelector('button[aria-label="Guests of REG-00009"]')).toBeNull();
      expect(own?.querySelector('button[aria-label="Guests of REG-00008"]')).not.toBeNull();
    } finally {
      day.types = [];
    }
  });

  it('tags what a visiting member holds on the day board, with no member number', async () => {
    component.setType('towel');
    await settle();
    const card = host().querySelector('.data-card');
    expect(card?.textContent).toContain('Lim Chee Keong');
    expect(card?.textContent).toContain('(reciprocal member)');
    expect(host().textContent).toContain('due back the same day');
  });
});
