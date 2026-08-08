import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { ArService } from '../services/ar.service';
import { ArSetting } from '../models/ar.models';

// Account Receivable → AR Specification (split from Statement Generation
// 2026-08-06, same role as Club Specification for Membership): the per-company
// AR options singleton. Today: statement cutoff day + the aging boundaries
// printed on every statement. Future AR-wide switches land here, not on the
// processing screens.
@Component({
  selector: 'app-ar-specification',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    CanDirective,
  ],
  templateUrl: './ar-specification.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-specification.css'],
})
export class ArSpecificationComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);

  // Collapsible section cards (standard: start expanded; folding never loses
  // form state - the FormGroup keeps values while the DOM is hidden).
  readonly expanded = signal<Record<string, boolean>>({ cutoff: true, aging: true });

  readonly form = this.fb.nonNullable.group({
    statementCutoffDay: [''],
    aging1: ['', [Validators.required]],
    aging2: [''],
    aging3: [''],
    aging4: [''],
    aging5: [''],
    aging6: [''],
  });

  ngOnInit(): void {
    this.service.getArSetting().subscribe({
      next: (res) => { this.applySetting(res.setting); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the AR specification.');
      },
    });
  }

  toggleSection(key: string): void {
    this.expanded.update((v) => ({ ...v, [key]: !v[key] }));
  }

  isExpanded(key: string): boolean {
    return this.expanded()[key] !== false;
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  private applySetting(s: ArSetting): void {
    this.form.reset({
      statementCutoffDay: s.statementCutoffDay === null ? '' : String(s.statementCutoffDay),
      aging1: s.aging1 === null ? '' : String(s.aging1),
      aging2: s.aging2 === null ? '' : String(s.aging2),
      aging3: s.aging3 === null ? '' : String(s.aging3),
      aging4: s.aging4 === null ? '' : String(s.aging4),
      aging5: s.aging5 === null ? '' : String(s.aging5),
      aging6: s.aging6 === null ? '' : String(s.aging6),
    });
  }

  onSave(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    // input[type=number] controls carry number | null at runtime (Angular's
    // NumberValueAccessor), '' only before first edit - normalize either way.
    const num = (x: string | number | null): number | null => {
      if (x === null || x === undefined || String(x).trim() === '') return null;
      return Number(x);
    };
    this.saving.set(true);
    this.service.saveArSetting({
      statementCutoffDay: num(v.statementCutoffDay),
      aging1: num(v.aging1), aging2: num(v.aging2), aging3: num(v.aging3),
      aging4: num(v.aging4), aging5: num(v.aging5), aging6: num(v.aging6),
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.applySetting(res.setting);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the AR specification.');
      },
    });
  }
}
