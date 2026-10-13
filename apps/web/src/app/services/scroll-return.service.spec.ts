import { ChangeDetectionStrategy, Component, inject, Injector } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScrollReturnService } from './scroll-return.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="data-card" data-return-id="row-1">one</div>
    <div class="data-card" data-return-id="row-2">two</div>
  `,
})
class ListHostComponent {
  readonly injector = inject(Injector);
}

// remember() on the way into a detail, consume() once the master list has
// rendered: the remembered card scrolls into view and flashes, exactly once.
describe('ScrollReturnService', () => {
  const LIST = '/admin/tax-schemes';
  let service: ScrollReturnService;
  let fixture: ComponentFixture<ListHostComponent>;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // jsdom has no layout: stub the scroll so the call is observable.
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
    // jsdom ships no CSS.escape either (the service uses it to build the selector).
    const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
    if (typeof g.CSS?.escape !== 'function') {
      g.CSS = { ...(g.CSS ?? {}), escape: (s: string) => String(s).replace(/([^\w-])/g, '\\$1') };
    }

    await TestBed.configureTestingModule({ imports: [ListHostComponent] }).compileComponents();
    service = TestBed.inject(ScrollReturnService);
    fixture = TestBed.createComponent(ListHostComponent);
    fixture.detectChanges();
  });

  function card(id: string): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-return-id="${id}"]`) as HTMLElement;
  }

  it('remember + consume scrolls the remembered card into view (centred) and flashes it', async () => {
    service.remember(LIST, 'row-2');

    service.consume(LIST, fixture.componentInstance.injector);
    await settle();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(card('row-2'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(card('row-2').classList.contains('return-flash')).toBe(true);
    expect(card('row-1').classList.contains('return-flash')).toBe(false);
  });

  it('the flash class is removed when its animation ends', async () => {
    service.remember(LIST, 'row-1');
    service.consume(LIST, fixture.componentInstance.injector);
    await settle();
    expect(card('row-1').classList.contains('return-flash')).toBe(true);

    card('row-1').dispatchEvent(new Event('animationend'));

    expect(card('row-1').classList.contains('return-flash')).toBe(false);
  });

  it('consume is one-shot: a second consume for the same list does nothing', async () => {
    service.remember(LIST, 'row-1');
    service.consume(LIST, fixture.componentInstance.injector);
    await settle();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    service.consume(LIST, fixture.componentInstance.injector);
    await settle();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('consume with nothing remembered is a no-op', async () => {
    service.consume(LIST, fixture.componentInstance.injector);
    await settle();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('lists are keyed by path so screens do not collide', async () => {
    service.remember('/membership/types', 'row-1');

    service.consume(LIST, fixture.componentInstance.injector);
    await settle();
    expect(scrollIntoView).not.toHaveBeenCalled();

    service.consume('/membership/types', fixture.componentInstance.injector);
    await settle();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('a remembered record that is no longer rendered (deleted or filtered out) is silently forgotten', async () => {
    service.remember(LIST, 'gone');

    service.consume(LIST, fixture.componentInstance.injector);
    await settle();

    expect(scrollIntoView).not.toHaveBeenCalled();
    service.consume(LIST, fixture.componentInstance.injector);
    await settle();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
