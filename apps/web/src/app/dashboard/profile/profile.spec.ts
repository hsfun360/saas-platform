import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileComponent } from './profile';
import { environment } from '../../../environments/environment';

const STATUS_URL = `${environment.apiUrl}/auth/mfa/status`;
const PROFILE_URL = `${environment.apiUrl}/auth/profile`;
const ENABLE_URL = `${environment.apiUrl}/auth/mfa/enable`;
const DISABLE_URL = `${environment.apiUrl}/auth/mfa/disable`;

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
    // Boot calls: the MFA status for the Security card and the profile itself.
    http.expectOne(STATUS_URL).flush({ available: true, enabled: false, enrolledAt: null, recoveryCodesLeft: 0, required: false, requiredBy: null });
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
    http.expectOne(STATUS_URL).flush({ available: true, enabled: true, enrolledAt: '2026-11-01', recoveryCodesLeft: 8, required: false, requiredBy: null });
    expect(component.mfaRecoveryCodes()).toEqual(['AAAA-BBBB']);
  });

  it('the disable form submits through Angular, never natively', () => {
    component.mfaStatus.set({ available: true, enabled: true, enrolledAt: '2026-11-01', recoveryCodesLeft: 8, required: false, requiredBy: null });
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
    http.expectOne(STATUS_URL).flush({ available: true, enabled: false, enrolledAt: null, recoveryCodesLeft: 0, required: false, requiredBy: null });
    expect(component.mfaMode()).toBe('idle');
  });
});
