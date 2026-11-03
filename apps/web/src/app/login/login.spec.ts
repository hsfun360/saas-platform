import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';

import { LoginComponent } from './login';
import { AuthResponse } from '../models/auth.models';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MsalService,
          useValue: {
            handleRedirectObservable: () => of(null),
            loginRedirect: () => undefined,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ---- Per-environment SSO buttons (2026-11-03: no built-in Google client) ----

  const ssoButtons = () => Array.from(fixture.nativeElement.querySelectorAll('.btn-sso') as NodeListOf<HTMLElement>).map((b) => b.textContent?.trim());

  it('shows the Google button only when the environment serves a Google client', () => {
    http.expectOne((r) => r.url.endsWith('/auth/sso-config')).flush({ googleClientId: '123-abc.apps.googleusercontent.com', microsoftEnabled: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.btn-sso--google').length).toBe(1);
    expect(ssoButtons().length).toBe(2);
  });

  it('hides the Google button, and the whole "or" block when Microsoft is off too, without a Google client', () => {
    http.expectOne((r) => r.url.endsWith('/auth/sso-config')).flush({ googleClientId: null, microsoftEnabled: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.btn-sso').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.divider')).toBeNull();
  });

  it('keeps the Microsoft button alone when only Google is unavailable', () => {
    http.expectOne((r) => r.url.endsWith('/auth/sso-config')).flush({ googleClientId: null, microsoftEnabled: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.btn-sso--google').length).toBe(0);
    expect(ssoButtons().length).toBe(1);
    expect(fixture.nativeElement.querySelector('.divider')).not.toBeNull();
  });

  // ---- Registered-workstation lock (2026-11-01) ----

  it('a workstation refusal shows the outcome card and sends the remote-access request with the token and reason', () => {
    component.loginForm.patchValue({ email: 'alice@acme.test', password: 'correct horse battery' });
    component.onSubmit();
    http.expectOne((r) => r.url.endsWith('/auth/login')).flush({ message: 'Your role signs in only from a registered workstation at your organisation.', workstationRequired: true, email: 'alice@acme.test', remoteAccessToken: 'ra-token', remoteAccessPending: false });
    fixture.detectChanges();
    expect(component.isRemoteAccessStep()).toBe(true);
    expect(component.isMfaStep()).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.auth-lead')?.textContent).toContain('registered workstation');
    expect(el.querySelector('button[type=submit]')?.textContent).toContain('Request remote access');

    component.remoteAccessForm.controls.reason.setValue('  Working from home  ');
    component.submitRemoteAccessRequest();
    const req = http.expectOne((r) => r.url.endsWith('/auth/remote-access/request'));
    expect(req.request.body).toEqual({ token: 'ra-token', reason: 'Working from home' });
    req.flush({ message: 'Your request has been sent to your administrator.', pending: true });
    fixture.detectChanges();
    expect(el.querySelector('.auth-alert--success')?.textContent).toContain('sent to your administrator');
    expect(el.querySelector('#ra-reason')).toBeNull();
  });

  it('a refusal with a request already waiting says so and offers a reminder', () => {
    component.loginForm.patchValue({ email: 'alice@acme.test', password: 'correct horse battery' });
    component.onSubmit();
    http.expectOne((r) => r.url.endsWith('/auth/login')).flush({ message: 'locked', workstationRequired: true, email: 'alice@acme.test', remoteAccessToken: 'ra-token', remoteAccessPending: true });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.auth-alert--neutral')?.textContent).toContain('already waiting');
    expect(el.querySelector('button[type=submit]')?.textContent).toContain('Remind my administrator');
    component.cancelRemoteAccess();
    fixture.detectChanges();
    expect(component.isRemoteAccessStep()).toBe(false);
    expect(el.querySelector('#ra-reason')).toBeNull();
  });

  // Password accepted, code needed: the API's challenge payload carries the
  // account's trusted-device rule.
  function challenge(extra: Partial<AuthResponse>) {
    component.loginForm.patchValue({ email: 'user@example.com', password: 'correct horse battery' });
    component.onSubmit();
    http.expectOne((r) => r.url.endsWith('/auth/login')).flush({ message: 'code', mfaRequired: true, mfaToken: 'mfa-token', email: 'user@example.com', ...extra });
    fixture.detectChanges();
    expect(component.isMfaStep()).toBe(true);
  }

  it('offers "Don\'t ask again" for the organisation\'s window and sends the tick', () => {
    challenge({ rememberDeviceAllowed: true, rememberDeviceDays: 7 });
    const label = fixture.nativeElement.querySelector('.login-check') as HTMLElement;
    expect(label.textContent).toContain('for 7 days');
    expect(component.mfaForm.getRawValue().rememberDevice).toBe(true);
    component.mfaForm.controls.code.setValue('123456');
    component.submitMfaCode();
    const req = http.expectOne((r) => r.url.endsWith('/auth/mfa/verify'));
    expect(req.request.body).toEqual({ mfaToken: 'mfa-token', code: '123456', rememberDevice: true });
  });

  it('hides the checkbox and never asks to remember the device when the organisation forbids it', () => {
    challenge({ rememberDeviceAllowed: false, rememberDeviceDays: 30 });
    expect(fixture.nativeElement.querySelector('.login-check')).toBeNull();
    component.mfaForm.controls.code.setValue('654321');
    component.submitMfaCode();
    const req = http.expectOne((r) => r.url.endsWith('/auth/mfa/verify'));
    expect(req.request.body).toEqual({ mfaToken: 'mfa-token', code: '654321', rememberDevice: false });
  });

  it('a challenge without the rule (older API) keeps the 30-day default', () => {
    challenge({});
    expect(fixture.nativeElement.querySelector('.login-check')?.textContent).toContain('for 30 days');
  });
});
