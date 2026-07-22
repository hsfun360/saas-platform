import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { TaxSchemeService } from '../services/tax-scheme.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CompanyTaxAdoption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// System Setup → Company Tax (per active company / workspace).
// The subscriber defines the tax catalog once (Tax Setup); here a Tenant Admin, in a
// company's context, chooses which of that country's schemes THIS company uses and
// overrides GL accounts per component. Opt-out model: a scheme is on unless disabled.
// Reuses the System Setup stylesheet for the shared admin-screen look.
//
// The edit dialog is a typed Reactive Form (canonical reference: platform-users):
// an `enabled` boolean control plus a nested `gl` FormGroup keyed by tax component
// code (rebuilt per scheme, since the component set varies). `editForm.dirty` feeds
// the shared dialog's unsaved-changes guard.
@Component({
  selector: 'app-company-tax',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './company-tax.html',
  styleUrls: ['../system-setup/system-setup.css', './company-tax.css'],
})
export class CompanyTaxComponent implements OnInit {
  private readonly service = inject(TaxSchemeService);
  private readonly fb = inject(FormBuilder);

  readonly adoptions = signal<CompanyTaxAdoption[]>([]);
  readonly loading = signal(false);
  // Set when the API says the company has no country (400) - a distinct empty state.
  readonly noCountry = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Edit dialog: enable/disable + per-component GL overrides for one scheme.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editScheme = signal<CompanyTaxAdoption | null>(null);
  // `enabled` is the adopt flag; `gl` is a FormRecord keyed by component tax code,
  // rebuilt in openEdit() because the component set differs per scheme. The record
  // is held directly (typed for add/removeControl) and nested into the form.
  private readonly glRecord = new FormRecord<FormControl<string>>({});
  readonly editForm = this.fb.nonNullable.group({
    enabled: this.fb.nonNullable.control(true),
    gl: this.glRecord,
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.adoptions()].sort((a, b) => {
      if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
      return a.taxSchemeCode.localeCompare(b.taxSchemeCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        a.taxSchemeCode.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
    );
  });
  readonly enabledCount = computed(() => this.adoptions().filter((a) => a.isEnabled).length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.noCountry.set(false);
    this.service.companyAdoption().subscribe({
      next: (data) => {
        this.adoptions.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 400) {
          this.noCountry.set(true);
        } else {
          this.errorMessage.set(err.error?.message || 'Failed to load company tax schemes.');
        }
      },
    });
  }

  // Build the { taxCode: glAccountCode } map of this scheme's current overrides.
  private overridesOf(a: CompanyTaxAdoption): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of a.components) {
      if (c.companyGlAccountCode) out[c.taxCode] = c.companyGlAccountCode;
    }
    return out;
  }

  // Quick enable/disable without opening the editor. Preserves existing GL overrides
  // (the PUT replaces them wholesale, so we resend the current ones).
  toggleEnabled(a: CompanyTaxAdoption): void {
    this.clearMessages();
    this.togglingId.set(a.id);
    this.service.setCompanyAdoption(a.id, { isEnabled: !a.isEnabled, glOverrides: this.overridesOf(a) }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update.');
        this.togglingId.set(null);
      },
    });
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openEdit(a: CompanyTaxAdoption): void {
    this.clearMessages();
    // Rebuild the gl record for this scheme's components, then seed it pristine.
    const gl = this.glRecord;
    for (const key of Object.keys(gl.controls)) gl.removeControl(key);
    const overrides = this.overridesOf(a);
    for (const c of a.components) {
      gl.addControl(c.taxCode, this.fb.nonNullable.control(overrides[c.taxCode] || '', [Validators.maxLength(50)]));
    }
    this.editForm.controls.enabled.setValue(a.isEnabled);
    this.editForm.markAsPristine();
    this.editScheme.set(a);
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    const a = this.editScheme();
    if (!a) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const raw = this.editForm.getRawValue();
    // Keep only non-empty overrides; a blank input clears that component's override.
    const glOverrides: Record<string, string> = {};
    for (const c of a.components) {
      const v = (raw.gl[c.taxCode] || '').trim();
      if (v) glOverrides[c.taxCode] = v;
    }
    this.editSaving.set(true);
    this.service.setCompanyAdoption(a.id, { isEnabled: raw.enabled, glOverrides }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.editSaving.set(false);
        this.editOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save.');
        this.editSaving.set(false);
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
