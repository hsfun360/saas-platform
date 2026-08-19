import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { ArService } from '../services/ar.service';
import { ArStatementCategory, ArStatementRun, ArStatementRunPreview } from '../models/ar.models';

// Account Receivable → Statement Generation (split from the listing
// 2026-08-06; the AR options card moved to AR Specification the same day;
// BACKGROUND execution 2026-08-08). The run screen: Statement Month with
// From/To dates auto-filled from the cutoff rule (maintained on /ar/settings),
// a debtor-category scope, a preview/confirm step (show the expected result:
// N in scope, M replaced) - then submit hands the run to the outbox worker.
// This screen only POLLS the run row for the progress bar, so the user can
// leave any time; completion arrives as an in-app notification + email.
// Cancel settles at the next chunk; failed/partial runs Resume exactly where
// they stopped.
@Component({
  selector: 'app-ar-statement-generation',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    DialogComponent, CanDirective, LocalDatePipe, OverflowMenuComponent, MenuItemDirective,
  ],
  templateUrl: './ar-statement-generation.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-statement-generation.css'],
})
export class ArStatementGenerationComponent implements OnInit, OnDestroy {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Cutoff day (maintained on AR Specification; read here for the date
  // auto-fill only).
  private cutoffDay: number | null = null;

  // --- Run form ---
  readonly runForm = this.fb.nonNullable.group({
    month: ['', [Validators.required]],
    periodStart: ['', [Validators.required]],
    periodEnd: ['', [Validators.required]],
    individual: [true],
    corporate: [true],
    nominee: [true],
    other: [true],
  });

  // Preview/confirm dialog.
  readonly previewOpen = signal(false);
  readonly previewLoading = signal(false);
  readonly preview = signal<ArStatementRunPreview | null>(null);

  // The run being watched + history. The run executes on the BACKGROUND
  // worker after submit - this screen only polls the run row, so the user can
  // navigate anywhere (or close the browser) and the run keeps going.
  readonly currentRun = signal<ArStatementRun | null>(null);
  readonly runs = signal<ArStatementRun[]>([]);
  readonly runsLoading = signal(false);
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // A run the worker is (or will be) processing - disables Generate, shows Cancel.
  readonly runActive = computed(() => {
    const r = this.currentRun();
    return !!r && (r.status === 'queued' || r.status === 'running' || r.status === 'cancelling');
  });

  readonly progressPct = computed(() => {
    const r = this.currentRun();
    if (!r || !r.totalDebtors) return 0;
    return Math.round((r.processedCount / r.totalDebtors) * 100);
  });

  ngOnInit(): void {
    const month = this.thisMonth();
    this.runForm.patchValue({ month });
    this.loadSetting(month);
    this.loadRuns();
    this.runForm.controls.month.valueChanges.subscribe((m) => this.applyDefaultPeriod(m));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPolling();
  }

  private thisMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // --- Cutoff-rule period defaulting (mirrors the API's defaultPeriod) ---
  private lastDay(y: number, m: number): number {
    return new Date(y, m, 0).getDate();
  }

  private fmt(y: number, m: number, d: number): string {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  private applyDefaultPeriod(month: string): void {
    const [y, m] = (month || '').split('-').map(Number);
    if (!y || !m) return;
    const cutoff = this.cutoffDay;
    if (!cutoff) {
      this.runForm.patchValue({ periodStart: this.fmt(y, m, 1), periodEnd: this.fmt(y, m, this.lastDay(y, m)) });
      return;
    }
    const end = Math.min(cutoff, this.lastDay(y, m));
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const prevEnd = Math.min(cutoff, this.lastDay(py, pm));
    let sy = py; let sm = pm; let sd = prevEnd + 1;
    if (sd > this.lastDay(py, pm)) { sy = y; sm = m; sd = 1; }
    this.runForm.patchValue({ periodStart: this.fmt(sy, sm, sd), periodEnd: this.fmt(y, m, end) });
  }

  // --- Setting read (cutoff day -> default date range) ---
  private loadSetting(month: string): void {
    this.service.getArSetting().subscribe({
      next: (res) => {
        this.cutoffDay = res.setting.statementCutoffDay;
        this.applyDefaultPeriod(month);
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load AR settings.'),
    });
  }

  // --- Preview + confirm + run ---
  selectedCategories(): ArStatementCategory[] {
    const v = this.runForm.getRawValue();
    const out: ArStatementCategory[] = [];
    if (v.individual) out.push('individual');
    if (v.corporate) out.push('corporate');
    if (v.nominee) out.push('nominee');
    if (v.other) out.push('other');
    return out;
  }

  onGenerate(): void {
    this.clearMessages();
    if (this.runForm.invalid) { this.runForm.markAllAsTouched(); return; }
    const categories = this.selectedCategories();
    if (!categories.length) {
      this.errorMessage.set('Select at least one debtor category.');
      return;
    }
    const v = this.runForm.getRawValue();
    this.preview.set(null);
    this.previewOpen.set(true);
    this.previewLoading.set(true);
    this.service.previewStatementRun({
      month: v.month, periodStart: v.periodStart, periodEnd: v.periodEnd, categories,
    }).subscribe({
      next: (res) => { this.preview.set(res); this.previewLoading.set(false); },
      error: (err) => {
        this.previewOpen.set(false);
        this.previewLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to preview the statement run.');
      },
    });
  }

  closePreview(): void {
    this.previewOpen.set(false);
  }

  onConfirmRun(): void {
    const v = this.runForm.getRawValue();
    const categories = this.selectedCategories();
    this.previewOpen.set(false);
    this.service.createStatementRun({
      month: v.month, periodStart: v.periodStart, periodEnd: v.periodEnd, categories,
    }).subscribe({
      next: (res) => {
        this.successMessage.set('Statement run submitted - it continues in the background. You will be notified when it finishes.');
        this.currentRun.set(res.run);
        this.startPolling(res.run.id);
        this.loadRuns();
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to start the statement run.'),
    });
  }

  // --- Progress polling (the worker does the work; we just watch) ---
  private startPolling(runId: string): void {
    this.stopPolling();
    const tick = (): void => {
      if (this.destroyed) return;
      this.service.getStatementRun(runId).subscribe({
        next: (res) => {
          this.currentRun.set(res.run);
          const s = res.run.status;
          if (s === 'queued' || s === 'running' || s === 'cancelling') {
            this.pollTimer = setTimeout(tick, 2500);
            return;
          }
          this.stopPolling();
          if (s === 'completed') {
            this.successMessage.set(`${res.run.generatedCount} statement(s) generated`
              + ` (${res.run.replacedCount} replaced) for ${res.run.totalDebtors} debtor(s).`);
          } else if (s === 'failed') {
            this.errorMessage.set(res.run.errorMessage || 'The statement run failed. Use Resume to continue.');
          }
          this.loadRuns();
        },
        error: () => {
          // Transient poll failure (network blip) - keep watching.
          this.pollTimer = setTimeout(tick, 5000);
        },
      });
    };
    tick();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // --- Run history ---
  loadRuns(): void {
    this.runsLoading.set(true);
    this.service.listStatementRuns().subscribe({
      next: (res) => {
        this.runs.set(res.runs);
        this.runsLoading.set(false);
        // Surface the active (or last failed) run as the current one on screen
        // entry, so its live progress / Resume shows without digging in history.
        if (!this.currentRun()) {
          const open = res.runs.find((r) => r.status === 'queued' || r.status === 'running' || r.status === 'cancelling')
            || res.runs.find((r) => r.status === 'failed');
          if (open) {
            this.currentRun.set(open);
            if (open.status !== 'failed') this.startPolling(open.id);
          }
        }
      },
      error: () => this.runsLoading.set(false),
    });
  }

  onResume(run: ArStatementRun): void {
    this.clearMessages();
    this.service.resumeStatementRun(run.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.currentRun.set(res.run);
        this.startPolling(res.run.id);
        this.loadRuns();
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to resume the run.'),
    });
  }

  onCancelRun(run: ArStatementRun): void {
    this.clearMessages();
    this.service.cancelStatementRun(run.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        if (this.currentRun()?.id === run.id) {
          this.currentRun.set(res.run);
          // 'cancelling' still settles worker-side - keep watching it.
          if (res.run.status === 'cancelling') this.startPolling(res.run.id);
        }
        this.loadRuns();
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to cancel the run.'),
    });
  }

  monthLabel(iso: string): string {
    // '2026-08-01' -> 'Aug 2026' (device-locale month name via localDate pipe
    // would render the full date; statements are month-labelled).
    const [y, m] = iso.split('-').map(Number);
    if (!y || !m) return iso;
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[m - 1]} ${y}`;
  }

  scopeLabel(scope: ArStatementCategory[]): string {
    const labels: Record<ArStatementCategory, string> = {
      individual: 'Individual', corporate: 'Corporate', nominee: 'Nominee', other: 'Other Debtor',
    };
    if (!scope || scope.length === 4) return 'All debtors';
    return scope.map((s) => labels[s]).join(', ');
  }

  runPct(r: ArStatementRun): number {
    return r.totalDebtors ? Math.round((r.processedCount / r.totalDebtors) * 100) : 0;
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
