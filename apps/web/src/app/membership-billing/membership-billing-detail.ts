import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { BillingService } from '../services/billing.service';
import { BillingSchedule, BillingScheduleItem } from '../models/billing.models';

// Billing Schedule review (detail of /membership/billing, same menu): the
// holding items with their resolved routing - skip what shouldn't bill, then
// post the selection. One AR Invoice per posted item; failures stay on the
// item with their reason.
@Component({
  selector: 'app-membership-billing-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, CanDirective, LocalDatePipe],
  templateUrl: './membership-billing-detail.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-billing-detail.css'],
})
export class MembershipBillingDetailComponent {
  private readonly service = inject(BillingService);
  private readonly route = inject(ActivatedRoute);

  readonly schedule = signal<BillingSchedule | null>(null);
  readonly items = signal<BillingScheduleItem[]>([]);
  readonly loading = signal(false);
  readonly posting = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly selected = signal<Set<string>>(new Set());
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  scheduleId = '';

  readonly pendingItems = computed(() => this.items().filter((i) => i.status === 'pending'));
  readonly selectedCount = computed(() => this.selected().size);
  readonly totalSelected = computed(() => {
    let c = 0;
    for (const i of this.items()) if (this.selected().has(i.id)) c += Math.round(Number(i.amount) * 100);
    return (c / 100).toFixed(2);
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id') || '';
      if (id && id !== this.scheduleId) {
        this.scheduleId = id;
        this.load();
      }
    });
  }

  typeLabel(key: string): string {
    return key === 'membership-fee' ? 'Membership Fee' : 'Subscription Fee';
  }

  load(): void {
    this.loading.set(true);
    this.service.get(this.scheduleId).subscribe({
      next: (res) => {
        this.schedule.set(res.schedule);
        this.items.set(res.items);
        this.selected.set(new Set());
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the schedule.');
      },
    });
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }
  toggleSelected(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selected.set(next);
  }
  allSelected(): boolean {
    const pending = this.pendingItems();
    return pending.length > 0 && pending.every((i) => this.selected().has(i.id));
  }
  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.pendingItems().map((i) => i.id)));
  }

  onPost(): void {
    this.clearMessages();
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.posting.set(true);
    this.service.post(this.scheduleId, ids).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.posting.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to post.');
        this.posting.set(false);
      },
    });
  }

  toggleSkip(item: BillingScheduleItem): void {
    this.clearMessages();
    const next = item.status === 'skipped' ? 'pending' : 'skipped';
    this.togglingId.set(item.id);
    this.service.setItemStatus(item.id, next).subscribe({
      next: () => { this.togglingId.set(null); this.load(); },
      error: (err) => {
        this.togglingId.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to update the item.');
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
