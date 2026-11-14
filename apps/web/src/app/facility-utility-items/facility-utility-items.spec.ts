import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilityUtilityItemsComponent } from './facility-utility-items';
import { FacilityUtilityItem, FacilityUtilityItemPayload, FacilityUtilityItemService } from '../services/facility-utility-item.service';

// Behaviour tests for Utility Items: the "How it is handed out" choice maps
// to the two stored switches, a new numbered item moves the ONE dialog on to
// its units, Generate units adds nothing until a preview shows fresh codes,
// and an item outside the caller's data scope keeps its units viewable but
// read-only.

function item(over: Partial<FacilityUtilityItem>): FacilityUtilityItem {
  return {
    id: 'i1', code: 'LOCKER', description: 'Lockers', trackUnits: true, returnRequired: true, behaviour: 'units',
    stockQuantity: null, maxPerPerson: 1, feeTransactionTypeId: null, guestsAllowed: true, visitingMembersAllowed: true, requiresEntry: false,
    iconUrl: null, sortOrder: 10, isActive: true, unitCount: 2, unitsAvailable: 1, outCount: 1, canModify: true,
    ...over,
  };
}

describe('FacilityUtilityItemsComponent', () => {
  let fixture: ComponentFixture<FacilityUtilityItemsComponent>;
  let component: FacilityUtilityItemsComponent;
  let created: FacilityUtilityItemPayload[];
  let generated: unknown[];

  const locker = item({});
  const towel = item({ id: 'i2', code: 'TOWEL', description: 'Towels', trackUnits: false, behaviour: 'quantity', unitCount: 0, unitsAvailable: 0, outCount: 0, canModify: false });

  function card(code: string): Element {
    const found = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.data-card')).find((c) => c.textContent?.includes(code));
    if (!found) throw new Error(`no card for ${code}`);
    return found;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    created = [];
    generated = [];
    const service = {
      list: () => of({ items: [locker, towel], feeItems: [], unitStatuses: [], limits: { maxGenerate: 500 } }),
      create: (payload: FacilityUtilityItemPayload) => {
        created.push(payload);
        return of({ message: 'Utility item created.', item: item({ id: 'i9', code: String(payload.code), trackUnits: payload.trackUnits === true, behaviour: payload.trackUnits ? 'units' : 'quantity', unitCount: 0, unitsAvailable: 0, outCount: 0 }) });
      },
      units: () => of([]),
      previewUnits: () => of({ codes: [{ code: 'L001', exists: true }, { code: 'L002', exists: false }], fresh: 1, existing: 1 }),
      generateUnits: (_id: string, req: unknown) => { generated.push(req); return of({ message: '1 unit added.', added: 1 }); },
    };
    await TestBed.configureTestingModule({
      imports: [FacilityUtilityItemsComponent],
      providers: [provideRouter([]), { provide: FacilityUtilityItemService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityUtilityItemsComponent);
    component = fixture.componentInstance;
    await settle();
  });

  it('lists each item with how it is handed out and its rollup', () => {
    expect(card('LOCKER').textContent).toContain('Numbered units');
    expect(card('LOCKER').textContent).toContain('1 of 2 free');
    expect(card('TOWEL').textContent).toContain('By quantity');
  });

  it('saves the hand-out choice as the two stored switches: a use is neither tracked nor returned', async () => {
    component.openAdd();
    component.form.patchValue({ code: 'shower', description: 'Shower', behaviour: 'use' });
    component.onSave();
    await settle();
    expect(created[0]).toEqual({
      code: 'SHOWER', description: 'Shower', trackUnits: false, returnRequired: false, stockQuantity: null,
      maxPerPerson: 1, feeTransactionTypeId: null, guestsAllowed: true, visitingMembersAllowed: true, requiresEntry: false, sortOrder: 100,
    });
    expect(component.dlgMode()).toBeNull();
  });

  it('keeps no due-days setting - every returnable item is due back the same day - and says who an item is closed to', async () => {
    expect(card('LOCKER').textContent).toContain('Same day');
    expect(card('LOCKER').textContent).not.toContain('Not for visiting members');
    component.rows.set([item({ visitingMembersAllowed: false })]);
    await settle();
    expect(card('LOCKER').textContent).toContain('Not for visiting members');
    component.openEdit(item({ visitingMembersAllowed: false }));
    await settle();
    expect(component.form.controls.visitingMembersAllowed.value).toBe(false);
    expect((document.body.textContent || '')).not.toContain('Due back after (days)');
    expect((document.body.textContent || '')).toContain('Visiting members may take it');
  });

  it('moves the one dialog on to the units after a new numbered item is saved', async () => {
    component.openAdd();
    component.form.patchValue({ code: 'KEY', description: 'Keys', behaviour: 'units' });
    component.onSave();
    await settle();
    expect(created[0].trackUnits).toBe(true);
    expect(component.dlgMode()).toBe('units');
    expect(component.unitItem()?.code).toBe('KEY');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-dialog').length).toBe(1);
  });

  it('adds generated units only after a preview shows fresh codes, and names the count on the button', async () => {
    component.openUnits(locker);
    await settle();
    component.openGenerate();
    await settle();
    const add = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.includes('Add 1 unit'));
    expect(add).toBeDefined();
    // Changing the range drops the preview, so nothing can be added blind.
    component.generateChanged();
    component.submitGenerate();
    expect(generated.length).toBe(0);
    component.refreshPreview();
    await settle();
    component.submitGenerate();
    expect(generated.length).toBe(1);
  });

  it('keeps the units of an item outside the data scope viewable, without Edit on the row', async () => {
    const theirs = item({ id: 'i3', code: 'BAY', description: 'Bays', canModify: false });
    component.rows.set([theirs]);
    await settle();
    const actions = card('BAY').querySelector('.data-row__actions');
    expect(actions?.textContent).not.toContain('Edit');
    expect(actions?.textContent).toContain('Units');
    component.openUnits(theirs);
    await settle();
    expect(component.unitsReadOnly()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('View only');
  });
});
