import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FacilityPaymentTypeService, FacilityPaymentType } from '../services/facility-payment-type.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

// Facility Management → Payment Types (/facility/payment-types; structure
// approved 2026-10-25). The settlement-tender catalog of the facility desk:
// code + payment class (fixed vocabulary - native select) + description +
// icon for the settlement tiles. Enable / disable, no delete (golf's shape).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-payment-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './facility-payment-types.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-payment-types.css'],
})
export class FacilityPaymentTypesComponent implements OnInit {
  private readonly service = inject(FacilityPaymentTypeService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/payment-types';

  readonly rows = signal<FacilityPaymentType[]>([]);
  readonly paymentClasses = signal<MembershipStatusOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    paymentType: ['', [Validators.required, Validators.maxLength(50)]],
    paymentClass: ['', [Validators.required]],
    description: ['', [Validators.maxLength(255)]],
    iconUrl: [''],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.paymentType.localeCompare(b.paymentType);
    });
    if (!q) return sorted;
    return sorted.filter((t) => t.paymentType.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
      || this.classLabel(t.paymentClass).toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit payment type' : 'New payment type'));

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.paymentClasses.set(m.paymentClasses), error: () => undefined });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  classLabel(key: string): string {
    return this.paymentClasses().find((c) => c.key === key)?.label || key;
  }

  // What the picked class does at settlement (show the expected result).
  classHint(): string {
    switch (this.form.controls.paymentClass.value) {
      case 'member': return 'Charges the amount to the billed member\'s own account through Account Receivable, with the credit limit enforced.';
      case 'debtor': return 'Charges the amount to an AR Other Debtor picked at settlement (a corporate account, a city ledger).';
      case 'suspend': return 'Counts toward settlement and flags the bill for later suspense clearing.';
      case 'cash': case 'creditcard': case 'voucher': case 'staff': case 'online': return 'Records the tender on the bill; nothing posts to a ledger account.';
      default: return '';
    }
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
        this.returnScroll.consume(FacilityPaymentTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load payment types.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ paymentType: '', paymentClass: '', description: '', iconUrl: '' });
    this.dialogOpen.set(true);
  }

  openEdit(t: FacilityPaymentType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({ paymentType: t.paymentType, paymentClass: t.paymentClass, description: t.description || '', iconUrl: t.iconUrl || '' });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      paymentType: v.paymentType.trim().toUpperCase(),
      paymentClass: v.paymentClass,
      description: v.description.trim() || null,
      iconUrl: v.iconUrl || null,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.dialogOpen.set(false);
        this.returnScroll.remember(FacilityPaymentTypesComponent.LIST_PATH, res.paymentType.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the payment type.');
        this.saving.set(false);
      },
    });
  }

  onIconSelected(input: HTMLInputElement): void {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadIcon(file).subscribe({
      next: (res) => {
        this.form.controls.iconUrl.setValue(res.url);
        this.form.controls.iconUrl.markAsDirty();
        this.uploading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload the icon.');
        this.uploading.set(false);
      },
    });
  }

  removeIcon(): void {
    this.form.controls.iconUrl.setValue('');
    this.form.controls.iconUrl.markAsDirty();
  }

  toggleActive(t: FacilityPaymentType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.paymentType} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityPaymentTypesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the payment type.');
        this.togglingId.set(null);
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
