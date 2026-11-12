import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FacilityStationComponent } from './facility-station';
import { FacilityStationService, ServePanel, ServeRow, ServeTile, StationDay, StationUtilityUnit } from '../services/facility-station.service';

// Behaviour tests for the station's scan and serve (slice 6b): what is
// scanned or keyed opens ONE Serve panel for that person, a tap on a tile
// issues for the holder the panel names and redraws it, a tile that cannot be
// tapped says why, a unit picked on the board is offered first, and Undo
// takes a wrong tap back.

function tile(over: Partial<ServeTile>): ServeTile {
  return {
    utilityItemId: 'locker', code: 'LOCKER', description: 'Locker', iconUrl: null, behaviour: 'units',
    fee: { code: 'LOCKERFEE', description: 'Locker fee', unitAmount: 5 }, allowed: true, reason: null, held: 0, limit: 1, dueDays: 0,
    freeUnits: [{ id: 'u1', code: 'L001', location: null }, { id: 'u2', code: 'L002', location: 'Row B' }], suggestedUnitId: 'u1',
    ...over,
  };
}

function row(over: Partial<ServeRow>): ServeRow {
  return {
    id: 'r1', patron: { id: 'p1', name: 'Ahmad Faizal', memberNo: 'M001' }, holderName: 'Tan Wei Ming', guestRegistrationId: 'g1',
    utilityItemId: 'locker', utilityUnitId: 'u2', unit: { id: 'u2', code: 'L002', location: 'Row B' }, registrationId: null, quantity: 1,
    issuedAt: '2026-11-12T02:00:00Z', dueBack: '2026-11-12T15:59:00Z', overdue: false, returnedAt: null, returnedQuantity: null, returnCondition: null,
    status: 'issued', feeBillId: null, bill: null, remarks: null,
    item: { id: 'locker', code: 'LOCKER', description: 'Locker', behaviour: 'units' }, undoable: true,
    ...over,
  };
}

function panel(over: Partial<ServePanel>): ServePanel {
  return {
    kind: 'guest', person: { name: 'Tan Wei Ming' }, host: { memberId: 'm1', memberNo: 'M001', name: 'Ahmad Faizal' },
    pass: { id: 'g1', registrationNo: 'G-00001', visitDate: '2026-11-12', arrivedAt: '2026-11-12T01:52:00Z', firstScan: false },
    standingWarning: null, holding: [], usedToday: [],
    tiles: [
      tile({}),
      tile({ utilityItemId: 'towel', code: 'TOWEL', description: 'Towel', behaviour: 'quantity', fee: null, limit: 2, freeUnits: [], suggestedUnitId: null }),
      tile({ utilityItemId: 'sauna', code: 'SAUNA', description: 'Sauna', behaviour: 'use', fee: null, allowed: false, reason: 'Members only.', limit: 0, freeUnits: [], suggestedUnitId: null }),
    ],
    bill: null, undoMinutes: 5, clubNow: { date: '2026-11-12', time: '09:52' },
    ...over,
  };
}

describe('FacilityStationComponent - scan and serve', () => {
  let fixture: ComponentFixture<FacilityStationComponent>;
  let component: FacilityStationComponent;
  let scans: unknown[];
  let issues: Record<string, unknown>[];
  let undone: string[];
  let nextPanel: ServePanel;
  let scanFails: string | null;

  const day: StationDay = {
    date: '2026-11-12', dayType: 'weekday', clubNow: { date: '2026-11-12', time: '09:52' }, checkInOpenMinutes: 30, types: [],
    utilityItems: [{
      id: 'locker', code: 'LOCKER', description: 'Locker', iconUrl: null, behaviour: 'units', trackUnits: true, returnRequired: true,
      stockQuantity: null, maxPerPerson: 1, dueDays: 0, guestsAllowed: true, requiresEntry: false, fee: null,
      units: [
        { id: 'u1', code: 'L001', location: null, isActive: true, unitStatus: 'available', currentIssueId: null, remarks: null },
        { id: 'u2', code: 'L002', location: 'Row B', isActive: true, unitStatus: 'available', currentIssueId: null, remarks: null },
      ],
      outCount: 0, usedCount: 0, issues: [],
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

  beforeEach(async () => {
    scans = [];
    issues = [];
    undone = [];
    nextPanel = panel({});
    scanFails = null;
    const service = {
      meta: () => of({ participantTypes: [], registrationStatuses: [], issueStatuses: [], returnConditions: [], unitStatuses: [], limits: { maxGuestsPerRegistration: 50, maxIssueQuantity: 500 } }),
      today: () => of(day),
      scan: (body: unknown) => {
        scans.push(body);
        return scanFails ? throwError(() => ({ error: { message: scanFails } })) : of({ panel: nextPanel });
      },
      issue: (body: Record<string, unknown>) => {
        issues.push(body);
        const held = panel({ holding: [row({})], tiles: [tile({ allowed: false, reason: 'Limit reached - holding 1 of 1.', held: 1 })] });
        return of({ message: 'L002 issued to Tan Wei Ming, guest of Ahmad Faizal.', issueId: 'r1', warnings: [], panel: held });
      },
      undoIssue: (id: string) => { undone.push(id); return of({ message: 'L002 undone.', panel: panel({}) }); },
      returnIssue: () => of({ message: 'Returned.', panel: panel({}) }),
    };
    await TestBed.configureTestingModule({
      imports: [FacilityStationComponent],
      providers: [provideRouter([]), { provide: FacilityStationService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityStationComponent);
    component = fixture.componentInstance;
    await settle();
  });

  it('submits the scan box without a native form submission and opens ONE Serve panel for the person', async () => {
    const form = host().querySelector('form.st-scan') as HTMLFormElement;
    component.scanForm.setValue({ code: ' https://club/guest-pass/abc ' });
    const event = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(scans).toEqual([{ code: 'https://club/guest-pass/abc' }]);
    expect(component.dlgMode()).toBe('serve');
    expect(host().querySelectorAll('app-dialog').length).toBe(1);
    expect(host().textContent).toContain('Serve Tan Wei Ming');
    expect(host().textContent).toContain('Guest of Ahmad Faizal (M001)');
    // The box is ready for the next code.
    expect(component.scanForm.controls.code.value).toBe('');
  });

  it('keeps the box and says why when the code is refused', async () => {
    scanFails = 'This pass is for 14 Nov 2026 - it is not valid today.';
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    expect(component.dlgMode()).toBeNull();
    expect(component.errorMessage()).toBe('This pass is for 14 Nov 2026 - it is not valid today.');
    expect(component.scanForm.controls.code.value).toBe('abc');
  });

  it('states each tile\'s outcome: the price before the tap, the next free unit, and why a tile cannot be tapped', async () => {
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    const tiles = Array.from(host().querySelectorAll('.st-tile'));
    expect(tiles.length).toBe(3);
    expect(tiles[0].textContent).toContain("5.00 before tax, on Ahmad Faizal's bill");
    expect(tiles[0].querySelector('.st-unit--suggested')?.textContent).toContain('L001');
    expect(tiles[1].textContent).toContain('Free');
    expect(tiles[1].textContent).toContain('Issue 1 TOWEL');
    expect(tiles[2].textContent).toContain('Members only.');
    expect(tiles[2].querySelector('button')).toBeNull();
  });

  it('issues the tapped unit for the pass holder and redraws the panel with what is now held', async () => {
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    (host().querySelector('.st-tile .st-unit[aria-label^="Issue L002"]') as HTMLButtonElement).click();
    await settle();
    expect(issues).toEqual([{ utilityItemId: 'locker', utilityUnitId: 'u2', quantity: 1, guestRegistrationId: 'g1', memberNo: null, panel: true }]);
    expect(component.successMessage()).toContain('L002 issued to Tan Wei Ming');
    expect(component.dlgMode()).toBe('serve');
    expect(host().querySelector('.st-hold')?.textContent).toContain('L002');
    expect(host().querySelector('.st-tile')?.textContent).toContain('Limit reached - holding 1 of 1.');
  });

  it('issues one piece of a counted item with a single tap', async () => {
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    button('Issue 1 TOWEL')?.click();
    await settle();
    expect(issues[0]).toEqual({ utilityItemId: 'towel', utilityUnitId: null, quantity: 1, guestRegistrationId: 'g1', memberNo: null, panel: true });
  });

  it('serves a member on the keyed number: the issue names the member, not a pass', async () => {
    nextPanel = panel({ kind: 'member', person: { name: 'Ahmad Faizal' }, pass: null });
    component.scanForm.setValue({ code: 'M001' });
    component.submitScan();
    await settle();
    expect(host().textContent).toContain('Member M001');
    expect(host().querySelector('.st-tile')?.textContent).toContain('5.00 before tax');
    expect(host().querySelector('.st-tile')?.textContent).not.toContain("'s bill");
    component.serveIssue(nextPanel.tiles[0], 'u1');
    await settle();
    expect(issues[0]).toEqual({ utilityItemId: 'locker', utilityUnitId: 'u1', quantity: 1, guestRegistrationId: null, memberNo: 'M001', panel: true });
  });

  it('offers the unit tapped on the board first, in place of the next free one', async () => {
    const picked = day.utilityItems?.[0].units[1] as StationUtilityUnit;
    component.setType('locker');
    component.unitClicked(picked);
    await settle();
    expect(component.preferredUnit()?.code).toBe('L002');
    expect(host().querySelector('#stScanHint')?.textContent).toContain('L002');
    expect(component.dlgMode()).toBeNull();
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    const first = host().querySelector('.st-tile .st-unit');
    expect(first?.textContent).toContain('L002');
    expect(first?.classList.contains('st-unit--suggested')).toBe(true);
  });

  it('undoes a wrong tap from the Holding list and redraws the panel', async () => {
    nextPanel = panel({ holding: [row({})] });
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    button('Undo')?.click();
    await settle();
    expect(undone).toEqual(['r1']);
    expect(component.successMessage()).toBe('L002 undone.');
    expect(host().querySelector('.st-hold')).toBeNull();
  });

  it('on a desk with a scanner, puts the focus back on the next-person field after a tap so a scan never presses a tile', async () => {
    // A handheld scanner types where the focus is and ends with Enter.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
    try {
      fixture = TestBed.createComponent(FacilityStationComponent);
      component = fixture.componentInstance;
      await settle();
      expect(component.deskInput).toBe(true);
      component.scanForm.setValue({ code: 'abc' });
      component.submitScan();
      await settle();
      const next = host().querySelector('#stScanNext') as HTMLInputElement;
      expect(next).not.toBeNull();
      const unit = host().querySelector('.st-tile .st-unit') as HTMLButtonElement;
      unit.focus();
      unit.click();
      await settle();
      expect(document.activeElement).toBe(host().querySelector('#stScanNext'));
    } finally {
      window.matchMedia = original;
    }
  });

  it('offers Return, not Undo, once the undo window has passed', async () => {
    nextPanel = panel({ holding: [row({ undoable: false })] });
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    const actions = host().querySelector('.st-hold__actions');
    expect(actions?.textContent).toContain('Return');
    expect(actions?.textContent).not.toContain('Undo');
  });

  it('opens the return form from the panel on Damaged, and Back returns to the person being served', async () => {
    nextPanel = panel({ holding: [row({ undoable: false })] });
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    component.openReturn(nextPanel.holding[0], true);
    await settle();
    expect(component.dlgMode()).toBe('return');
    expect(component.form.controls.condition.value).toBe('damaged');
    // The footer steps back, it does not close the drawer on the person.
    expect(button('Cancel')).toBeUndefined();
    button('Back')?.click();
    await settle();
    expect(component.dlgMode()).toBe('serve');
    expect(component.panel()?.person.name).toBe('Tan Wei Ming');
    expect(host().textContent).toContain('Serve Tan Wei Ming');
  });

  it('opens the return form from the board on Good, with Cancel', async () => {
    component.openReturn(row({}));
    await settle();
    expect(component.form.controls.condition.value).toBe('good');
    expect(button('Cancel')).toBeDefined();
    expect(button('Back')).toBeUndefined();
  });

  it('lists a use under Used today, and explains Undo only while something can be undone', async () => {
    const use = row({ id: 'r2', utilityItemId: 'sauna', utilityUnitId: null, unit: null, status: 'used', item: { id: 'sauna', code: 'SAUNA', description: 'Sauna', behaviour: 'use' }, undoable: false });
    nextPanel = panel({ usedToday: [use] });
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    const headings = Array.from(host().querySelectorAll('h3.dlg-section')).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Holding now', 'Used today', 'Tap to issue']);
    expect(host().textContent).toContain('Nothing out.');
    expect(host().querySelector('.st-hold--used')?.textContent).toContain('SAUNA');
    expect(host().textContent).not.toContain('Undo is for a wrong tap');
    component.panel.set(panel({ usedToday: [{ ...use, undoable: true }] }));
    await settle();
    expect(host().textContent).toContain('Undo is for a wrong tap, in the first 5 minutes.');
  });

  it('marks the unit picked on the board as picked, not as the next free one', async () => {
    component.setType('locker');
    component.unitClicked(day.utilityItems?.[0].units[1] as StationUtilityUnit);
    component.scanForm.setValue({ code: 'abc' });
    component.submitScan();
    await settle();
    const units = Array.from(host().querySelectorAll('.st-tile .st-unit'));
    expect(units[0].textContent).toContain('L002');
    expect(units[0].textContent).toContain('picked');
    expect(units[1].textContent).toContain('free');
    expect(units[1].textContent).not.toContain('next free');
  });

  it('on a desk, keeps the focus in the next-person field when a code keyed inside the panel is refused', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
    try {
      fixture = TestBed.createComponent(FacilityStationComponent);
      component = fixture.componentInstance;
      await settle();
      component.scanForm.setValue({ code: 'abc' });
      component.submitScan();
      await settle();
      scanFails = "'NOPE' is not a guest pass of this club or a member number.";
      const next = host().querySelector('#stScanNext') as HTMLInputElement;
      next.value = 'NOPE';
      next.dispatchEvent(new Event('input'));
      component.submitScan();
      await settle();
      expect(component.dlgMode()).toBe('serve');
      expect(component.errorMessage()).toContain('NOPE');
      // The refused code stays, selected, where it was keyed - never behind the drawer.
      expect(document.activeElement).toBe(next);
      expect(next.value).toBe('NOPE');
    } finally {
      window.matchMedia = original;
    }
  });
});
