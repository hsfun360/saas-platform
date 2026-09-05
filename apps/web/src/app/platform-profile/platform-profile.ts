import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PlatformProfileService } from '../services/platform-profile.service';
import { CountryService } from '../services/country.service';
import { CurrencyService } from '../services/currency.service';
import { TaxSchemeService } from '../services/tax-scheme.service';
import { EInvoiceMsicCodeService } from '../services/e-invoice-msic-code.service';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { PlatformProfile, PlatformChargeQuote, Country, Currency, TaxScheme, EInvoiceMsicCode } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ComboboxComponent } from '../shared/combobox/combobox';

// SaaS Administration → Platform Profile: the platform's own "company of record" (a
// singleton). Its identity is the invoice header the platform issues to subscribers,
// and its country + default scheme anchor the platform's own tax (so a MY platform
// always taxes charges with a MY scheme). One flat settings form.
//
// Reactive Forms (see docs/coding-standards.md → "Forms", canonical reference
// `platform-users`): one typed nonNullable FormGroup, validators on the controls,
// `<app-phone-input>` bound via formControlName, inline role="alert" errors, correct
// HTML5 input types. The billing country drives the scheme picker via a signal.
@Component({
  selector: 'app-platform-profile',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, PhoneInputComponent, MoneyInputDirective, ComboboxComponent],
  templateUrl: './platform-profile.html',
  styleUrls: ['../system-setup/system-setup.css', './platform-profile.css'],
})
export class PlatformProfileComponent implements OnInit {
  private readonly service = inject(PlatformProfileService);
  private readonly countryService = inject(CountryService);
  private readonly currencyService = inject(CurrencyService);
  private readonly taxService = inject(TaxSchemeService);
  private readonly msicService = inject(EInvoiceMsicCodeService);
  private readonly fb = inject(FormBuilder);

  // LHDN MSIC codes for the e-Invoice section's picker (datalist assist).
  readonly msicOptions = signal<EInvoiceMsicCode[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploadingLogo = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly countries = signal<Country[]>([]);
  readonly currencies = signal<Currency[]>([]);
  // The platform-owned tax catalog (accountId NULL) - the source of the scheme picker.
  readonly platformSchemes = signal<TaxScheme[]>([]);

  // The whole profile, as one typed nonNullable group (controls stay non-null
  // strings). Only legalName is required (it heads every invoice); email must be a
  // valid address. logo/countryCode/baseCurrencyCode/defaultTaxSchemeCode carry no
  // validators but are part of the saved payload.
  readonly form = this.fb.nonNullable.group({
    legalName: ['', [Validators.required, Validators.maxLength(150)]],
    tradingName: ['', [Validators.maxLength(150)]],
    registrationNumber: ['', [Validators.maxLength(50)]],
    taxRegistrationNumber: ['', [Validators.maxLength(50)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone: [''],
    website: ['', [Validators.maxLength(255)]],
    addressLine1: ['', [Validators.maxLength(150)]],
    addressLine2: ['', [Validators.maxLength(150)]],
    city: ['', [Validators.maxLength(100)]],
    state: ['', [Validators.maxLength(100)]],
    postalCode: ['', [Validators.maxLength(20)]],
    logo: [''],
    // LHDN e-Invoice issuer identity (Malaysia MyInvois).
    tin: ['', [Validators.maxLength(20)]],
    msicCode: ['', [Validators.maxLength(20)]],
    businessActivityDescription: ['', [Validators.maxLength(300)]],
    sstRegistrationNumber: ['', [Validators.maxLength(35)]],
    ttxRegistrationNumber: ['', [Validators.maxLength(35)]],
    countryCode: [''],
    baseCurrencyCode: [''],
    defaultTaxSchemeCode: [''],
  });

  // Mirrors the billing country control so the scheme picker recomputes reactively
  // when the country changes (a plain control read isn't a signal dependency).
  readonly countryCode = signal('');

  // Only the platform schemes for the chosen billing country are valid choices for the
  // default tax scheme - this is what pins a MY invoice to a MY scheme.
  readonly schemesForCountry = computed(() => {
    const cc = this.countryCode().toLowerCase();
    if (!cc) return [];
    return this.platformSchemes().filter((s) => s.countryCode === cc && s.isActive !== false);
  });

  // Combobox options (house standard: long reference lists get the shared
  // constrained combobox). Labels mirror what the old <select> options rendered.
  readonly countryOptions = computed(() =>
    this.countries().map((c) => ({ value: c.alpha2, label: `${c.flagEmoji ? c.flagEmoji + ' ' : ''}${c.name}` })));
  readonly currencyOptions = computed(() =>
    this.currencies().map((cur) => ({ value: cur.code, label: `${cur.code} — ${cur.name}` })));
  readonly schemeOptions = computed(() =>
    this.schemesForCountry().map((s) => ({ value: s.taxSchemeCode, label: `${s.taxSchemeCode} — ${s.name}` })));

  // ---- Test: quote a charge through the profile ----
  readonly quoteAmount = signal<number>(100);
  readonly quoting = signal(false);
  readonly quoteResult = signal<PlatformChargeQuote | null>(null);
  readonly quoteError = signal('');

  ngOnInit(): void {
    this.loadCountries();
    this.loadCurrencies();
    this.loadSchemes();
    this.loadMsicCodes();
    this.load();
    this.syncSchemeState();
  }

  // Show a control's validation message once the user has interacted with it (or
  // after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  private load(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (p) => {
        // Null → '' so the controls stay non-null strings. reset() keeps the form
        // pristine after seeding.
        this.form.reset({
          legalName: p.legalName || '', tradingName: p.tradingName || '',
          registrationNumber: p.registrationNumber || '', taxRegistrationNumber: p.taxRegistrationNumber || '',
          email: p.email || '', phone: p.phone || '', website: p.website || '',
          addressLine1: p.addressLine1 || '', addressLine2: p.addressLine2 || '',
          city: p.city || '', state: p.state || '', postalCode: p.postalCode || '',
          logo: p.logo || '', countryCode: p.countryCode || '', baseCurrencyCode: p.baseCurrencyCode || '',
          defaultTaxSchemeCode: p.defaultTaxSchemeCode || '',
          tin: p.tin || '', msicCode: p.msicCode || '',
          businessActivityDescription: p.businessActivityDescription || '',
          sstRegistrationNumber: p.sstRegistrationNumber || '',
          ttxRegistrationNumber: p.ttxRegistrationNumber || '',
        });
        this.countryCode.set(p.countryCode || '');
        this.syncSchemeState();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load platform profile.');
      },
    });
  }

  private loadCountries(): void {
    this.countryService.listActive().subscribe({ next: (l) => this.countries.set(l), error: () => {} });
  }

  private loadCurrencies(): void {
    this.currencyService.listActive().subscribe({ next: (l) => this.currencies.set(l), error: () => {} });
  }

  private loadSchemes(): void {
    this.taxService.list(undefined, true).subscribe({ next: (l) => this.platformSchemes.set(l), error: () => {} });
  }

  private loadMsicCodes(): void {
    this.msicService.listActive().subscribe({ next: (l) => this.msicOptions.set(l), error: () => {} });
  }

  // MSIC code -> business activity description assist: when a known code is
  // picked/typed, fill the description if the user hasn't written their own.
  onMsicChange(code: string): void {
    const match = this.msicOptions().find((m) => m.code === code.trim().toUpperCase());
    if (match && !this.form.getRawValue().businessActivityDescription.trim()) {
      this.form.patchValue({ businessActivityDescription: match.description });
    }
  }

  // The scheme picker is only usable once a billing country is chosen - disable it
  // (rather than an attribute-bound [disabled], which reactive forms warns about)
  // when there's no country. getRawValue() still returns the value when disabled.
  private syncSchemeState(): void {
    const control = this.form.controls.defaultTaxSchemeCode;
    if (this.countryCode()) {
      if (control.disabled) control.enable({ emitEvent: false });
    } else if (control.enabled) {
      control.disable({ emitEvent: false });
    }
  }

  // If the billing country changes and the chosen scheme is no longer valid, clear it.
  onCountryChange(): void {
    this.countryCode.set(this.form.controls.countryCode.value);
    const valid = this.schemesForCountry().some(
      (s) => s.taxSchemeCode === this.form.controls.defaultTaxSchemeCode.value,
    );
    if (!valid) this.form.controls.defaultTaxSchemeCode.setValue('');
    this.syncSchemeState();
    this.quoteResult.set(null);
    this.quoteError.set('');
  }

  // Upload a chosen logo file to GCS; store the returned URL on the form (same flow
  // as the Company logo).
  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Please choose an image file for the logo.');
      return;
    }
    if (file.size > 1024 * 1024) {
      this.errorMessage.set('Logo is too large. Please choose an image under 1MB.');
      return;
    }
    this.uploadingLogo.set(true);
    const data = new FormData();
    data.append('logo', file);
    this.service.uploadLogo(data).subscribe({
      next: (res) => {
        this.form.patchValue({ logo: res.url });
        this.uploadingLogo.set(false);
        input.value = ''; // allow re-selecting the same file later
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload logo.');
        this.uploadingLogo.set(false);
      },
    });
  }

  removeLogo(): void {
    this.form.patchValue({ logo: '' });
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // reveal every field's error at once
      this.errorMessage.set('Legal name is required (it heads every invoice).');
      return;
    }
    // getRawValue() includes disabled controls, so the payload keeps the same shape
    // and endpoint as before.
    const payload = this.form.getRawValue() as PlatformProfile;
    this.saving.set(true);
    this.service.save(payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save platform profile.');
      },
    });
  }

  onQuote(): void {
    this.quoteError.set('');
    this.quoteResult.set(null);
    const amount = Number(this.quoteAmount());
    if (!Number.isFinite(amount)) {
      this.quoteError.set('Enter a numeric amount.');
      return;
    }
    this.quoting.set(true);
    this.service.quote(amount).subscribe({
      next: (q) => {
        this.quoting.set(false);
        this.quoteResult.set(q);
      },
      error: (err) => {
        this.quoting.set(false);
        this.quoteError.set(err.error?.message || 'Failed to quote the charge.');
      },
    });
  }

  countryName(code: string | null): string {
    if (!code) return '';
    return this.countries().find((c) => c.alpha2 === code)?.name || code;
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
