import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { ArService } from '../services/ar.service';
import { CountryService } from '../services/country.service';
import { ArDebtor, ArOption, ArDebtorsMeta } from '../models/ar.models';
import { Country } from '../models/auth.models';

// Account Receivable → Debtor Listing.
// ONE shared listing for all three debtor types (membership contract, member
// personal, Other Debtor) with a type filter - Finance queries outstanding in
// one place. Party data (numbers, names) is resolved server-side; this screen
// owns the LEDGER ACCOUNT: credit terms, limits, status. After provisioning,
// this is the single place credit terms are maintained (the membership screen
// shows them read-only).
// Other Debtors (city ledger) are created/edited from here too - AR owns their
// party master.
@Component({
  selector: 'app-ar-debtors',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    RouterLink, DialogComponent, CanDirective, MoneyInputDirective, PhoneInputComponent,
    OverflowMenuComponent, MenuItemDirective,
  ],
  templateUrl: './ar-debtors.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-debtors.css'],
})
export class ArDebtorsComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly countryService = inject(CountryService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<ArDebtor[]>([]);
  readonly total = signal(0);
  readonly meta = signal<ArDebtorsMeta | null>(null);
  readonly countries = signal<Country[]>([]);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly search = signal('');
  readonly typeFilter = signal('');
  readonly statusFilter = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly backfilling = signal(false);
  readonly hasMore = computed(() => this.rows().length < this.total());

  private readonly query$ = new Subject<void>();

  // --- Edit ledger account dialog ---
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editRow = signal<ArDebtor | null>(null);
  readonly editForm = this.fb.nonNullable.group({
    terms: [null as number | null],
    creditLimit: [0],
    sendReminders: [false],
    chargeInterest: [false],
    status: ['active', [Validators.required]],
  });

  // --- Other Debtor dialog (single dialog, create/edit via mode signal) ---
  readonly otherOpen = signal(false);
  readonly otherMode = signal<'create' | 'edit'>('create');
  readonly otherSaving = signal(false);
  readonly otherLoading = signal(false);
  otherId = '';
  otherCode = ''; // display-only in edit mode (immutable after create)
  readonly otherForm = this.fb.nonNullable.group({
    code: [''],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    registrationNo: ['', [Validators.maxLength(255)]],
    taxNo: ['', [Validators.maxLength(255)]],
    contactPerson: ['', [Validators.maxLength(255)]],
    phone: [''],
    mobile: [''],
    fax: [''],
    email: ['', [Validators.email]],
    address1: [''],
    address2: [''],
    address3: [''],
    city: [''],
    state: [''],
    postcode: ['', [Validators.maxLength(20)]],
    countryCode: [''],
    remarks: [''],
    // Ledger seeding (create mode only; afterwards edited via the ledger dialog).
    terms: [null as number | null],
    creditLimit: [0],
    sendReminders: [false],
    chargeInterest: [false],
  });

  readonly autoOtherCode = computed(() => this.meta()?.otherDebtorNumberingMode === 'auto');

  constructor() {
    this.query$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.load(true));
  }

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.countryService.listActive().subscribe({ next: (c) => this.countries.set(c), error: () => {} });
    this.load(true);
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  typeLabel(key: string): string {
    return (this.meta()?.debtorTypes || []).find((t: ArOption) => t.key === key)?.label || key;
  }

  statusLabel(key: string): string {
    return (this.meta()?.debtorStatuses || []).find((s: ArOption) => s.key === key)?.label || key;
  }

  load(reset = true): void {
    if (reset) this.loading.set(true);
    else this.loadingMore.set(true);
    const offset = reset ? 0 : this.rows().length;
    this.service
      .listDebtors({ q: this.search().trim(), type: this.typeFilter(), status: this.statusFilter(), offset })
      .subscribe({
        next: (res) => {
          this.rows.set(reset ? res.debtors : [...this.rows(), ...res.debtors]);
          this.total.set(res.total);
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadingMore.set(false);
          this.errorMessage.set(err.error?.message || 'Failed to load debtors.');
        },
      });
  }

  loadMore(): void {
    this.load(false);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.query$.next();
  }

  clearSearch(): void {
    this.search.set('');
    this.load(true);
  }

  setTypeFilter(key: string): void {
    this.typeFilter.set(key);
    this.load(true);
  }

  setStatusFilter(key: string): void {
    this.statusFilter.set(key);
    this.load(true);
  }

  clearFilters(): void {
    this.search.set('');
    this.typeFilter.set('');
    this.statusFilter.set('');
    this.load(true);
  }

  // --- Ledger account (credit terms) ---

  openEdit(row: ArDebtor): void {
    this.clearMessages();
    this.editRow.set(row);
    this.editForm.reset({
      terms: row.terms,
      creditLimit: Number(row.creditLimit) || 0,
      sendReminders: row.sendReminders,
      chargeInterest: row.chargeInterest,
      status: row.status,
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    const row = this.editRow();
    if (!row) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const f = this.editForm.getRawValue();
    this.editSaving.set(true);
    this.service
      .updateDebtor(row.id, {
        terms: f.terms,
        creditLimit: f.creditLimit,
        sendReminders: f.sendReminders,
        chargeInterest: f.chargeInterest,
        status: f.status,
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message);
          this.editSaving.set(false);
          this.editOpen.set(false);
          this.load(true);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update the debtor.');
          this.editSaving.set(false);
        },
      });
  }

  // --- Other Debtor (party master) ---

  openAddOther(): void {
    this.clearMessages();
    this.otherMode.set('create');
    this.otherId = '';
    this.otherCode = '';
    this.otherForm.reset({
      code: '', name: '', registrationNo: '', taxNo: '', contactPerson: '',
      phone: '', mobile: '', fax: '', email: '',
      address1: '', address2: '', address3: '', city: '', state: '', postcode: '',
      countryCode: '', remarks: '',
      terms: null, creditLimit: 0, sendReminders: false, chargeInterest: false,
    });
    this.otherOpen.set(true);
  }

  openEditOther(row: ArDebtor): void {
    this.clearMessages();
    this.otherMode.set('edit');
    this.otherId = row.sourceId;
    this.otherCode = row.no || '';
    this.otherOpen.set(true);
    this.otherLoading.set(true);
    this.service.getOtherDebtor(row.sourceId).subscribe({
      next: (res) => {
        const o = res.otherDebtor;
        this.otherCode = o.code;
        this.otherForm.reset({
          code: o.code,
          name: o.name,
          registrationNo: o.registrationNo || '',
          taxNo: o.taxNo || '',
          contactPerson: o.contactPerson || '',
          phone: o.phone || '',
          mobile: o.mobile || '',
          fax: o.fax || '',
          email: o.email || '',
          address1: o.address1 || '',
          address2: o.address2 || '',
          address3: o.address3 || '',
          city: o.city || '',
          state: o.state || '',
          postcode: o.postcode || '',
          countryCode: o.countryCode || '',
          remarks: o.remarks || '',
          terms: null, creditLimit: 0, sendReminders: false, chargeInterest: false,
        });
        this.otherLoading.set(false);
      },
      error: (err) => {
        this.otherLoading.set(false);
        this.otherOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the Other Debtor.');
      },
    });
  }

  closeOther(): void {
    this.otherOpen.set(false);
  }

  onSaveOther(): void {
    this.clearMessages();
    if (this.otherForm.invalid) {
      this.otherForm.markAllAsTouched();
      return;
    }
    const f = this.otherForm.getRawValue();
    const profile = {
      name: f.name.trim(),
      registrationNo: f.registrationNo.trim() || null,
      taxNo: f.taxNo.trim() || null,
      contactPerson: f.contactPerson.trim() || null,
      phone: f.phone || null,
      mobile: f.mobile || null,
      fax: f.fax.trim() || null,
      email: f.email.trim() || null,
      address1: f.address1.trim() || null,
      address2: f.address2.trim() || null,
      address3: f.address3.trim() || null,
      city: f.city.trim() || null,
      state: f.state.trim() || null,
      postcode: f.postcode.trim() || null,
      countryCode: f.countryCode || null,
      remarks: f.remarks.trim() || null,
    };
    this.otherSaving.set(true);
    const req = this.otherMode() === 'create'
      ? this.service.createOtherDebtor({
          ...profile,
          code: f.code.trim() || null,
          terms: f.terms,
          creditLimit: f.creditLimit,
          sendReminders: f.sendReminders,
          chargeInterest: f.chargeInterest,
        })
      : this.service.updateOtherDebtor(this.otherId, profile);
    req.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.otherSaving.set(false);
        this.otherOpen.set(false);
        this.load(true);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the Other Debtor.');
        this.otherSaving.set(false);
      },
    });
  }

  // Enable/Disable an Other Debtor (party isActive + ledger suspend/reactivate).
  toggleOther(row: ArDebtor): void {
    this.clearMessages();
    const enable = row.status === 'suspended';
    this.service.updateOtherDebtor(row.sourceId, { isActive: enable }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.load(true);
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to update the Other Debtor.'),
    });
  }

  // --- Reconciliation (drift detector; also runs nightly from the worker) ---
  readonly reconOpen = signal(false);
  readonly reconBusy = signal(false);
  readonly reconResult = signal<{
    message: string;
    checked: Record<string, number>;
    discrepancies: Array<{ type: string; ref: string; field: string; expected: string; actual: string; fixed: boolean }>;
  } | null>(null);

  runReconcile(fix = false): void {
    this.clearMessages();
    this.reconBusy.set(true);
    this.service.reconcile(fix).subscribe({
      next: (res) => {
        this.reconBusy.set(false);
        this.reconResult.set(res);
        if (res.discrepancies.length === 0) {
          this.successMessage.set(res.message);
          this.reconOpen.set(false);
        } else {
          this.reconOpen.set(true);
          if (fix) { this.successMessage.set(res.message); this.load(true); }
        }
      },
      error: (err) => {
        this.reconBusy.set(false);
        this.errorMessage.set(err.error?.message || 'Reconciliation failed.');
      },
    });
  }

  closeRecon(): void {
    this.reconOpen.set(false);
    this.reconResult.set(null);
  }

  // Producer-side utility: provision ledger accounts for memberships/nominees
  // that were already active before the AR module (idempotent).
  runBackfill(): void {
    this.clearMessages();
    this.backfilling.set(true);
    this.service.backfillDebtors().subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.backfilling.set(false);
        this.load(true);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to queue debtor provisioning.');
        this.backfilling.set(false);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
