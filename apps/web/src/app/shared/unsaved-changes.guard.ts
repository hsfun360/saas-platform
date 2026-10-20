import { CanDeactivateFn } from '@angular/router';

// Route-leave unsaved-changes guard (standard 2026-10-20, piloted on Golf
// Specification): a page-level settings FORM must not be navigable away from
// while dirty without asking - the sidebar menu, browser Back and any
// router.navigate all pause here until the user chooses Discard or stays.
// This is the routed-screen counterpart of <app-dialog>'s [dirty] guard.
//
// The screen owns the confirmation UI (the shared <app-confirm-dialog>, with
// [backTrap]="false" because the router navigation is paused while it shows):
//   readonly leaveConfirm = signal<ConfirmRequest | null>(null);
//   hasUnsavedChanges(): boolean { return this.form.dirty && !this.saving(); }
//   confirmLeave(): Promise<boolean> { ... resolve(true) on Discard ... }
// plus a `(window:beforeunload)` host binding for refresh / tab close (the
// only leave path the browser lets us guard natively).
// Route: `canDeactivate: [unsavedChangesGuard]`.
export interface UnsavedChangesAware {
  hasUnsavedChanges(): boolean;
  confirmLeave(): Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<UnsavedChangesAware> = (component) =>
  component.hasUnsavedChanges() ? component.confirmLeave() : true;
