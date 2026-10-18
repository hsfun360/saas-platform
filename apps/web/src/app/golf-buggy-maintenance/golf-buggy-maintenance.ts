import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import {
  GolfBuggyMaintenanceService, GolfMaintenanceJob, GolfMaintenanceUnit, GolfInspectionSystem,
} from '../services/golf-buggy-maintenance.service';

type DialogMode = 'job' | 'inspect' | 'complete';
// One unit row of the batch inspection: include it, the five systems, findings.
type InspectRow = FormGroup<{
  buggyId: FormControl<string>;
  include: FormControl<boolean>;
  steeringOk: FormControl<boolean>;
  brakesOk: FormControl<boolean>;
  electricalOk: FormControl<boolean>;
  driveOk: FormControl<boolean>;
  bodyOk: FormControl<boolean>;
  findings: FormControl<string>;
}>;

// Golf Management → Buggy Management → Buggy Maintenance (/golf/buggy-maintenance;
// user decisions 2026-10-18). The jobs on the fleet: a service or repair parks
// the unit until it is completed here (the station cannot issue it), an
// inspection ticks the five systems and is done on the spot (a fault opens a
// repair), and a fault or damaged return at the Buggy Station opens its repair
// by itself. Open jobs first; New job opens a service or repair on one or
// several units; Inspect records the checklist for several units at once.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-buggy-maintenance',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    ConfirmDialogComponent, OverflowMenuComponent, MenuItemDirective, MoneyInputDirective, LocalDatePipe],
  templateUrl: './golf-buggy-maintenance.html',
  styleUrls: ['../golf-buggies/golf-buggies.css', './golf-buggy-maintenance.css'],
})
export class GolfBuggyMaintenanceComponent implements OnInit {
  private readonly service = inject(GolfBuggyMaintenanceService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/buggy-maintenance';

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly jobs = signal<GolfMaintenanceJob[]>([]);
  readonly fleet = signal<GolfMaintenanceUnit[]>([]);
  readonly kinds = signal<MembershipStatusOption[]>([]);
  readonly systems = signal<MembershipStatusOption[]>([]);

  // Server filters: status tab + kind + the opened-on range (done jobs only).
  readonly status = signal<'open' | 'done' | ''>('open');
  readonly kind = signal('');
  readonly dateFrom = signal(localDateOnly().slice(0, 8) + '01');
  readonly dateTo = signal(localDateOnly());
  readonly search = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.jobs();
    return q ? list.filter((j) => j.buggyNo.toLowerCase().includes(q) || (j.buggyType?.name || '').toLowerCase().includes(q) || (j.findings || '').toLowerCase().includes(q) || (j.workDone || '').toLowerCase().includes(q)) : list;
  });
  readonly openCount = computed(() => this.jobs().filter((j) => j.status === 'open').length);
  readonly parkedUnits = computed(() => this.fleet().filter((u) => u.location === 'maintenance'));

  // Dialog: new job (drawer) / inspect (drawer) / complete (centred).
  readonly dialogOpen = signal(false);
  readonly mode = signal<DialogMode>('job');
  readonly target = signal<GolfMaintenanceJob | null>(null);
  readonly unitSearch = signal('');
  readonly jobForm = this.fb.nonNullable.group({
    kind: ['service' as 'service' | 'repair', [Validators.required]],
    findings: ['', [Validators.maxLength(1000)]],
    remarks: ['', [Validators.maxLength(255)]],
  });
  readonly jobUnits = signal<Set<string>>(new Set());
  readonly inspectRows = this.fb.array<InspectRow>([]);
  readonly inspectForm = this.fb.group({ rows: this.inspectRows, remarks: this.fb.nonNullable.control('', [Validators.maxLength(255)]) });
  readonly completeForm = this.fb.nonNullable.group({
    workDone: ['', [Validators.maxLength(1000)]],
    cost: this.fb.control<number | null>(null, [Validators.min(0)]),
  });
  readonly inspectionSystems: { key: GolfInspectionSystem; label: string }[] = [
    { key: 'steeringOk', label: 'Steering' }, { key: 'brakesOk', label: 'Brakes' }, { key: 'electricalOk', label: 'Electrical' }, { key: 'driveOk', label: 'Drive' }, { key: 'bodyOk', label: 'Body' },
  ];
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  // The units a job can be opened on: active, in the depot, no open job.
  readonly jobCandidates = computed(() => {
    const q = this.unitSearch().trim().toLowerCase();
    return this.fleet().filter((u) => u.location === 'in-depot' && !u.openJob && (!q || u.buggyNo.toLowerCase().includes(q) || (u.buggyType?.name || '').toLowerCase().includes(q)));
  });
  // The units an inspection can cover: anything not out on the course.
  readonly inspectCandidates = computed(() => this.fleet().filter((u) => u.location !== 'on-course'));

  readonly dialogTitle = computed(() => {
    switch (this.mode()) {
      case 'inspect': return 'Safety inspection';
      case 'complete': return `Complete ${this.target()?.kindLabel.toLowerCase() || 'job'} - buggy ${this.target()?.buggyNo || ''}`;
      default: return 'New job';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const done = this.status() !== 'open';
    this.service.list({ status: this.status(), kind: this.kind(), dateFrom: done ? this.dateFrom() : '', dateTo: done ? this.dateTo() : '' }).subscribe({
      next: (res) => {
        this.jobs.set(res.jobs);
        this.fleet.set(res.fleet);
        this.kinds.set(res.kinds);
        this.systems.set(res.systems);
        this.loading.set(false);
        this.returnScroll.consume(GolfBuggyMaintenanceComponent.LIST_PATH, this.injector);
      },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the maintenance jobs.'); },
    });
  }

  setStatus(v: 'open' | 'done' | ''): void { this.status.set(v); this.load(); }
  setKind(v: string): void { this.kind.set(v); this.load(); }
  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  clearSearch(): void { this.search.set(''); }

  sourceLabel(j: GolfMaintenanceJob): string {
    switch (j.source) {
      case 'station-return': return 'raised at the Buggy Station';
      case 'inspection': return 'raised by an inspection';
      default: return 'keyed';
    }
  }

  // ---- new job ----

  openJob(): void {
    this.clearMessages();
    this.mode.set('job');
    this.jobForm.reset({ kind: 'service', findings: '', remarks: '' });
    this.jobUnits.set(new Set());
    this.unitSearch.set('');
    this.dialogOpen.set(true);
  }

  toggleUnit(id: string): void {
    this.jobUnits.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    this.jobForm.markAsDirty();
  }

  runJob(): void {
    const ids = [...this.jobUnits()];
    if (!ids.length) {
      this.errorMessage.set('Pick at least one buggy.');
      return;
    }
    const v = this.jobForm.getRawValue();
    if (v.kind === 'repair' && !v.findings.trim()) {
      this.errorMessage.set('Describe the fault found.');
      return;
    }
    this.saving.set(true);
    this.service.open({ buggyIds: ids, kind: v.kind, findings: v.findings.trim() || null, remarks: v.remarks.trim() || null }).subscribe({
      next: (res) => { this.saving.set(false); this.jobForm.markAsPristine(); this.dialogOpen.set(false); this.successMessage.set(res.message); this.status.set('open'); this.load(); },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'The job could not be opened.'); },
    });
  }

  // ---- inspection ----

  openInspect(): void {
    this.clearMessages();
    this.mode.set('inspect');
    this.inspectRows.clear({ emitEvent: false });
    for (const u of this.inspectCandidates()) {
      this.inspectRows.push(this.fb.nonNullable.group({
        buggyId: [u.id], include: [false], steeringOk: [true], brakesOk: [true], electricalOk: [true], driveOk: [true], bodyOk: [true], findings: ['', [Validators.maxLength(1000)]],
      }) as InspectRow, { emitEvent: false });
    }
    this.inspectForm.controls.remarks.setValue('');
    this.inspectForm.markAsPristine();
    this.unitSearch.set('');
    this.dialogOpen.set(true);
  }

  unitOfRow(i: number): GolfMaintenanceUnit | undefined {
    const id = this.inspectRows.at(i)?.controls.buggyId.value;
    return this.fleet().find((u) => u.id === id);
  }

  rowVisible(i: number): boolean {
    const q = this.unitSearch().trim().toLowerCase();
    if (!q) return true;
    const u = this.unitOfRow(i);
    return !!u && (u.buggyNo.toLowerCase().includes(q) || (u.buggyType?.name || '').toLowerCase().includes(q));
  }

  rowHasFault(i: number): boolean {
    const r = this.inspectRows.at(i);
    return !!r && this.inspectionSystems.some((s) => r.controls[s.key].value === false);
  }

  // Methods, not computeds: they read form controls.
  includedCount(): number {
    return this.inspectRows.controls.filter((r) => r.controls.include.value).length;
  }

  includeAll(on: boolean): void {
    for (let i = 0; i < this.inspectRows.length; i += 1) if (this.rowVisible(i)) this.inspectRows.at(i).controls.include.setValue(on);
    this.inspectForm.markAsDirty();
  }

  runInspect(): void {
    const items = this.inspectRows.controls.filter((r) => r.controls.include.value).map((r) => {
      const v = r.getRawValue();
      return { buggyId: v.buggyId, steeringOk: v.steeringOk, brakesOk: v.brakesOk, electricalOk: v.electricalOk, driveOk: v.driveOk, bodyOk: v.bodyOk, findings: v.findings.trim() || null };
    });
    if (!items.length) {
      this.errorMessage.set('Tick the buggies inspected.');
      return;
    }
    const missing = items.find((it) => this.inspectionSystems.some((s) => it[s.key] === false) && !it.findings);
    if (missing) {
      const u = this.fleet().find((x) => x.id === missing.buggyId);
      this.errorMessage.set(`Describe the fault found on ${u?.buggyNo || 'the buggy'}.`);
      return;
    }
    this.saving.set(true);
    this.service.inspect({ items, remarks: this.inspectForm.controls.remarks.value.trim() || null }).subscribe({
      next: (res) => { this.saving.set(false); this.inspectForm.markAsPristine(); this.dialogOpen.set(false); this.successMessage.set(res.message); this.load(); },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'The inspection could not be recorded.'); },
    });
  }

  // ---- complete / cancel ----

  openComplete(j: GolfMaintenanceJob): void {
    this.clearMessages();
    this.target.set(j);
    this.mode.set('complete');
    this.completeForm.reset({ workDone: '', cost: null });
    this.dialogOpen.set(true);
  }

  runComplete(): void {
    const j = this.target();
    if (!j) return;
    if (this.completeForm.invalid) {
      this.completeForm.markAllAsTouched();
      return;
    }
    const v = this.completeForm.getRawValue();
    this.saving.set(true);
    this.service.complete(j.id, { workDone: v.workDone.trim() || null, cost: v.cost }).subscribe({
      next: (res) => { this.saving.set(false); this.completeForm.markAsPristine(); this.dialogOpen.set(false); this.successMessage.set(res.message); this.returnScroll.remember(GolfBuggyMaintenanceComponent.LIST_PATH, j.id); this.load(); },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'The job could not be completed.'); },
    });
  }

  askCancel(j: GolfMaintenanceJob): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Cancel job',
      message: `Cancel the ${j.kindLabel.toLowerCase()} on buggy ${j.buggyNo}? The record is removed and the unit returns to the depot. A job raised at the station or by an inspection cannot be cancelled - complete it instead.`,
      confirmLabel: 'Cancel job',
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(j.id);
        this.service.cancel(j.id).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'The job could not be cancelled.'); },
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
