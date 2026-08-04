import { ChangeDetectionStrategy, Component, Directive, ElementRef, inject, input, signal, viewChild } from '@angular/core';

// Marks a projected button as an overflow-menu item: shared styling (global
// .overflow-menu__item in styles.css) + menu a11y semantics. Items are
// tabindex=-1 because the MENU manages focus (arrow keys), not the tab order.
@Directive({
  selector: 'button[appMenuItem]',
  standalone: true,
  host: { class: 'overflow-menu__item', role: 'menuitem', tabindex: '-1' },
})
export class MenuItemDirective {}

// The standard kebab ("⋮") overflow menu for a card's SECONDARY actions - the
// list/card action-row keeps one visible primary button and folds the rest in
// here, so rows don't accumulate a button per feature. Project the actions as
// `<button appMenuItem (click)="…">` children; a click on any item closes the
// menu and returns focus to the trigger (so a dialog the item opens restores
// focus there when it closes). Styles are global in styles.css (.overflow-menu*)
// because projected content can't be styled by this component's own sheet.
//
// A11y: aria-haspopup/aria-expanded on the trigger, role=menu/menuitem, focus
// moves to the first item on open, ArrowUp/Down cycle, Home/End jump, Esc
// closes and refocuses the trigger, outside click / Tab close.
@Component({
  selector: 'app-overflow-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-menu" (keydown)="onKeydown($event)">
      <button
        #trigger
        type="button"
        class="btn btn--secondary btn--sm overflow-menu__trigger"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="label()"
        [title]="label()"
        (click)="toggle()"
      >
        <span class="material-icons" aria-hidden="true">more_vert</span>
      </button>
      @if (open()) {
        <div class="overflow-menu__pop" role="menu" (click)="onPanelClick($event)">
          <ng-content />
        </div>
      }
    </div>
  `,
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class OverflowMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  // Accessible name for the icon-only trigger, e.g. "More actions for ACME".
  readonly label = input.required<string>();

  readonly open = signal(false);

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    // Zoneless: the panel renders after this tick; focus the first item then.
    setTimeout(() => this.focusItem(0));
  }

  close(refocusTrigger = false): void {
    this.open.set(false);
    if (refocusTrigger) this.trigger().nativeElement.focus();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  onPanelClick(event: MouseEvent): void {
    // The item's own (click) handler has already run (it bubbles up from the
    // item); closing with refocus makes the trigger the "previously focused
    // element" any dialog the item opened will return to.
    if ((event.target as HTMLElement).closest('.overflow-menu__item')) this.close(true);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    switch (event.key) {
      case 'Escape':
        event.stopPropagation(); // don't also close a surrounding dialog
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
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(-1);
        break;
      case 'Tab':
        this.close(); // let focus move on naturally
        break;
    }
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.overflow-menu__item'));
  }

  private focusItem(index: number): void {
    this.items().at(index)?.focus();
  }

  private moveFocus(delta: number): void {
    const items = this.items();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(current + delta + items.length) % items.length].focus();
  }
}
