import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FacilityVenue, FacilityVenuePayload, FacilityVenueService, VenueUnitOption } from '../services/facility-venue.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { FieldInfoComponent } from '../shared/field-info/field-info';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));

// Facility Management → Venues (/facility/venues; slice 5, structure approved
// 2026-10-26). Where a class is held: a place of its own with an optional
// link to one facility unit. The link decides the blocking - a slot-type unit
// is blocked whole while a session runs, an entry-type unit and an unlinked
// venue block nothing - and the drawer states it under the picker. ONE drawer
// dialog (create / edit), the listing standard.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-venues',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, FieldInfoComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './facility-venues.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-venues.css'],
})
export class FacilityVenuesComponent implements OnInit {
  private readonly service = inject(FacilityVenueService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/venues';

  readonly rows = signal<FacilityVenue[]>([]);
  readonly units = signal<VenueUnitOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly unitOptions = computed(() => this.units().map((u) => ({ value: u.id, label: `${u.code} - ${u.name} (${u.facilityTypeCode})` })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
    return sorted.filter((v) => !q || v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
      || (v.facility?.code || '').toLowerCase().includes(q) || (v.location || '').toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((v) => v.isActive !== false).length);

  readonly hint = {
    link: 'A venue that occupies a facility unit links to it. On a court or hall booked by slot the whole unit is blocked on the booking grid while a session runs, and the schedule preview skips the unit\'s closure days. On the gym or pool the session takes part of the space and nothing is blocked. A studio or meeting room that is not a facility stays unlinked. Several venues may share one unit (lanes 1-2 and lanes 3-4). The link is frozen once a session references the venue.',
    capacity: 'The default seats a session holds here. A class, a schedule or a session may lower it, never raise it.',
  };

  // --- The ONE drawer dialog ---
  readonly dlgOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly editRow = signal<FacilityVenue | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(255)]],
    facilityId: [''],
    capacity: [10, [Validators.required, Validators.min(1), Validators.max(500)]],
    location: ['', [Validators.maxLength(255)]],
    remarks: ['', [Validators.maxLength(255)]],
  });

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit venue' : 'New venue'));

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // The blocking consequence of the unit picked on the form, in words.
  linkText(): string {
    const id = this.form.controls.facilityId.value;
    if (!id) return 'Not a facility - nothing is blocked while a session runs.';
    const u = this.units().find((x) => x.id === id);
    if (!u) return '';
    return u.usageMode === 'slot'
      ? `Blocks the whole of ${u.code} on the booking grid while a session runs.`
      : `Takes part of ${u.code} - nothing is blocked, the door count stays its own.`;
  }

  // The link is frozen once a session references the venue.
  linkFrozen(): boolean {
    const r = this.editRow();
    return !!r && r.sessionCount > 0;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.venues);
        this.units.set(res.facilities);
        this.loading.set(false);
        this.returnScroll.consume(FacilityVenuesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load venues.');
      },
    });
  }

  private resetForm(v: FacilityVenue | null): void {
    this.form.reset({
      code: v?.code || '',
      name: v?.name || '',
      description: v?.description || '',
      facilityId: v?.facilityId || '',
      capacity: v?.capacity ?? 10,
      location: v?.location || '',
      remarks: v?.remarks || '',
    });
    if (v && v.sessionCount > 0) {
      this.form.controls.code.disable();
      this.form.controls.facilityId.disable();
    } else {
      this.form.controls.code.enable();
      this.form.controls.facilityId.enable();
    }
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editRow.set(null);
    this.resetForm(null);
    this.dlgOpen.set(true);
  }

  openEdit(v: FacilityVenue): void {
    this.clearMessages();
    this.editId.set(v.id);
    this.editRow.set(v);
    this.resetForm(v);
    this.dlgOpen.set(true);
  }

  closeDialog(): void {
    this.dlgOpen.set(false);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: FacilityVenuePayload = {
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      description: v.description.trim() || null,
      facilityId: v.facilityId || null,
      capacity: clampInt(v.capacity, 1, 500, 10),
      location: v.location.trim() || null,
      remarks: v.remarks.trim() || null,
    };
    if (this.linkFrozen()) {
      delete payload.code;
      delete payload.facilityId;
    }
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.closeDialog();
        this.returnScroll.remember(FacilityVenuesComponent.LIST_PATH, res.venue.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the venue.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(v: FacilityVenue): void {
    this.clearMessages();
    const next = !(v.isActive !== false);
    this.togglingId.set(v.id);
    this.service.update(v.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${v.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityVenuesComponent.LIST_PATH, v.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the venue.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(v: FacilityVenue): void {
    this.clearMessages();
    const inUse = v.classCount + v.sessionCount;
    this.confirmAction.set({
      title: 'Delete venue',
      message: inUse
        ? `${v.code} is named by ${v.classCount} class${v.classCount === 1 ? '' : 'es'} and ${v.sessionCount} session${v.sessionCount === 1 ? '' : 's'} - disable it to keep it out of use.`
        : `Delete venue ${v.code} (${v.name})? This cannot be undone.`,
      confirmLabel: 'Delete venue',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(v.id);
        this.service.remove(v.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the venue.');
          },
        });
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
