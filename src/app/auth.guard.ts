import { inject } from '@angular/core'; // Needed to use Router
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = localStorage.getItem('token'); // Look for your stored token

  console.log('Guard checking token:', token); // Add this for debugging

  if (token) {
    // User is logged in! Allow them to see the dashboard.
    return true;
  } else {
    // User is NOT logged in. Redirect them to the login page.
    console.warn('Access Denied: Redirecting to login...');
    router.navigate(['/login']);
    return false;
  }
};
