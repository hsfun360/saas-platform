import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TenantUsersComponent } from './tenant-users';
import { environment } from '../../environments/environment';
import { AccountPerson, AccountUsersResponse } from '../models/auth.models';

const USERS_URL = `${environment.apiUrl}/auth/account/users`;

function person(over: Partial<AccountPerson> = {}): AccountPerson {
  return {
    id: 'u-a', email: 'a@example.com', full_name: 'Person A', profileEditable: true, mfaEnabled: true,
    memberships: [{ companyId: 'c-1', companyName: 'Club One', roleId: 'r-1', roleName: 'Front Desk' }],
    ...over,
  };
}

function usersResponse(people: AccountPerson[]): AccountUsersResponse {
  return { companies: [{ id: 'c-1', name: 'Club One', roles: [] }], people, invitations: [] };
}

describe('TenantUsersComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // The signed-in user, as the JWT states it: never offered their own reset.
    localStorage.setItem('token', 'h.' + btoa(JSON.stringify({ id: 'u-me', companyId: 'c-1' })) + '.s');
    TestBed.configureTestingModule({
      imports: [TenantUsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function flushSideLoads(): void {
    // Roles, departments and positions: empty lists are enough for the list.
    http.match(() => true).forEach((r) => r.flush([]));
  }

  function mount(people: AccountPerson[]) {
    const fixture = TestBed.createComponent(TenantUsersComponent);
    fixture.detectChanges();
    http.expectOne(USERS_URL).flush(usersResponse(people));
    flushSideLoads();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function openMenu(fixture: { detectChanges(): void; nativeElement: unknown }, personId: string): HTMLElement {
    const card = host(fixture).querySelector<HTMLElement>(`[data-return-id="${personId}"]`)!;
    card.querySelector<HTMLButtonElement>('.overflow-menu__trigger')!.click();
    fixture.detectChanges();
    return card;
  }

  function resetItem(card: HTMLElement): HTMLButtonElement | null {
    return Array.from(card.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Reset two-factor authentication')) ?? null;
  }

  it('offers "Reset two-factor authentication" only for people with a code, and never for oneself', () => {
    const fixture = mount([
      person(),
      person({ id: 'u-b', email: 'b@example.com', mfaEnabled: false }),
      person({ id: 'u-me', email: 'me@example.com', mfaEnabled: true }),
    ]);
    expect(resetItem(openMenu(fixture, 'u-a'))).not.toBeNull();
    expect(resetItem(openMenu(fixture, 'u-b'))).toBeNull();
    expect(resetItem(openMenu(fixture, 'u-me'))).toBeNull();
  });

  it('confirms with the concrete outcome, POSTs the reset, reports the result and reloads the list', () => {
    const fixture = mount([person()]);
    const c = fixture.componentInstance;
    resetItem(openMenu(fixture, 'u-a'))!.click();
    fixture.detectChanges();
    expect(c.confirmAction()?.message).toContain('Reset two-factor authentication for a@example.com?');
    expect(c.confirmAction()?.message).toContain('sign in with their password alone');
    const confirm = host(fixture).querySelector<HTMLButtonElement>('app-confirm-dialog .btn--danger')!;
    expect(confirm.textContent?.trim()).toBe('Reset');
    confirm.click();
    fixture.detectChanges();

    const req = http.expectOne(`${environment.apiUrl}/auth/company/users/u-a/mfa/reset`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Two-factor authentication has been reset for this user.' });
    // The list reloads so the item disappears for a person who now has no code.
    http.expectOne(USERS_URL).flush(usersResponse([person({ mfaEnabled: false })]));
    flushSideLoads();
    fixture.detectChanges();
    expect(c.successMessage()).toBe('Two-factor authentication has been reset for this user.');
    expect(c.confirmAction()).toBeNull();
    expect(resetItem(openMenu(fixture, 'u-a'))).toBeNull();
  });
});
