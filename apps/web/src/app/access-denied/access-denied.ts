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
    <div class="empty-state ad-page">
      <span class="material-icons empty-icon ad-page__icon--danger" aria-hidden="true">lock</span>
      <h1 class="ad-page__title">Access denied</h1>
      <p>You don't have access to this area. If you think this is a mistake, ask your administrator to grant you the relevant role or module.</p>
      <button type="button" class="btn btn--primary" (click)="goToDashboard()">
        <span class="material-icons" aria-hidden="true">dashboard</span>
        Back to My Dashboard
      </button>
    </div>
  `,
  styles: [`
    .ad-page { padding: var(--space-2xl) var(--space-lg); max-width: 520px; margin: 0 auto; }
    .ad-page__title { margin: var(--space-md) 0 0; font-size: var(--font-h1); color: var(--text-primary); }
    .ad-page p { margin: var(--space-sm) 0 var(--space-lg); }
    .ad-page__icon--danger { color: var(--danger-text); }
  `],
})
export class AccessDeniedComponent {
  private readonly router = inject(Router);

  goToDashboard(): void {
    // My Dashboard (/home) is the one home page - the per-system landing
    // pages (and the ActiveSystemService that tracked them) are gone.
    this.router.navigateByUrl('/home');
  }
}
