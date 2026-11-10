import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilityClosuresComponent } from './facility-closures';
import { FacilityClosureDay, FacilityClosurePlan, FacilityClosureService } from '../services/facility-closure.service';

// Behaviour tests for the data scope on Facility Closures: a plan the caller
// may not amend (canModify false) keeps "Closure days", opened VIEW-ONLY - no
// row menu, no Generate, no Remove, no Save, every input disabled.

function plan(over: Partial<FacilityClosurePlan>): FacilityClosurePlan {
  return {
    id: 'p1', facilityTypeId: 't1', facilityId: 'u1', description: 'Court resurfacing', dayScope: 'all',
    dateFrom: '2026-12-01', dateTo: '2026-12-02', startTime: null, endTime: null, isActive: true,
    facilityType: { id: 't1', code: 'TENNIS', description: 'Tennis Court', usageMode: 'slot' },
    facility: { id: 'u1', code: 'TC1', name: 'Tennis Court 1' },
    days: [
      { closureDate: '2026-12-01', startTime: null, endTime: null, isActive: true },
      { closureDate: '2026-12-02', startTime: '07:00', endTime: '12:00', isActive: true },
    ],
    canModify: true,
    ...over,
  };
}

describe('FacilityClosuresComponent', () => {
  let fixture: ComponentFixture<FacilityClosuresComponent>;
  let component: FacilityClosuresComponent;
  let saved: { planId: string; days: FacilityClosureDay[] }[];
  let queryParams: Record<string, string>;

  const mine = plan({});
  const theirs = plan({ id: 'p2', description: 'Swim meet', facility: { id: 'u2', code: 'POOL1', name: 'Main Pool' }, canModify: false });

  const serviceStub = {
    list: () => of({ plans: [mine, theirs], types: [], facilities: [] }),
    saveDays: (planId: string, days: FacilityClosureDay[]) => {
      saved.push({ planId, days });
      return of({ message: 'Saved.', days, classSessionsCancelled: 0 });
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

  async function create(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FacilityClosuresComponent],
      providers: [
        provideRouter([]),
        { provide: FacilityClosureService, useValue: serviceStub },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityClosuresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    saved = [];
    queryParams = {};
  });

  it('keeps Closure days on a plan the caller may not amend, without the row menu', async () => {
    await create();
    const cards = queryAll('.data-card');
    expect(cards.length).toBe(2);
    for (const card of cards) expect(card.textContent).toContain('Closure days (2)');
    expect(cards[0].querySelector('app-overflow-menu')).not.toBeNull();
    expect(cards[1].querySelector('app-overflow-menu')).toBeNull();
  });

  it('opens the days of such a plan view-only: no Generate, Remove or Save, inputs disabled', async () => {
    await create();
    component.openDays(theirs);
    fixture.detectChanges();
    await settle();

    expect(query('#fclDays')?.textContent).toContain('View only');
    const inputs = queryAll<HTMLInputElement>('#fclDays .fcl-day-row input');
    expect(inputs.length).toBe(6);
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(queryAll('#fclDays .fcl-day-row button').length).toBe(0);
    expect(query('#fclDays')?.textContent).not.toContain('Regenerate days');
    expect(query('button[form="fclDays"]')).toBeNull();
    expect(component.isDirty()).toBe(false);

    // Even a forced submit saves nothing.
    component.onSaveDays();
    expect(saved.length).toBe(0);
  });

  it('still edits the days of an amendable plan', async () => {
    await create();
    component.openDays(mine);
    fixture.detectChanges();
    await settle();

    expect(query('#fclDays')?.textContent).not.toContain('View only');
    expect(queryAll<HTMLInputElement>('#fclDays .fcl-day-row input').some((i) => i.disabled)).toBe(false);
    expect(queryAll('#fclDays .fcl-day-row button').length).toBe(2);
    expect(query('#fclDays')?.textContent).toContain('Regenerate days');
    expect(query('button[form="fclDays"]')?.textContent).toContain('Save 2 days');

    component.onSaveDays();
    expect(saved.map((s) => [s.planId, s.days.length])).toEqual([['p1', 2]]);
  });

  it('arriving from a facility the caller may not amend lists that unit\'s plans and opens no form', async () => {
    queryParams = { search: 'POOL1' };
    await create();
    expect(component.search()).toBe('POOL1');
    expect(queryAll('.data-card').map((c) => c.querySelector('.data-card__title')?.textContent?.trim())).toEqual(['Swim meet']);
    expect(component.dlgMode()).toBeNull();
  });
});
