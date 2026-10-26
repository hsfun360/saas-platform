import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent, ComboOption } from '../shared/combobox/combobox';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { FacilityNoShowService, FacilitySuspension } from '../services/facility-noshow.service';

// Facility Management -> Booking Suspensions (/facility/suspensions;
// structures approved 2026-10-26, slice 4). Active and past suspensions -
// automatic after repeated no-shows or keyed by the office - with Lift (a
// reason) and New suspension (member, dates, reason, optional facility type).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-suspensions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent, ComboboxComponent, LocalDatePipe],
  templateUrl: './facility-suspensions.html',
  styleUrls: ['./facility-suspensions.css'],
})
export class FacilitySuspensionsComponent implements OnInit {
  private readonly service = inject(FacilityNoShowService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/suspensions';

  readonly suspensions = signal<FacilitySuspension[]>([]);
  readonly facilityTypes = signal<{ id: string; code: string; description: string }[]>([]);
  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly status = signal<'' | 'active' | 'lifted' | 'expired'>('active');
  readonly search = signal('');
  readonly busyId = signal<string | null>(null);
  readonly typeOptions = computed<ComboOption[]>(() => this.facilityTypes().map((t) => ({ value: t.id, label: `${t.code} - ${t.description}` })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.suspensions();
    if (!q) return list;
    return list.filter((s) => s.patronName.toLowerCase().includes(q) || (s.memberNo || '').toLowerCase().includes(q) || s.reason.toLowerCase().includes(q));
  });

  // The ONE drawer: 'new' | 'lift'.
  readonly dlgMode = signal<'new' | 'lift' | null>(null);
  readonly liftTarget = signal<FacilitySuspension | null>(null);
  readonly saving = signal(false);
  readonly form = this.fb.nonNullable.group({
    memberNo: ['', [Validators.required, Validators.maxLength(50)]],
    fromDate: [localDateOnly(), Validators.required],
    toDate: ['', Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(255)]],
    facilityTypeId: [''],
  });
  readonly liftForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.maxLength(255)]] });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.listSuspensions(this.status() || null).subscribe({
      next: (res) => {
        this.suspensions.set(res.suspensions);
        this.facilityTypes.set(res.facilityTypes);
        this.loading.set(false);
        this.returnScroll.consume(FacilitySuspensionsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the suspensions.');
      },
    });
  }

  setStatus(s: string): void {
    this.status.set((['active', 'lifted', 'expired'].includes(s) ? s : '') as '' | 'active' | 'lifted' | 'expired');
    this.load();
  }

  clearSearch(): void {
    this.search.set('');
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  statusClass(s: FacilitySuspension): string {
    if (s.status === 'active') return 'status-chip--danger';
    return 'status-chip--off';
  }

  openNew(): void {
    this.clearMessages();
    this.form.reset({ memberNo: '', fromDate: localDateOnly(), toDate: '', reason: '', facilityTypeId: '' });
    this.dlgMode.set('new');
  }

  openLift(s: FacilitySuspension): void {
    this.clearMessages();
    this.liftTarget.set(s);
    this.liftForm.reset({ reason: '' });
    this.dlgMode.set('lift');
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.liftTarget.set(null);
    this.form.markAsPristine();
    this.liftForm.markAsPristine();
  }

  isDirty(): boolean {
    return this.dlgMode() === 'new' ? this.form.dirty : this.liftForm.dirty;
  }

  submitNew(): void {
    this.clearMessages();
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    if (v.toDate < v.fromDate) { this.errorMessage.set('The last day must not be before the first day.'); return; }
    this.saving.set(true);
    this.service.createSuspension({ memberNo: v.memberNo.trim(), fromDate: v.fromDate, toDate: v.toDate, reason: v.reason.trim(), facilityTypeId: v.facilityTypeId || null }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(`${res.suspension.patronName} suspended from booking until ${formatLocalDate(res.suspension.toDate)}.`);
        this.form.markAsPristine();
        this.closeDialog();
        this.status.set('active');
        this.returnScroll.remember(FacilitySuspensionsComponent.LIST_PATH, res.suspension.id);
        this.load();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to create the suspension.'); },
    });
  }

  submitLift(): void {
    this.clearMessages();
    const s = this.liftTarget();
    if (!s) return;
    if (this.liftForm.invalid) { this.liftForm.markAllAsTouched(); return; }
    this.saving.set(true);
    this.service.liftSuspension(s.id, this.liftForm.getRawValue().reason.trim()).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.liftForm.markAsPristine();
        this.closeDialog();
        this.returnScroll.remember(FacilitySuspensionsComponent.LIST_PATH, s.id);
        this.load();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to lift the suspension.'); },
    });
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
