import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { RoleManagementComponent } from './role-management';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/auth/account`;

// Role Management through the DOM: the listing caption and the role dialog's
// registered-workstation lock (2026-11-01). The permission picker and the
// dialog are the real shared pieces; only HTTP is stubbed.
describe('RoleManagementComponent', () => {
  let component: RoleManagementComponent;
  let fixture: ComponentFixture<RoleManagementComponent>;
  let http: HttpTestingController;

  const roles = [
    { id: 'role-fd', name: 'Front Desk', description: 'Counter staff', dataScope: 'own', signInLockedToWorkstations: true, PermittedMenus: [{ id: 'm1', name: 'Tee Sheet' }] },
    { id: 'role-ps', name: 'Pro Shop', description: '', dataScope: 'all', signInLockedToWorkstations: false, PermittedMenus: [] },
  ];

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleManagementComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleManagementComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/roles`).flush(roles);
    http.expectOne(`${BASE}/menus`).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('captions a locked role on the listing and leaves the others plain', () => {
    const cards = host().querySelectorAll('.data-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('registered workstations only');
    expect(cards[1].textContent).not.toContain('registered workstations only');
  });

  it('the new-role dialog starts with the lock off and sends it when switched on', () => {
    component.openCreate();
    fixture.detectChanges();
    const lock = host().querySelector<HTMLInputElement>('#roleLock')!;
    expect(lock).not.toBeNull();
    expect(lock.checked).toBe(false);
    expect(component.roleForm.getRawValue().lockedToWorkstations).toBe(false);
    lock.click();
    fixture.detectChanges();
    expect(component.roleForm.getRawValue().lockedToWorkstations).toBe(true);
  });

  it('editing prefills the lock from the role detail', () => {
    component.startEdit(roles[0] as never);
    fixture.detectChanges();
    expect(component.roleForm.getRawValue().lockedToWorkstations).toBe(true);
    http.expectOne(`${BASE}/roles/role-fd`).flush({ id: 'role-fd', name: 'Front Desk', description: 'Counter staff', dataScope: 'own', signInLockedToWorkstations: false, menuIds: ['m1'], permissions: [{ menuId: 'm1', canCreate: true, canEdit: true, canDelete: true }] });
    fixture.detectChanges();
    // The detail answer is authoritative over the listing row.
    expect(component.roleForm.getRawValue().lockedToWorkstations).toBe(false);
    expect(host().querySelector<HTMLInputElement>('#roleLock')!.checked).toBe(false);
  });
});
