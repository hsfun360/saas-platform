import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ItemsService } from './items.service';
import { Item } from './item.model';
import { ScrollReturnService } from '../services/scroll-return.service';

// Sample CRUD screen using the master–detail + URL-state pattern (see
// docs/project-overview.md). The list (master) is on the left; the selected
// item's detail/edit form (detail) is on the right.
//
// The URL is the single source of truth for what's open:
//   /items          → list only (nothing selected)
//   /items/new      → create form in the detail pane
//   /items/:id      → that item's detail + edit form
// This gives deep-linking and working browser back/forward for free; selection
// flows FROM the route param, never by setting the signal directly.
@Component({
  selector: 'app-items',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalDatePipe, ReactiveFormsModule],
  templateUrl: './items.html',
  styleUrls: ['./items.css'],
})
export class ItemsComponent implements OnInit {
  private readonly itemsService = inject(ItemsService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private readonly basePath = ['/items'];
  private readonly newSentinel = 'new';

  readonly items = signal<Item[]>([]);
  readonly search = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Live client-side filter over the already-loaded list — name, description and
  // status. No extra server round-trip; results update as the user types.
  readonly filteredItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    const list = this.items();
    if (!query) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(query) ||
        i.description.toLowerCase().includes(query) ||
        i.status.toLowerCase().includes(query),
    );
  });

  // The :id route param, verbatim ('new' = create mode, null = list only).
  readonly selectedId = signal<string | null>(null);
  readonly isCreating = computed(() => this.selectedId() === this.newSentinel);
  readonly selectedItem = computed(() => {
    const id = this.selectedId();
    return id && id !== this.newSentinel ? (this.items().find((i) => i.id === id) ?? null) : null;
  });
  // Detail pane is "open" (covers the master on mobile) when creating or viewing.
  readonly detailOpen = computed(() => this.selectedId() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(500)]],
    status: ['active' as Item['status'], [Validators.required]],
  });

  constructor() {
    // React to the :id param (direct nav, deep link, browser back/forward).
    // A real record id is remembered so that when the user navigates back to the
    // plain list route (which recreates this component), the master scrolls their
    // row back into view instead of jumping to the top ('new' has no row).
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      this.selectedId.set(id);
      if (id && id !== this.newSentinel) this.returnScroll.remember('/items', id);
      this.syncForm();
    });
  }

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.loading.set(true);
    this.itemsService.list().subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
        // A deep link (/items/:id) may have arrived before the list loaded —
        // now that items are in, populate the edit form for the open item.
        this.syncForm();
        // Back on the plain list route: scroll to the row the user came from.
        if (!this.selectedId()) this.returnScroll.consume('/items', this.injector);
      },
      error: () => this.loading.set(false),
    });
  }

  // Populate the form from the current selection: blank for create, the item's
  // values for edit, untouched when nothing is open.
  private syncForm(): void {
    if (this.isCreating()) {
      this.form.reset({ name: '', description: '', status: 'active' });
      return;
    }
    const item = this.selectedItem();
    if (item) {
      this.form.reset({ name: item.name, description: item.description, status: item.status });
    }
  }

  // --- Navigation (selection flows back in via the route subscription) ---
  selectItem(id: string): void {
    this.clearMessages();
    this.router.navigate([...this.basePath, id]);
  }

  startCreate(): void {
    this.clearMessages();
    this.router.navigate([...this.basePath, this.newSentinel]);
  }

  backToList(): void {
    this.clearMessages();
    this.router.navigate(this.basePath);
  }

  clearSearch(): void {
    this.search.set('');
  }

  // --- Create / update ---
  save(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('A name is required.');
      return;
    }

    const input = this.form.getRawValue();
    const creating = this.isCreating();
    const editingId = this.selectedItem()?.id;

    if (!creating && !editingId) {
      this.errorMessage.set('Nothing to save — select an item first.');
      return;
    }

    this.saving.set(true);
    const req$ = creating
      ? this.itemsService.create(input)
      : this.itemsService.update(editingId!, input);

    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.loadItems();
        // After a create, open the new item's detail (also flips the mobile pane).
        if (creating) {
          this.router.navigate([...this.basePath, res.item.id]);
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save item.');
        this.saving.set(false);
      },
    });
  }

  // --- Delete ---
  deleteItem(item: Item): void {
    this.clearMessages();
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;

    this.deletingId.set(item.id);
    this.itemsService.remove(item.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.deletingId.set(null);
        // If the open item was deleted, return to the list (URL-driven).
        if (this.selectedId() === item.id) {
          this.backToList();
        }
        this.loadItems();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete item.');
        this.deletingId.set(null);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
