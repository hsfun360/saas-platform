import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import {
  GolfAffiliatedVisitService, GolfAffiliatedVisit, GolfVisitMeta, GolfVisitConfirmPreview, GolfVisitPayload, GolfVisitClubOption,
} from '../services/golf-affiliated-visit.service';

// The DEVICE-local calendar date as 'YYYY-MM-DD' (toISOString would be UTC).
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Golf Management → Front Desk → Affiliated Visits (/golf/affiliated-visits;
// user decisions 2026-10-15, HOST side only). An incoming Letter of
// Introduction from an affiliated association or reciprocal club is recorded
// here as a visit; Confirm shows what will be booked (the flight, the party,
// whether approval runs first) and then books the golf part under the
// visitor's own golfer identity; the desk receives the visitor on the Tee
// Time Sheet (letter and ID sighted), and the visit completes when every
// bill is settled. Decline and Cancel take a reason; the letter is uploaded.
// Single-dialog standard: the record form is the drawer, the confirm preview
// and the reason prompts are a centred dialog, never two at once.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-affiliated-visits',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    ComboboxComponent, PhoneInputComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './golf-affiliated-visits.html',
  styleUrls: ['./golf-affiliated-visits.css'],
})
export class GolfAffiliatedVisitsComponent implements OnInit {
  private readonly service = inject(GolfAffiliatedVisitService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/affiliated-visits';

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly visits = signal<GolfAffiliatedVisit[]>([]);
  readonly statuses = signal<MembershipStatusOption[]>([]);
  readonly meta = signal<GolfVisitMeta | null>(null);

  // Server-side filters: visit-date range (7 days back, 60 ahead - letters
  // arrive well before the visit) + status; client-side search.
  readonly dateFrom = signal(localDate(new Date(Date.now() - 7 * 86400000)));
  readonly dateTo = signal(localDate(new Date(Date.now() + 60 * 86400000)));
  readonly status = signal('');
  readonly search = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.visits();
    if (!q) return rows;
    return rows.filter((v) =>
      v.visitNo.toLowerCase().includes(q)
      || v.visitorName.toLowerCase().includes(q)
      || v.visitorMemberNo.toLowerCase().includes(q)
      || (v.club?.name || '').toLowerCase().includes(q)
      || (v.club?.code || '').toLowerCase().includes(q)
      || (v.bookingNo || '').toLowerCase().includes(q)
      || (v.loiReference || '').toLowerCase().includes(q));
  });
  readonly requestedCount = computed(() => this.visits().filter((v) => v.status === 'requested' || v.status === 'pending-approval').length);
  readonly openCount = computed(() => this.visits().filter((v) => v.isOpen).length);

  readonly clubOptions = computed(() => (this.meta()?.clubs || []).map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` })));
  readonly courseOptions = computed(() => (this.meta()?.courses || []).map((c) => ({ value: c.id, label: `${c.courseCode}${c.description ? ' - ' + c.description : ''}` })));

  // ---- the record drawer ----
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editId = signal<string | null>(null);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit visit' : 'New visit'));

  readonly form = this.fb.nonNullable.group({
    affiliatedClubId: ['', [Validators.required]],
    visitorName: ['', [Validators.required, Validators.maxLength(255)]],
    visitorMemberNo: ['', [Validators.required, Validators.maxLength(50)]],
    visitorIdentityNo: ['', [Validators.maxLength(50)]],
    visitorMobile: [''],
    visitorEmail: ['', [Validators.email]],
    loiReference: ['', [Validators.maxLength(100)]],
    loiDocumentUrl: [''],
    visitDate: ['', [Validators.required]],
    alternateDate: [''],
    golfRequested: [true],
    courseId: [''],
    teeTime: [''],
    holes: [18],
    playerCount: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    guestCount: [0, [Validators.required, Validators.min(0), Validators.max(9)]],
    dining: ['', [Validators.maxLength(255)]],
    accommodation: ['', [Validators.maxLength(255)]],
    other: ['', [Validators.maxLength(255)]],
    remarks: ['', [Validators.maxLength(255)]],
  });

  // ---- the centred dialogs: confirm preview, decline / cancel reasons ----
  readonly actionKind = signal<'confirm' | 'decline' | 'cancel' | null>(null);
  readonly actionTarget = signal<GolfAffiliatedVisit | null>(null);
  readonly actionReason = signal('');
  readonly preview = signal<GolfVisitConfirmPreview | null>(null);
  readonly previewError = signal('');
  readonly working = signal(false);
  readonly workingId = signal<string | null>(null);

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.list({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), status: this.status() }).subscribe({
      next: (res) => {
        this.visits.set(res.visits);
        this.statuses.set(res.statuses);
        this.loading.set(false);
        this.returnScroll.consume(GolfAffiliatedVisitsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load visits.');
      },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setStatus(v: string): void { this.status.set(v); this.load(); }
  clearSearch(): void { this.search.set(''); }

  statusLabel(key: string): string {
    return this.statuses().find((s) => s.key === key)?.label || key;
  }

  chipClass(status: string): string {
    switch (status) {
      case 'confirmed': case 'arrived': case 'completed': return 'status-chip--on';
      case 'requested': case 'pending-approval': return 'status-chip--info';
      default: return 'status-chip--off';
    }
  }

  // The club picked in the drawer and its terms (show the expected result).
  pickedClub(): GolfVisitClubOption | null {
    const id = this.form.controls.affiliatedClubId.value;
    return (this.meta()?.clubs || []).find((c) => c.id === id) || null;
  }

  clubTerms(): string {
    const c = this.pickedClub();
    if (!c) return '';
    const parts: string[] = [];
    if (c.agreementFrom || c.agreementTo) parts.push(`agreement ${c.agreementFrom || '…'} to ${c.agreementTo || 'open'}`);
    if (c.maxVisitsPerPlayer) parts.push(`${c.maxVisitsPerPlayer} visit${c.maxVisitsPerPlayer === 1 ? '' : 's'} per ${c.maxVisitsPeriod || 'year'} per member`);
    if (c.maxGuestsPerVisit !== null) parts.push(c.maxGuestsPerVisit === 0 ? 'no guests' : `up to ${c.maxGuestsPerVisit} guest${c.maxGuestsPerVisit === 1 ? '' : 's'}`);
    if (c.requiresApproval) parts.push('visits need approval');
    parts.push(c.allowChargeToHomeClub ? 'charges may be signed back' : 'bills settled before leaving');
    return parts.join(' · ');
  }

  golfOn(): boolean {
    return this.form.controls.golfRequested.value === true;
  }

  // ---- record ----

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      affiliatedClubId: '', visitorName: '', visitorMemberNo: '', visitorIdentityNo: '', visitorMobile: '', visitorEmail: '',
      loiReference: '', loiDocumentUrl: '', visitDate: '', alternateDate: '', golfRequested: true, courseId: '', teeTime: '', holes: 18,
      playerCount: 1, guestCount: 0, dining: '', accommodation: '', other: '', remarks: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(v: GolfAffiliatedVisit): void {
    this.clearMessages();
    this.editId.set(v.id);
    const g = v.facilities?.golf || null;
    this.form.reset({
      affiliatedClubId: v.affiliatedClubId, visitorName: v.visitorName, visitorMemberNo: v.visitorMemberNo,
      visitorIdentityNo: v.visitorIdentityNo || '', visitorMobile: v.visitorMobile || '', visitorEmail: v.visitorEmail || '',
      loiReference: v.loiReference || '', loiDocumentUrl: v.loiDocumentUrl || '', visitDate: v.visitDate, alternateDate: v.alternateDate || '',
      golfRequested: !!g, courseId: g?.courseId || '', teeTime: g?.teeTime || '', holes: g?.holes || 18,
      playerCount: v.playerCount, guestCount: v.guestCount,
      dining: v.facilities?.dining || '', accommodation: v.facilities?.accommodation || '', other: v.facilities?.other || '', remarks: v.remarks || '',
    });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onLetterSelected(input: HTMLInputElement): void {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadLetter(file).subscribe({
      next: (res) => {
        this.form.controls.loiDocumentUrl.setValue(res.url);
        this.form.controls.loiDocumentUrl.markAsDirty();
        this.uploading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload the letter.');
        this.uploading.set(false);
      },
    });
  }

  removeLetter(): void {
    this.form.controls.loiDocumentUrl.setValue('');
    this.form.controls.loiDocumentUrl.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: GolfVisitPayload = {
      affiliatedClubId: v.affiliatedClubId,
      visitorName: v.visitorName.trim(),
      visitorMemberNo: v.visitorMemberNo.trim(),
      visitorIdentityNo: v.visitorIdentityNo.trim() || null,
      visitorMobile: v.visitorMobile || null,
      visitorEmail: v.visitorEmail.trim() || null,
      loiReference: v.loiReference.trim() || null,
      loiDocumentUrl: v.loiDocumentUrl || null,
      visitDate: v.visitDate,
      alternateDate: v.alternateDate || null,
      facilities: {
        golf: v.golfRequested ? { courseId: v.courseId || null, teeTime: v.teeTime || null, holes: Number(v.holes) || 18 } : null,
        dining: v.dining.trim() || null,
        accommodation: v.accommodation.trim() || null,
        other: v.other.trim() || null,
      },
      playerCount: v.golfRequested ? Number(v.playerCount) || 1 : 1,
      guestCount: v.golfRequested ? Number(v.guestCount) || 0 : 0,
      remarks: v.remarks.trim() || null,
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
        this.returnScroll.remember(GolfAffiliatedVisitsComponent.LIST_PATH, res.visit.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the visit.');
        this.saving.set(false);
      },
    });
  }

  // ---- confirm (preview first) ----

  openConfirm(v: GolfAffiliatedVisit): void {
    this.clearMessages();
    this.actionKind.set('confirm');
    this.actionTarget.set(v);
    this.preview.set(null);
    this.previewError.set('');
    this.service.confirmPreview(v.id).subscribe({
      next: (p) => this.preview.set(p),
      error: (err) => this.previewError.set(err.error?.message || 'The visit cannot be confirmed as recorded.'),
    });
  }

  confirmLabel(): string {
    const p = this.preview();
    if (!p) return 'Confirm visit';
    if (p.needsApproval && p.chain?.steps?.length) return 'Submit for approval';
    return p.flight ? `Confirm and book ${p.flight.teeTime}` : 'Confirm visit';
  }

  runConfirm(): void {
    const target = this.actionTarget();
    if (!target || !this.preview()) return;
    this.working.set(true);
    this.service.confirm(target.id).subscribe({
      next: (res) => {
        this.working.set(false);
        this.closeAction();
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfAffiliatedVisitsComponent.LIST_PATH, target.id);
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The visit could not be confirmed.');
      },
    });
  }

  // ---- decline / cancel (reason required) ----

  openDecline(v: GolfAffiliatedVisit): void {
    this.clearMessages();
    this.actionKind.set('decline');
    this.actionTarget.set(v);
    this.actionReason.set('');
  }

  openCancel(v: GolfAffiliatedVisit): void {
    this.clearMessages();
    this.actionKind.set('cancel');
    this.actionTarget.set(v);
    this.actionReason.set('');
  }

  runReasonAction(): void {
    const target = this.actionTarget();
    const kind = this.actionKind();
    if (!target || (kind !== 'decline' && kind !== 'cancel')) return;
    const reason = this.actionReason().trim();
    if (!reason) {
      this.errorMessage.set(kind === 'decline' ? 'Give the reason for declining the visit.' : 'Give the reason for cancelling the visit.');
      return;
    }
    this.working.set(true);
    const req$ = kind === 'decline' ? this.service.decline(target.id, reason) : this.service.cancel(target.id, reason);
    req$.subscribe({
      next: (res) => {
        this.working.set(false);
        this.closeAction();
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfAffiliatedVisitsComponent.LIST_PATH, target.id);
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The action failed.');
      },
    });
  }

  closeAction(): void {
    this.actionKind.set(null);
    this.actionTarget.set(null);
    this.preview.set(null);
    this.previewError.set('');
    this.actionReason.set('');
  }

  complete(v: GolfAffiliatedVisit): void {
    this.clearMessages();
    this.workingId.set(v.id);
    this.service.complete(v.id).subscribe({
      next: (res) => {
        this.workingId.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfAffiliatedVisitsComponent.LIST_PATH, v.id);
        this.load();
      },
      error: (err) => {
        this.workingId.set(null);
        this.errorMessage.set(err.error?.message || 'The visit could not be completed.');
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
