import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilitiesComponent } from './facilities';
import { Facility, FacilityService } from '../services/facility.service';
import { FacilityTypeService } from '../services/facility-type.service';

// Behaviour tests for the data scope on Facilities: a unit the caller may not
// amend (canModify false) loses Edit but keeps its row menu for "Closures",
// which then only LISTS the unit's closure plans instead of opening the
// create form.

function unit(over: Partial<Facility>): Facility {
  return {
    id: 'u1', facilityTypeId: 't1', code: 'TC1', name: 'Tennis Court 1', location: null, isIndoor: false, isFloodlit: false,
    capacity: null, pictureUrl: null, remarks: null, sortOrder: 0, isActive: true,
    facilityType: { id: 't1', code: 'TENNIS', description: 'Tennis Court', usageMode: 'slot' },
    canModify: true,
    ...over,
  };
}

describe('FacilitiesComponent', () => {
  let fixture: ComponentFixture<FacilitiesComponent>;
  let component: FacilitiesComponent;
  let navigations: { commands: unknown[]; queryParams: unknown }[];

  const mine = unit({});
  const theirs = unit({ id: 'u2', code: 'POOL1', name: 'Main Pool', canModify: false });

  function card(code: string): Element {
    const found = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.data-card')).find((c) => c.textContent?.includes(code));
    if (!found) throw new Error(`no card for ${code}`);
    return found;
  }

  beforeEach(async () => {
    navigations = [];
    await TestBed.configureTestingModule({
      imports: [FacilitiesComponent],
      providers: [
        provideRouter([]),
        { provide: FacilityService, useValue: { list: () => of([mine, theirs]) } },
        { provide: FacilityTypeService, useValue: { list: () => of([]) } },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    router.navigate = ((commands: unknown[], extras?: { queryParams?: unknown }) => {
      navigations.push({ commands, queryParams: extras?.queryParams });
      return Promise.resolve(true);
    }) as Router['navigate'];
    fixture = TestBed.createComponent(FacilitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('drops Edit on a facility the caller may not amend but keeps its row menu', () => {
    expect(card('TC1').querySelector('.data-row__actions')?.textContent).toContain('Edit');
    expect(card('TC1').querySelector('app-overflow-menu')).not.toBeNull();
    expect(card('POOL1').querySelector('.data-row__actions')?.textContent).not.toContain('Edit');
    expect(card('POOL1').querySelector('app-overflow-menu')).not.toBeNull();
  });

  it('Closures on an amendable facility opens the closure form with the unit preselected', () => {
    component.openClosures(mine);
    expect(navigations).toEqual([{ commands: ['/facility/closures'], queryParams: { facilityTypeId: 't1', facilityId: 'u1' } }]);
  });

  it('Closures on a facility the caller may not amend only lists that unit\'s closure plans', () => {
    component.openClosures(theirs);
    expect(navigations).toEqual([{ commands: ['/facility/closures'], queryParams: { search: 'POOL1' } }]);
  });
});
