import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldInfoComponent } from './field-info';

// The field-info popover contract (standard 2026-10-18): hover shows, click
// pins, Esc closes without reaching a host dialog, outside press closes, and
// the icon carries the accessible name + expanded state.
@Component({
  standalone: true,
  imports: [FieldInfoComponent],
  template: `<app-field-info label="Advance Booking Days" text="The long explanation." />`,
})
class HostComponent {}

describe('FieldInfoComponent', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button.fi-btn') as HTMLButtonElement;
    return { fixture, btn };
  }

  function popOf(fixture: { nativeElement: HTMLElement }): HTMLElement | null {
    return fixture.nativeElement.querySelector('.fi-pop');
  }

  it('names the icon after the field and reports the expanded state', async () => {
    const { fixture, btn } = await render();
    expect(btn.getAttribute('aria-label')).toBe('About Advance Booking Days');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('click pins the popover open with the text, a second click closes it', async () => {
    const { fixture, btn } = await render();
    btn.click();
    fixture.detectChanges();
    expect(popOf(fixture)?.textContent).toContain('The long explanation.');
    btn.click();
    fixture.detectChanges();
    expect(popOf(fixture)).toBeNull();
  });

  it('hover shows and hover-out hides while unpinned, but a pinned popover survives hover-out', async () => {
    const { fixture, btn } = await render();
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(popOf(fixture)).not.toBeNull();
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(popOf(fixture)).toBeNull();

    btn.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    btn.click(); // pin while hover-open
    fixture.detectChanges();
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(popOf(fixture)).not.toBeNull();
  });

  it('Esc closes the popover and stops the event so a host dialog never sees it', async () => {
    const { fixture, btn } = await render();
    btn.click();
    fixture.detectChanges();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stop = vi.spyOn(esc, 'stopPropagation');
    btn.dispatchEvent(esc);
    fixture.detectChanges();
    expect(popOf(fixture)).toBeNull();
    expect(stop).toHaveBeenCalled();
  });

  it('a press outside closes the pinned popover', async () => {
    const { fixture, btn } = await render();
    btn.click();
    fixture.detectChanges();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();
    expect(popOf(fixture)).toBeNull();
  });
});
