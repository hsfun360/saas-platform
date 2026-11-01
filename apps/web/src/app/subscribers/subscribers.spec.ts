import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { SubscribersComponent } from './subscribers';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/admin`;

// Subscriber Management's Manage Admin panel is the platform arm of the MFA
// recovery exception: the row kebab offers "Reset two-factor authentication"
// only for users who have it on, confirms the concrete outcome through the
// shared confirm card, posts to the platform reset endpoint and reloads the
// users. Rendered through the DOM with the real shared pieces.
describe('SubscribersComponent (Manage Admin, two-factor reset)', () => {
  let component: SubscribersComponent;
  let fixture: ComponentFixture<SubscribersComponent>;
  let http: HttpTestingController;

  const subscriber = {
    id: 'acct-1',
    subscriberName: 'Acme Club',
    subscriptionPlan: 'PRO',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    Companies: [{ id: 'company-A', name: 'Acme Club', isActive: true }],
  };

  function openPanel(): void {
    component.manageAdmin(subscriber);
    fixture.detectChanges();
    http.expectOne(`${BASE}/companies/company-A/users`).flush([
      { id: 'u-admin', email: 'admin@acme.test', roleName: 'Tenant Admin', mfaEnabled: true },
      { id: 'u-clerk', email: 'clerk@acme.test', roleName: 'Clerk', mfaEnabled: false },
    ]);
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.admin-user-row'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscribersComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscribersComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/subscriptions`).flush([subscriber]);
    http.expectOne(`${BASE}/modules`).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('offers the reset only on users who have two-factor authentication on', () => {
    openPanel();

    const [adminRow, clerkRow] = rows();
    expect(adminRow.textContent).toContain('admin@acme.test');
    expect(adminRow.querySelector('.overflow-menu__trigger')).not.toBeNull();
    expect(clerkRow.querySelector('.overflow-menu__trigger')).toBeNull();
    // The Tenant Admin keeps the tick, the clerk keeps the visible primary.
    expect(adminRow.querySelector('.admin-current')).not.toBeNull();
    expect(clerkRow.querySelector('.btn--primary')?.textContent).toContain('Set as Admin');
  });

  it('confirms the concrete outcome, posts the reset and reloads the users', () => {
    openPanel();
    const adminRow = rows()[0];

    adminRow.querySelector<HTMLButtonElement>('.overflow-menu__trigger')!.click();
    fixture.detectChanges();
    const item = adminRow.querySelector<HTMLButtonElement>('.overflow-menu__item')!;
    expect(item.textContent).toContain('Reset two-factor authentication');
    item.click();
    fixture.detectChanges();

    const card = host().querySelector<HTMLElement>('.cfm-card')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('.cfm-msg')?.textContent).toContain('Reset two-factor authentication for admin@acme.test?');
    expect(card.querySelector('.cfm-msg')?.textContent).toContain('trusted devices are cleared');
    const buttons = card.querySelectorAll<HTMLButtonElement>('.cfm-actions button');
    expect(buttons[1].textContent?.trim()).toBe('Reset');
    buttons[1].click();
    fixture.detectChanges();

    // The card closes and the reset goes to the platform endpoint.
    expect(host().querySelector('.cfm-card')).toBeNull();
    const req = http.expectOne(`${BASE}/users/u-admin/mfa/reset`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Two-factor authentication has been reset for this user.' });
    fixture.detectChanges();

    // The panel reloads so the kebab disappears from a user with nothing left to reset.
    http.expectOne(`${BASE}/companies/company-A/users`).flush([
      { id: 'u-admin', email: 'admin@acme.test', roleName: 'Tenant Admin', mfaEnabled: false },
      { id: 'u-clerk', email: 'clerk@acme.test', roleName: 'Clerk', mfaEnabled: false },
    ]);
    fixture.detectChanges();

    expect(host().querySelector('.flash-success')?.textContent).toContain('has been reset');
    expect(rows()[0].querySelector('.overflow-menu__trigger')).toBeNull();
  });

  it('cancelling the confirm sends nothing', () => {
    openPanel();
    const adminRow = rows()[0];
    adminRow.querySelector<HTMLButtonElement>('.overflow-menu__trigger')!.click();
    fixture.detectChanges();
    adminRow.querySelector<HTMLButtonElement>('.overflow-menu__item')!.click();
    fixture.detectChanges();

    const cancel = host().querySelector<HTMLButtonElement>('.cfm-actions button')!;
    cancel.click();
    fixture.detectChanges();

    expect(host().querySelector('.cfm-card')).toBeNull();
    http.expectNone(`${BASE}/users/u-admin/mfa/reset`);
  });
});
