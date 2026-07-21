import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PublicHolidayService } from '../services/public-holiday.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { HolidayCountry, PublicHoliday } from '../models/auth.models';

// System Setup → Public Holidays. Subscriber-owned reference data, scoped by
// country: the Tenant Admin maintains one holiday calendar per country their
// companies operate in (Company.countryCode), consumed by product booking
// calendars via /api/public-holidays. When the subscriber's companies are all
// in a SINGLE country, the country picker/filter is hidden and defaulted.
// Enable/disable, no hard delete. Reactive Forms + the dialog dirty-guard.
@Component({
  selector: 'app-public-holidays',
  standalone: true,
  imports: [LocalDatePipe, ScreenTitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './public-holidays.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class PublicHolidaysComponent implements OnInit {
  private readonly service = inject(PublicHolidayService);
  private readonly fb = inject(FormBuilder);

  readonly holidays = signal<PublicHoliday[]>([]);
  readonly countries = signal<HolidayCountry[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    countryCode: ['', [Validators.required]],
    holidayDate: ['', [Validators.required]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly search = signal('');
  readonly countryFilter = signal(''); // '' = all countries
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // A subscriber whose companies are all in one country never sees a country
  // picker - the single country is defaulted behind the scenes.
  readonly singleCountry = computed<HolidayCountry | null>(() => {
    const list = this.countries();
    return list.length === 1 ? list[0] : null;
  });
  readonly multiCountry = computed(() => this.countries().length > 1);

  private readonly countryByCode = computed(() => {
    const map = new Map<string, HolidayCountry>();
    for (const c of this.countries()) map.set(c.countryCode, c);
    return map;
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const country = this.countryFilter();
    const sorted = [...this.holidays()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (a.holidayDate !== b.holidayDate) return a.holidayDate.localeCompare(b.holidayDate);
      return a.description.localeCompare(b.description);
    });
    return sorted.filter((h) => {
      if (country && h.countryCode !== country) return false;
      if (!q) return true;
      return (
        h.description.toLowerCase().includes(q) ||
        h.holidayDate.includes(q) ||
        this.countryName(h.countryCode).toLowerCase().includes(q)
      );
    });
  });
  readonly activeCount = computed(() => this.holidays().filter((h) => h.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().description ?? ''}` : 'New public holiday',
  );

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  countryName(code: string): string {
    return this.countryByCode().get(code)?.name || code.toUpperCase();
  }

  countryFlag(code: string): string {
    return this.countryByCode().get(code)?.flagEmoji || '';
  }

  // Show the country on a card only when it carries information: multiple
  // countries, or a stale holiday whose country no longer matches the single
  // company country.
  showCardCountry(h: PublicHoliday): boolean {
    const single = this.singleCountry();
    return !single || h.countryCode !== single.countryCode;
  }

  load(): void {
    this.loading.set(true);
    this.service.listCountries().subscribe({
      next: (data) => this.countries.set(data),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load your companies’ countries.'),
    });
    this.service.listAll().subscribe({
      next: (data) => {
        this.holidays.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load public holidays.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    const single = this.singleCountry();
    this.form.reset({
      countryCode: single ? single.countryCode : this.countryFilter() || '',
      holidayDate: '',
      description: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(h: PublicHoliday): void {
    this.clearMessages();
    this.editId.set(h.id);
    this.form.reset({
      countryCode: h.countryCode,
      holidayDate: h.holidayDate,
      description: h.description,
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
      countryCode: v.countryCode,
      holidayDate: v.holidayDate,
      description: v.description.trim(),
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.description} (${payload.holidayDate}) ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save public holiday.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(h: PublicHoliday): void {
    this.clearMessages();
    const next = !(h.isActive !== false);
    this.togglingId.set(h.id);
    this.service.update(h.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${h.description} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update public holiday.');
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
