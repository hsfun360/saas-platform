import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { EmailTemplateVariable } from '../../models/auth.models';

// A compact "Insert variable" dropdown for plain-text fields (e.g. the email
// Subject). Emits the chosen variable name; the host inserts {{name}} at the
// caret. The rich body editor has its own in-toolbar menu, so this is only for
// inputs that aren't the WYSIWYG editor.
@Component({
  selector: 'app-variable-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeMenu()' },
  template: `
    <div class="vm">
      <button type="button" class="btn btn--secondary btn--sm" (click)="toggle()"
              [attr.aria-expanded]="open()" aria-haspopup="menu" [disabled]="!variables().length">
        <span class="material-icons" aria-hidden="true">data_object</span>
        Insert variable
      </button>

      @if (open()) {
        <button type="button" class="vm__backdrop" (click)="closeMenu()" aria-hidden="true" tabindex="-1"></button>
        <div class="vm__menu" role="menu">
          @for (v of variables(); track v.name) {
            <button type="button" class="vm__item" role="menuitem" (click)="choose(v.name)" [title]="v.description">
              <code>{{ '{{' }}{{ v.name }}{{ '}}' }}</code>
              <span class="vm__desc">{{ v.description }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .vm { position: relative; display: inline-block; }
    .vm__backdrop { position: fixed; inset: 0; z-index: 40; background: transparent; border: 0; cursor: default; }
    .vm__menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 50; min-width: 260px; max-width: 340px;
      max-height: 320px; overflow-y: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: var(--space-xs); }
    .vm__item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%;
      text-align: left; background: transparent; border: 0; border-radius: 6px; padding: var(--space-xs) var(--space-sm);
      cursor: pointer; min-height: 44px; }
    .vm__item:hover, .vm__item:focus-visible { background: #eef2ff; }
    .vm__item code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; color: #3730a3; }
    .vm__desc { font-size: var(--font-caption); color: #64748b; }
  `],
})
export class VariableMenuComponent {
  readonly variables = input<readonly EmailTemplateVariable[]>([]);
  readonly pick = output<string>();

  readonly open = signal(false);

  toggle(): void {
    this.open.update((o) => !o);
  }
  closeMenu(): void {
    this.open.set(false);
  }
  choose(name: string): void {
    this.pick.emit(name);
    this.closeMenu();
  }
}
