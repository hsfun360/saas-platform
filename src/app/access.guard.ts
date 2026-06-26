import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessService } from './services/access.service';

// Per-system authorization. A route opts in with `data: { systemModule: '<name>' }`;
// if the user can't access that module, they're redirected to /access-denied (which
// renders inside the shell). Runs AFTER authGuard, so the user is already logged in.
export const systemAccessGuard: CanActivateFn = (route) => {
  const access = inject(AccessService);
  const router = inject(Router);

  const moduleName = route.data['systemModule'] as string | undefined;
  if (access.canAccessModule(moduleName)) {
    return true;
  }
  return router.parseUrl('/access-denied');
};
