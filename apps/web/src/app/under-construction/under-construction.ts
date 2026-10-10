import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

// Placeholder shown (inside the dashboard shell) for any menu whose route has no
// component built yet — instead of silently bouncing to Home. Wired as the shell's
// child wildcard route, so the header + sidebar stay and the user keeps context.
@Component({
  selector: 'app-under-construction',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state uc-page">
      <span class="material-icons empty-icon" aria-hidden="true">construction</span>
      <h1 class="uc-page__title">Under construction</h1>
      <p><strong>{{ featureName }}</strong> isn't available yet - we're still building it. Check back soon.</p>
      <p class="cell-subtle uc-page__path">{{ path }}</p>
      <button type="button" class="btn btn--primary" (click)="goToDashboard()">
        <span class="material-icons" aria-hidden="true">space_dashboard</span>
        Back to My Dashboard
      </button>
    </div>
  `,
  styles: [`
    .uc-page { padding: var(--space-2xl) var(--space-lg); max-width: 520px; margin: 0 auto; }
    .uc-page__title { margin: var(--space-md) 0 0; font-size: var(--font-h1); color: var(--text-primary); }
    .uc-page p { margin: var(--space-sm) 0 0; }
    .uc-page__path { margin-bottom: var(--space-lg); }
  `],
})
export class UnderConstructionComponent {
  private readonly router = inject(Router);

  // The route the user tried to open (shown for context).
  get path(): string {
    return this.router.url;
  }

  // A readable feature name derived from the last URL segment, e.g.
  // /golf/tee-times -> "Tee Times", /booking-rules -> "Booking Rules".
  get featureName(): string {
    const seg = this.router.url.split('?')[0].split('/').filter(Boolean).pop();
    if (!seg) return 'This page';
    return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Return to My Dashboard (/home) - the user's personal page, always valid,
  // matching the sidebar's "My Dashboard" item (user decision 2026-07-22; the
  // old per-system dashboardRoute could itself point at an unbuilt route,
  // bouncing the user straight back here).
  goToDashboard(): void {
    this.router.navigateByUrl('/home');
  }
}
