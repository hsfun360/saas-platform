import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

// Shown (inside the dashboard shell) when a user navigates to a system/area they
// don't have access to — see access.guard.ts. The backend is still the
// authoritative gate on data; this is the friendly UX when route access is denied.
@Component({
  selector: 'app-access-denied',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding: var(--space-2xl) var(--space-lg); display: flex; flex-direction: column;
                align-items: center; text-align: center;">
      <span class="material-icons" aria-hidden="true"
            style="font-size: 64px; width: 64px; height: 64px; display: inline-flex; align-items: center;
                   justify-content: center; overflow: hidden; color: var(--danger-text);">lock</span>

      <h1 style="margin: var(--space-md) 0 0; font-size: var(--font-h1); color: var(--text-primary);">Access denied</h1>

      <p style="margin: var(--space-sm) 0 var(--space-lg); font-size: var(--font-body); color: var(--text-secondary); max-width: 460px;">
        You don't have access to this area. If you think this is a mistake, ask your administrator
        to grant you the relevant role or module.
      </p>

      <button type="button" class="btn btn--primary" (click)="goToDashboard()">
        <span class="material-icons" aria-hidden="true">dashboard</span>
        Back to My Dashboard
      </button>
    </div>
  `,
})
export class AccessDeniedComponent {
  private readonly router = inject(Router);

  goToDashboard(): void {
    // My Dashboard (/home) is the one home page - the per-system landing
    // pages (and the ActiveSystemService that tracked them) are gone.
    this.router.navigateByUrl('/home');
  }
}
