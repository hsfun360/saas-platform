import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogComponent } from './dialog';

@Component({
  standalone: true,
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button id="opener" type="button" (click)="show.set(true)">Open</button>
    @if (show()) {
      <app-dialog title="New thing" [dirty]="dirty()" [busy]="busy()" (close)="onClose()">
        <button id="chip" type="button">Change</button>
        <form id="f">
          <input id="first" type="text" />
          <input id="second" type="text" />
        </form>
        <ng-container dialogFooter>
          <button id="cancel" type="button">Cancel</button>
          <button id="save" type="submit" form="f">Save</button>
        </ng-container>
      </app-dialog>
    }
  `,
})
class HostComponent {
  readonly show = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  closes = 0;
  onClose(): void {
    this.closes += 1;
    this.show.set(false);
  }
}

describe('DialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function q<T extends Element>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  }

  // Let afterNextRender (initial focus) and the async history.back() -> popstate
  // cycle run before asserting.
  async function settle(ms = 50): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(): Promise<void> {
    q<HTMLButtonElement>('#opener')!.focus();
    q<HTMLButtonElement>('#opener')!.click();
    fixture.detectChanges();
    await settle();
  }

  function keydown(name: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
    q('.dlg-overlay')!.dispatchEvent(ev);
    fixture.detectChanges();
    return ev;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(async () => {
    // Close any dialog still open so its history trap is consumed before the next test.
    if (host.show()) {
      host.show.set(false);
      fixture.detectChanges();
      await settle();
    }
  });

  it('pushes a same-URL history entry on open so the Back button is trapped', async () => {
    const push = vi.spyOn(history, 'pushState');
    const url = location.href;

    await open();

    expect(push).toHaveBeenCalledTimes(1);
    expect((history.state as { appDialogGuard?: boolean } | null)?.appDialogGuard).toBe(true);
    expect(location.href).toBe(url);
    push.mockRestore();
  });

  it('moves focus to the first TYPEABLE field on open, skipping a preceding button', async () => {
    await open();

    expect(document.activeElement).toBe(q('#first'));
  });

  it('Escape closes a pristine dialog and focus returns to the trigger', async () => {
    await open();

    keydown('Escape');
    await settle();

    expect(host.closes).toBe(1);
    expect(q('app-dialog')).toBeNull();
    expect(document.activeElement).toBe(q('#opener'));
  });

  it('closing by Escape consumes the pushed history entry', async () => {
    await open();
    expect((history.state as { appDialogGuard?: boolean } | null)?.appDialogGuard).toBe(true);

    keydown('Escape');
    await settle(100);

    expect((history.state as { appDialogGuard?: boolean } | null)?.appDialogGuard).not.toBe(true);
  });

  it('the X button routes through the same guard as Escape', async () => {
    await open();

    q<HTMLButtonElement>('.dlg__close')!.click();
    fixture.detectChanges();
    await settle();

    expect(host.closes).toBe(1);
  });

  it('browser Back (popstate) dismisses a pristine dialog', async () => {
    await open();

    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();
    await settle();

    expect(host.closes).toBe(1);
    expect(q('app-dialog')).toBeNull();
  });

  it('on a dirty form Escape shows the discard confirmation instead of closing, with focus on Keep editing', async () => {
    host.dirty.set(true);
    await open();

    keydown('Escape');
    await settle();

    expect(host.closes).toBe(0);
    expect(q('.dlg__confirm')).toBeTruthy();
    expect(document.activeElement?.textContent?.trim()).toBe('Keep editing');
  });

  it('on a dirty form browser Back re-arms the trap and asks to discard', async () => {
    host.dirty.set(true);
    await open();
    const push = vi.spyOn(history, 'pushState');

    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();
    await settle();

    expect(host.closes).toBe(0);
    expect(q('.dlg__confirm')).toBeTruthy();
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('Keep editing returns the cursor to the field the user left off in; Discard closes', async () => {
    host.dirty.set(true);
    await open();
    q<HTMLInputElement>('#second')!.focus();
    fixture.detectChanges();

    keydown('Escape');
    await settle();
    expect(q('.dlg__confirm')).toBeTruthy();

    keydown('Escape'); // Esc on the confirmation = Keep editing
    await settle();
    expect(q('.dlg__confirm')).toBeNull();
    expect(document.activeElement).toBe(q('#second'));

    keydown('Escape');
    await settle();
    (Array.from(fixture.nativeElement.querySelectorAll('.dlg__confirm button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.trim() === 'Discard changes')!
      .click();
    fixture.detectChanges();
    await settle();

    expect(host.closes).toBe(1);
    expect(q('app-dialog')).toBeNull();
  });

  it('while busy (mid-save) Escape and the X are inert', async () => {
    host.busy.set(true);
    await open();

    keydown('Escape');
    q<HTMLButtonElement>('.dlg__close')!.click();
    await settle();

    expect(host.closes).toBe(0);
    expect(q('app-dialog')).toBeTruthy();
    expect(q<HTMLButtonElement>('.dlg__close')!.disabled).toBe(true);
  });

  it('Tab from the last focusable wraps to the first (focus trap)', async () => {
    await open();
    q<HTMLButtonElement>('#save')!.focus();

    const tab = keydown('Tab');

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q('.dlg__close'));
  });
});
