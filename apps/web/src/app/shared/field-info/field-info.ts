import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, input, signal } from '@angular/core';

// The house field-info popover (standard 2026-10-18, piloted on Golf
// Specification): a small (i) icon button beside a field label that holds the
// LONG behavioural explanation, so the form keeps at most one short inline
// hint per field and the page stays scannable.
// Deliberately NOT a hover-only tooltip - touch devices have no hover and the
// keyboard-only entry standard needs it operable: hovering the icon shows the
// text, clicking (or Enter/Space on the focused icon) pins it open, Esc /
// outside click / outside scroll closes. The popover is plain text (no
// focusable content), so focus stays on the icon and aria-expanded carries
// the state; the icon is a real tabbable button (reachability), placed after
// the label text so it never interrupts the label-to-field focus flow.
// The panel is viewport-fixed (like the combobox popover) so section cards
// and dialog bodies can never clip it, flipping above the icon when the
// space below is short.
@Component({
  selector: 'app-field-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="fi-btn"
            [attr.aria-label]="label() ? 'About ' + label() : 'More information'"
            [attr.aria-expanded]="open()"
            (click)="toggle()"
            (mouseenter)="hoverOpen()"
            (mouseleave)="hoverClose()"
            (keydown)="onKeydown($event)">
      <span class="material-icons" aria-hidden="true">info_outline</span>
    </button>
    @if (open()) {
      <div class="fi-pop" role="note"
           [style.left.px]="pop().left"
           [style.top.px]="pop().top"
           [style.bottom.px]="pop().bottom"
           [style.maxWidth.px]="pop().width">{{ text() }}</div>
    }
  `,
  styles: `
    :host { display: inline-flex; vertical-align: middle; }
    .fi-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      padding: 0;
      margin-left: var(--space-xs);
      cursor: help;
      color: var(--text-muted);
      border-radius: 50%;
    }
    .fi-btn:hover { color: var(--brand-text); }
    .fi-btn .material-icons { font-size: 18px; }
    .fi-pop {
      position: fixed;
      z-index: 1400; /* above the dialog overlay (1200) and flash (1300) */
      background: var(--surface-card);
      color: var(--text-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: var(--space-sm) var(--space-md);
      font-size: var(--font-body-2);
      font-weight: var(--weight-regular);
      line-height: 1.5;
      text-align: left;
      text-transform: none;
      letter-spacing: normal;
      white-space: normal;
    }
  `,
})
export class FieldInfoComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  // The field's label, for the icon's accessible name ("About <label>").
  readonly label = input<string>('');
  // The explanation shown in the popover.
  readonly text = input<string>('');

  readonly open = signal(false);
  // true once the user clicked/pressed the icon: hover-out no longer closes.
  private pinned = false;
  readonly pop = signal<{ left: number; top: number | null; bottom: number | null; width: number }>(
    { left: 0, top: null, bottom: null, width: 360 },
  );

  toggle(): void {
    if (this.pinned && this.open()) {
      this.close();
    } else {
      this.pinned = true;
      this.show();
    }
  }

  hoverOpen(): void {
    if (!this.open()) this.show();
  }

  hoverClose(): void {
    if (!this.pinned) this.close();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.open()) {
      e.stopPropagation(); // a host dialog's own Esc must not fire
      this.close();
    }
  }

  private show(): void {
    const btn = this.host.nativeElement.querySelector('button') as HTMLElement | null;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const up = window.innerHeight - rect.bottom < 180;
    this.pop.set({
      left,
      width,
      top: up ? null : rect.bottom + 6,
      bottom: up ? window.innerHeight - rect.top + 6 : null,
    });
    this.open.set(true);
    document.addEventListener('mousedown', this.onOutsidePress, true);
    window.addEventListener('scroll', this.onOutsideScroll, true);
    window.addEventListener('resize', this.onViewportChange);
  }

  private close(): void {
    this.pinned = false;
    this.open.set(false);
    document.removeEventListener('mousedown', this.onOutsidePress, true);
    window.removeEventListener('scroll', this.onOutsideScroll, true);
    window.removeEventListener('resize', this.onViewportChange);
  }

  private readonly onOutsidePress = (e: Event): void => {
    const t = e.target as Node | null;
    if (t && this.host.nativeElement.contains(t)) return;
    this.close();
  };

  // A fixed panel cannot follow its icon when the page scrolls - close, same
  // outcome as clicking away (matches the combobox popover behaviour).
  private readonly onOutsideScroll = (e: Event): void => {
    const t = e.target as Node | null;
    if (t && this.host.nativeElement.contains(t)) return;
    this.close();
  };

  private readonly onViewportChange = (): void => this.close();

  ngOnDestroy(): void {
    document.removeEventListener('mousedown', this.onOutsidePress, true);
    window.removeEventListener('scroll', this.onOutsideScroll, true);
    window.removeEventListener('resize', this.onViewportChange);
  }
}
