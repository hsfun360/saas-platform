import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from '../../models/auth.models';
import { FavoritesService } from '../../services/favorites.service';

// The bookmark star beside a screen's title: click to pin/unpin the screen on
// My Dashboard's Quick access. Drop `<app-fav-star />` inside the header <h1>,
// right after the screenTitle - the same per-screen convention as the title
// pipes. Renders NOTHING when the current route isn't menu-backed (hardcoded
// admin screens, portals), so only grantable screens can be starred.
@Component({
  selector: 'app-fav-star',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (menuRoute(); as route) {
      <button
        type="button"
        class="fav-star"
        [class.fav-star--on]="isOn()"
        (click)="toggle()"
        [attr.aria-pressed]="isOn()"
        [attr.aria-label]="isOn() ? 'Remove this screen from My Dashboard quick access' : 'Add this screen to My Dashboard quick access'"
        [title]="isOn() ? 'Remove from My Dashboard' : 'Add to My Dashboard'"
      >
        <span class="material-icons" aria-hidden="true">{{ isOn() ? 'star' : 'star_border' }}</span>
      </button>
    }
  `,
  styles: [
    `
      :host {
        display: inline-block;
        vertical-align: middle;
      }
      /* 44px touch target that doesn't stretch the h1 line box. */
      .fav-star {
        width: 44px;
        height: 44px;
        margin: -12px 0 -12px var(--space-xs);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        color: var(--text-muted);
      }
      .fav-star:hover {
        background: var(--surface-hover);
        color: var(--text-secondary);
      }
      .fav-star--on,
      .fav-star--on:hover {
        color: var(--accent);
      }
      .fav-star .material-icons {
        font-size: 22px;
      }
    `,
  ],
})
export class FavStarComponent {
  private readonly router = inject(Router);
  private readonly favorites = inject(FavoritesService);

  constructor() {
    this.favorites.ensureLoaded();
  }

  // Resolve the screen's granted menu route once - the component lives inside
  // the screen's template, so it is recreated on every navigation.
  readonly menuRoute = computed<string | null>(() => {
    const path = this.router.url.split('?')[0].split('#')[0];
    const segments = path.split('/').filter(Boolean);
    let menus: MenuItem[] = [];
    try {
      menus = JSON.parse(localStorage.getItem('userMenus') || '[]');
    } catch {
      menus = [];
    }
    for (let take = segments.length; take >= 1; take--) {
      const candidate = '/' + segments.slice(0, take).join('/');
      if (menus.some((m) => m.route === candidate)) return candidate;
    }
    return null;
  });

  readonly isOn = computed(() => {
    const route = this.menuRoute();
    return route !== null && this.favorites.routeSet().has(route);
  });

  toggle(): void {
    const route = this.menuRoute();
    if (route) this.favorites.toggle(route);
  }
}
