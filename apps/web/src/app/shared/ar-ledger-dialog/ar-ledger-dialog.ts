import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../dialog/dialog';
import { MoneyInputDirective } from '../money-input.directive';
import { ComboboxComponent, ComboOption } from '../combobox/combobox';
import { ArService } from '../../services/ar.service';
import { ArAccountMeta, ArAnalysisEntryMeta, ArDebtor, ArDocListRow, ArLedgerDoc } from '../../models/ar.models';
import { AR_RATE_PATTERN, arBaseEquivalent, arRateForDate, arTrimRate } from '../ar-fx';

// The ONE ledger-document entry dialog (Invoice / Debit Note / Credit Note),
// shared by the Debtor Account screen (debtor known - entry only) and the
// per-document transaction screens (no debtor yet - a picker step first).
// Single-dialog rule: one <app-dialog>, the picker/entry steps are @switch
// views behind a mode signal.
//
// Posting door follows the caller's RBAC surface: with a preset [debtor] the
// account screen's kind-agnostic endpoint is used (gated '/ar/debtors');
// standalone the type's own endpoint is used (gated on that type's menu).
export interface ArLedgerDialogDebtor {
  id: string;
  no: string | null;
  name: string | null;
}

@Component({
  selector: 'app-ar-ledger-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, MoneyInputDirective, ComboboxComponent],
  templateUrl: './ar-ledger-dialog.html',
  styleUrls: ['./ar-ledger-dialog.css'],
})
export class ArLedgerDialogComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly kind = input.required<'invoice' | 'debit-note' | 'credit-note'>();
  // Preset debtor (account screen). null = standalone: pick a debtor first.
  readonly debtor = input<ArLedgerDialogDebtor | null>(null);
  // Entry meta provided by the account screen; self-loaded after a pick.
  readonly meta = input<ArAccountMeta | null>(null);
  // CN "apply against" candidates (account screen provides its open debits;
  // standalone/edit modes read them from the self-loaded meta instead).
  readonly openDebits = input<ArLedgerDoc[]>([]);
  // Raise-CN from a posted document: pre-select this open debit as the target
  // and seed the amount with its remaining balance (still editable), plus the
  // source document's analysis dimensions ({ "<dimensionNo>": optionId }) so
  // the offset lands in the same reporting buckets by default.
  readonly presetTargetId = input<string | null>(null);
  readonly presetAmount = input<number | null>(null);
  readonly presetAnalysis = input<Record<string, string> | null>(null);
  // Editing an existing Open (draft): prefill + PATCH instead of POST.
  readonly editRow = input<ArDocListRow | null>(null);

  readonly closed = output<void>();
  readonly posted = output<string>();
  readonly failed = output<string>();

  readonly mode = signal<'pick' | 'entry'>('entry');
  readonly pickedDebtor = signal<ArLedgerDialogDebtor | null>(null);
  readonly selfMeta = signal<ArAccountMeta | null>(null);
  readonly metaLoading = signal(false);
  readonly saving = signal(false);

  // Debtor picker state (standalone mode).
  readonly pickSearch = signal('');
  readonly pickLoading = signal(false);
  readonly pickRows = signal<ArDebtor[]>([]);
  private readonly pickQuery$ = new Subject<void>();

  readonly activeDebtor = computed(() => this.debtor() || this.pickedDebtor());
  readonly effMeta = computed(() => this.meta() || this.selfMeta());
  // The catalog is AR-owned with per-document classes (2026-08-15): each
  // entry dialog offers only its own class's types.
  readonly classTypes = computed(() =>
    (this.effMeta()?.transactionTypes || []).filter((t) => t.trxClass === this.kind()));
  // Invoices (2026-08-13) and Credit Notes (2026-08-20) follow the Save
  // (draft) -> Submit lifecycle; DN still posts immediately until its slice.
  readonly isLifecycle = computed(() => this.kind() === 'invoice' || this.kind() === 'credit-note');
  readonly submitLabel = computed(() => {
    const m = this.effMeta();
    const approval = this.kind() === 'credit-note' ? m?.creditNoteApproval : m?.invoiceApproval;
    return approval ? 'Submit for Approval' : 'Submit';
  });
  // "Apply against" choices: the account screen's live ledger when provided,
  // else the open debits shipped on the self-loaded meta.
  readonly effOpenDebits = computed<ArLedgerDoc[]>(() => {
    const provided = this.openDebits();
    if (provided.length) return provided;
    return (this.effMeta()?.openDebits || []) as unknown as ArLedgerDoc[];
  });

  readonly form = this.fb.nonNullable.group({
    docNo: [''],
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
    transactionTypeId: ['', [Validators.required]],
    description: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    targetLedgerId: [''],
    // Multicurrency (step 3): the rate to base on a FOREIGN-currency account
    // (1 account unit = rate base units). Defaults from the account
    // currency's rate history at the document date; editable while Open.
    exchangeRate: ['', [Validators.pattern(AR_RATE_PATTERN)]],
  });

  // --- Financial-analysis dimensions (hybrid design 2026-08-25) ---
  // One picker per slot-assigned dimension; selections live outside the form
  // group (dynamic list, same pattern as the transaction-type module radio).
  readonly analysisMeta = computed(() => this.effMeta()?.analysis || []);
  // ENTRY ORDER (user feedback 2026-08-31): a parent dimension renders before
  // its children, with the child directly after its parent (Division, then
  // Department under it) - the natural keying sequence. Roots and siblings
  // order by dimension number. No configuration knob: the hierarchy IS the
  // order, so the setup screen cannot drift from it.
  readonly orderedAnalysisMeta = computed<ArAnalysisEntryMeta[]>(() => {
    const meta = this.analysisMeta();
    const byNo = new Map(meta.map((c) => [c.dimensionNo, c]));
    const childrenOf = (no: number | null) => meta
      .filter((c) => (c.parentDimensionNo !== null && byNo.has(c.parentDimensionNo) ? c.parentDimensionNo : null) === no)
      .sort((a, b) => a.dimensionNo - b.dimensionNo);
    const out: ArAnalysisEntryMeta[] = [];
    const visit = (c: ArAnalysisEntryMeta) => {
      if (out.includes(c)) return;
      out.push(c);
      for (const child of childrenOf(c.dimensionNo)) visit(child);
    };
    for (const root of childrenOf(null)) visit(root);
    // Defensive: anything a cycle or dangling parent kept out still renders.
    for (const c of meta) if (!out.includes(c)) out.push(c);
    return out;
  });
  readonly analysisSel = signal<Record<string, string>>({});
  // The pickers sit in their own collapsible section card (user feedback
  // 2026-08-26); folding never loses the selections - they live up here.
  readonly anaOpen = signal(true);

  selFor(dimensionNo: number): string {
    return this.analysisSel()[String(dimensionNo)] || '';
  }

  // A child dimension's options are filtered by its parent's current pick.
  // With no parent picked yet, ALL are offered - choosing one back-fills the
  // parent below, since a Department determines its Division.
  optionsFor(dim: ArAnalysisEntryMeta): ArAnalysisEntryMeta['options'] {
    const parentNo = dim.parentDimensionNo;
    if (parentNo === null) return dim.options;
    const parentPick = this.selFor(parentNo);
    if (!parentPick) return dim.options;
    return dim.options.filter((o) => o.parentOptionId === parentPick);
  }

  // The cascade-filtered options as combobox rows (label = code — description
  // so type-to-filter matches either).
  comboOptionsFor(dim: ArAnalysisEntryMeta): ComboOption[] {
    return this.optionsFor(dim).map((o) => ({
      value: o.id,
      label: o.description ? `${o.code} — ${o.description}` : o.code,
    }));
  }

  pickAnalysis(dimensionNo: number, optionId: string): void {
    this.analysisSel.update((m) => {
      const next: Record<string, string> = { ...m, [String(dimensionNo)]: optionId };
      const meta = this.analysisMeta();
      const byNo = new Map(meta.map((c) => [c.dimensionNo, c]));

      // Walk UP: the picked option determines every ancestor, so fill them in.
      // Clearing to None deliberately leaves ancestors alone - the clerk may
      // have chosen the Division on purpose.
      let cursor = byNo.get(dimensionNo) || null;
      let chosenId = optionId;
      for (let hop = 0; cursor && cursor.parentDimensionNo !== null && chosenId && hop < 6; hop += 1) {
        const opt = cursor.options.find((o) => o.id === chosenId);
        const parentId = opt?.parentOptionId || '';
        next[String(cursor.parentDimensionNo)] = parentId;
        cursor = byNo.get(cursor.parentDimensionNo) || null;
        chosenId = parentId;
      }

      // Walk DOWN: drop any descendant that no longer belongs under the new
      // pick, rather than leaving a mismatched pair the server would reject.
      for (let pass = 0; pass < meta.length; pass += 1) {
        let changed = false;
        for (const c of meta) {
          if (c.parentDimensionNo === null) continue;
          const own = next[String(c.dimensionNo)];
          const parentPick = next[String(c.parentDimensionNo)] || '';
          if (!own || !parentPick) continue;
          const opt = c.options.find((o) => o.id === own);
          if (opt && opt.parentOptionId !== parentPick) {
            next[String(c.dimensionNo)] = '';
            changed = true;
          }
        }
        if (!changed) break;
      }
      return next;
    });
    this.form.markAsDirty();
  }

  // Client-side required check (the API enforces the same rule).
  private analysisError(): string | null {
    for (const dim of this.analysisMeta()) {
      if (dim.isRequired && !this.selFor(dim.dimensionNo)) return `${dim.name} is required.`;
    }
    return null;
  }

  // --- Multicurrency (step 3) ---
  readonly fxCurrency = computed(() => this.effMeta()?.currency || null);
  readonly isForeign = computed(() => { const c = this.fxCurrency(); return !!c && !c.isBase && !!c.code; });
  // Form mirrors (computed cannot read a FormControl): amount, rate, docDate.
  private readonly amountSig = signal<number | null>(0);
  private readonly rateSig = signal('');
  private readonly docDateSig = signal('');
  // Once the user keys a rate (or a draft carries one) the date no longer
  // re-defaults it.
  private readonly rateTouched = signal(false);
  readonly baseEquivalent = computed(() => arBaseEquivalent(this.amountSig(), this.rateSig()));

  constructor() {
    this.pickQuery$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.loadPickRows());
    this.form.controls.amount.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => this.amountSig.set(v));
    this.form.controls.docDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => this.docDateSig.set(v));
    this.form.controls.exchangeRate.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.rateSig.set(v);
      this.rateTouched.set(true);
    });
    // Default the rate from the table whenever the document date moves and
    // the user has not keyed one (programmatic set: no valueChanges event).
    effect(() => {
      if (!this.isForeign() || this.rateTouched()) return;
      const r = arRateForDate(this.fxCurrency(), this.docDateSig());
      this.form.controls.exchangeRate.setValue(r, { emitEvent: false });
      this.rateSig.set(r);
    });
  }

  // Re-sync the mirrors after a programmatic reset (reset emits no events here).
  private syncFxSignals(): void {
    this.amountSig.set(this.form.controls.amount.value);
    this.docDateSig.set(this.form.controls.docDate.value);
    this.rateSig.set(this.form.controls.exchangeRate.value);
  }

  ngOnInit(): void {
    const t = this.today();
    const edit = this.editRow();
    if (edit) {
      // Edit an existing draft: debtor fixed, form prefilled, meta self-loaded.
      this.form.reset({
        docNo: edit.docNo || '',
        docDate: edit.docDate,
        trxDate: edit.trxDate,
        transactionTypeId: edit.transactionTypeId,
        description: edit.description || '',
        amount: Number(edit.netAmount),
        // CN drafts carry their allocation intent (resolved at posting).
        targetLedgerId: edit.applyToLedgerId || '',
        exchangeRate: arTrimRate(edit.exchangeRate),
      }, { emitEvent: false });
      // A draft with a frozen-at-save rate keeps it; one saved before its
      // rate existed defaults from the table like a new document.
      this.rateTouched.set(!!edit.exchangeRate);
      this.syncFxSignals();
      // Analysis prefill: the stored slot values (ids resolve against the
      // self-loaded meta's options).
      const sel: Record<string, string> = {};
      for (let n = 1; n <= 6; n += 1) {
        const v = edit[`analysis${n}Id` as keyof ArDocListRow];
        if (typeof v === 'string' && v) sel[String(n)] = v;
      }
      this.analysisSel.set(sel);
      this.pickedDebtor.set({ id: edit.debtor.id, no: edit.debtor.no, name: edit.debtor.name });
      this.mode.set('entry');
      this.metaLoading.set(true);
      this.service.accountMeta(edit.debtor.id).subscribe({
        next: (m) => { this.selfMeta.set(m); this.metaLoading.set(false); },
        error: (err) => {
          this.metaLoading.set(false);
          this.failed.emit(err.error?.message || 'Failed to load the entry options.');
        },
      });
      return;
    }
    this.form.reset({
      docNo: '', docDate: t, trxDate: t, transactionTypeId: '',
      description: '', amount: this.presetAmount() ?? 0,
      // Raise-CN pre-selects the source document as the apply-against target.
      targetLedgerId: this.presetTargetId() || '',
      exchangeRate: '',
    }, { emitEvent: false });
    this.rateTouched.set(false);
    this.syncFxSignals();
    // Raise-CN carries the source document's dimensions; a plain New starts
    // empty. Ids resolve against the account meta's options once loaded.
    this.analysisSel.set(this.presetAnalysis() ? { ...this.presetAnalysis()! } : {});
    // A preset debtor starts straight in entry mode - self-loading the meta
    // when the opener didn't supply it (e.g. Raise-CN from a listing row);
    // standalone starts at the debtor picker.
    const preset = this.debtor();
    if (preset) {
      this.mode.set('entry');
      if (!this.meta()) {
        this.metaLoading.set(true);
        this.service.accountMeta(preset.id).subscribe({
          next: (m) => { this.selfMeta.set(m); this.metaLoading.set(false); },
          error: (err) => {
            this.metaLoading.set(false);
            this.failed.emit(err.error?.message || 'Failed to load the entry options.');
          },
        });
      }
    } else {
      this.mode.set('pick');
      this.loadPickRows();
    }
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  kindLabel(kind?: string): string {
    const k = kind || this.kind();
    return k === 'invoice' ? 'Invoice' : k === 'debit-note' ? 'Debit Note' : k === 'credit-note' ? 'Credit Note' : k;
  }

  remaining(doc: ArLedgerDoc): string {
    return Number(doc.balanceAmount).toFixed(2);
  }

  numberingMode(): string | null {
    return this.effMeta()?.numberingModes?.[`ar-${this.kind()}`] ?? null;
  }

  // --- Debtor picker ---

  onPickSearch(value: string): void {
    this.pickSearch.set(value);
    this.pickQuery$.next();
  }

  private loadPickRows(): void {
    this.pickLoading.set(true);
    this.service.debtorOptions(this.pickSearch().trim()).subscribe({
      next: (res) => { this.pickRows.set(res.debtors); this.pickLoading.set(false); },
      error: (err) => {
        this.pickLoading.set(false);
        this.failed.emit(err.error?.message || 'Failed to search debtors.');
      },
    });
  }

  pick(row: ArDebtor): void {
    this.pickedDebtor.set({ id: row.id, no: row.no, name: row.name });
    this.mode.set('entry');
    this.metaLoading.set(true);
    this.service.accountMeta(row.id).subscribe({
      next: (m) => { this.selfMeta.set(m); this.metaLoading.set(false); },
      error: (err) => {
        this.metaLoading.set(false);
        this.failed.emit(err.error?.message || 'Failed to load the entry options.');
      },
    });
  }

  changeDebtor(): void {
    // Standalone only (the button is hidden when the debtor is preset).
    this.pickedDebtor.set(null);
    this.selfMeta.set(null);
    this.mode.set('pick');
    this.loadPickRows();
  }

  // --- Save / Submit ---
  // Invoices: Save keeps/creates the Open draft; Submit saves first, then
  // posts (or routes into the approval chain). DN/CN: single Post as before.

  private payload(): Record<string, unknown> {
    const f = this.form.getRawValue();
    return {
      docNo: f.docNo.trim() || null,
      docDate: f.docDate,
      trxDate: f.trxDate,
      transactionTypeId: f.transactionTypeId,
      description: f.description.trim() || null,
      amount: f.amount,
      targetLedgerId: this.kind() === 'credit-note' ? (f.targetLedgerId || null) : null,
      // Foreign-currency account only: the keyed rate (blank = the API takes
      // the Exchange Rates table at the document date, or refuses clearly).
      ...(this.isForeign() ? { exchangeRate: f.exchangeRate.trim() || null } : {}),
      // Analysis selections ({ "<dimensionNo>": optionId }).
      analysis: this.analysisSel(),
    };
  }

  // Raise-CN locks the target (the action's meaning IS "offset that
  // document"); the generic New flow keeps it selectable.
  targetLocked(): boolean {
    return !!this.presetTargetId() && !this.editRow();
  }
  lockedTargetLabel(): string {
    const target = this.effOpenDebits().find((d) => d.id === this.presetTargetId());
    return target ? `${this.kindLabel(target.docKind)} ${target.docNo} — open ${this.remaining(target)}` : 'Selected document';
  }

  // A new draft saved by a Submit whose submit step then failed - further
  // saves must PATCH it, never create a duplicate.
  private readonly savedDraftId = signal<string | null>(null);

  // The save request for the current context: edit (or an already-saved new
  // draft) -> PATCH; standalone new -> the kind's own door; account-preset
  // new -> the account door (which creates drafts for lifecycle kinds).
  private saveRequest() {
    const debtor = this.activeDebtor();
    const cn = this.kind() === 'credit-note';
    const editId = this.editRow()?.id || this.savedDraftId();
    if (editId) {
      return cn ? this.service.updateCreditNote(editId, this.payload())
        : this.service.updateInvoice(editId, this.payload());
    }
    if (this.debtor()) return this.service.postLedger(debtor!.id, { ...this.payload(), docKind: this.kind() });
    return cn ? this.service.postCreditNote({ ...this.payload(), debtorId: debtor!.id })
      : this.service.postInvoice({ ...this.payload(), debtorId: debtor!.id });
  }

  private submitRequest(id: string) {
    return this.kind() === 'credit-note' ? this.service.submitCreditNote(id) : this.service.submitInvoice(id);
  }

  // A targeted CN cannot exceed the target's remaining balance (user rule
  // 2026-08-20). Client check on the keyed (net) amount for instant feedback;
  // the API re-checks GROSS (tax included) authoritatively.
  private cnAmountError(): string | null {
    if (this.kind() !== 'credit-note') return null;
    const f = this.form.getRawValue();
    if (!f.targetLedgerId) return null;
    const target = this.effOpenDebits().find((d) => d.id === f.targetLedgerId);
    if (!target) return null;
    const remaining = Number(target.balanceAmount);
    if ((Number(f.amount) || 0) > remaining + 0.000001) {
      return `The credit note amount cannot exceed the balance of ${target.docNo} (${remaining.toFixed(2)}).`;
    }
    return null;
  }

  onSave(): void {
    if (!this.activeDebtor()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const capErr = this.cnAmountError() || this.analysisError();
    if (capErr) { this.failed.emit(capErr); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the document.');
      },
    });
  }

  onSubmit(): void {
    if (!this.activeDebtor()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const capErr = this.cnAmountError() || this.analysisError();
    if (capErr) { this.failed.emit(capErr); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (saved) => {
        this.savedDraftId.set(saved.id);
        this.form.markAsPristine(); // the draft is persisted - no discard prompt
        this.submitRequest(saved.id).subscribe({
          next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
          error: (err) => {
            this.saving.set(false);
            // The draft IS saved (dialog stays open for a retry; a repeat
            // Save/Submit PATCHes the same draft).
            this.failed.emit(`${err.error?.message || 'Submit failed.'} The ${this.kindLabel().toLowerCase()} stays saved as Open.`);
          },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the document.');
      },
    });
  }
}
