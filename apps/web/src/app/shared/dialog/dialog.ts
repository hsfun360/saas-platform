import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

// Reusable modal dialog: a popup that covers the whole viewport (full-screen on
// mobile, centred card on desktop) so the content reads as its own screen. It
// owns the chrome (overlay, title bar, scrollable body, fixed footer) and the
// accessibility behaviour required by docs/coding-standards.md — focus moves in
// on open, is trapped while open, Esc closes, and focus returns to the trigger
// on close.
//
// Unsaved-changes guard (opt-in): bind [dirty] to whether the projected form
// currently holds unsaved edits — `form.dirty` for a reactive FormGroup, or
// `f.dirty` from a template ref `#f="ngForm"` for a template-driven form (both
// stay pristine until the user actually edits a field). When it is true, any
// attempt to leave — Cancel (routed through requestClose), the ✕, Esc, the
// browser Back button / mobile back gesture, or a browser refresh / tab close —
// is intercepted: in-app closes and Back show a styled "discard?" confirmation
// over the form, and a browser unload triggers the native "Leave site?" prompt.
//
// Back handling: opening a dialog pushes a same-URL history entry so Back is
// caught here (via popstate) instead of navigating the whole screen away and
// silently dropping the edits. Back on a pristine form dismisses the dialog;
// on a dirty form it shows the discard confirmation. The pushed entry is
// cleaned up when the dialog closes by any other path.
//
// Usage (the footer keeps its buttons inline — opt the submit out of the mobile
// full-width rule via the global `.dlg__footer .btn`):
//   @if (show()) {
//     <app-dialog #dlg title="New item" [busy]="saving()"
//                 [dirty]="f.dirty" (close)="cancel()">
//       <form id="myForm" #f="ngForm" (ngSubmit)="save()"> …ngModel fields… </form>
//       <ng-container dialogFooter>
//         <button type="button" class="btn btn--secondary" (click)="dlg.requestClose()">Cancel</button>
//         <button type="submit" form="myForm" class="btn btn--primary">Save</button>
//       </ng-container>
//     </app-dialog>
//   }
// Route the footer Cancel through `dlg.requestClose()` (not straight to the
// component) so it passes through the same guard as the ✕ and Esc. The submit
// button sits in the footer but targets the body <form> by its `form` attribute,
// so Enter-to-submit still works.
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dialog.html',
  styleUrl: './dialog.css',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class DialogComponent implements OnDestroy {
  readonly title = input.required<string>();
  readonly busy = input(false); // while true, the ✕ and Esc are inert (mid-save)
  readonly close = output<void>();

  // Unsaved-changes guard — see the class comment. Default: never dirty (off).
  // Typed nullable because NgForm.dirty is `boolean | null`; every read is a
  // truthy check so null/undefined behave as "not dirty".
  readonly dirty = input<boolean | null | undefined>(false);
  readonly discardTitle = input('Discard unsaved changes?');
  readonly discardMessage = input(
    'Your changes have not been saved and will be lost if you leave this form.',
  );

  // True while the in-dialog "discard?" confirmation is shown over the form.
  readonly confirming = signal(false);

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly keepBtn = viewChild<ElementRef<HTMLElement>>('keepBtn');
  // Captured at construction (during the click that opened the dialog) so focus
  // can return to the opener on close.
  private readonly trigger = document.activeElement as HTMLElement | null;
  // The last field the user was in inside the form body — so "Keep editing"
  // returns the cursor exactly where they left off, not to the first field.
  private lastBodyFocus: HTMLElement | null = null;
  // True while a same-URL history entry we pushed to trap the browser Back
  // button is still live (i.e. not yet consumed by a Back press).
  private pushedGuardEntry = false;

  constructor() {
    // Trap browser Back / mobile back while the dialog is open: push a same-URL
    // history entry so a Back press pops THIS instead of navigating the whole
    // editing screen away (which would silently drop the user's edits).
    history.pushState({ appDialogGuard: true }, '');
    this.pushedGuardEntry = true;
    window.addEventListener('popstate', this.onPopState);

    afterNextRender(() => {
      (this.firstFocusable() ?? this.panel().nativeElement).focus();
    });
    // When the discard confirmation appears, move focus to its safe default
    // ("Keep editing") so an accidental Enter never discards the user's work.
    effect(() => {
      if (this.confirming()) this.keepBtn()?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.onPopState);
    // If the dialog is closing by any path OTHER than Back (Cancel / ✕ / Esc /
    // Discard / save), our trap entry is still in history — consume it so a later
    // Back press isn't a dead no-op. The listener is already removed and the URL
    // is unchanged, so this neither re-enters here nor triggers a route change.
    // Guard on our own history-state marker so that if the dialog was instead
    // torn down by a forward navigation (a new entry sits on top of ours), we do
    // NOT history.back() and yank the user off the page they navigated to.
    const state = history.state as { appDialogGuard?: boolean } | null;
    if (this.pushedGuardEntry && state?.appDialogGuard === true) {
      this.pushedGuardEntry = false;
      history.back();
    }
    this.trigger?.focus();
  }

  // Browser Back / mobile back while the dialog is open. Our trap entry was just
  // popped; route the intent through the same guard as the ✕/Cancel.
  private readonly onPopState = (): void => {
    this.pushedGuardEntry = false; // consumed by this Back press
    if (this.busy()) {
      this.reTrap(); // mid-save: keep the user here
      return;
    }
    if (this.dirty()) {
      this.reTrap(); // re-arm so we stay on the screen while confirming
      this.confirming.set(true);
    } else {
      this.close.emit(); // pristine: Back simply dismisses the dialog
    }
  };

  // Re-push the Back trap (after a Back press we chose not to honour yet).
  private reTrap(): void {
    history.pushState({ appDialogGuard: true }, '');
    this.pushedGuardEntry = true;
  }

  // A leave attempt via the ✕ or Cancel (footer routes here) or Esc. If the form
  // is dirty, show the discard confirmation instead of closing outright.
  requestClose(): void {
    if (this.busy() || this.confirming()) return;
    if (this.dirty()) {
      this.confirming.set(true);
    } else {
      this.close.emit();
    }
  }

  // Confirmation choices.
  discardChanges(): void {
    this.confirming.set(false);
    this.close.emit();
  }

  keepEditing(): void {
    this.confirming.set(false);
    // Return the cursor to the field the user left off in; fall back to the
    // first field only if that element is gone or disabled.
    const last = this.lastBodyFocus;
    if (last?.isConnected && !last.hasAttribute('disabled')) {
      last.focus();
    } else {
      (this.firstFocusable() ?? this.panel().nativeElement).focus();
    }
  }

  // Remember the last field focused inside the form body (ignores the ✕, footer
  // buttons and the confirmation, which live outside .dlg__body) so keepEditing()
  // can restore it.
  onFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    const body = this.panel().nativeElement.querySelector('.dlg__body');
    if (target && body?.contains(target)) this.lastBodyFocus = target;
  }

  // Browser refresh / tab close / hard navigation while the form is dirty →
  // native "Leave site?" prompt (the only leave path the browser lets us guard).
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = ''; // legacy browsers require a set returnValue
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirming()) this.keepEditing();
      else this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.focusables();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // While the discard confirmation is up, trap focus inside it (not the form
  // behind it); otherwise trap across the whole panel.
  private focusables(): HTMLElement[] {
    const panel = this.panel().nativeElement;
    const scope = this.confirming()
      ? panel.querySelector<HTMLElement>('.dlg__confirm') ?? panel
      : panel;
    return Array.from(
      scope.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  // Prefer the first real field over the ✕ button for initial focus.
  private firstFocusable(): HTMLElement | null {
    const all = this.focusables();
    return all.find((el) => !el.classList.contains('dlg__close')) ?? all[0] ?? null;
  }
}

