import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Gate for the authenticated shell: requires a token that is present AND not
// expired. (HTTP 401s are also handled by the interceptor, which logs out — this
// rejects a stale token up front so the shell never even renders for it.)
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    // Purpose-scoped tokens must never enter the shell — each goes to its own
    // flow (onboarding wizard / forced MFA enrollment); anything else → login.
    const purpose = tokenPurpose(token);
    if (purpose === 'onboarding') {
      return router.parseUrl('/onboarding');
    }
    if (purpose === 'mfa-enroll') {
      return router.parseUrl('/mfa-setup');
    }
    if (purpose) {
      localStorage.removeItem('token');
      return router.parseUrl('/login');
    }
    return true;
  }

  // No token, or expired / malformed — drop it and send to login.
  localStorage.removeItem('token');
  return router.parseUrl('/login');
};

// Gate for the forced-enrollment /mfa-setup page: only the 'mfa-enroll' token
// belongs there (self-service enrollment lives in Profile → Security instead).
export const mfaSetupGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    if (tokenPurpose(token) === 'mfa-enroll') {
      return true;
    }
    return router.parseUrl('/home');
  }

  localStorage.removeItem('token');
  return router.parseUrl('/login');
};

// Gate for the /onboarding wizard: only an onboarding-scoped token belongs
// there. A full workspace token goes to the app; anything else to login.
export const onboardingGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    if (tokenPurpose(token) === 'onboarding') {
      return true;
    }
    return router.parseUrl('/home');
  }

  localStorage.removeItem('token');
  return router.parseUrl('/login');
};

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenPurpose(token: string): string | null {
  const payload = decodePayload(token);
  return payload && typeof payload['purpose'] === 'string' ? (payload['purpose'] as string) : null;
}

function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload) return true; // malformed token → treat as invalid
  // `exp` is seconds since epoch. A token with no exp is treated as non-expiring.
  return typeof payload['exp'] === 'number' && Date.now() >= (payload['exp'] as number) * 1000;
}
