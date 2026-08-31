import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// The house CONSTRAINED combobox (built 2026-08-27 for the dimension pickers;
// reusable for any long reference list - transaction types, GL accounts, ...).
// A text input that FILTERS a fixed option list; the committed value is always
// a real option's value, never free text:
//   - focus opens the full list and selects the text so typing replaces it;
//   - typing filters by substring across the label (code AND description);
//   - ArrowUp/Down navigate, Enter commits the highlighted row, Esc closes
//     and reverts (stopped from bubbling so a host dialog stays open);
//   - leaving the field commits an exact or single-match filter, otherwise
//     REVERTS to the previous selection - a non-option is never kept;
//   - the popover flips upward when the viewport below is too short (the
//     pickers live at the bottom of scrollable dialogs).
// There is deliberately no component library in this app - this is the one
// shared implementation; do not hand-roll another autocomplete.
export interface ComboOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-combobox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combobox.html',
  styleUrls: ['./combobox.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComboboxComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly options = input<ComboOption[]>([]);
  readonly value = input<string>('');
  readonly inputId = input<string>('');
  readonly placeholder = input<string>('Type to search…');
  readonly allowEmpty = input<boolean>(true);
  readonly emptyLabel = input<string>('— None —');
  readonly disabled = input<boolean>(false);
  readonly valueChange = output<string>();

  readonly open = signal(false);
  readonly highlighted = signal(0);
  // Viewport-FIXED popover coordinates (computed from the input's rect at
  // open): fixed positioning escapes every clipping container - the section
  // card, the dialog body's scroll, overflow rules - so the list is always
  // fully visible. top XOR bottom is set (bottom = the list opens upward when
  // the space below is too short). Outside scroll/resize closes the list
  // rather than chasing the field around.
  readonly popRect = signal<{ left: number; width: number; top: number | null; bottom: number | null }>(
    { left: 0, width: 0, top: null, bottom: null },
  );
  // The text while EDITING; null = not editing, show the selection's label.
  private readonly draft = signal<string | null>(null);

  private static seq = 0;
  readonly listId = `combo-list-${(ComboboxComponent.seq += 1)}`;

  readonly selectedLabel = computed(() => {
    const v = this.value();
    if (!v) return '';
    return this.options().find((o) => o.value === v)?.label || '';
  });

  displayText(): string {
    const d = this.draft();
    return d !== null ? d : this.selectedLabel();
  }

  // The rows shown: the None row (when allowed) + the filtered options.
  readonly rows = computed<ComboOption[]>(() => {
    const q = (this.draft() || '').trim().toLowerCase();
    const filtered = q
      ? this.options().filter((o) => o.label.toLowerCase().includes(q))
      : this.options();
    return this.allowEmpty() ? [{ value: '', label: this.emptyLabel() }, ...filtered] : filtered;
  });

  onFocus(el: HTMLInputElement): void {
    if (this.disabled()) return;
    el.select();
    this.openList();
  }

  onInput(text: string): void {
    this.draft.set(text);
    if (!this.open()) this.openList();
    // Re-point the highlight at the first REAL match (skip the None row).
    const rows = this.rows();
    this.highlighted.set(Math.min(this.allowEmpty() && rows.length > 1 ? 1 : 0, rows.length - 1));
  }

  onKeydown(e: KeyboardEvent): void {
    if (this.disabled()) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.open()) { this.openList(); return; }
      const n = this.rows().length;
      if (!n) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      this.highlighted.set((this.highlighted() + delta + n) % n);
      this.scrollHighlightIntoView();
    } else if (e.key === 'Enter') {
      // Never let Enter fall through to the surrounding form's submit.
      e.preventDefault();
      if (!this.open()) { this.openList(); return; }
      const row = this.rows()[this.highlighted()];
      if (row) this.commit(row.value);
    } else if (e.key === 'Escape') {
      if (this.open()) {
        // Close ONLY the popover - a host dialog's own Esc must not fire.
        e.stopPropagation();
        this.closeList();
      }
    } else if (e.key === 'Tab') {
      this.settle();
    }
  }

  // Leaving the component entirely: settle the draft (commit or revert).
  onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    this.settle();
  }

  // Rows commit on mousedown (before the input's blur can revert the draft).
  onOptionMousedown(e: MouseEvent, row: ComboOption): void {
    e.preventDefault();
    this.commit(row.value);
  }

  onToggleMousedown(e: MouseEvent, el: HTMLInputElement): void {
    if (this.disabled()) return;
    e.preventDefault();
    if (this.open()) { this.closeList(); return; }
    el.focus();
    this.openList();
  }

  optionRowId(i: number): string {
    return `${this.listId}-opt-${i}`;
  }

  activeDescendant(): string | null {
    return this.open() ? this.optionRowId(this.highlighted()) : null;
  }

  private openList(): void {
    const input = this.host.nativeElement.querySelector('input') as HTMLElement | null;
    if (input) {
      const rect = input.getBoundingClientRect();
      // Flip upward when the space below the field is too short for the list.
      const up = window.innerHeight - rect.bottom < 260;
      this.popRect.set({
        left: rect.left,
        width: rect.width,
        top: up ? null : rect.bottom + 2,
        bottom: up ? window.innerHeight - rect.top + 2 : null,
      });
    }
    this.open.set(true);
    // Start the highlight on the current selection.
    const rows = this.rows();
    const i = rows.findIndex((r) => r.value === this.value());
    this.highlighted.set(i >= 0 ? i : 0);
    window.addEventListener('scroll', this.onOutsideScroll, true);
    window.addEventListener('resize', this.onWindowResize);
  }

  private closeList(): void {
    this.open.set(false);
    this.draft.set(null);
    window.removeEventListener('scroll', this.onOutsideScroll, true);
    window.removeEventListener('resize', this.onWindowResize);
    this.syncInputDom();
  }

  // Belt-and-braces DOM write: the [value] binding proved unreliable at
  // REVERTING typed text under zoneless change detection (the typed draft
  // stayed visible after settle() dropped it), so every close writes the
  // display text straight onto the input. commit() overrides with the newly
  // committed label, since the parent's [value] echo has not landed yet.
  private syncInputDom(text?: string): void {
    const input = this.host.nativeElement.querySelector('input') as HTMLInputElement | null;
    if (input) input.value = text !== undefined ? text : this.displayText();
  }

  // A fixed-position popover cannot follow the field when its container
  // scrolls - close instead (same outcome as clicking away). Scrolling INSIDE
  // the option list itself stays open.
  private readonly onOutsideScroll = (e: Event) => {
    const t = e.target as Node | null;
    if (t && this.host.nativeElement.contains(t)) return;
    this.closeList();
  };
  private readonly onWindowResize = () => this.closeList();

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onOutsideScroll, true);
    window.removeEventListener('resize', this.onWindowResize);
  }

  private commit(v: string): void {
    if (v !== this.value()) this.valueChange.emit(v);
    this.closeList();
    this.syncInputDom(v ? (this.options().find((o) => o.value === v)?.label || '') : '');
  }

  // Field left with an uncommitted draft: an exact label match commits, a
  // cleared field commits None (when allowed), a single filtered match is
  // forgiving and commits too - anything else reverts to the selection.
  private settle(): void {
    const d = this.draft();
    if (d === null) { this.open.set(false); return; }
    const q = d.trim().toLowerCase();
    if (!q) {
      if (this.allowEmpty()) { this.commit(''); return; }
      this.closeList();
      return;
    }
    const exact = this.options().find((o) => o.label.toLowerCase() === q);
    if (exact) { this.commit(exact.value); return; }
    const matches = this.options().filter((o) => o.label.toLowerCase().includes(q));
    if (matches.length === 1) { this.commit(matches[0].value); return; }
    this.closeList();
  }

  private scrollHighlightIntoView(): void {
    const el = document.getElementById(this.optionRowId(this.highlighted()));
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
}
