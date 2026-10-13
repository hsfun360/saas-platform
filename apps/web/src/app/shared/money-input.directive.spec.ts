import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { MoneyInputDirective } from './money-input.directive';

// Reactive usage: the directive is the ControlValueAccessor.
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MoneyInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <input id="amount" appMoney formControlName="amount" type="number" inputmode="decimal" min="0" step="0.01" />
      <input id="other" type="text" />
    </form>
  `,
})
class ReactiveHostComponent {
  readonly form = new FormGroup({ amount: new FormControl<number | null>(0) });
}

// Display-only usage: a row input outside any FormGroup.
@Component({
  standalone: true,
  imports: [MoneyInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input id="row" appMoney [moneyValue]="amount()" type="number" />`,
})
class RowHostComponent {
  readonly amount = signal<number | string | null>(12.5);
}

describe('MoneyInputDirective', () => {
  describe('as a reactive ControlValueAccessor', () => {
    let fixture: ComponentFixture<ReactiveHostComponent>;
    let host: ReactiveHostComponent;
    let input: HTMLInputElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [ReactiveHostComponent] }).compileComponents();
      fixture = TestBed.createComponent(ReactiveHostComponent);
      host = fixture.componentInstance;
      fixture.detectChanges();
      input = fixture.nativeElement.querySelector('#amount');
    });

    function type(text: string): void {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    }

    it('masks the seeded value to two decimals ("0.00") while the form value stays a number', () => {
      expect(input.value).toBe('0.00');
      expect(host.form.controls.amount.value).toBe(0);

      host.form.reset({ amount: 1250.5 });
      expect(input.value).toBe('1250.50');
      expect(host.form.controls.amount.value).toBe(1250.5);
    });

    it('shows an empty field for a null value', () => {
      host.form.reset({ amount: null });
      expect(input.value).toBe('');
    });

    it('emits the parsed number while typing without re-formatting under the caret', () => {
      type('12.3');
      expect(host.form.controls.amount.value).toBe(12.3);
      expect(input.value).toBe('12.3');

      type('');
      expect(host.form.controls.amount.value).toBeNull();
    });

    it('re-formats to two decimals on blur, rounds the form value and marks the control touched', () => {
      type('12.345');
      expect(host.form.controls.amount.touched).toBe(false);

      input.dispatchEvent(new Event('blur'));

      expect(input.value).toBe('12.35');
      expect(host.form.controls.amount.value).toBe(12.35);
      expect(host.form.controls.amount.touched).toBe(true);
    });

    it('selects the whole value on focus (click and Tab alike) so typing replaces the seeded 0.00', () => {
      const select = vi.spyOn(input, 'select');

      input.dispatchEvent(new Event('focus'));

      expect(select).toHaveBeenCalledTimes(1);
    });

    it('takes over the FOCUSING click at mousedown and focuses the field by hand', () => {
      const select = vi.spyOn(input, 'select');
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      input.dispatchEvent(down);

      expect(down.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(select).toHaveBeenCalled();
    });

    it('leaves a click on an already-focused field fully native (one click places the caret)', () => {
      input.focus();
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      input.dispatchEvent(down);

      expect(down.defaultPrevented).toBe(false);
    });

    it('blocks the scroll-wheel step on a focused amount and ignores the wheel elsewhere', () => {
      const idle = new WheelEvent('wheel', { bubbles: true, cancelable: true });
      input.dispatchEvent(idle);
      expect(idle.defaultPrevented).toBe(false);

      input.focus();
      const focused = new WheelEvent('wheel', { bubbles: true, cancelable: true });
      input.dispatchEvent(focused);
      expect(focused.defaultPrevented).toBe(true);
    });

    it('follows the control disabled state', () => {
      host.form.controls.amount.disable();
      expect(input.disabled).toBe(true);

      host.form.controls.amount.enable();
      expect(input.disabled).toBe(false);
    });
  });

  describe('as a display-only mask ([moneyValue])', () => {
    let fixture: ComponentFixture<RowHostComponent>;
    let input: HTMLInputElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [RowHostComponent] }).compileComponents();
      fixture = TestBed.createComponent(RowHostComponent);
      fixture.detectChanges();
      input = fixture.nativeElement.querySelector('#row');
    });

    it('formats the bound value to two decimals and follows changes while the field is not focused', () => {
      expect(input.value).toBe('12.50');

      fixture.componentInstance.amount.set('99');
      fixture.detectChanges();
      expect(input.value).toBe('99.00');

      fixture.componentInstance.amount.set(null);
      fixture.detectChanges();
      expect(input.value).toBe('');
    });

    it('does not re-format under the caret while the field is focused (the echo from the (input) handler)', () => {
      input.focus();
      input.value = '99.5'; // mid-typing: a re-format here would turn it into "99.50" under the caret

      fixture.componentInstance.amount.set(99.5);
      fixture.detectChanges();

      expect(input.value).toBe('99.5');

      input.blur();
      fixture.componentInstance.amount.set(7);
      fixture.detectChanges();
      expect(input.value).toBe('7.00');
    });
  });
});
