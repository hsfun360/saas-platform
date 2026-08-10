import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';

// One sortable field a listing offers. defaultDir is the direction applied
// when the field is first selected (e.g. amounts start high-to-low); clicking
// the already-active field flips the direction - the same mental model as
// clicking a grid column header twice.
export interface SortOption {
  key: string;
  label: string;
  defaultDir?: 'asc' | 'desc';
}

export interface SortValue {
  key: string;
  dir: 'asc' | 'desc';
}

// The standard sort control for card listings - the card-list equivalent of a
// grid's clickable column headers. A labelled trigger ("Sort: Outstanding ↓",
// so the active sort is always visible) opens a popover of the sortable
// fields. Client-filtered screens apply the emitted value in their computed();
// server-paginated screens pass it as query params and reload (reference:
// ar-debtors). Popover look + item styling reuse the global .overflow-menu__*
// classes; the focus/keyboard handling mirrors shared/overflow-menu (kept in
// step by hand - change one, check the other).
@Component({
  selector: 'app-sort-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-menu" (keydown)="onKeydown($event)">
      <button
        #trigger
        type="button"
        class="btn btn--secondary btn--sm"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'Sort by ' + activeLabel() + ', ' + (value().dir === 'asc' ? 'ascending' : 'descending')"
        (click)="toggle()"
      >
        <span class="material-icons" aria-hidden="true">swap_vert</span>
        {{ activeLabel() }}
        <span class="material-icons sort-menu__dir" aria-hidden="true">{{ value().dir === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</span>
      </button>
      @if (open()) {
        <div class="overflow-menu__pop" role="menu">
          @for (o of options(); track o.key) {
            <button
              type="button"
              class="overflow-menu__item"
              role="menuitemradio"
              tabindex="-1"
              [attr.aria-checked]="o.key === value().key"
              (click)="select(o)"
            >
              {{ o.label }}
              @if (o.key === value().key) {
                <span class="material-icons sort-menu__indicator" aria-hidden="true">
                  {{ value().dir === 'asc' ? 'arrow_upward' : 'arrow_downward' }}
                </span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class SortMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  readonly options = input.required<SortOption[]>();
  readonly value = input.required<SortValue>();
  readonly valueChange = output<SortValue>();

  readonly open = signal(false);

  readonly activeLabel = computed(() => this.options().find((o) => o.key === this.value().key)?.label ?? 'Sort');

  select(option: SortOption): void {
    const current = this.value();
    const next: SortValue =
      option.key === current.key
        ? { key: option.key, dir: current.dir === 'asc' ? 'desc' : 'asc' } // re-click flips
        : { key: option.key, dir: option.defaultDir ?? 'asc' };
    this.valueChange.emit(next);
    this.close(true);
  }

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    // Zoneless: the panel renders after this tick; focus the first item then.
    setTimeout(() => this.items().at(0)?.focus());
  }

  close(refocusTrigger = false): void {
    this.open.set(false);
    if (refocusTrigger) this.trigger().nativeElement.focus();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    switch (event.key) {
      case 'Escape':
        event.stopPropagation();
        this.close(true);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(-1);
        break;
      case 'Home':
        event.preventDefault();
        this.items().at(0)?.focus();
        break;
      case 'End':
        event.preventDefault();
        this.items().at(-1)?.focus();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.overflow-menu__item'));
  }

  private moveFocus(delta: number): void {
    const items = this.items();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(current + delta + items.length) % items.length].focus();
  }
}
