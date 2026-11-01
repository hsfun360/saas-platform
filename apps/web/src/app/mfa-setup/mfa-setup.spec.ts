import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MfaSetupComponent } from './mfa-setup';
import { environment } from '../../environments/environment';

const SETUP_URL = `${environment.apiUrl}/auth/mfa/setup`;
const ENABLE_URL = `${environment.apiUrl}/auth/mfa/enable`;

describe('MfaSetupComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MfaSetupComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function mount() {
    const fixture = TestBed.createComponent(MfaSetupComponent);
    fixture.detectChanges();
    http.expectOne(SETUP_URL).flush({ otpauthUrl: 'otpauth://totp/x', qrDataUrl: 'data:image/png;base64,AA==' });
    fixture.detectChanges();
    return fixture;
  }

  it('mints the secret exactly once per page, on init', () => {
    const fixture = mount();
    fixture.detectChanges();
    http.expectNone(SETUP_URL);
    expect(fixture.componentInstance.qrDataUrl()).toContain('data:image/png');
  });

  it('submitting the form never performs a native submission (which would reload the page and mint a new secret)', () => {
    const fixture = mount();
    const c = fixture.componentInstance;
    c.code.setValue('123456');
    fixture.detectChanges();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const req = http.expectOne(ENABLE_URL);
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush({ message: 'ok', recoveryCodes: ['AAAA-BBBB'] });
    expect(c.recoveryCodes()).toEqual(['AAAA-BBBB']);
  });

  it('an incomplete code is refused client-side with the field error, and nothing is sent', () => {
    const fixture = mount();
    const c = fixture.componentInstance;
    c.code.setValue('12345');
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(ev);
    fixture.detectChanges();
    expect(ev.defaultPrevented).toBe(true);
    http.expectNone(ENABLE_URL);
    expect(fixture.nativeElement.querySelector('#mfaCodeErr')?.textContent).toContain('Enter the 6-digit code');
  });

  it('shows the server message when the code is rejected', () => {
    const fixture = mount();
    const c = fixture.componentInstance;
    c.code.setValue('000000');
    c.confirm();
    http.expectOne(ENABLE_URL).flush({ message: 'That code is not valid. Check your authenticator app and try again.' }, { status: 400, statusText: 'Bad Request' });
    expect(c.errorMessage()).toContain('not valid');
    expect(c.submitting()).toBe(false);
  });
});
