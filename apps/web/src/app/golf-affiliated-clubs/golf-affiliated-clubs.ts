import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  GolfAffiliatedClubService, GolfAffiliatedClub, GolfAffiliatedClubKind, GolfVisitCapPeriod, GolfAffiliatedClubMeta,
} from '../services/golf-affiliated-club.service';
import { CountryService } from '../services/country.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { CanDirective } from '../shared/can.directive';
import { Country, MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { addressLines } from '../shared/address';

// Golf Management → Common Setup → Affiliated Clubs (/golf/affiliated-clubs;
// user decisions 2026-10-15). The associations and reciprocal clubs whose
// members this club admits under a letter of introduction, with the terms
// of each arrangement: the affiliate player type its visitors are billed
// as, the agreement's validity, whether charges may be signed back to the
// home club, the guests per visit, the per-player visit cap and the
// approval flag. The visits themselves are recorded on Affiliated Visits.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-affiliated-clubs',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, ComboboxComponent, PhoneInputComponent, CanDirective, OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './golf-affiliated-clubs.html',
  // membership-types.css supplies the shared .mt-chip pill; own css = the switch rows.
  styleUrls: ['../membership-types/membership-types.css', './golf-affiliated-clubs.css'],
})
export class GolfAffiliatedClubsComponent implements OnInit {
  private readonly service = inject(GolfAffiliatedClubService);
  private readonly countryService = inject(CountryService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/affiliated-clubs';

  readonly rows = signal<GolfAffiliatedClub[]>([]);
  readonly kinds = signal<MembershipStatusOption[]>([]);
  readonly periods = signal<MembershipStatusOption[]>([]);
  readonly meta = signal<GolfAffiliatedClubMeta | null>(null);
  readonly countries = signal<Country[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    kind: ['' as GolfAffiliatedClubKind | '', [Validators.required]],
    playerTypeId: ['', [Validators.required]],
    agreementFrom: [''],
    agreementTo: [''],
    allowChargeToHomeClub: [false],
    maxGuestsPerVisit: [null as number | null, [Validators.min(0), Validators.max(99)]],
    maxVisitsPerPlayer: [null as number | null, [Validators.min(1), Validators.max(999)]],
    maxVisitsPeriod: ['year' as GolfVisitCapPeriod | ''],
    requiresApproval: [false],
    contactName: [''],
    contactEmail: ['', [Validators.email]],
    contactPhone: [''],
    addressLine1: [''],
    addressLine2: [''],
    city: [''],
    state: [''],
    postalCode: [''],
    countryCode: [''],
    remarks: [''],
    sortOrder: [100, [Validators.required, Validators.min(1), Validators.max(999)]],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly playerTypeOptions = computed(() => (this.meta()?.playerTypes || []).map((t) => ({
    value: t.id,
    label: `${t.code} - ${t.description}${t.isActive ? '' : ' (disabled)'}`,
  })));
  readonly countryOptions = computed(() => this.countries().map((c) => ({ value: c.alpha2, label: `${c.flagEmoji} ${c.name}` })));

  // Active before disabled, then sort order + name.
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter((c) =>
      c.code.toLowerCase().includes(q)
      || c.name.toLowerCase().includes(q)
      || this.kindLabel(c.kind).toLowerCase().includes(q)
      || (c.playerTypeCode || '').toLowerCase().includes(q)
      || (c.contactName || '').toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((c) => c.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit affiliated club' : 'New affiliated club'));

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.countryService.listActive().subscribe({ next: (c) => this.countries.set(c), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  kindLabel(key: string): string {
    return this.kinds().find((k) => k.key === key)?.label || key;
  }

  periodLabel(key: string | null): string {
    return key ? (this.periods().find((p) => p.key === key)?.label || key).toLowerCase() : '';
  }

  addressLines(c: GolfAffiliatedClub): string[] {
    return addressLines(c.address);
  }

  // The arrangement's terms in one sentence (show the expected result).
  termsText(c: GolfAffiliatedClub): string {
    const parts: string[] = [];
    if (c.agreementFrom || c.agreementTo) parts.push(`agreement ${c.agreementFrom || '…'} to ${c.agreementTo || 'open'}`);
    parts.push(c.maxVisitsPerPlayer ? `${c.maxVisitsPerPlayer} visit${c.maxVisitsPerPlayer === 1 ? '' : 's'} ${this.periodLabel(c.maxVisitsPeriod)} per player` : 'no visit cap');
    parts.push(c.maxGuestsPerVisit === null ? 'guests unlimited' : (c.maxGuestsPerVisit === 0 ? 'no guests' : `up to ${c.maxGuestsPerVisit} guest${c.maxGuestsPerVisit === 1 ? '' : 's'} per visit`));
    parts.push(c.allowChargeToHomeClub ? 'charges may be signed back' : 'settle before leaving');
    if (c.requiresApproval) parts.push('visits need approval');
    return parts.join(' · ');
  }

  // Method, not computed: reads form controls.
  capOn(): boolean {
    const v = this.form.controls.maxVisitsPerPlayer.value;
    return v !== null && v !== undefined && String(v) !== '';
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.clubs);
        this.kinds.set(res.kinds);
        this.periods.set(res.periods);
        this.loading.set(false);
        this.returnScroll.consume(GolfAffiliatedClubsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load affiliated clubs.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      code: '', name: '', kind: '', playerTypeId: '', agreementFrom: '', agreementTo: '', allowChargeToHomeClub: false,
      maxGuestsPerVisit: null, maxVisitsPerPlayer: null, maxVisitsPeriod: 'year', requiresApproval: false,
      contactName: '', contactEmail: '', contactPhone: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', countryCode: '',
      remarks: '', sortOrder: 100,
    });
    this.dialogOpen.set(true);
  }

  openEdit(c: GolfAffiliatedClub): void {
    this.clearMessages();
    this.editId.set(c.id);
    this.form.reset({
      code: c.code, name: c.name, kind: c.kind, playerTypeId: c.playerTypeId,
      agreementFrom: c.agreementFrom || '', agreementTo: c.agreementTo || '', allowChargeToHomeClub: c.allowChargeToHomeClub,
      maxGuestsPerVisit: c.maxGuestsPerVisit, maxVisitsPerPlayer: c.maxVisitsPerPlayer, maxVisitsPeriod: c.maxVisitsPeriod || 'year',
      requiresApproval: c.requiresApproval,
      contactName: c.contactName || '', contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '',
      addressLine1: c.address.line1 || '', addressLine2: c.address.line2 || '', city: c.address.city || '', state: c.address.state || '',
      postalCode: c.address.postcode || '', countryCode: c.address.countryCode || '',
      remarks: c.remarks || '', sortOrder: c.sortOrder,
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
    const numOrNull = (x: number | null) => (x === null || x === undefined || String(x) === '' ? null : Number(x));
    const payload = {
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      kind: v.kind,
      playerTypeId: v.playerTypeId,
      agreementFrom: v.agreementFrom || null,
      agreementTo: v.agreementTo || null,
      allowChargeToHomeClub: v.allowChargeToHomeClub,
      maxGuestsPerVisit: numOrNull(v.maxGuestsPerVisit),
      maxVisitsPerPlayer: numOrNull(v.maxVisitsPerPlayer),
      maxVisitsPeriod: numOrNull(v.maxVisitsPerPlayer) === null ? null : v.maxVisitsPeriod,
      requiresApproval: v.requiresApproval,
      contactName: v.contactName.trim() || null,
      contactEmail: v.contactEmail.trim() || null,
      contactPhone: v.contactPhone || null,
      addressLine1: v.addressLine1.trim() || null,
      addressLine2: v.addressLine2.trim() || null,
      city: v.city.trim() || null,
      state: v.state.trim() || null,
      postalCode: v.postalCode.trim() || null,
      countryCode: v.countryCode || null,
      remarks: v.remarks.trim() || null,
      sortOrder: Number(v.sortOrder) || 100,
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
        this.returnScroll.remember(GolfAffiliatedClubsComponent.LIST_PATH, res.club.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the affiliated club.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(c: GolfAffiliatedClub): void {
    this.clearMessages();
    const next = !(c.isActive !== false);
    this.togglingId.set(c.id);
    this.service.setActive(c.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${c.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfAffiliatedClubsComponent.LIST_PATH, c.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the affiliated club.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(c: GolfAffiliatedClub): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete affiliated club',
      message: `Delete ${c.code} (${c.name})? It is refused while any visiting golfer is on record for this club; disable it instead to keep history.`,
      confirmLabel: 'Delete club',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(c.id);
        this.service.remove(c.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the affiliated club.');
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
