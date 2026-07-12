import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { COUNTRY_CODES } from '../country-codes';

// Reusable phone/mobile/fax field: a native country dialling-code <select> (emoji
// flag + code, e.g. "🇲🇾 +60") next to the number input. A native select is used on
// purpose - it renders emoji flags on mobile, its popup escapes scrollable dialogs
// (no clipping), and it's fully keyboard/screen-reader accessible. (On Windows the
// emoji flag shows as the 2-letter code - an OS limitation, not a bug.)
//
// Implements ControlValueAccessor so it binds with both `formControlName` and
// `[(ngModel)]`, reading/writing ONE combined string, e.g. "+60123456789".
@Component({
  selector: 'app-phone-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
  ],
  template: `
    <div class="phone-field">
      <select class="phone-field__code" aria-label="Country dialling code"
              [value]="code()" [disabled]="disabled()"
              (change)="onCodeChange($any($event.target).value)" (blur)="onTouchedFn()">
        @for (c of countries; track c.code) {
          <option [value]="c.code">{{ c.flag }} {{ c.code }}</option>
        }
      </select>
      <input class="phone-field__number" type="tel" inputmode="tel"
             [id]="inputId()" [value]="national()" [disabled]="disabled()"
             [placeholder]="placeholder()"
             (input)="onNumberInput($any($event.target).value)" (blur)="onTouchedFn()" />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .phone-field { display: flex; gap: var(--space-sm); width: 100%; min-width: 0; }
    /* width is set explicitly so an ancestor .form-group select / .form-group
       input (the global form standard) can't stretch the code select to full
       width and collapse the number field. */
    .phone-field__code {
      flex: 0 0 auto;
      width: auto;
      box-sizing: border-box;
      min-height: 44px;
      padding: var(--space-sm);
      font-size: var(--font-body);
      color: var(--text-primary);
      background: var(--surface-sunken);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      cursor: pointer;
    }
    .phone-field__number {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
      box-sizing: border-box;
      min-height: 44px;
      padding: var(--space-sm) var(--space-md);
      font-size: var(--font-body);
      color: var(--text-primary);
      background: var(--surface-input);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
    }
    .phone-field__code:focus, .phone-field__number:focus {
      outline: none;
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .phone-field__code:disabled, .phone-field__number:disabled {
      background: var(--surface-sunken);
      cursor: not-allowed;
    }
  `],
})
export class PhoneInputComponent implements ControlValueAccessor {
  /** Applied to the number input so an external `<label for>` still associates. */
  readonly inputId = input<string>('');
  readonly placeholder = input<string>('Phone number');

  readonly countries = COUNTRY_CODES;
  readonly code = signal('+60');
  readonly national = signal('');
  readonly disabled = signal(false);

  private onChangeFn: (value: string) => void = () => {};
  onTouchedFn: () => void = () => {};

  writeValue(value: string | null): void {
    const v = (value ?? '').toString().trim();
    if (!v) {
      this.code.set('+60');
      this.national.set('');
      return;
    }
    // Longest prefix first so e.g. "+60" wins before a shorter "+6"-style code.
    const match = [...this.countries]
      .sort((a, b) => b.code.length - a.code.length)
      .find((c) => v.startsWith(c.code));
    if (match) {
      this.code.set(match.code);
      this.national.set(v.slice(match.code.length).trim());
    } else {
      this.code.set('+60');
      this.national.set(v);
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onCodeChange(code: string): void {
    this.code.set(code);
    this.emit();
  }

  onNumberInput(value: string): void {
    this.national.set(value);
    this.emit();
  }

  // Store as code + national (no separator), matching the profile format.
  private emit(): void {
    const n = this.national().trim();
    this.onChangeFn(n ? `${this.code()}${n}` : '');
  }
}

