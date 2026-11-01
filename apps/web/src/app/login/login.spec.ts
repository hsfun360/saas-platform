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
