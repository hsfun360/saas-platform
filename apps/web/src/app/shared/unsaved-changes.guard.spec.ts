import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { UnsavedChangesAware, unsavedChangesGuard } from './unsaved-changes.guard';

// The route-leave contract: a pristine screen never prompts; a dirty screen
// leaves only when its confirmLeave() resolves true.
describe('unsavedChangesGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function componentWith(dirty: boolean, answer: boolean): UnsavedChangesAware & { asked: boolean } {
    return {
      asked: false,
      hasUnsavedChanges: () => dirty,
      confirmLeave(): Promise<boolean> {
        this.asked = true;
        return Promise.resolve(answer);
      },
    };
  }

  it('lets a pristine screen navigate without asking', () => {
    const c = componentWith(false, false);
    expect(unsavedChangesGuard(c, route, state, state)).toBe(true);
    expect(c.asked).toBe(false);
  });

  it('asks a dirty screen and leaves when the user discards', async () => {
    const c = componentWith(true, true);
    await expect(unsavedChangesGuard(c, route, state, state)).resolves.toBe(true);
    expect(c.asked).toBe(true);
  });

  it('asks a dirty screen and stays when the user keeps editing', async () => {
    const c = componentWith(true, false);
    await expect(unsavedChangesGuard(c, route, state, state)).resolves.toBe(false);
  });
});
