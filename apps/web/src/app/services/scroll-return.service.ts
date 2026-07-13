import { Injectable, Injector, afterNextRender } from '@angular/core';

// Master–detail "return to row": navigating between a master list route and its
// detail route (/x vs /x/:id) destroys and recreates the component, so on the way
// back the list re-renders from scratch at the top - on mobile the user lands on
// the first card and has to scroll all the way down again. This service carries
// the open record's id across that recreation so the master can scroll the card
// the user came from back into view (and flash it for orientation).
//
// Wiring a screen:
//  - master card element:  [attr.data-return-id]="row.id"
//  - when the detail opens (the :id route renders): remember(listPath, id)
//  - in the master, after the list data lands:      consume(listPath, injector)
// listPath is the master route (e.g. '/admin/tax-schemes') so screens don't
// collide. Works for the in-app Back button AND the browser/phone back button,
// since both re-enter the master route.
@Injectable({ providedIn: 'root' })
export class ScrollReturnService {
  private readonly pending = new Map<string, string>();

  /** Record which detail record is open for the given master list. */
  remember(listPath: string, id: string): void {
    this.pending.set(listPath, id);
  }

  /**
   * If a record was remembered for this list, scroll its card into view once the
   * freshly-set list data has rendered, then forget it (one-shot).
   */
  consume(listPath: string, injector: Injector): void {
    const id = this.pending.get(listPath);
    if (!id) return;
    this.pending.delete(listPath);
    afterNextRender(
      () => {
        const el = document.querySelector<HTMLElement>(`[data-return-id="${CSS.escape(id)}"]`);
        if (!el) return; // record deleted or filtered out - nothing to return to
        el.scrollIntoView({ block: 'center' });
        el.classList.add('return-flash');
        el.addEventListener('animationend', () => el.classList.remove('return-flash'), { once: true });
      },
      { injector },
    );
  }
}
