import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FacilityParticipantTypesComponent } from './facility-participant-types';
import { FacilityParticipantType, FacilityParticipantTypePayload, FacilityParticipantTypeService } from '../services/facility-participant-type.service';

// Behaviour tests for the two VISITING price groups (slice 7b): Affiliated
// Member and Reciprocal Member are system rows a club prices - a club-defined
// type cannot take their base identity, and their own row shows it locked.

function row(over: Partial<FacilityParticipantType>): FacilityParticipantType {
  return {
    id: 'p1', code: 'member', description: 'Member', baseIdentity: 'member', requiresApproval: false,
    isSystem: true, isActive: true, sortOrder: 1, canModify: true,
    ...over,
  } as FacilityParticipantType;
}

describe('FacilityParticipantTypesComponent', () => {
  let fixture: ComponentFixture<FacilityParticipantTypesComponent>;
  let component: FacilityParticipantTypesComponent;
  let created: FacilityParticipantTypePayload[];

  const reciprocal = row({ id: 'p5', code: 'reciprocal', description: 'Reciprocal Member', baseIdentity: 'reciprocal', sortOrder: 5 });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function baseOptions(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>('#fptBase option')).map((o) => o.value).filter(Boolean);
  }

  beforeEach(async () => {
    created = [];
    const service = {
      list: () => of({
        participantTypes: [row({}), row({ id: 'p3', code: 'guest', description: 'Guest / Visitor', baseIdentity: 'guest', sortOrder: 3 }), reciprocal],
        baseIdentities: [
          { key: 'member', label: 'Member' }, { key: 'member-guest', label: 'Member as Guest' }, { key: 'guest', label: 'Guest / Visitor' },
          { key: 'affiliate', label: 'Affiliated Member', systemOnly: true }, { key: 'reciprocal', label: 'Reciprocal Member', systemOnly: true },
        ],
      }),
      create: (payload: FacilityParticipantTypePayload) => { created.push(payload); return of({ message: 'Created.', participantType: row({ id: 'p9', code: String(payload.code), isSystem: false }) }); },
    };
    await TestBed.configureTestingModule({
      imports: [FacilityParticipantTypesComponent],
      providers: [provideRouter([]), { provide: FacilityParticipantTypeService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(FacilityParticipantTypesComponent);
    component = fixture.componentInstance;
    await settle();
  });

  it('lists a visiting price group under its own base label', () => {
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.data-card'));
    const card = cards.find((c) => c.textContent?.includes('reciprocal'));
    expect(card?.textContent).toContain('Reciprocal Member');
  });

  it('does not offer the visiting bases to a club-defined type', async () => {
    component.openAdd();
    await settle();
    expect(baseOptions()).toEqual(['member', 'member-guest', 'guest']);
  });

  it('shows the visiting base, locked, on its own system row and explains what it prices', async () => {
    component.openEdit(reciprocal);
    await settle();
    expect(baseOptions()).toContain('reciprocal');
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#fptBase');
    expect(select?.disabled).toBe(true);
    expect(select?.value).toBe('reciprocal');
    expect(component.baseHint()).toContain('price group of their entry fee');
  });
});
