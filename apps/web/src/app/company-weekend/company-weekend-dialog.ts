import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../shared/dialog/dialog';
import { CompanyWeekendService } from '../services/company-weekend.service';
import { CompanyEntity } from '../models/auth.models';

// ISO 8601 weekday numbers: 1 = Monday ... 7 = Sunday.
const DAYS: ReadonlyArray<{ day: number; key: string; label: string }> = [
  { day: 1, key: 'd1', label: 'Monday' },
  { day: 2, key: 'd2', label: 'Tuesday' },
  { day: 3, key: 'd3', label: 'Wednesday' },
  { day: 4, key: 'd4', label: 'Thursday' },
  { day: 5, key: 'd5', label: 'Friday' },
  { day: 6, key: 'd6', label: 'Saturday' },
  { day: 7, key: 'd7', label: 'Sunday' },
];

// Tenant Admin: set which day(s) of the week are one company's weekend / rest
// days (varies by state - e.g. Fri+Sat in Johor, Sat+Sun in KL). Drives the
// weekday/weekend pricing matrices downstream (golf green fees etc.). Opens as
// a dialog from the Companies screen, like the SMTP config. An empty selection
// is valid: the company is "not configured" and weekend pricing never applies.
@Component({
  selector: 'app-company-weekend-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './company-weekend-dialog.html',
  styles: [`
    .wk-day { display: flex; align-items: center; gap: var(--space-sm); min-height: 44px; padding: 0 var(--space-sm); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: var(--font-body); color: var(--text-primary); background: var(--surface-card); }
    .wk-day input { width: 18px; height: 18px; flex-shrink: 0; }
    .wk-day--on { background: var(--surface-selected); border-color: var(--border-strong); }
    .wk-list { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-sm); margin-bottom: var(--space-md); }
    @media (max-width: 767px) { .wk-list { grid-template-columns: 1fr; } }
    .wk-summary { border-radius: 8px; padding: var(--space-sm) var(--space-md); font-size: var(--font-body-2); margin-bottom: var(--space-md); background: var(--info-surface); color: var(--info-text); border: 1px solid var(--info-border); }
    .wk-hint { font-size: var(--font-caption); color: var(--text-muted); margin: 0 0 var(--space-md); }
  `],
})
export class CompanyWeekendDialogComponent implements OnInit {
  readonly company = input.required<CompanyEntity>();
  readonly close = output<void>();

  private readonly service = inject(CompanyWeekendService);
  private readonly fb = inject(FormBuilder);

  readonly days = DAYS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    d1: [false], d2: [false], d3: [false], d4: [false], d5: [false], d6: [false], d7: [false],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // The concrete outcome, always visible before saving (no dark rooms).
  readonly selectedLabels = computed(() => {
    const v = this.formValue();
    return DAYS.filter((d) => v[d.key as keyof typeof v]).map((d) => d.label);
  });

  ngOnInit(): void {
    this.service.get(this.company().id).subscribe({
      next: (res) => {
        const patch: Record<string, boolean> = {};
        for (const d of DAYS) patch[d.key] = res.weekendDays.includes(d.day);
        this.form.reset(patch as never);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load weekend days.');
        this.loading.set(false);
      },
    });
  }

  isOn(key: string): boolean {
    const v = this.formValue();
    return !!v[key as keyof typeof v];
  }

  save(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    const v = this.form.getRawValue();
    const weekendDays = DAYS.filter((d) => v[d.key as keyof typeof v]).map((d) => d.day);
    this.saving.set(true);
    this.service.save(this.company().id, weekendDays).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || 'Saved.');
        this.form.reset(this.form.getRawValue());
        this.saving.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save weekend days.');
        this.saving.set(false);
      },
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
