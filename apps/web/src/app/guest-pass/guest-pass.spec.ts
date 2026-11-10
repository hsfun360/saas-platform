import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { GuestPassComponent } from './guest-pass';
import { MembershipGuestService, PublicGuestPass } from '../services/membership-guest.service';

// Behaviour tests for the public day pass: it reads the token from the link,
// shows the live state the API reports, draws the QR only while the pass can
// still be used, and never leaks why a bad link failed.

const PASS: PublicGuestPass = {
  clubName: 'Kuala Lumpur Golf & Country Club', clubLogo: null, registrationNo: 'GR-000001',
  guestName: 'Lim Mei Ling', hostName: 'Ahmad Faizal', visitDate: '2026-11-10',
  state: 'valid', stateLabel: 'Valid today', arrivedAt: null, qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
};

describe('GuestPassComponent', () => {
  let fixture: ComponentFixture<GuestPassComponent>;
  let askedToken: string | null;

  function build(token: string, result: () => ReturnType<MembershipGuestService['publicPass']>): void {
    askedToken = null;
    TestBed.configureTestingModule({
      imports: [GuestPassComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(token ? { token } : {}) } } },
        { provide: MembershipGuestService, useValue: { publicPass: (t: string) => { askedToken = t; return result(); } } },
      ],
    });
    fixture = TestBed.createComponent(GuestPassComponent);
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  it('opens the pass by the token in the link and shows who it is for', () => {
    build('tok123', () => of(PASS));
    expect(askedToken).toBe('tok123');
    expect(text('.auth-greeting__name')).toBe('Kuala Lumpur Golf & Country Club');
    expect(text('.auth-greeting__hello')).toBe('Lim Mei Ling');
    expect(text('.auth-chip')).toContain('Guest of Ahmad Faizal');
    expect(text('.auth-alert h2')).toBe('Valid today');
    expect((fixture.nativeElement as HTMLElement).querySelector('.auth-alert--success')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.gp-qr img')).toBeTruthy();
  });

  it('shows an expired pass as unusable, with no QR code', () => {
    build('tok123', () => of({ ...PASS, state: 'expired', stateLabel: 'Expired', qrDataUrl: null }));
    expect(text('.auth-alert h2')).toBe('Expired');
    expect((fixture.nativeElement as HTMLElement).querySelector('.auth-alert--danger')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.gp-qr')).toBeNull();
  });

  it('answers a bad link with one plain message', () => {
    build('nope', () => throwError(() => ({ status: 404, error: { message: 'internal detail' } })));
    expect(text('.auth-alert--danger')).toContain('This pass link is not valid');
    expect(text('.auth-alert--danger')).not.toContain('internal detail');
  });

  it('does not call the API without a token', () => {
    build('', () => of(PASS));
    expect(askedToken).toBeNull();
    expect(text('.auth-alert--danger')).toContain('incomplete');
  });
});
