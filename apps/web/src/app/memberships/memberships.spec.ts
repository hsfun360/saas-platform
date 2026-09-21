import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MembershipsComponent } from './memberships';
import { MembershipService } from '../services/membership.service';
import { SalutationService } from '../services/salutation.service';
import { TitleService } from '../services/title.service';
import { NationalityService } from '../services/nationality.service';
import { RaceService } from '../services/race.service';
import { IndustryTypeService } from '../services/industry-type.service';
import { CountryService } from '../services/country.service';
import { Member, Membership, MembershipListRow } from '../models/auth.models';

// Regression tests for the Members dialog (corporate membership -> nominees).
//
// The bug: the members LIST and the member FORM were two separate <app-dialog>
// instances swapped by @if conditions. The shared dialog pushes a history
// back-trap entry on open and consumes it with an async history.back() on
// destroy - so swapping instances made the destroyed list dialog pop the new
// form dialog's trap entry, which read as the Back button and closed the edit
// form the instant it opened ("Edit does nothing"). The fix is the
// single-dialog standard: ONE instance, mode signal + @switch views.

const NOMINEE: Member = {
  id: 'mem-1',
  membershipId: 'ms-1',
  memberNo: 'CORP-126-000003.001',
  memberKind: 'nominee',
  memberStatusId: 'st1',
  lastName: 'SUFFIX-TEST-NOMINEE',
  email: 'old@example.com',
  addresses: [],
};

const MEMBERSHIP: Membership = {
  id: 'ms-1',
  membershipNo: 'CORP-126-000003',
  membershipClass: 'corporate',
  membershipTypeId: 'ty1',
  membershipStatusId: 'st1',
  joinDate: '2026-01-01',
  sendReminders: false,
  chargeInterest: false,
  monthlyFee: false,
  yearlyFee: false,
  members: [NOMINEE],
};

const LIST_ROW: MembershipListRow = {
  id: 'ms-1',
  membershipNo: 'CORP-126-000003',
  membershipClass: 'corporate',
  membershipTypeId: 'ty1',
  membershipStatusId: 'st1',
  joinDate: '2026-01-01',
  nomineeCount: 1,
  dependentCount: 0,
};

describe('MembershipsComponent members dialog', () => {
  let fixture: ComponentFixture<MembershipsComponent>;
  let component: MembershipsComponent;
  let updateCalls: { memberId: string; payload: Record<string, unknown> }[];
  let getCalls: number;

  const membershipServiceStub = {
    meta: () =>
      of({
        memberKinds: [],
        dependentTypes: [{ key: 'spouse', label: 'Spouse' }],
        expiringDependentTypes: [],
        genders: [],
        maritalStatuses: [],
        creditFlags: [],
        statementModes: [],
        addressTypes: [],
        numberingMode: 'manual' as const,
      }),
    options: () =>
      of({
        types: [
          { id: 'ty1', category: 'CORP', membershipClass: 'corporate', noOfNominee: 3 },
        ],
        statuses: [{ id: 'st1', membershipStatus: 'Active', statusClass: 'active' }],
        fees: [],
        agents: [],
        settings: null,
      }),
    list: () =>
      of({
        total: 1,
        limit: 20,
        offset: 0,
        counts: { individual: 0, corporate: 1 },
        memberships: [LIST_ROW],
      }),
    get: () => {
      getCalls += 1;
      return of(MEMBERSHIP);
    },
    suggestMemberNo: () => of({ memberNo: 'CORP-126-000003.002' }),
    updateMember: (_msId: string, memberId: string, payload: Record<string, unknown>) => {
      updateCalls.push({ memberId, payload });
      return of({ message: 'Member updated.', member: { ...NOMINEE, ...payload } as Member });
    },
    createNominee: () => of({ message: 'Nominee created.', member: NOMINEE }),
    createDependent: () => of({ message: 'Dependent created.', member: NOMINEE }),
  };

  const emptyListActive = { listActive: () => of([]) };

  // Let queued macrotasks (the dialog's async history.back() -> popstate cycle,
  // the exact mechanism of the original bug) run before re-checking the DOM.
  async function settle(ms = 50): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    updateCalls = [];
    getCalls = 0;
    await TestBed.configureTestingModule({
      imports: [MembershipsComponent],
      providers: [
        provideRouter([]),
        { provide: MembershipService, useValue: membershipServiceStub },
        { provide: SalutationService, useValue: emptyListActive },
        { provide: TitleService, useValue: emptyListActive },
        { provide: NationalityService, useValue: emptyListActive },
        { provide: RaceService, useValue: emptyListActive },
        { provide: IndustryTypeService, useValue: emptyListActive },
        { provide: CountryService, useValue: emptyListActive },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MembershipsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });

  function query<T extends Element>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  }

  function queryAll(selector: string): Element[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
  }

  async function openMembersDialog(): Promise<void> {
    component.openMembers(LIST_ROW);
    fixture.detectChanges();
    await settle();
  }

  it('opens the Members dialog with the nominee row and its Edit button', async () => {
    await openMembersDialog();

    expect(queryAll('app-dialog').length).toBe(1);
    expect(query('app-dialog')?.textContent).toContain('Members — CORP-126-000003');
    expect(query('app-dialog')?.textContent).toContain('SUFFIX-TEST-NOMINEE');
    const editBtn = queryAll('.mem-row__actions button').find((b) => b.textContent?.trim() === 'Edit');
    expect(editBtn).toBeTruthy();
  });

  it('Edit on the nominee opens the member form view - and it STAYS open (regression: dialog-swap history race)', async () => {
    await openMembersDialog();

    const editBtn = queryAll('.mem-row__actions button').find(
      (b) => b.textContent?.trim() === 'Edit',
    ) as HTMLButtonElement;
    editBtn.click();
    fixture.detectChanges();

    // The form view renders inside the SAME single dialog instance.
    expect(component.memberDialogMode()).toBe('edit');
    expect(queryAll('app-dialog').length).toBe(1);
    expect(query('#memberDlgForm')).toBeTruthy();

    // Give the old bug's mechanism time to fire (async history.back() ->
    // popstate). With two swapped dialog instances this closed the form here.
    await settle(100);
    expect(component.memberDialogMode()).toBe('edit');
    expect(query('#memberDlgForm')).toBeTruthy();

    // The form is seeded from the nominee - including the Email field.
    const email = query<HTMLInputElement>('#mEmail');
    expect(email?.value).toBe('old@example.com');
  });

  it('saves an edited Email and returns to the members list view', async () => {
    await openMembersDialog();

    (queryAll('.mem-row__actions button').find(
      (b) => b.textContent?.trim() === 'Edit',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    await settle(100);

    const email = query<HTMLInputElement>('#mEmail');
    expect(email).toBeTruthy();
    email!.value = 'new@example.com';
    email!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query<HTMLFormElement>('#memberDlgForm')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await settle();

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].memberId).toBe('mem-1');
    expect(updateCalls[0].payload['email']).toBe('new@example.com');
    // Back on the list view of the one dialog, reloaded.
    expect(component.memberDialogMode()).toBeNull();
    expect(queryAll('app-dialog').length).toBe(1);
    expect(query('app-dialog')?.textContent).toContain('Members — CORP-126-000003');
    expect(getCalls).toBeGreaterThan(1);
  });

  it('Back to list returns to the members list without closing the dialog', async () => {
    await openMembersDialog();

    (queryAll('.mem-row__actions button').find(
      (b) => b.textContent?.trim() === 'Edit',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    await settle(100);

    const backBtn = queryAll('.dlg__footer button').find(
      (b) => b.textContent?.trim() === 'Back to list',
    ) as HTMLButtonElement;
    expect(backBtn).toBeTruthy();
    backBtn.click();
    fixture.detectChanges();
    await settle(100);

    expect(component.memberDialogMode()).toBeNull();
    expect(component.membersOpen()).toBe(true);
    expect(queryAll('app-dialog').length).toBe(1);
    expect(query('app-dialog')?.textContent).toContain('SUFFIX-TEST-NOMINEE');
  });
});
