import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DialogComponent } from '../dialog/dialog';

// One destructive-action confirmation: what is about to happen, in plain words,
// and the button that names the outcome ("Delete", "Remove", "Transfer").
// Screens hold a `signal<ConfirmRequest | null>` and render
//   @if (confirmAction(); as c) { <app-confirm-dialog [request]="c" (cancelled)="confirmAction.set(null)" /> }
// `run` is called once the user confirms; the screen closes the dialog itself
// (set the signal to null) and lets its row-level busy state show progress,
// exactly as the old window.confirm() flow did, but with the shared centred
// <app-dialog> look, focus trap, Esc and focus return.
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  // false for a non-destructive but consequential action (e.g. a transfer).
  danger?: boolean;
  run: () => void;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <app-dialog [title]="request().title" (close)="cancelled.emit()">
      <p style="margin: 0;">{{ request().message }}</p>
      <ng-container dialogFooter>
        <button type="button" class="btn btn--secondary" (click)="cancelled.emit()">Cancel</button>
        <button type="button" class="btn" [class.btn--danger]="request().danger !== false" [class.btn--primary]="request().danger === false" (click)="request().run()">
          {{ request().confirmLabel }}
        </button>
      </ng-container>
    </app-dialog>
  `,
})
export class ConfirmDialogComponent {
  readonly request = input.required<ConfirmRequest>();
  readonly cancelled = output<void>();
}
