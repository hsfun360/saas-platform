import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SalesService } from '../services/sales.service';
import { CountryService } from '../services/country.service';
import { Country, SalesAgency } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';

// Membership Management → Sales Agencies (SRS 2.2). The outsourced agency
// companies a club engages to promote its memberships; their staff are Sales
// Agents of kind 'agency-staff'.
@Component({
  selector: 'app-sales-agencies',
  standalone: true,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, PhoneInputComponent],
  templateUrl: './sales-agencies.html',
  styleUrls: ['../system-setup/system-setup.css', '../memberships/memberships.css'],
})
export class SalesAgenciesComponent implements OnInit {
  private readonly service = inject(SalesService);
  private readonly countryService = inject(CountryService);
  private readonly fb = inject(FormBuilder);

  readonly countries = signal<Country[]>([]);

  readonly rows = signal<SalesAgency[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly dialogOpen = signal(false);
  readonly editRow = signal<SalesAgency | null>(null);

  readonly form = this.fb.nonNullable.group({
    agencyCode: ['', [Validators.required, Validators.maxLength(30)]],
    agencyName: ['', [Validators.required, Validators.maxLength(255)]],
    registrationNo: ['', [Validators.maxLength(100)]],
    contactPerson: ['', [Validators.maxLength(255)]],
    phone: [''],
    mobile: [''],
    email: ['', [Validators.email]],
    // The single office address; an empty street line means "no address".
    address: this.fb.nonNullable.group({
      address: ['', [Validators.maxLength(255)]],
      city: ['', [Validators.maxLength(100)]],
      postcode: ['', [Validators.maxLength(20)]],
      state: ['', [Validators.maxLength(100)]],
      countryCode: [''],
    }),
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((r) =>
      [r.agencyCode, r.agencyName, r.registrationNo, r.contactPerson, r.email]
        .some((v) => (v || '').toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.countryService.listActive().subscribe({ next: (l) => this.countries.set(l), error: () => {} });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.listAgencies().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load agencies.');
      },
    });
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  openAdd(): void {
    this.clearMessages();
    this.editRow.set(null);
    this.form.reset({
      agencyCode: '', agencyName: '', registrationNo: '', contactPerson: '', phone: '', mobile: '', email: '',
      address: { address: '', city: '', postcode: '', state: '', countryCode: '' },
    });
    this.dialogOpen.set(true);
  }

  openEdit(row: SalesAgency): void {
    this.clearMessages();
    this.editRow.set(row);
    this.form.reset({
      agencyCode: row.agencyCode,
      agencyName: row.agencyName,
      registrationNo: row.registrationNo || '',
      contactPerson: row.contactPerson || '',
      phone: row.phone || '',
      mobile: row.mobile || '',
      email: row.email || '',
      address: {
        address: row.address?.address || '',
        city: row.address?.city || '',
        postcode: row.address?.postcode || '',
        state: row.address?.state || '',
        countryCode: row.address?.countryCode || '',
      },
    });
    this.dialogOpen.set(true);
  }

  close(): void {
    this.dialogOpen.set(false);
    this.editRow.set(null);
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const payload = this.form.getRawValue();
    const editing = this.editRow();
    this.saving.set(true);
    const req$ = editing ? this.service.updateAgency(editing.id, payload) : this.service.createAgency(payload);
    req$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.dialogOpen.set(false);
        this.editRow.set(null);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the agency.');
      },
    });
  }

  toggleActive(row: SalesAgency): void {
    this.clearMessages();
    this.service.setAgencyActive(row.id, !row.isActive).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to update the agency.'),
    });
  }

  showError(control: { touched: boolean; invalid: boolean }): boolean {
    return control.touched && control.invalid;
  }
}
