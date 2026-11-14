import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilityTypesComponent } from './facility-types';
import { FacilityType, FacilityTypeService, FacilityTypeSlot, FacilityTypeSlotSet } from '../services/facility-type.service';
import { FacilityTransactionTypeService } from '../services/facility-transaction-type.service';

// Behaviour tests for the data scope on Facility Types: a type the caller may
// not amend (canModify false) loses Edit but keeps its row menu when it has
// slot sets to show, and those open VIEW-ONLY - no Add, no set menu, no
// Regenerate, no Save, every slot input disabled.

function facilityType(over: Partial<FacilityType>): FacilityType {
  return {
    id: 't1', code: 'TENNIS', description: 'Tennis Court', usageMode: 'slot', isActive: true, sortOrder: 0,
    unitCount: 2, activeUnitCount: 2, slotSetCount: 1, canModify: true,
    ...over,
  } as FacilityType;
}

const SET: FacilityTypeSlotSet = {
  id: 's1', facilityTypeId: 't2', description: 'Daily', dayScope: 'all', effectiveDate: '2026-01-01',
  firstSlotTime: '07:00', lastSlotTime: '08:00', slotMinutes: 60, frontDeskFrom: null, isActive: true,
  slots: [
    { slotNumber: 1, startTime: '07:00', endTime: '08:00', isFrontDesk: false, isActive: true },
    { slotNumber: 2, startTime: '08:00', endTime: '09:00', isFrontDesk: false, isActive: true },
  ],
};

describe('FacilityTypesComponent', () => {
  let fixture: ComponentFixture<FacilityTypesComponent>;
  let component: FacilityTypesComponent;
  let savedSlots: FacilityTypeSlot[][];

  const mine = facilityType({});
  const theirs = facilityType({ id: 't2', code: 'SQUASH', description: 'Squash Court', canModify: false });
  const theirGym = facilityType({ id: 't3', code: 'GYM', description: 'Gym', usageMode: 'entry', slotSetCount: 0, canModify: false });

  const serviceStub = {
    meta: () => of({
      usageModes: [{ key: 'slot', label: 'Time slot booking' }, { key: 'entry', label: 'Entry registration' }],
      dayScopes: [{ key: 'all', label: 'All days' }],
      limits: { maxSlotsPerSet: 200, slotMinutesMin: 5, slotMinutesMax: 480, maxClosureRangeDays: 366, maxSessions: 10 },
    }),
    list: () => of([mine, theirs, theirGym]),
    slotSets: () => of([SET]),
    saveSlots: (_typeId: string, _setId: string, slots: FacilityTypeSlot[]) => {
      savedSlots.push(slots);
      return of({ message: 'Saved.', slots });
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

  function queryAll<T extends Element>(selector: string): T[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector));
  }

  function card(code: string): Element {
    const found = queryAll('.data-card').find((c) => c.textContent?.includes(code));
    if (!found) throw new Error(`no card for ${code}`);
    return found;
  }

  beforeEach(async () => {
    savedSlots = [];
    await TestBed.configureTestingModule({
      imports: [FacilityTypesComponent],
      providers: [
        provideRouter([]),
        { provide: FacilityTypeService, useValue: serviceStub },
        { provide: FacilityTransactionTypeService, useValue: { list: () => of([]) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityTypesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });

  it('drops Edit on a type the caller may not amend but keeps the row menu of a slot type', () => {
    expect(card('TENNIS').querySelector('.data-row__actions')?.textContent).toContain('Edit');
    expect(card('TENNIS').querySelector('app-overflow-menu')).not.toBeNull();

    expect(card('SQUASH').querySelector('.data-row__actions')?.textContent).not.toContain('Edit');
    expect(card('SQUASH').querySelector('app-overflow-menu')).not.toBeNull();

    // No slot sets to show on an entry type: nothing is left in the row.
    expect(card('GYM').querySelector('.data-row__actions')?.textContent).not.toContain('Edit');
    expect(card('GYM').querySelector('app-overflow-menu')).toBeNull();
  });

  it('lists the slot sets of such a type view-only: no Add, no set menu', async () => {
    component.openSets(theirs);
    fixture.detectChanges();
    await settle();

    expect(query('app-dialog')?.textContent).toContain('View only');
    expect(queryAll('.ft-set').length).toBe(1);
    expect(query('.ft-set app-overflow-menu')).toBeNull();
    expect(query('app-dialog')?.textContent).not.toContain('Add slot set');
    expect(query('.ft-set')?.textContent).toContain('Slots (2)');
  });

  it('opens its slots view-only: inputs disabled, no Regenerate, no Save', async () => {
    component.openSets(theirs);
    fixture.detectChanges();
    await settle();
    component.openSlots(SET);
    fixture.detectChanges();
    await settle();

    const inputs = queryAll<HTMLInputElement>('#ftSlots .ft-slot-row input');
    expect(inputs.length).toBe(8);
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(query('#ftSlots')?.textContent).not.toContain('Regenerate');
    expect(query('button[form="ftSlots"]')).toBeNull();
    expect(component.isDirty()).toBe(false);

    // Even a forced submit saves nothing.
    component.onSaveSlots();
    expect(savedSlots.length).toBe(0);
  });

  it('still edits the slot sets of an amendable type', async () => {
    component.openSets(mine);
    fixture.detectChanges();
    await settle();

    expect(query('app-dialog')?.textContent).not.toContain('View only');
    expect(query('.ft-set app-overflow-menu')).not.toBeNull();
    expect(query('app-dialog')?.textContent).toContain('Add slot set');

    component.openSlots(SET);
    fixture.detectChanges();
    await settle();
    expect(queryAll<HTMLInputElement>('#ftSlots .ft-slot-row input').some((i) => i.disabled)).toBe(false);
    expect(query('#ftSlots')?.textContent).toContain('Regenerate');
    expect(query('button[form="ftSlots"]')?.textContent).toContain('Save 2 slots');

    component.onSaveSlots();
    expect(savedSlots.map((s) => s.length)).toEqual([2]);
  });

  it('offers "Visiting members allowed" on an entry type only, saves it, and says so on the card', async () => {
    const updates: Record<string, unknown>[] = [];
    (serviceStub as unknown as { update: unknown }).update = (_id: string, payload: Record<string, unknown>) => {
      updates.push(payload);
      return of({ message: 'Saved.', facilityType: facilityType({ id: 't4', code: 'POOL', usageMode: 'entry', visitingMembersAllowed: false }) });
    };
    const pool = facilityType({ id: 't4', code: 'POOL', description: 'Pool', usageMode: 'entry', slotSetCount: 0, visitingMembersAllowed: false });
    component.rows.set([mine, pool]);
    fixture.detectChanges();
    await settle();
    expect(card('POOL').textContent).toContain('No visiting members');
    expect(card('TENNIS').textContent).not.toContain('No visiting members');

    component.openEdit(pool);
    fixture.detectChanges();
    await settle();
    expect(query('app-dialog')?.textContent).toContain('Visiting members allowed');
    expect(component.form.controls.visitingMembersAllowed.value).toBe(false);
    component.form.controls.visitingMembersAllowed.setValue(true);
    component.onSave();
    await settle();
    expect(updates[0]['visitingMembersAllowed']).toBe(true);

    // A slot type is not entered on a day pass: the switch is not offered.
    component.openEdit(mine);
    fixture.detectChanges();
    await settle();
    expect(query('app-dialog')?.textContent).not.toContain('Visiting members allowed');
  });
});
