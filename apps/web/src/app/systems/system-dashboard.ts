import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

// Placeholder landing/dashboard shown when a user enters a "system" (a Module:
// Platform, Membership, Golf, Facility…). One component, configured per route via
// `data` for now — each system gets its OWN real dashboard component (talking to
// its own service API) as it is built. Lives in the shared shell's router-outlet.
@Component({
  selector: 'app-system-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding: var(--space-lg); max-width: 900px;">
      <div style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
        <span class="material-icons" aria-hidden="true"
              style="font-size: 40px; width: 40px; height: 40px; color: #2563eb;">{{ icon() }}</span>
        <div>
          <h1 style="margin: 0; font-size: var(--font-h1); color: #0f172a;">{{ title() }}</h1>
          @if (blurb()) {
            <p style="margin: 2px 0 0; color: #64748b; font-size: var(--font-body-2);">{{ blurb() }}</p>
          }
        </div>
      </div>

      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: var(--space-xl); text-align: center; color: #64748b;">
        <span class="material-icons" aria-hidden="true" style="font-size: 32px; width: 32px; height: 32px; color: #94a3b8;">dashboard_customize</span>
        <p style="margin: var(--space-sm) 0 0; font-size: var(--font-body);">
          This is the <strong>{{ title() }}</strong> dashboard. It's a placeholder for now —
          this is where this system's overview, key metrics and shortcuts will live.
        </p>
        <p style="margin: var(--space-xs) 0 0; font-size: var(--font-body-2);">
          Use the apps switcher (top bar) to move between systems; the side menu shows this system's screens.
        </p>
      </div>
    </div>
  `,
})
export class SystemDashboardComponent {
  private readonly route = inject(ActivatedRoute);

  readonly title = signal('Dashboard');
  readonly icon = signal('dashboard');
  readonly blurb = signal('');

  constructor() {
    // Subscribe (not snapshot) so it updates when navigating between systems that
    // reuse this same component.
    this.route.data.pipe(takeUntilDestroyed()).subscribe((d) => {
      this.title.set(d['title'] || 'Dashboard');
      this.icon.set(d['icon'] || 'dashboard');
      this.blurb.set(d['blurb'] || '');
    });
  }
}
