import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfBuggyMaintenanceService, GolfBuggyDamage, GolfDamageReasonType, GolfMaintenanceUnit } from '../services/golf-buggy-maintenance.service';

// Golf Management → Buggy Management → Buggy Damages (/golf/buggy-damages;
// user decisions 2026-10-18: compensation stays OUTSIDE the system). The
// damage register: one record per incident - the unit, the outing, who or
// what caused it, the rider held responsible, the description - and the
// repair it opened. A damaged return at the Buggy Station records it by
// itself; the desk records one here for anything found later.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-buggy-damages',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    ConfirmDialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './golf-buggy-damages.html',
  styleUrls: ['../golf-buggy-maintenance/golf-buggy-maintenance.css', '../golf-buggies/golf-buggies.css'],
})
export class GolfBuggyDamagesComponent implements OnInit {
  private readonly service = inject(GolfBuggyMaintenanceService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/buggy-damages';

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly damages = signal<GolfBuggyDamage[]>([]);
  readonly fleet = signal<GolfMaintenanceUnit[]>([]);
  readonly reasonTypes = signal<MembershipStatusOption[]>([]);

  readonly status = signal<'open' | 'resolved' | ''>('open');
  readonly dateFrom = signal(localDateOnly().slice(0, 8) + '01');
  readonly dateTo = signal(localDateOnly());
  readonly search = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.damages();
    return q ? list.filter((d) => d.buggyNo.toLowerCase().includes(q) || (d.golferName || '').toLowerCase().includes(q) || (d.memberNo || '').toLowerCase().includes(q) || d.description.toLowerCase().includes(q)) : list;
  });
  readonly openCount = computed(() => this.damages().filter((d) => d.status === 'open').length);
  readonly unitOptions = computed(() => this.fleet().map((u) => ({ value: u.id, label: `${u.buggyNo}${u.buggyType ? ' - ' + u.buggyType.name : ''}` })));

  readonly dialogOpen = signal(false);
  readonly editId = signal<string | null>(null);
  readonly target = signal<GolfBuggyDamage | null>(null);
  readonly form = this.fb.nonNullable.group({
    buggyId: ['', [Validators.required]],
    playDate: [localDateOnly(), [Validators.required]],
    reasonType: ['player' as GolfDamageReasonType, [Validators.required]],
    description: ['', [Validators.required, Validators.maxLength(1000)]],
    golferName: ['', [Validators.maxLength(255)]],
    memberNo: ['', [Validators.maxLength(50)]],
    remarks: ['', [Validators.maxLength(255)]],
    openRepair: [true],
  });
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const closed = this.status() !== 'open';
    this.service.listDamages({ status: this.status(), dateFrom: closed ? this.dateFrom() : '', dateTo: closed ? this.dateTo() : '' }).subscribe({
      next: (res) => {
        this.damages.set(res.damages);
        this.fleet.set(res.fleet);
        this.reasonTypes.set(res.reasonTypes);
        this.loading.set(false);
        this.returnScroll.consume(GolfBuggyDamagesComponent.LIST_PATH, this.injector);
      },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the damage register.'); },
    });
  }

  setStatus(v: 'open' | 'resolved' | ''): void { this.status.set(v); this.load(); }
  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  clearSearch(): void { this.search.set(''); }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.target.set(null);
    this.form.reset({ buggyId: '', playDate: localDateOnly(), reasonType: 'player', description: '', golferName: '', memberNo: '', remarks: '', openRepair: true });
    this.form.controls.buggyId.enable();
    this.form.controls.playDate.enable();
    this.dialogOpen.set(true);
  }

  openEdit(d: GolfBuggyDamage): void {
    this.clearMessages();
    this.editId.set(d.id);
    this.target.set(d);
    this.form.reset({ buggyId: d.buggyId, playDate: d.playDate, reasonType: d.reasonType, description: d.description, golferName: d.golferName || '', memberNo: d.memberNo || '', remarks: d.remarks || '', openRepair: false });
    // The unit and the date are facts of the incident; the rest is editable.
    this.form.controls.buggyId.disable();
    this.form.controls.playDate.disable();
    this.dialogOpen.set(true);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = { buggyId: v.buggyId, playDate: v.playDate, reasonType: v.reasonType, description: v.description.trim(), golferName: v.golferName.trim() || null, memberNo: v.memberNo.trim() || null, remarks: v.remarks.trim() || null, openRepair: v.openRepair };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.updateDamage(id, payload) : this.service.recordDamage(payload);
    req$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.dialogOpen.set(false);
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfBuggyDamagesComponent.LIST_PATH, res.damage.id);
        if (!id) this.status.set('open');
        this.load();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'The damage record could not be saved.'); },
    });
  }

  askResolve(d: GolfBuggyDamage): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Resolve damage record',
      message: `Mark the damage on buggy ${d.buggyNo} (${d.playDate}) as resolved? A record with an open repair resolves when that repair is completed on Buggy Maintenance.`,
      confirmLabel: 'Resolve',
      danger: false,
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(d.id);
        this.service.resolveDamage(d.id).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.returnScroll.remember(GolfBuggyDamagesComponent.LIST_PATH, d.id); this.load(); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'The record could not be resolved.'); },
        });
      },
    });
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
