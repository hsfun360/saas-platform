import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecurityPolicyComponent } from './security-policy';
import { environment } from '../../environments/environment';
import { SecurityPolicyState } from '../models/auth.models';

const URL = `${environment.apiUrl}/auth/account/security-policy`;

function state(over: Partial<SecurityPolicyState> = {}): SecurityPolicyState {
  return {
    mfaAvailable: true, mfaPolicy: 'optional', mfaRequiredFrom: null, effective: false, users: 12, enrolled: 4, notEnrolled: 8,
    trustedDevicesAllowed: true, trustedDeviceDays: 30, trustedDevices: 3,
    ...over,
  };
}

const pristineForm = { mfaRequired: false, mfaRequiredFrom: '', trustedDevicesAllowed: true, trustedDeviceDays: 30 };

describe('SecurityPolicyComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SecurityPolicyComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function mount(initial: SecurityPolicyState) {
    const fixture = TestBed.createComponent(SecurityPolicyComponent);
    fixture.detectChanges();
    http.expectOne(URL).flush(initial);
    fixture.detectChanges();
    return fixture;
  }

  it('loads pristine with the stored policy and states the expected result for "off"', () => {
    const fixture = mount(state());
    const c = fixture.componentInstance;
    expect(c.form.dirty).toBe(false);
    expect(c.form.getRawValue()).toEqual(pristineForm);
    expect(c.expected()).toContain('4 of 12 users have two-factor authentication on');
    expect(fixture.nativeElement.querySelector('.save-bar')).toBeNull();
  });

  it('turning the switch on reveals the start date and states who will be asked to enrol', () => {
    const fixture = mount(state());
    const c = fixture.componentInstance;
    c.form.controls.mfaRequired.setValue(true);
    c.form.markAsDirty();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#spMfaFrom')).not.toBeNull();
    expect(c.expected()).toContain('8 of 12 users have not set up two-factor authentication');
    expect(c.expected()).toContain('at their next sign-in');
    expect(fixture.nativeElement.querySelector('.save-bar')).not.toBeNull();
  });

  it('a future start date is announced in the expected result; a date is not sent when the policy is off', () => {
    const fixture = mount(state());
    const c = fixture.componentInstance;
    c.form.controls.mfaRequired.setValue(true);
    c.form.controls.mfaRequiredFrom.setValue('2999-01-15');
    expect(c.expected()).toContain('from ');
    c.form.controls.mfaRequired.setValue(false);
    c.save();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mfaPolicy: 'optional', mfaRequiredFrom: null, trustedDevicesAllowed: true, trustedDeviceDays: 30 });
    req.flush({ message: 'Security policy updated.', ...state() });
    expect(c.form.dirty).toBe(false);
    expect(c.successMessage()).toBe('Security policy updated.');
  });

  it('warns, but still allows editing, when the platform has no MFA key', () => {
    const fixture = mount(state({ mfaAvailable: false }));
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.flash-error.flash--static')?.textContent).toContain('not available on this platform yet');
    expect(el.querySelector('input[role=switch]')).not.toBeNull();
    const ok = mount(state({ mfaAvailable: true }));
    expect(ok.nativeElement.querySelector('.flash-error.flash--static')).toBeNull();
  });

  it('saving a required policy sends the date and re-seeds the form from the answer', () => {
    const fixture = mount(state());
    const c = fixture.componentInstance;
    c.form.controls.mfaRequired.setValue(true);
    c.form.controls.mfaRequiredFrom.setValue('2026-11-01');
    c.save();
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01', trustedDevicesAllowed: true, trustedDeviceDays: 30 });
    req.flush({ message: 'Security policy updated.', ...state({ mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01', notEnrolled: 8 }) });
    expect(c.form.getRawValue()).toEqual({ ...pristineForm, mfaRequired: true, mfaRequiredFrom: '2026-11-01' });
    expect(c.hasUnsavedChanges()).toBe(false);
  });

  // ---- Trusted devices ("Don't ask again on this device") ----

  it('states how many devices skip the code today, and what switching the option off does to them', () => {
    const fixture = mount(state({ trustedDevices: 3 }));
    const c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('#spTrustDays')).not.toBeNull();
    expect(c.expectedTrust()).toContain('3 trusted devices currently skip the code');
    c.form.controls.trustedDevicesAllowed.setValue(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#spTrustDays')).toBeNull();
    expect(c.expectedTrust()).toContain('3 trusted devices currently skipping the code will be asked for one at their next sign-in');
    c.save();
    const req = http.expectOne(URL);
    // The stored window travels with the switch so turning it back on later restores it.
    expect(req.request.body).toEqual({ mfaPolicy: 'optional', mfaRequiredFrom: null, trustedDevicesAllowed: false, trustedDeviceDays: 30 });
    req.flush({ message: 'Security policy updated.', ...state({ trustedDevicesAllowed: false, trustedDevices: 0 }) });
    expect(c.expectedTrust()).toBe('Trusted devices are off: every sign-in asks for a code.');
  });

  it('shortening the window says which devices will be asked again; lengthening it keeps existing windows', () => {
    const fixture = mount(state({ trustedDevices: 2, trustedDeviceDays: 30 }));
    const c = fixture.componentInstance;
    c.form.controls.trustedDeviceDays.setValue(7);
    expect(c.expectedTrust()).toContain('Any device trusted more than 7 days ago will be asked for a code');
    c.form.controls.trustedDeviceDays.setValue(60);
    expect(c.expectedTrust()).toContain('keep their 30-day window');
    c.form.controls.trustedDeviceDays.setValue(1);
    expect(c.expectedTrust()).toContain('more than 1 day ago');
    c.save();
    expect(http.expectOne(URL).request.body).toEqual({ mfaPolicy: 'optional', mfaRequiredFrom: null, trustedDevicesAllowed: true, trustedDeviceDays: 1 });
  });

  it('refuses to save a window outside 1 to 90 days and says so on the field', () => {
    const fixture = mount(state());
    const c = fixture.componentInstance;
    for (const bad of [0, 91, 7.5]) {
      c.form.controls.trustedDeviceDays.setValue(bad);
      fixture.detectChanges();
      expect(c.trustDaysInvalid()).toBe(true);
      expect(fixture.nativeElement.querySelector('#spTrustDaysErr')).not.toBeNull();
      c.save();
      http.expectNone(URL);
      expect(c.errorMessage()).toContain('from 1 to 90');
    }
    c.form.controls.trustedDeviceDays.setValue(90);
    fixture.detectChanges();
    expect(c.trustDaysInvalid()).toBe(false);
    expect(fixture.nativeElement.querySelector('#spTrustDaysErr')).toBeNull();
  });
});
