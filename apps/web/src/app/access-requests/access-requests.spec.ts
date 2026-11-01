import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AccessRequestsComponent } from './access-requests';
import { environment } from '../../environments/environment';
import { RemoteAccessGrant, RemoteAccessList } from '../models/auth.models';

const BASE = `${environment.apiUrl}/auth/account/remote-access`;
const USERS = `${environment.apiUrl}/auth/account/users`;

function grant(over: Partial<RemoteAccessGrant> = {}): RemoteAccessGrant {
  return {
    id: 'g-1', userId: 'u-alice', userName: 'Alice Tan', userEmail: 'alice@acme.test', status: 'pending', reason: 'Clubhouse closed',
    requestedAt: '2026-11-01T01:00:00.000Z', device: 'Chrome on Windows', ip: '203.0.113.9',
    validFrom: null, validUntil: null, decidedBy: null, decidedAt: null, decisionNote: null, revokedAt: null,
    ...over,
  };
}

// Access Requests through the DOM with the real shared pieces: the three
// groups, the approve dialog's concrete button, the decline, the revoke
// confirm and the grant-in-advance drawer.
describe('AccessRequestsComponent', () => {
  let fixture: ComponentFixture<AccessRequestsComponent>;
  let component: AccessRequestsComponent;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function mount(list: Partial<RemoteAccessList> = {}): void {
    fixture = TestBed.createComponent(AccessRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(BASE).flush({ pending: [], active: [], history: [], maxDays: 30, ...list });
    http.expectOne(USERS).flush({ companies: [], invitations: [], people: [{ id: 'u-bob', email: 'bob@acme.test', full_name: 'Bob Lim', memberships: [] }] });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccessRequestsComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows the waiting request with device, address and reason, the grant in force, and the history folded', () => {
    mount({
      pending: [grant()],
      active: [grant({ id: 'g-2', status: 'approved', validFrom: '2026-11-01T01:00:00.000Z', validUntil: '2026-11-08T01:00:00.000Z', decidedBy: 'Yap Soon Kum' })],
      history: [grant({ id: 'g-3', status: 'rejected', decidedBy: 'Yap Soon Kum', decisionNote: 'Come in on Monday' })],
    });
    const request = host().querySelector('.ar-request')!;
    expect(request.textContent).toContain('Alice Tan');
    expect(request.textContent).toContain('Chrome on Windows');
    expect(request.textContent).toContain('203.0.113.9');
    expect(request.textContent).toContain('Clubhouse closed');
    expect(request.querySelector('.status-chip')?.textContent).toContain('Waiting');
    expect(host().querySelector('.ar-grant')?.textContent).toContain('by Yap Soon Kum');
    expect(host().querySelector('.ar-history')).toBeNull();
    component.toggleSection('history');
    fixture.detectChanges();
    expect(host().querySelector('.ar-history .status-chip')?.textContent).toContain('Declined');
  });

  it('approving states the window on the button, sends days and note, and refreshes from the answer', () => {
    mount({ pending: [grant()], maxDays: 14 });
    host().querySelector<HTMLButtonElement>('.ar-request .btn--success')!.click();
    fixture.detectChanges();
    expect(host().querySelector('#arDays')).not.toBeNull();
    expect(component.decisionForm.getRawValue().days).toBe(7);
    expect(host().querySelector('.dlg__footer .btn--success')?.textContent).toContain('Approve for 7 days');
    expect(component.decisionExpected()).toContain('Alice Tan may sign in from anywhere until');

    component.decisionForm.controls.days.setValue(15);
    fixture.detectChanges();
    expect(component.daysInvalid(15)).toBe(true);
    expect(component.decisionExpected()).toContain('from 1 to 14');
    expect(host().querySelector<HTMLButtonElement>('.dlg__footer .btn--success')!.disabled).toBe(true);

    component.decisionForm.controls.days.setValue(3);
    component.decisionForm.controls.note.setValue('Until Thursday');
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('.dlg__footer .btn--success')!.click();
    const req = http.expectOne(`${BASE}/g-1/approve`);
    expect(req.request.body).toEqual({ days: 3, note: 'Until Thursday' });
    req.flush({ message: 'Remote access approved. The person has been told.', pending: [], active: [grant({ status: 'approved', validFrom: '2026-11-01T01:00:00.000Z', validUntil: '2026-11-04T01:00:00.000Z' })], history: [], maxDays: 14 });
    fixture.detectChanges();
    expect(host().querySelector('#arDays')).toBeNull();
    expect(host().querySelectorAll('.ar-request').length).toBe(0);
    expect(host().querySelectorAll('.ar-grant').length).toBe(1);
    expect(host().querySelector('.flash-success')?.textContent).toContain('approved');
  });

  it('declining sends only the note', () => {
    mount({ pending: [grant()] });
    host().querySelector<HTMLButtonElement>('.ar-request .btn--danger')!.click();
    fixture.detectChanges();
    expect(host().querySelector('#arDays')).toBeNull();
    expect(component.decisionExpected()).toContain('declined');
    host().querySelector<HTMLButtonElement>('.dlg__footer .btn--danger')!.click();
    const req = http.expectOne(`${BASE}/g-1/reject`);
    expect(req.request.body).toEqual({ note: null });
    req.flush({ message: 'Request declined. The person has been told.', pending: [], active: [], history: [grant({ status: 'rejected' })], maxDays: 30 });
    fixture.detectChanges();
    expect(host().querySelector('.flash-success')?.textContent).toContain('declined');
  });

  it('revoking confirms the concrete outcome and sends DELETE', () => {
    mount({ active: [grant({ id: 'g-2', status: 'approved', validFrom: '2026-11-01T01:00:00.000Z', validUntil: '2026-11-08T01:00:00.000Z' })] });
    host().querySelector<HTMLButtonElement>('.ar-grant .btn--danger')!.click();
    fixture.detectChanges();
    const card = host().querySelector('.cfm-card')!;
    expect(card.querySelector('.cfm-msg')?.textContent).toContain('Revoke remote access for Alice Tan?');
    expect(card.querySelector('.cfm-msg')?.textContent).toContain('registered workstations only');
    card.querySelectorAll<HTMLButtonElement>('.cfm-actions button')[1].click();
    fixture.detectChanges();
    const req = http.expectOne(`${BASE}/g-2`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Remote access revoked.', pending: [], active: [], history: [grant({ id: 'g-2', status: 'revoked' })], maxDays: 30 });
    fixture.detectChanges();
    expect(host().querySelectorAll('.ar-grant').length).toBe(0);
  });

  it('granting in advance needs a person, states the window, and posts user, days and note', () => {
    mount();
    host().querySelector<HTMLButtonElement>('.saas-fab')!.click();
    fixture.detectChanges();
    expect(host().querySelector('#arUser')).not.toBeNull();
    component.submitGrant();
    fixture.detectChanges();
    http.expectNone(`${BASE}/grants`);
    expect(host().querySelector('#arUserErr')).not.toBeNull();

    component.setGrantUser('u-bob');
    component.grantForm.controls.days.setValue(2);
    component.grantForm.controls.note.setValue('Conference');
    fixture.detectChanges();
    expect(host().querySelector('.dlg__footer .btn--primary')?.textContent).toContain('Grant for 2 days');
    expect(component.grantExpected()).toContain('Bob Lim - bob@acme.test may sign in from anywhere until');
    component.submitGrant();
    const req = http.expectOne(`${BASE}/grants`);
    expect(req.request.body).toEqual({ userId: 'u-bob', days: 2, note: 'Conference' });
    req.flush({ message: 'Remote access granted. The person has been told.', pending: [], active: [grant({ userId: 'u-bob', userName: 'Bob Lim', status: 'approved', validFrom: '2026-11-01T01:00:00.000Z', validUntil: '2026-11-03T01:00:00.000Z' })], history: [], maxDays: 30 });
    fixture.detectChanges();
    expect(host().querySelector('#arUser')).toBeNull();
    expect(host().querySelector('.ar-grant')?.textContent).toContain('Bob Lim');
  });
});
