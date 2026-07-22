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
    <div style="padding: var(--space-2xl) var(--space-lg); display: flex; flex-direction: column;
                align-items: center; text-align: center;">
      <span class="material-icons" aria-hidden="true"
            style="font-size: 64px; width: 64px; height: 64px; display: inline-flex; align-items: center;
                   justify-content: center; overflow: hidden; color: #f59e0b;">construction</span>

      <h1 style="margin: var(--space-md) 0 0; font-size: var(--font-h1); color: #0f172a;">Under construction</h1>

      <p style="margin: var(--space-sm) 0 0; font-size: var(--font-body); color: #475569; max-width: 460px;">
        <strong>{{ featureName }}</strong> isn't available yet — we're still building it. Check back soon.
      </p>

      <p style="margin: var(--space-xs) 0 var(--space-lg); font-size: var(--font-body-2); color: #64748b;">
        {{ path }}
      </p>

      <button type="button" class="btn btn--primary" (click)="goToDashboard()">
        <span class="material-icons" aria-hidden="true">space_dashboard</span>
        Back to My Dashboard
      </button>
    </div>
  `,
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
