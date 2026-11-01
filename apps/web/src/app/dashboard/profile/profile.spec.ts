import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileComponent } from './profile';
import { environment } from '../../../environments/environment';
import { MfaStatus, TrustedDevice } from '../../models/auth.models';

const STATUS_URL = `${environment.apiUrl}/auth/mfa/status`;
const PROFILE_URL = `${environment.apiUrl}/auth/profile`;
const ENABLE_URL = `${environment.apiUrl}/auth/mfa/enable`;
const DISABLE_URL = `${environment.apiUrl}/auth/mfa/disable`;
const DEVICES_URL = `${environment.apiUrl}/auth/mfa/trusted-devices`;

const mfaOn: MfaStatus = { available: true, enabled: true, enrolledAt: '2026-11-01', recoveryCodesLeft: 8, required: false, requiredBy: null, trustedDevicesAllowed: true, trustedDeviceDays: 30 };
const mfaOff: MfaStatus = { available: true, enabled: false, enrolledAt: null, recoveryCodesLeft: 0, required: false, requiredBy: null, trustedDevicesAllowed: true, trustedDeviceDays: 30 };

const devices: TrustedDevice[] = [
  { id: 'd-1', device: 'Chrome on Windows', createdAt: '2026-10-30T01:00:00Z', expiresAt: '2026-11-29T01:00:00Z', lastUsedAt: '2026-11-01T02:00:00Z', ip: '1.1.1.1', current: true },
  { id: 'd-2', device: 'Safari on iPhone', createdAt: '2026-10-20T01:00:00Z', expiresAt: '2026-11-19T01:00:00Z', lastUsedAt: null, ip: '2.2.2.2', current: false },
];

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Boot calls: the MFA status for the Security card, the trusted devices, and the profile itself.
    http.expectOne(STATUS_URL).flush(mfaOff);
    http.expectOne(DEVICES_URL).flush({ devices: [] });
    http.expectOne(PROFILE_URL).flush({ user: { full_name: 'Test User', phone: '', bio: '', profilePicture: '', authMethod: 'local' } });
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // The two MFA forms bind [formGroup]: without the FormGroupDirective a bare
  // <form (ngSubmit)> submits natively and reloads the page (the 2026-11-01
  // enrolment bug on /mfa-setup). Dispatching a real submit event must be
  // prevented AND reach the handler.
  it('the enrol form submits through Angular, never natively', () => {
    component.mfaMode.set('enrolling');
    component.mfaCode.setValue('123456');
    fixture.detectChanges();
    // The MFA form, not the profile form that precedes it in the DOM.
    const form = (fixture.nativeElement.querySelector('#pf-mfa-code') as HTMLElement).closest('form') as HTMLFormElement;
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const req = http.expectOne(ENABLE_URL);
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush({ message: 'ok', recoveryCodes: ['AAAA-BBBB'] });
    http.expectOne(STATUS_URL).flush(mfaOn);
    expect(component.mfaRecoveryCodes()).toEqual(['AAAA-BBBB']);
  });

  it('the disable form submits through Angular, never natively', () => {
    component.mfaStatus.set(mfaOn);
    component.mfaMode.set('disabling');
    component.mfaCode.setValue('654321');
    fixture.detectChanges();
    const form = (fixture.nativeElement.querySelector('#pf-mfa-off-code') as HTMLElement).closest('form') as HTMLFormElement;
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const req = http.expectOne(DISABLE_URL);
    expect(req.request.body).toEqual({ code: '654321' });
    req.flush({ message: 'Two-factor authentication disabled.' });
    http.expectOne(STATUS_URL).flush(mfaOff);
    expect(component.mfaMode()).toBe('idle');
  });

  // ---- Trusted devices ----

  it('lists the trusted devices with "This device" on the requesting browser, and hides the list while MFA is off', () => {
    component.trustedDevices.set(devices);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pf-devices')).toBeNull();

    component.mfaStatus.set(mfaOn);
    fixture.detectChanges();
    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.pf-device'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Chrome on Windows');
    expect(rows[0].querySelector('.status-chip')?.textContent).toContain('This device');
    expect(rows[1].querySelector('.status-chip')).toBeNull();
    expect(rows[1].textContent).toContain('2.2.2.2');
    expect(fixture.nativeElement.querySelector('.pf-devices .pf-row .btn')?.textContent).toContain('Remove all');
  });

  it('says when the organisation has switched trusted devices off, and shows the empty state', () => {
    component.mfaStatus.set({ ...mfaOn, trustedDevicesAllowed: false, trustedDeviceDays: 7 });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.pf-devices')?.textContent).toContain('switched trusted devices off');
    expect(el.querySelector('.pf-devices')?.textContent).toContain('for 7 days');
    expect(el.querySelector('.pf-devices__empty')?.textContent).toContain('No trusted devices');
  });

  it('removing a device confirms first, then deletes it and reloads the list', () => {
    component.mfaStatus.set(mfaOn);
    component.trustedDevices.set(devices);
    fixture.detectChanges();
    const remove = fixture.nativeElement.querySelectorAll('.pf-device .btn')[1] as HTMLButtonElement;
    remove.click();
    fixture.detectChanges();
    http.expectNone(`${DEVICES_URL}/d-2`);
    const confirm = component.confirmAction();
    expect(confirm?.title).toBe('Remove Safari on iPhone?');
    expect(fixture.nativeElement.querySelector('app-confirm-dialog')).not.toBeNull();

    confirm!.run();
    const req = http.expectOne(`${DEVICES_URL}/d-2`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Device removed. It will be asked for a code at its next sign-in.' });
    http.expectOne(DEVICES_URL).flush({ devices: [devices[0]] });
    expect(component.confirmAction()).toBeNull();
    expect(component.trustedDevices().length).toBe(1);
    expect(component.successMessage()).toContain('Device removed');
  });

  it('"Remove all" confirms with the count, then deletes every device', () => {
    component.mfaStatus.set(mfaOn);
    component.trustedDevices.set(devices);
    component.askRemoveAllDevices();
    expect(component.confirmAction()?.confirmLabel).toBe('Remove 2 devices');
    component.confirmAction()!.run();
    const req = http.expectOne(DEVICES_URL);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: '2 trusted devices removed. Every device will be asked for a code at its next sign-in.', revoked: 2 });
    http.expectOne(DEVICES_URL).flush({ devices: [] });
    expect(component.trustedDevices()).toEqual([]);
  });
});
