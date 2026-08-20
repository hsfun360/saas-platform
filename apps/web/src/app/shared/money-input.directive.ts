import { Directive, ElementRef, effect, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Money mask for amount fields: the input always DISPLAYS two decimals ("0.00",
// "1250.50") while the value carried by the form stays a plain number. Formatting
// happens on seed and on blur - never while the user is typing, so the caret is
// never disturbed.
//
// Two ways to use it (both keep the field's native type="number" attributes):
//  - Reactive control (preferred):  <input appMoney formControlName="amount">
//    Acts as the ControlValueAccessor: form.reset({amount: 0}) shows "0.00",
//    typing emits the parsed number (null when empty), blur re-formats and emits
//    the value rounded to 2dp.
//  - Display-only mask:             <input appMoney [moneyValue]="row.amount" (input)="...">
//    For rows kept outside a FormGroup. The existing (input) handler still owns
//    the state; the directive only formats the displayed text (when the field is
//    not focused, and on blur).
@Directive({
  selector: 'input[appMoney]',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInputDirective), multi: true },
  ],
  host: {
    '(input)': 'handleInput()',
    '(blur)': 'handleBlur()',
    '(focus)': 'handleFocus()',
    '(mouseup)': 'handleMouseUp($event)',
    '(wheel)': 'handleWheel($event)',
  },
})
export class MoneyInputDirective implements ControlValueAccessor {
  /** Display value for non-reactive usage (ignored when bound to a form control). */
  readonly moneyValue = input<number | string | null | undefined>(undefined);

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Non-reactive usage: re-format whenever the bound value changes, but never
    // under the user's caret (their (input) handler echoes the value back here
    // on every keystroke - formatting then would garble typing).
    effect(() => {
      const v = this.moneyValue();
      if (v === undefined) return;
      if (document.activeElement !== this.el) this.el.value = this.format(v);
    });
  }

  // ---- ControlValueAccessor (reactive usage) ----

  writeValue(value: number | string | null): void {
    this.el.value = this.format(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.disabled = isDisabled;
  }

  // ---- host events ----

  // Select-all on focus, for CLICK and TAB alike (user standard 2026-08-20):
  // the seeded "0.00" is highlighted so typing replaces it - never a caret
  // parked behind the zeros. A click fires focus then mouseup; the browser's
  // default mouseup would collapse the selection back to a caret, so the FIRST
  // mouseup after a select-on-focus is suppressed (subsequent clicks position
  // the caret normally, the field being already focused).
  private selectOnMouseUp = false;

  handleFocus(): void {
    this.el.select();
    this.selectOnMouseUp = true;
  }

  handleMouseUp(event: MouseEvent): void {
    if (this.selectOnMouseUp) {
      event.preventDefault();
      this.selectOnMouseUp = false;
    }
  }

  // Amounts are typed, never stepped: kill the scroll-wheel increment a
  // focused number input gets by default (an accidental wheel over a money
  // field must not change the figure). The spin buttons are hidden by the
  // global input[appMoney] CSS in styles.css.
  handleWheel(event: WheelEvent): void {
    if (document.activeElement === this.el) event.preventDefault();
  }

  handleInput(): void {
    this.onChange(this.parse(this.el.value));
  }

  handleBlur(): void {
    const n = this.parse(this.el.value);
    this.el.value = n === null ? '' : n.toFixed(2);
    if (n !== null) this.onChange(this.round(n));
    this.onTouched();
  }

  // ---- helpers ----

  private format(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '';
  }

  private parse(text: string): number | null {
    if (text.trim() === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  private round(n: number): number {
    return Number(n.toFixed(2));
  }
}
