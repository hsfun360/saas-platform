import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  GolfCaddyService, GolfCaddy, GolfCaddyMeta, GolfCaddyLeave, GolfCaddyNote, GolfCaddyStatus, GolfCaddyLeaveType, GolfCaddyNoteKind,
} from '../services/golf-caddy.service';
import { NationalityService } from '../services/nationality.service';
import { RaceService } from '../services/race.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { openBlobInNewTab } from '../shared/open-blob';

type DialogMode = 'form' | 'leaves' | 'notes' | 'status';

// Golf Management → Common Setup → Caddies (/golf/caddies; user decisions
// 2026-10-17). The caddy register: one card per caddy with the badge number,
// grade, group, leader flag, today's leave and the note points; Edit is the
// visible action, Leave, Notes, Print badge, New QR code, the status changes
// (inactive / blacklist / reinstate) and Delete fold into the kebab. ONE
// dialog with four views: the profile drawer, the leave records, the notes,
// the status change.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-caddies',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective, ComboboxComponent, PhoneInputComponent, LocalDatePipe],
  templateUrl: './golf-caddies.html',
  styleUrls: ['../membership-types/membership-types.css', './golf-caddies.css'],
})
export class GolfCaddiesComponent implements OnInit {
  private readonly service = inject(GolfCaddyService);
  private readonly nationalityService = inject(NationalityService);
  private readonly raceService = inject(RaceService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/caddies';

  readonly rows = signal<GolfCaddy[]>([]);
  readonly meta = signal<GolfCaddyMeta | null>(null);
  readonly nationalities = signal<{ nationalityCode: string; description?: string | null }[]>([]);
  readonly races = signal<{ raceCode: string; description?: string | null }[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly uploading = signal(false);

  readonly dialogOpen = signal(false);
  readonly mode = signal<DialogMode>('form');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly target = signal<GolfCaddy | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  // Leave view.
  readonly leaves = signal<GolfCaddyLeave[]>([]);
  readonly leaveEditId = signal<string | null>(null);
  readonly subLoading = signal(false);
  // Notes view.
  readonly notes = signal<GolfCaddyNote[]>([]);
  readonly noteEditId = signal<string | null>(null);
  // Status view.
  readonly nextStatus = signal<GolfCaddyStatus>('inactive');
  readonly statusReason = signal('');

  readonly form = this.fb.nonNullable.group({
    caddyNo: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    caddyGradeId: ['', [Validators.required]],
    caddyGroupId: [''],
    isLeader: [false],
    staffNo: ['', [Validators.maxLength(50)]],
    identityNo: ['', [Validators.maxLength(50)]],
    gender: [''],
    dateOfBirth: [''],
    mobile: [''],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    languages: ['', [Validators.maxLength(255)]],
    nationalityCode: [''],
    raceCode: [''],
    photo: [''],
    joinedDate: [''],
    leftDate: [''],
    remarks: ['', [Validators.maxLength(255)]],
  });

  readonly leaveForm = this.fb.nonNullable.group({
    leaveType: ['' as GolfCaddyLeaveType | '', [Validators.required]],
    dateFrom: ['', [Validators.required]],
    dateTo: ['', [Validators.required]],
    remarks: ['', [Validators.maxLength(255)]],
  });

  readonly noteForm = this.fb.nonNullable.group({
    kind: ['' as GolfCaddyNoteKind | '', [Validators.required]],
    noteDate: [localDateOnly(), [Validators.required]],
    points: [0, [Validators.required, Validators.min(-100), Validators.max(100)]],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    followUp: ['', [Validators.maxLength(255)]],
  });

  readonly search = signal('');
  readonly filter = signal<'all' | 'active' | 'on-leave' | 'inactive' | 'blacklisted'>('all');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly gradeOptions = computed(() =>
    (this.meta()?.grades || []).map((g) => ({ value: g.id, label: `${g.code} - ${g.name}` })));
  readonly groupOptions = computed(() =>
    (this.meta()?.groups || []).map((g) => ({ value: g.id, label: `${g.code} - ${g.name}` })));
  readonly nationalityOptions = computed(() =>
    this.nationalities().map((n) => ({ value: n.nationalityCode, label: `${n.nationalityCode}${n.description ? ' - ' + n.description : ''}` })));
  readonly raceOptions = computed(() =>
    this.races().map((r) => ({ value: r.raceCode, label: `${r.raceCode}${r.description ? ' - ' + r.description : ''}` })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((c) => {
      if (f === 'active' && (c.status !== 'active' || c.onLeaveType)) return false;
      if (f === 'on-leave' && !c.onLeaveType) return false;
      if (f === 'inactive' && c.status !== 'inactive') return false;
      if (f === 'blacklisted' && c.status !== 'blacklisted') return false;
      if (!q) return true;
      return c.caddyNo.toLowerCase().includes(q)
        || c.name.toLowerCase().includes(q)
        || (c.grade?.name || '').toLowerCase().includes(q)
        || (c.grade?.code || '').toLowerCase().includes(q)
        || (c.group?.name || '').toLowerCase().includes(q)
        || (c.staffNo || '').toLowerCase().includes(q)
        || (c.mobile || '').toLowerCase().includes(q);
    });
  });
  readonly counts = computed(() => {
    const rows = this.rows();
    return {
      active: rows.filter((c) => c.status === 'active' && !c.onLeaveType).length,
      onLeave: rows.filter((c) => !!c.onLeaveType).length,
      inactive: rows.filter((c) => c.status === 'inactive').length,
      blacklisted: rows.filter((c) => c.status === 'blacklisted').length,
    };
  });

  readonly dialogTitle = computed(() => {
    const t = this.target();
    switch (this.mode()) {
      case 'leaves': return `Caddy ${t?.caddyNo || ''} - leave`;
      case 'notes': return `Caddy ${t?.caddyNo || ''} - notes`;
      case 'status': return `Caddy ${t?.caddyNo || ''} - ${this.statusVerb(this.nextStatus())}`;
      default: return this.editId() ? 'Edit caddy' : 'New caddy';
    }
  });

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.nationalityService.listActive().subscribe({ next: (list) => this.nationalities.set(list), error: () => {} });
    this.raceService.listActive().subscribe({ next: (list) => this.races.set(list), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  label(list: { key: string; label: string }[] | undefined, key: string | null | undefined): string {
    return key ? (list || []).find((o) => o.key === key)?.label || key : '';
  }

  statusVerb(s: GolfCaddyStatus): string {
    return s === 'active' ? 'reinstate' : s === 'blacklisted' ? 'blacklist' : 'mark inactive';
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.caddies);
        this.loading.set(false);
        this.returnScroll.consume(GolfCaddiesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the caddy register.');
      },
    });
  }

  // ---- profile ----

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.target.set(null);
    this.mode.set('form');
    this.form.reset({
      caddyNo: '', name: '', caddyGradeId: '', caddyGroupId: '', isLeader: false, staffNo: '', identityNo: '', gender: '', dateOfBirth: '',
      mobile: '', email: '', languages: '', nationalityCode: '', raceCode: '', photo: '', joinedDate: '', leftDate: '', remarks: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(c: GolfCaddy): void {
    this.clearMessages();
    this.editId.set(c.id);
    this.target.set(c);
    this.mode.set('form');
    this.form.reset({
      caddyNo: c.caddyNo, name: c.name, caddyGradeId: c.caddyGradeId, caddyGroupId: c.caddyGroupId || '', isLeader: c.isLeader,
      staffNo: c.staffNo || '', identityNo: c.identityNo || '', gender: c.gender || '', dateOfBirth: c.dateOfBirth || '',
      mobile: c.mobile || '', email: c.email || '', languages: c.languages || '', nationalityCode: c.nationalityCode || '',
      raceCode: c.raceCode || '', photo: c.photo || '', joinedDate: c.joinedDate || '', leftDate: c.leftDate || '', remarks: c.remarks || '',
    });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onPhotoSelected(input: HTMLInputElement): void {
    const file = input.files && input.files[0];
    if (!file) return;
    this.uploading.set(true);
    this.service.uploadPhoto(file).subscribe({
      next: (res) => {
        this.form.controls.photo.setValue(res.url);
        this.form.controls.photo.markAsDirty();
        this.uploading.set(false);
        input.value = '';
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the photo.');
      },
    });
  }

  removePhoto(): void {
    this.form.controls.photo.setValue('');
    this.form.controls.photo.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      caddyNo: v.caddyNo.trim().toUpperCase(),
      name: v.name.trim(),
      caddyGradeId: v.caddyGradeId,
      caddyGroupId: v.caddyGroupId || null,
      isLeader: v.isLeader,
      staffNo: v.staffNo.trim() || null,
      identityNo: v.identityNo.trim() || null,
      gender: v.gender || null,
      dateOfBirth: v.dateOfBirth || null,
      mobile: v.mobile || null,
      email: v.email.trim() || null,
      languages: v.languages.trim() || null,
      nationalityCode: v.nationalityCode || null,
      raceCode: v.raceCode || null,
      photo: v.photo || null,
      joinedDate: v.joinedDate || null,
      leftDate: v.leftDate || null,
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
        this.returnScroll.remember(GolfCaddiesComponent.LIST_PATH, res.caddy.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the caddy.');
        this.saving.set(false);
      },
    });
  }

  // ---- leave ----

  openLeaves(c: GolfCaddy): void {
    this.clearMessages();
    this.target.set(c);
    this.mode.set('leaves');
    this.leaves.set([]);
    this.resetLeaveForm();
    this.dialogOpen.set(true);
    this.reloadLeaves();
  }

  private reloadLeaves(): void {
    const c = this.target();
    if (!c) return;
    this.subLoading.set(true);
    this.service.leaves(c.id).subscribe({
      next: (res) => { this.leaves.set(res.leaves); this.subLoading.set(false); },
      error: (err) => { this.subLoading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the leave records.'); },
    });
  }

  resetLeaveForm(l?: GolfCaddyLeave): void {
    this.leaveEditId.set(l ? l.id : null);
    this.leaveForm.reset({ leaveType: l ? l.leaveType : '', dateFrom: l ? l.dateFrom : localDateOnly(), dateTo: l ? l.dateTo : localDateOnly(), remarks: l?.remarks || '' });
  }

  saveLeave(): void {
    const c = this.target();
    if (!c) return;
    this.clearMessages();
    if (this.leaveForm.invalid) {
      this.leaveForm.markAllAsTouched();
      return;
    }
    const v = this.leaveForm.getRawValue();
    const payload = { leaveType: v.leaveType, dateFrom: v.dateFrom, dateTo: v.dateTo, remarks: v.remarks.trim() || null };
    this.saving.set(true);
    const id = this.leaveEditId();
    const req$ = id ? this.service.updateLeave(c.id, id, payload) : this.service.createLeave(c.id, payload);
    req$.subscribe({
      next: (res) => { this.saving.set(false); this.successMessage.set(res.message); this.resetLeaveForm(); this.reloadLeaves(); this.load(); },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to save the leave.'); },
    });
  }

  askRemoveLeave(l: GolfCaddyLeave): void {
    const c = this.target();
    if (!c) return;
    this.confirmAction.set({
      title: 'Remove leave record',
      message: `Remove the ${this.label(this.meta()?.leaveTypes, l.leaveType).toLowerCase()} from ${l.dateFrom} to ${l.dateTo}? The caddy becomes available on those dates again.`,
      confirmLabel: 'Remove leave',
      run: () => {
        this.confirmAction.set(null);
        this.service.removeLeave(c.id, l.id).subscribe({
          next: (res) => { this.successMessage.set(res.message); this.reloadLeaves(); this.load(); },
          error: (err) => this.errorMessage.set(err.error?.message || 'Failed to remove the leave.'),
        });
      },
    });
  }

  // ---- notes ----

  openNotes(c: GolfCaddy): void {
    this.clearMessages();
    this.target.set(c);
    this.mode.set('notes');
    this.notes.set([]);
    this.resetNoteForm();
    this.dialogOpen.set(true);
    this.reloadNotes();
  }

  private reloadNotes(): void {
    const c = this.target();
    if (!c) return;
    this.subLoading.set(true);
    this.service.notes(c.id).subscribe({
      next: (res) => { this.notes.set(res.notes); this.subLoading.set(false); },
      error: (err) => { this.subLoading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the notes.'); },
    });
  }

  readonly notePointsTotal = computed(() => this.notes().reduce((s, n) => s + (n.points || 0), 0));

  resetNoteForm(n?: GolfCaddyNote): void {
    this.noteEditId.set(n ? n.id : null);
    this.noteForm.reset({ kind: n ? n.kind : '', noteDate: n ? n.noteDate : localDateOnly(), points: n ? n.points : 0, description: n?.description || '', followUp: n?.followUp || '' });
  }

  saveNote(): void {
    const c = this.target();
    if (!c) return;
    this.clearMessages();
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }
    const v = this.noteForm.getRawValue();
    const payload = { kind: v.kind, noteDate: v.noteDate, points: Number(v.points) || 0, description: v.description.trim(), followUp: v.followUp.trim() || null };
    this.saving.set(true);
    const id = this.noteEditId();
    const req$ = id ? this.service.updateNote(c.id, id, payload) : this.service.createNote(c.id, payload);
    req$.subscribe({
      next: (res) => { this.saving.set(false); this.successMessage.set(res.message); this.resetNoteForm(); this.reloadNotes(); this.load(); },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to save the note.'); },
    });
  }

  askRemoveNote(n: GolfCaddyNote): void {
    const c = this.target();
    if (!c) return;
    this.confirmAction.set({
      title: 'Remove note',
      message: `Remove the ${this.label(this.meta()?.noteKinds, n.kind).toLowerCase()} of ${n.noteDate} (${n.points > 0 ? '+' : ''}${n.points} points)?`,
      confirmLabel: 'Remove note',
      run: () => {
        this.confirmAction.set(null);
        this.service.removeNote(c.id, n.id).subscribe({
          next: (res) => { this.successMessage.set(res.message); this.reloadNotes(); this.load(); },
          error: (err) => this.errorMessage.set(err.error?.message || 'Failed to remove the note.'),
        });
      },
    });
  }

  // ---- status ----

  openStatus(c: GolfCaddy, next: GolfCaddyStatus): void {
    this.clearMessages();
    this.target.set(c);
    this.nextStatus.set(next);
    this.statusReason.set('');
    this.mode.set('status');
    this.dialogOpen.set(true);
  }

  runStatus(): void {
    const c = this.target();
    if (!c) return;
    const next = this.nextStatus();
    const reason = this.statusReason().trim();
    if (next !== 'active' && !reason) return;
    this.saving.set(true);
    this.service.setStatus(c.id, next, next === 'active' ? null : reason).subscribe({
      next: (res) => { this.saving.set(false); this.dialogOpen.set(false); this.successMessage.set(res.message); this.returnScroll.remember(GolfCaddiesComponent.LIST_PATH, c.id); this.load(); },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to change the status.'); },
    });
  }

  // ---- kebab extras ----

  askRegenerateQr(c: GolfCaddy): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Issue a new QR code',
      message: `Issue a new QR code for caddy ${c.caddyNo}? The current badge stops working the moment the new code is issued - print and hand over the new badge.`,
      confirmLabel: 'Issue new QR code',
      danger: false,
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(c.id);
        this.service.regenerateQr(c.id).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to issue the QR code.'); },
        });
      },
    });
  }

  askDelete(c: GolfCaddy): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete caddy',
      message: `Delete caddy ${c.caddyNo} (${c.name})? Only a record with no leave or note can be deleted; mark the caddy inactive instead to keep the history.`,
      confirmLabel: 'Delete caddy',
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(c.id);
        this.service.remove(c.id).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to delete the caddy.'); },
        });
      },
    });
  }

  printBadges(ids: string[] = []): void {
    this.clearMessages();
    this.service.badgesHtml(ids).subscribe({
      next: (html) => openBlobInNewTab(html),
      error: (err) => this.errorMessage.set(err.error?.message || 'The badge sheet could not be opened.'),
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
