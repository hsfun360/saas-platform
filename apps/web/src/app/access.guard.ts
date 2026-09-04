import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessService } from './services/access.service';
import { PermissionsService } from './services/permissions.service';

// Per-system authorization. A route opts in with `data: { moduleCode: '<CODE>' }`
// (the frozen Module.code, e.g. 'GOLF'); if the user can't access that module,
// they're redirected to /access-denied (which renders inside the shell). Runs
// AFTER authGuard, so the user is already logged in.
//
// Two checks, both UX-layer (the backend stays authoritative):
// 1. Module: is the user entitled to the system at all?
// 2. Menu: within an accessible module, the SCREEN itself must be a held menu
//    grant (PermissionsService.hasMenu, strict). Without this, a deep link to an
//    ungranted screen rendered the shell - empty state + New button - even
//    though every API call 403'd (found in the RBAC test 2026-09-03).
export const systemAccessGuard: CanActivateFn = (route, state) => {
  const access = inject(AccessService);
  const permissions = inject(PermissionsService);
  const router = inject(Router);

  const moduleCode = route.data['moduleCode'] as string | undefined;
  if (!access.canAccessModule(moduleCode)) {
    return router.parseUrl('/access-denied');
  }
  if (!permissions.hasMenu(state.url)) {
    return router.parseUrl('/access-denied');
  }
  return true;
};
