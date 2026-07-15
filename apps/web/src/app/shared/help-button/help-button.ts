import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { marked } from 'marked';
import { HelpService } from '../../services/help.service';

// The header's Book icon + slide-over help panel. The icon renders only when
// the current route has a published manual (see HelpService); clicking it
// opens the manual in a right-hand drawer so staff read the guide without
// leaving the screen. Markdown is rendered with the self-hosted `marked`
// library and passed through Angular's HTML sanitizer.
@Component({
  selector: 'app-help-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (help.currentSlug(); as slug) {
      <button type="button" class="hp-btn" [title]="'User guide: ' + help.currentTitle()"
              [attr.aria-label]="'Open the user guide for ' + help.currentTitle()"
              aria-haspopup="dialog" [attr.aria-expanded]="open()"
              (click)="toggle()">
        <span class="material-icons" aria-hidden="true">menu_book</span>
      </button>
    }

    @if (open()) {
      <div class="hp-backdrop" (click)="close()" aria-hidden="true"></div>
      <aside class="hp-panel" role="dialog" aria-modal="true"
             [attr.aria-label]="'User guide: ' + help.currentTitle()"
             (keydown.escape)="close()">
        <header class="hp-head">
          <button type="button" #closeBtn class="hp-close" (click)="close()" aria-label="Close the user guide">
            <span class="material-icons" aria-hidden="true">arrow_back</span>
          </button>
          <h2 class="hp-title">{{ help.currentTitle() }}</h2>
          <button type="button" class="hp-close" (click)="close()" aria-label="Close the user guide">
            <span class="material-icons" aria-hidden="true">close</span>
          </button>
        </header>
        <div class="hp-body">
          @if (loading()) {
            <div class="hp-loading"><div class="spinner"></div><span>Loading guide…</span></div>
          } @else if (failed()) {
            <p class="hp-error" role="alert">The guide could not be loaded. Check your connection and try again.</p>
          } @else {
            <article class="hp-md" [innerHTML]="html()"></article>
          }
        </div>
      </aside>
    }
  `,
  styles: [
    `
      :host { display: inline-flex; }
      /* Bare glyph on the page surface: transparent background, theme-aware
         colour, still a 44px touch target. */
      .hp-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 44px; height: 44px;
        border: none; background: transparent; cursor: pointer;
        border-radius: 50%;
        color: var(--brand-text);
        padding: 0;
      }
      .hp-btn .material-icons { font-size: 24px; }
      .hp-btn:hover { background: var(--surface-hover); }
      /* The panel and its backdrop sit BELOW the app header (the header owns
         z-index 1100 and an ancestor stacking context caps us underneath it -
         starting at --header-height keeps our own header row, with its close
         buttons, always visible instead of hidden behind the red bar). */
      .hp-backdrop {
        position: fixed; top: var(--header-height, 0px); right: 0; bottom: 0; left: 0;
        background: var(--overlay);
        z-index: 1050;
      }
      .hp-panel {
        position: fixed; top: var(--header-height, 0px); right: 0; bottom: 0;
        width: min(480px, 100vw);
        background: var(--surface-card);
        border-left: 1px solid var(--border);
        box-shadow: var(--shadow);
        z-index: 1051;
        display: flex; flex-direction: column;
        animation: hp-slide-in 0.2s ease-out;
      }
      /* Mobile: stop above the bottom nav so its tabs stay reachable. */
      @media (max-width: 768px) {
        .hp-panel, .hp-backdrop { bottom: var(--bottom-nav-height, 0px); }
      }
      @keyframes hp-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .hp-head {
        display: flex; align-items: center; gap: var(--space-sm);
        padding: var(--space-md) var(--space-lg);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .hp-title {
        flex: 1; margin: 0;
        font-size: var(--font-h2); font-weight: var(--weight-semibold);
        color: var(--text-primary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .hp-close {
        display: inline-flex; align-items: center; justify-content: center;
        width: 44px; height: 44px;
        border: none; background: none; cursor: pointer;
        border-radius: 50%; color: var(--text-secondary);
      }
      .hp-close:hover { background: var(--surface-hover); }
      .hp-body { flex: 1; overflow-y: auto; padding: var(--space-lg); }
      .hp-loading {
        display: flex; align-items: center; gap: var(--space-sm);
        color: var(--text-muted); font-size: var(--font-body);
      }
      .hp-loading .spinner {
        width: 18px; height: 18px;
        border: 2px solid var(--border-strong); border-top-color: var(--brand);
        border-radius: 50%; animation: hp-spin 0.7s linear infinite;
      }
      @keyframes hp-spin { to { transform: rotate(360deg); } }
      .hp-error { color: var(--danger-text); font-size: var(--font-body); }

      /* Manual typography - theme-aware, compact. */
      .hp-md { color: var(--text-primary); font-size: var(--font-body); line-height: 1.6; }
      .hp-md h1 { font-size: var(--font-h1); margin: 0 0 var(--space-sm); }
      .hp-md h2 { font-size: var(--font-h2); margin: var(--space-lg) 0 var(--space-sm); border-bottom: 1px solid var(--border); padding-bottom: var(--space-xs); }
      .hp-md h3 { font-size: var(--font-body); font-weight: var(--weight-bold); margin: var(--space-md) 0 var(--space-xs); }
      .hp-md p, .hp-md ul, .hp-md ol { margin: 0 0 var(--space-sm); }
      .hp-md li { margin-bottom: var(--space-xs); }
      .hp-md blockquote {
        margin: 0 0 var(--space-md); padding: var(--space-sm) var(--space-md);
        border-left: 3px solid var(--brand);
        background: var(--surface-sunken);
        border-radius: 0 6px 6px 0;
        color: var(--text-secondary);
      }
      .hp-md blockquote p { margin: 0; }
      .hp-md code {
        background: var(--surface-sunken);
        border: 1px solid var(--border);
        border-radius: 4px; padding: 0 4px;
        font-size: 0.92em;
      }
      .hp-md table { border-collapse: collapse; width: 100%; margin: 0 0 var(--space-md); font-size: var(--font-body-2); }
      .hp-md th, .hp-md td { border: 1px solid var(--border); padding: var(--space-xs) var(--space-sm); text-align: left; vertical-align: top; }
      .hp-md th { background: var(--surface-sunken); color: var(--text-secondary); }
    `,
  ],
})
export class HelpButtonComponent {
  readonly help = inject(HelpService);

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly failed = signal(false);
  // Plain string bound via [innerHTML]: Angular's default sanitizer runs on it,
  // which is exactly right for our own committed manual content.
  readonly html = signal('');

  private lastFocus: HTMLElement | null = null;

  toggle(): void {
    this.open() ? this.close() : this.openPanel();
  }

  private openPanel(): void {
    const slug = this.help.currentSlug();
    if (!slug) return;
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.open.set(true);
    this.loading.set(true);
    this.failed.set(false);
    this.help.loadManual(slug).subscribe({
      next: (md) => {
        // [Screenshot: ...] placeholders are authoring aids; hide them from staff.
        const cleaned = md.replace(/^\[Screenshot:.*\]$/gm, '');
        this.html.set(marked.parse(cleaned, { async: false }) as string);
        this.loading.set(false);
        queueMicrotask(() => this.closeBtn()?.nativeElement.focus());
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
        queueMicrotask(() => this.closeBtn()?.nativeElement.focus());
      },
    });
  }

  close(): void {
    this.open.set(false);
    this.lastFocus?.focus();
    this.lastFocus = null;
  }
}
