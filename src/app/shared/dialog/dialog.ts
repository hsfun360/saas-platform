import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';

// Reusable modal dialog: a popup that covers the whole viewport (full-screen on
// mobile, centred card on desktop) so the content reads as its own screen. It
// owns the chrome (overlay, title bar, scrollable body, fixed footer) and the
// accessibility behaviour required by docs/coding-standards.md — focus moves in
// on open, is trapped while open, Esc closes, and focus returns to the trigger
// on close.
//
// Usage (the footer keeps its buttons inline — opt the submit out of the mobile
// full-width rule via the global `.dlg__footer .btn`):
//   @if (show()) {
//     <app-dialog title="New company" [busy]="saving()" (close)="cancel()">
//       <form id="myForm" [formGroup]="form" (ngSubmit)="save()"> …fields… </form>
//       <ng-container dialogFooter>
//         <button type="button" class="btn btn--secondary" (click)="cancel()">Cancel</button>
//         <button type="submit" form="myForm" class="btn btn--primary">Save</button>
//       </ng-container>
//     </app-dialog>
//   }
// The submit button sits in the footer but targets the body <form> by its `form`
// attribute, so Enter-to-submit still works.
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dialog.html',
  styleUrl: './dialog.css',
})
export class DialogComponent implements OnDestroy {
  readonly title = input.required<string>();
  readonly busy = input(false); // while true, the ✕ and Esc are inert (mid-save)
  readonly close = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  // Captured at construction (during the click that opened the dialog) so focus
  // can return to the opener on close.
  private readonly trigger = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      (this.firstFocusable() ?? this.panel().nativeElement).focus();
    });
  }

  ngOnDestroy(): void {
    this.trigger?.focus();
  }

  requestClose(): void {
    if (!this.busy()) this.close.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
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

  private focusables(): HTMLElement[] {
    return Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>(
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
