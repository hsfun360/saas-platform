import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { ComboOption, ComboboxComponent } from './combobox';

const OPTIONS: ComboOption[] = [
  { value: 'my', label: 'MY - Malaysia' },
  { value: 'sg', label: 'SG - Singapore' },
  { value: 'mv', label: 'MV - Maldives' },
];

// Signal-driven caller ([value] / (valueChange)).
@Component({
  standalone: true,
  imports: [ComboboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="outer" (keydown)="outerKeys.set(outerKeys() + 1)">
      <app-combobox inputId="country" [options]="options" [value]="value()" (valueChange)="value.set($event)" />
    </div>
  `,
})
class ValueHostComponent {
  readonly options = OPTIONS;
  readonly value = signal('');
  readonly outerKeys = signal(0);
}

// Reactive-form caller (formControlName): the component is a ControlValueAccessor.
@Component({
  standalone: true,
  imports: [ComboboxComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <app-combobox inputId="country" [options]="options" formControlName="country" [allowEmpty]="false" />
    </form>
  `,
})
class FormHostComponent {
  readonly options = OPTIONS;
  readonly form = new FormGroup({ country: new FormControl<string>('sg', { nonNullable: true }) });
}

function key(name: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
}

describe('ComboboxComponent', () => {
  beforeEach(() => {
    // jsdom has no layout, so the highlight-follow scroll is a no-op stub.
    Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
  });

  describe('with [value] / (valueChange)', () => {
    let fixture: ComponentFixture<ValueHostComponent>;
    let host: ValueHostComponent;
    let input: HTMLInputElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [ValueHostComponent] }).compileComponents();
      fixture = TestBed.createComponent(ValueHostComponent);
      host = fixture.componentInstance;
      fixture.detectChanges();
      input = fixture.nativeElement.querySelector('#country');
    });

    // Row labels in order; the None row (the component's own emptyLabel) is
    // reported as '(none)' by its class so the test never spells the label.
    function rowLabels(): string[] {
      return Array.from(fixture.nativeElement.querySelectorAll('.combo__option') as NodeListOf<HTMLElement>).map((li) =>
        li.classList.contains('combo__option--none') ? '(none)' : (li.textContent || '').replace('check', '').trim(),
      );
    }

    function typeText(text: string): void {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('focus opens the full list (None row first) and selects the text', () => {
      const select = vi.spyOn(input, 'select');

      input.focus();
      fixture.detectChanges();

      expect(select).toHaveBeenCalled();
      expect(input.getAttribute('aria-expanded')).toBe('true');
      expect(rowLabels()).toEqual(['(none)', 'MY - Malaysia', 'SG - Singapore', 'MV - Maldives']);
    });

    it('typing filters by case-insensitive substring across the whole label and highlights the first real match', () => {
      input.focus();
      typeText('m');
      expect(rowLabels()).toEqual(['(none)', 'MY - Malaysia', 'MV - Maldives']);

      typeText('sing');
      expect(rowLabels()).toEqual(['(none)', 'SG - Singapore']);
      expect(fixture.nativeElement.querySelector('.combo__option--highlight')?.textContent).toContain('Singapore');

      typeText('zzz');
      expect(rowLabels()).toEqual(['(none)']);
      expect(host.value()).toBe('');
    });

    it('ArrowDown then Enter commits the highlighted option and never submits the surrounding form', () => {
      input.focus();
      fixture.detectChanges();
      input.dispatchEvent(key('ArrowDown')); // None -> MY
      fixture.detectChanges();
      const enter = key('Enter');
      input.dispatchEvent(enter);
      fixture.detectChanges();

      expect(enter.defaultPrevented).toBe(true);
      expect(host.value()).toBe('my');
      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(input.value).toBe('MY - Malaysia');
    });

    it('a single filtered match commits on Tab; an exact label commits too', () => {
      input.focus();
      typeText('maldi');
      input.dispatchEvent(key('Tab'));
      fixture.detectChanges();
      expect(host.value()).toBe('mv');

      input.focus();
      typeText('sg - singapore');
      input.dispatchEvent(key('Tab'));
      fixture.detectChanges();
      expect(host.value()).toBe('sg');
    });

    it('free text that is not an option REVERTS on leave - the value is never free text', () => {
      host.value.set('my');
      fixture.detectChanges();

      input.focus();
      typeText('m'); // ambiguous: Malaysia and Maldives
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      fixture.detectChanges();

      expect(host.value()).toBe('my');
      expect(input.value).toBe('MY - Malaysia');
      expect(input.getAttribute('aria-expanded')).toBe('false');
    });

    it('clearing the field commits None when allowed', () => {
      host.value.set('my');
      fixture.detectChanges();

      input.focus();
      typeText('');
      input.dispatchEvent(key('Tab'));
      fixture.detectChanges();

      expect(host.value()).toBe('');
      expect(input.value).toBe('');
    });

    it('Escape closes only the popover and is stopped so a host dialog stays open', () => {
      input.focus();
      typeText('ma');
      expect(input.getAttribute('aria-expanded')).toBe('true');
      const before = host.outerKeys();

      input.dispatchEvent(key('Escape'));
      fixture.detectChanges();

      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(host.value()).toBe('');
      expect(host.outerKeys()).toBe(before); // did not bubble to the outer keydown listener
    });

    it('a click on an option commits it', () => {
      input.focus();
      fixture.detectChanges();
      const sg = Array.from(fixture.nativeElement.querySelectorAll('.combo__option') as NodeListOf<HTMLElement>).find(
        (li) => li.textContent?.includes('Singapore'),
      );

      sg!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(host.value()).toBe('sg');
    });
  });

  describe('with formControlName (ControlValueAccessor)', () => {
    let fixture: ComponentFixture<FormHostComponent>;
    let host: FormHostComponent;
    let input: HTMLInputElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [FormHostComponent] }).compileComponents();
      fixture = TestBed.createComponent(FormHostComponent);
      host = fixture.componentInstance;
      fixture.detectChanges();
      input = fixture.nativeElement.querySelector('#country');
    });

    it('displays the label of the control value and hides the None row when allowEmpty is false', () => {
      expect(input.value).toBe('SG - Singapore');

      input.focus();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.combo__option').length).toBe(3);
      expect(fixture.nativeElement.querySelector('.combo__option--none')).toBeNull();
    });

    it('keyboard selection writes the option value to the control and touches it on leave', () => {
      expect(host.form.controls.country.touched).toBe(false);

      input.focus();
      input.value = 'maldi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      input.dispatchEvent(key('Enter'));
      fixture.detectChanges();

      expect(host.form.controls.country.value).toBe('mv');
      expect(host.form.controls.country.touched).toBe(true);
      expect(host.form.dirty).toBe(true);
    });

    it('setValue from the form updates the displayed label', () => {
      host.form.controls.country.setValue('my');
      fixture.detectChanges();

      expect(input.value).toBe('MY - Malaysia');
    });

    it('a disabled control disables the input', () => {
      host.form.controls.country.disable();
      fixture.detectChanges();

      expect(input.disabled).toBe(true);
    });
  });
});
