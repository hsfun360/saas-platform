import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent, ConfirmRequest } from './confirm-dialog';

// The one confirmation card: compact (title, message, two buttons - no dialog
// chrome), safe-button focus, Esc cancels without reaching a host dialog, and
// the danger/primary split follows the request.
@Component({
  standalone: true,
  imports: [ConfirmDialogComponent],
  template: `
    @if (request(); as c) {
      <app-confirm-dialog [request]="c" (cancelled)="cancelledCount = cancelledCount + 1" />
    }
  `,
})
class HostComponent {
  readonly request = signal<ConfirmRequest | null>(null);
  cancelledCount = 0;
}

describe('ConfirmDialogComponent', () => {
  async function render(req: Partial<ConfirmRequest> = {}) {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    let ran = 0;
    fixture.componentInstance.request.set({
      title: 'Discard unsaved changes?',
      message: 'They will be lost.',
      confirmLabel: 'Discard changes',
      run: () => { ran += 1; },
      ...req,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const card = fixture.nativeElement.querySelector('.cfm-card') as HTMLElement;
    return { fixture, card, ranCount: () => ran };
  }

  it('renders the compact card - title, message and the two buttons, no dialog header/footer chrome', async () => {
    const { fixture, card } = await render();
    expect(card.querySelector('.cfm-title')?.textContent).toContain('Discard unsaved changes?');
    expect(card.querySelector('.cfm-msg')?.textContent).toContain('They will be lost.');
    const labels = [...card.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Cancel', 'Discard changes']);
    expect(fixture.nativeElement.querySelector('.dlg__header')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dlg__footer')).toBeNull();
  });

  it('cancelLabel overrides the safe button ("Keep editing" for unsaved-changes confirms)', async () => {
    const { card } = await render({ cancelLabel: 'Keep editing' });
    expect(card.querySelector('button')?.textContent?.trim()).toBe('Keep editing');
  });

  it('confirm runs the request; the safe button emits cancelled', async () => {
    const { fixture, card, ranCount } = await render();
    const [safe, confirm] = [...card.querySelectorAll('button')];
    confirm.click();
    expect(ranCount()).toBe(1);
    safe.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.cancelledCount).toBe(1);
  });

  it('the confirm button is danger by default', async () => {
    const { card } = await render();
    expect(card.querySelectorAll('button')[1].classList.contains('btn--danger')).toBe(true);
  });

  it('the confirm button is primary when danger is false', async () => {
    const { card } = await render({ danger: false });
    expect(card.querySelectorAll('button')[1].classList.contains('btn--primary')).toBe(true);
  });

  it('Esc cancels and stops the event so a host dialog never sees it', async () => {
    const { fixture } = await render();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stop = vi.spyOn(esc, 'stopPropagation');
    fixture.nativeElement.querySelector('.cfm-overlay').dispatchEvent(esc);
    fixture.detectChanges();
    expect(fixture.componentInstance.cancelledCount).toBe(1);
    expect(stop).toHaveBeenCalled();
  });

  it('opens with focus on the SAFE button so an accidental Enter never confirms', async () => {
    const { card } = await render();
    expect(document.activeElement).toBe(card.querySelector('button'));
  });
});
