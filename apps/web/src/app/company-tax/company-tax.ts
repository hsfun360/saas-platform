import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaxSchemeService } from '../services/tax-scheme.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CompanyTaxAdoption } from '../models/auth.models';

// System Setup → Company Tax (per active company / workspace).
// The subscriber defines the tax catalog once (Tax Setup); here a Tenant Admin, in a
// company's context, chooses which of that country's schemes THIS company uses and
// overrides GL accounts per component. Opt-out model: a scheme is on unless disabled.
// Reuses the System Setup stylesheet for the shared admin-screen look.
@Component({
  selector: 'app-company-tax',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './company-tax.html',
  styleUrls: ['../system-setup/system-setup.css', './company-tax.css'],
})
export class CompanyTaxComponent implements OnInit {
  private readonly service = inject(TaxSchemeService);

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
  editEnabled = true;
  editGl: Record<string, string> = {};

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

  openEdit(a: CompanyTaxAdoption): void {
    this.clearMessages();
    this.editScheme.set(a);
    this.editEnabled = a.isEnabled;
    this.editGl = this.overridesOf(a);
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    const a = this.editScheme();
    if (!a) return;
    // Keep only non-empty overrides; a blank input clears that component's override.
    const glOverrides: Record<string, string> = {};
    for (const c of a.components) {
      const v = (this.editGl[c.taxCode] || '').trim();
      if (v) glOverrides[c.taxCode] = v;
    }
    this.editSaving.set(true);
    this.service.setCompanyAdoption(a.id, { isEnabled: this.editEnabled, glOverrides }).subscribe({
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
