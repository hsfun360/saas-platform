import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, inject, input, output } from '@angular/core';

// One confirmation look app-wide (restyled 2026-10-20, user feedback: the
// full-dialog chrome - title band, body borders, footer - read as stray lines
// next to the drawer's minimal in-dialog discard card). A confirmation is a
// COMPACT CARD: title, message, two buttons - the exact layout of
// <app-dialog>'s internal discard confirmation - not a full dialog.
// Screens hold a `signal<ConfirmRequest | null>` and render
//   @if (confirmAction(); as c) { <app-confirm-dialog [request]="c" (cancelled)="confirmAction.set(null)" /> }
// `run` is called once the user confirms; the screen closes the card itself
// (set the signal to null) and lets its row-level busy state show progress.
// A11y: role=alertdialog, focus lands on the SAFE button (cancel) so an
// accidental Enter never destroys anything, Tab cycles the two buttons, Esc
// cancels, and focus returns to the trigger on close. No history trap - a
// confirmation is short-lived and may open during a paused router navigation
// (the route-leave guard), where a pushed history entry would fight the
// navigation.
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  // The safe button's label; defaults to "Cancel" ("Keep editing" for
  // unsaved-changes confirms, matching the drawer's discard card).
  cancelLabel?: string;
  // false for a non-destructive but consequential action (e.g. a transfer).
  danger?: boolean;
  run: () => void;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cfm-overlay" (keydown)="onKeydown($event)">
      <div class="cfm-card" role="alertdialog" aria-modal="true" [attr.aria-label]="request().title">
        <h3 class="cfm-title">{{ request().title }}</h3>
        <p class="cfm-msg">{{ request().message }}</p>
        <div class="cfm-actions">
          <button type="button" class="btn btn--secondary" #safeBtn (click)="cancelled.emit()">
            {{ request().cancelLabel || 'Cancel' }}
          </button>
          <button type="button" class="btn" [class.btn--danger]="request().danger !== false" [class.btn--primary]="request().danger === false" (click)="request().run()">
            {{ request().confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .cfm-overlay {
      position: fixed;
      inset: 0;
      z-index: 1250; /* above the dialog overlay (1200), under the flash (1300) */
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-lg);
      background: var(--overlay);
    }
    .cfm-card {
      width: 100%;
      max-width: 400px;
      background: var(--surface-card);
      border-radius: 12px;
      padding: var(--space-lg);
      box-shadow: var(--shadow);
    }
    .cfm-title {
      margin: 0 0 var(--space-sm);
      font-size: var(--font-h3);
      font-weight: var(--weight-semibold);
      color: var(--text-primary);
    }
    .cfm-msg {
      margin: 0 0 var(--space-lg);
      font-size: var(--font-body-2);
      color: var(--text-secondary);
    }
    .cfm-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: nowrap;
      gap: var(--space-sm);
    }
  `,
})
export class ConfirmDialogComponent implements OnDestroy {
  readonly request = input.required<ConfirmRequest>();
  readonly cancelled = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // Captured at construction (during the click that opened the confirm) so
  // focus can return to the opener on close.
  private readonly trigger = document.activeElement as HTMLElement | null;

  constructor() {
    // Focus the SAFE button so an accidental Enter never confirms.
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.btn--secondary')?.focus();
    });
  }

  ngOnDestroy(): void {
    this.trigger?.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // a host dialog behind must not also close
      this.cancelled.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    // Trap focus between the two buttons.
    const buttons = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('button'));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
