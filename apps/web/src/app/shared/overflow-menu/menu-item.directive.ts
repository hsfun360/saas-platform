import { Directive } from '@angular/core';

// Marks a projected button as an overflow-menu item: shared styling (global
// .overflow-menu__item in styles.css) + menu a11y semantics. Items are
// tabindex=-1 because the MENU manages focus (arrow keys), not the tab order.
// Project it inside <app-overflow-menu> as `<button type="button" appMenuItem>`.
@Directive({
  selector: 'button[appMenuItem]',
  standalone: true,
  host: { class: 'overflow-menu__item', role: 'menuitem', tabindex: '-1' },
})
export class MenuItemDirective {}
