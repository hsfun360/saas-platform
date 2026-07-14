import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TitleService } from '../services/title.service';
import { CountryService } from '../services/country.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Country, Title } from '../models/auth.models';

// System Setup → Titles. Subscriber-owned reference data: honorifics (Datuk, Tan
// Sri, Sir, Prof...), one list per Account, shared by every company and consumed
// by Membership pickers. Each may be bound to a Country (Tun/Tan Sri/Datuk = MY);
// blank country = universal. Enable/disable, no hard delete.
@Component({
  selector: 'app-titles',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './titles.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class TitlesComponent implements OnInit {
  private readonly service = inject(TitleService);
  private readonly countryService = inject(CountryService);
  private readonly fb = inject(FormBuilder);

  readonly titles = signal<Title[]>([]);
  readonly countries = signal<Country[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    titleCode: ['', [Validators.required, Validators.maxLength(30)]],
    description: ['', [Validators.maxLength(200)]],
    countryCode: [''],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.titles()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.titleCode.localeCompare(b.titleCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.titleCode.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        this.countryName(t.countryCode).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.titles().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().titleCode ?? ''}` : 'New title',
  );

  ngOnInit(): void {
    this.load();
    this.countryService.listActive().subscribe({ next: (l) => this.countries.set(l), error: () => {} });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  countryFlag(code: string | null | undefined): string {
    if (!code) return '';
    return this.countries().find((c) => c.alpha2 === code)?.flagEmoji || '';
  }

  countryName(code: string | null | undefined): string {
    if (!code) return '';
    return this.countries().find((c) => c.alpha2 === code)?.name || code;
  }

  load(): void {
    this.loading.set(true);
    this.service.listAll().subscribe({
      next: (data) => {
        this.titles.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load titles.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ titleCode: '', description: '', countryCode: '' });
    this.dialogOpen.set(true);
  }

  openEdit(t: Title): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({ titleCode: t.titleCode, description: t.description || '', countryCode: t.countryCode || '' });
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
      titleCode: v.titleCode.trim(),
      description: v.description.trim() || null,
      countryCode: v.countryCode || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.titleCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save title.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: Title): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.update(t.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${t.titleCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update title.');
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
