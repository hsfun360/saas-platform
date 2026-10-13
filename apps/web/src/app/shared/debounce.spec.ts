import { TestBed } from '@angular/core/testing';
import { Injector, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onDebounced } from './debounce';

describe('onDebounced', () => {
  let injector: Injector;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    injector = TestBed.inject(Injector);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire for the initial value', () => {
    const search = signal('');
    const run = vi.fn();
    onDebounced(search, 300, run, { injector });
    TestBed.tick();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });

  it('fires once after the source has been quiet for the delay', () => {
    const search = signal('');
    const run = vi.fn();
    onDebounced(search, 300, run, { injector });
    TestBed.tick();

    search.set('a');
    TestBed.tick();
    vi.advanceTimersByTime(100);
    search.set('ab');
    TestBed.tick();
    vi.advanceTimersByTime(100);
    search.set('abc');
    TestBed.tick();
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('re-arms for a later change', () => {
    const search = signal('');
    const run = vi.fn();
    onDebounced(search, 300, run, { injector });
    TestBed.tick();

    search.set('a');
    TestBed.tick();
    vi.advanceTimersByTime(300);
    search.set('b');
    TestBed.tick();
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('clears the pending timer when destroyed', () => {
    const search = signal('');
    const run = vi.fn();
    const ref = onDebounced(search, 300, run, { injector });
    TestBed.tick();

    search.set('a');
    TestBed.tick();
    ref.destroy();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });
});
