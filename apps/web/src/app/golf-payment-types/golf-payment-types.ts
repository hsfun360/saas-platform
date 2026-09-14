import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfPaymentTypeService } from '../services/golf-payment-type.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { GolfPaymentType, MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';

// Golf Management → Master File Setup → Payment Type.
// Per-company settlement-tender catalog: code + payment class (fixed
// vocabulary: debtor / cash / member / voucher / staff / online / suspend /
// credit card - a native select, not a combobox) + description + icon for the
// front-desk settlement tiles. Enable/disable, no delete. Mirrors the golf
// Transaction Type screen (minus pricing/package).
@Component({
  selector: 'app-golf-payment-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './golf-payment-types.html',
  // membership-types.css supplies the shared .mt-chip pill; own css = icon bits.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-payment-types.css'],
})
export class GolfPaymentTypesComponent implements OnInit {
  private readonly service = inject(GolfPaymentTypeService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the list re-sorts on reload, so
  // the saved/toggled card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/payment-types';

  readonly rows = signal<GolfPaymentType[]>([]);
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
    return sorted.filter(
      (t) =>
        t.paymentType.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        this.classLabel(t.paymentClass).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit payment type' : 'New payment type'));

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.paymentClasses.set(m.paymentClasses), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  classLabel(key: string): string {
    return this.paymentClasses().find((c) => c.key === key)?.label || key;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
        this.returnScroll.consume(GolfPaymentTypesComponent.LIST_PATH, this.injector);
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

  openEdit(t: GolfPaymentType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({
      paymentType: t.paymentType,
      paymentClass: t.paymentClass,
      description: t.description || '',
      iconUrl: t.iconUrl || '',
    });
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
      paymentType: v.paymentType.trim(),
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
        this.dialogOpen.set(false);
        this.returnScroll.remember(GolfPaymentTypesComponent.LIST_PATH, res.paymentType.id);
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
        this.form.controls.iconUrl.markAsDirty(); // uploads count as unsaved changes
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

  toggleActive(t: GolfPaymentType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.paymentType} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfPaymentTypesComponent.LIST_PATH, t.id);
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
