import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Gate for the authenticated shell: requires a token that is present AND not
// expired. (HTTP 401s are also handled by the interceptor, which logs out — this
// rejects a stale token up front so the shell never even renders for it.)
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    return true;
  }

  // No token, or expired / malformed — drop it and send to login.
  localStorage.removeItem('token');
  return router.parseUrl('/login');
};

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // `exp` is seconds since epoch. A token with no exp is treated as non-expiring.
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch {
    return true; // malformed token → treat as invalid
  }
}
