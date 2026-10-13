import { EffectRef, Injector, effect, untracked } from '@angular/core';

// Run `run` once `source` has been quiet for `ms` milliseconds - the signal
// form of a debounced search box. Reads `source` inside an effect, so any
// signal it composes (a search term, a filter chip) re-arms the timer; the
// first evaluation (the initial value) never fires, so a screen keeps loading
// its first page from ngOnInit exactly as before. The pending timer is cleared
// when the source changes again or the owning component is destroyed, which is
// what the six `Subject + debounceTime(300)` copies did by hand before
// 2026-10-13. Call it in an injection context (a field initializer or the
// constructor), or pass `injector`.
export function onDebounced(source: () => unknown, ms: number, run: () => void, options?: { injector?: Injector }): EffectRef {
  let armed = false;
  return effect((onCleanup) => {
    source();
    if (!armed) {
      armed = true;
      return;
    }
    const handle = setTimeout(() => untracked(run), ms);
    onCleanup(() => clearTimeout(handle));
  }, options);
}
