import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { Facility, FacilityPayload, FacilityService } from '../services/facility.service';
import { FacilityType, FacilityTypeService, FacilityUsageMode } from '../services/facility-type.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

const MODE_ICONS: Record<FacilityUsageMode, string> = { slot: 'event_available', entry: 'login', issue: 'key' };
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));

// Facility Management → Facilities (/facility/facilities; structure approved
// 2026-10-25). The physical units under each Facility Type - Badminton Court
// 1-8, the Gym, Locker 001-200. The type is picked at creation and then
// fixed; closures are keyed on the Facility Closures screen (the row's menu
// jumps there with the unit preselected).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facilities',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './facilities.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../membership-types/membership-types.css', './facilities.css'],
})
export class FacilitiesComponent implements OnInit {
  private readonly service = inject(FacilityService);
  private readonly typeService = inject(FacilityTypeService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/facilities';

  readonly rows = signal<Facility[]>([]);
  readonly types = signal<FacilityType[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly uploading = signal(false);

  readonly search = signal('');
  readonly typeFilter = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    facilityTypeId: ['', [Validators.required]],
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    location: ['', [Validators.maxLength(255)]],
    isIndoor: [false],
    isFloodlit: [false],
    capacity: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100000)]),
    sortOrder: [100, [Validators.required, Validators.min(0), Validators.max(9999)]],
    remarks: ['', [Validators.maxLength(2000)]],
    pictureUrl: [''],
  });

  // Types that have at least one unit (the filter row) and the active types
  // (the create picker).
  readonly filterTypes = computed(() => {
    const used = new Set(this.rows().map((r) => r.facilityTypeId));
    return this.types().filter((t) => used.has(t.id));
  });
  readonly pickerTypes = computed(() => this.types().filter((t) => t.isActive !== false));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const typeId = this.typeFilter();
    // The server orders by type then unit; inactive units trail within the list.
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    return sorted.filter((r) => (!typeId || r.facilityTypeId === typeId)
      && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.location || '').toLowerCase().includes(q)
        || (r.facilityType?.code || '').toLowerCase().includes(q) || (r.facilityType?.description || '').toLowerCase().includes(q)));
  });
  readonly activeCount = computed(() => this.rows().filter((r) => r.isActive !== false).length);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit facility' : 'New facility'));

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  modeIcon(mode: FacilityUsageMode | undefined): string {
    return mode ? MODE_ICONS[mode] : 'category';
  }

  // The type the form currently names (drives the capacity field and hints).
  selectedType(): FacilityType | null {
    const id = this.form.controls.facilityTypeId.value;
    return this.types().find((t) => t.id === id) || null;
  }

  typeLabel(r: Facility): string {
    return r.facilityType ? `${r.facilityType.code} - ${r.facilityType.description}` : '';
  }

  load(): void {
    this.loading.set(true);
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending === 0) {
        this.loading.set(false);
        this.returnScroll.consume(FacilitiesComponent.LIST_PATH, this.injector);
      }
    };
    this.service.list().subscribe({
      next: (rows) => { this.rows.set(rows); done(); },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Failed to load facilities.'); done(); },
    });
    this.typeService.list().subscribe({
      next: (types) => { this.types.set(types); done(); },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Failed to load facility types.'); done(); },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      facilityTypeId: this.typeFilter() || '', code: '', name: '', location: '', isIndoor: false, isFloodlit: false,
      capacity: null, sortOrder: 100, remarks: '', pictureUrl: '',
    });
    this.form.controls.facilityTypeId.enable();
    this.dialogOpen.set(true);
  }

  openEdit(r: Facility): void {
    this.clearMessages();
    this.editId.set(r.id);
    this.form.reset({
      facilityTypeId: r.facilityTypeId, code: r.code, name: r.name, location: r.location || '',
      isIndoor: r.isIndoor === true, isFloodlit: r.isFloodlit === true, capacity: r.capacity ?? null,
      sortOrder: r.sortOrder ?? 100, remarks: r.remarks || '', pictureUrl: r.pictureUrl || '',
    });
    // The type is fixed once the unit exists (closures and bookings hang off it).
    this.form.controls.facilityTypeId.disable();
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onPictureSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadPicture(file).subscribe({
      next: (res) => {
        this.form.controls.pictureUrl.setValue(res.url);
        this.form.controls.pictureUrl.markAsDirty();
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the picture.');
      },
    });
  }

  removePicture(): void {
    this.form.controls.pictureUrl.setValue('');
    this.form.controls.pictureUrl.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const type = this.selectedType();
    const payload: FacilityPayload = {
      facilityTypeId: v.facilityTypeId,
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      location: v.location.trim() || null,
      isIndoor: v.isIndoor === true,
      isFloodlit: v.isFloodlit === true,
      capacity: type?.usageMode === 'entry' && v.capacity !== null && v.capacity !== undefined && String(v.capacity) !== '' ? clampInt(v.capacity, 1, 100000, 1) : null,
      sortOrder: clampInt(v.sortOrder, 0, 9999, 100),
      remarks: v.remarks.trim() || null,
      pictureUrl: v.pictureUrl || null,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.dialogOpen.set(false);
        this.returnScroll.remember(FacilitiesComponent.LIST_PATH, res.facility.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the facility.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(r: Facility): void {
    this.clearMessages();
    const next = !(r.isActive !== false);
    this.togglingId.set(r.id);
    this.service.update(r.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${r.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilitiesComponent.LIST_PATH, r.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the facility.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(r: Facility): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete facility',
      message: `Delete ${r.code} (${r.name})? It is refused while a closure plan names it; disable it instead to keep history. This cannot be undone.`,
      confirmLabel: 'Delete facility',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(r.id);
        this.service.remove(r.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the facility.');
          },
        });
      },
    });
  }

  // Closures are keyed on their own screen; jump there with this unit preselected.
  openClosures(r: Facility): void {
    this.returnScroll.remember(FacilitiesComponent.LIST_PATH, r.id);
    this.router.navigate(['/facility/closures'], { queryParams: { facilityTypeId: r.facilityTypeId, facilityId: r.id } });
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
