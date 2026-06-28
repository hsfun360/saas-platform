import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { Item, ItemInput } from './item.model';

// In-memory data source so the screen builds and runs with NO backend.
// It returns Observables (with a small simulated latency) so the component's
// subscribe/next/error code is identical to the real thing — to go live, swap
// these method bodies for HttpClient calls and delete the seed/store. The
// shapes ({ item, message } / { message }) mirror the app's auth.service.
@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly latencyMs = 300;
  private counter = 3;

  private store: Item[] = [
    { id: 'it-1', name: 'Acme Corporation', description: 'Enterprise customer, onboarded last quarter.', status: 'active', updatedAt: '2026-05-02T09:00:00.000Z' },
    { id: 'it-2', name: 'Globex Inc.', description: 'On a 30-day trial of the Pro plan.', status: 'inactive', updatedAt: '2026-06-11T14:30:00.000Z' },
    { id: 'it-3', name: 'Initech LLC', description: 'Renewal pending finance approval.', status: 'active', updatedAt: '2026-06-20T08:15:00.000Z' },
  ];

  list(): Observable<Item[]> {
    return of(this.store.map((i) => ({ ...i }))).pipe(delay(this.latencyMs));
  }

  get(id: string): Observable<Item> {
    const found = this.store.find((i) => i.id === id);
    return found
      ? of({ ...found }).pipe(delay(this.latencyMs))
      : throwError(() => ({ error: { message: 'Item not found.' } }));
  }

  create(input: ItemInput): Observable<{ item: Item; message: string }> {
    const item: Item = { id: `it-${++this.counter}`, ...this.normalize(input), updatedAt: this.now() };
    this.store = [item, ...this.store];
    return of({ item: { ...item }, message: `"${item.name}" created.` }).pipe(delay(this.latencyMs));
  }

  update(id: string, input: ItemInput): Observable<{ item: Item; message: string }> {
    const index = this.store.findIndex((i) => i.id === id);
    if (index === -1) {
      return throwError(() => ({ error: { message: 'Item not found.' } }));
    }
    const item: Item = { ...this.store[index], ...this.normalize(input), updatedAt: this.now() };
    this.store = this.store.map((i) => (i.id === id ? item : i));
    return of({ item: { ...item }, message: `"${item.name}" updated.` }).pipe(delay(this.latencyMs));
  }

  remove(id: string): Observable<{ message: string }> {
    const found = this.store.find((i) => i.id === id);
    if (!found) {
      return throwError(() => ({ error: { message: 'Item not found.' } }));
    }
    this.store = this.store.filter((i) => i.id !== id);
    return of({ message: `"${found.name}" deleted.` }).pipe(delay(this.latencyMs));
  }

  private normalize(input: ItemInput): ItemInput {
    return { name: input.name.trim(), description: input.description.trim(), status: input.status };
  }

  private now(): string {
    return new Date().toISOString();
  }
}
