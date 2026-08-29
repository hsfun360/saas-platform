import { Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';
import { ScrollReturnService } from '../services/scroll-return.service';
import { ArService } from '../services/ar.service';
import { ArAnalysisCategory, ArAnalysisCategoryModule, ArAnalysisOption } from '../models/ar.models';

// One tickable module row in the dimension dialog. `applies` is the module's
// opt-in; `isRequired` is that module's own mandatory flag (enabled only while
// the module is ticked).
type ModuleRowForm = FormGroup<{
  moduleId: FormControl<string>;
  moduleName: FormControl<string>;
  applies: FormControl<boolean>;
  isRequired: FormControl<boolean>;
}>;

// Account Receivable → Master File Setup → Analysis Setup (hybrid design
// locked in 2026-08-25). Master-detail: DIMENSIONS (categories) on the left -
// each optionally assigned to one of six Ledger slots - and the selected
// dimension's OPTIONS on the right. Documents reference options by id, so
// everything renames freely; enable/disable only, no deletes. The slot of a
// used dimension is immutable (the API enforces the repurpose lock).
//
// Each dimension also declares WHICH MODULES it applies to (2026-08-27), each
// with its own "required on manual entry" flag - so a Golf-only dimension
// never reaches an AR clerk. The catalog and the dimension number stay
// company-global, which is what keeps analysis<N>Id joinable across modules.
//
// A dimension may also sit UNDER another (Department under Division, 1:many).
// Both levels are stamped in their own column, so history is frozen and each
// level stays a one-column report. The parent link is independent of the
// dimension NUMBER: Division may be Dimension 5 and Department Dimension 2.
@Component({
  selector: 'app-ar-analysis',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    DialogComponent, OverflowMenuComponent, MenuItemDirective, CanDirective,
  ],
  templateUrl: './ar-analysis.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-analysis.css'],
})
export class ArAnalysisComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private static readonly LIST_PATH = '/ar/analysis';

  readonly categories = signal<ArAnalysisCategory[]>([]);
  readonly options = signal<ArAnalysisOption[]>([]);
  // Registered dimension consumers this company subscribes to - the dialog's
  // tickable list (empty = nothing is wired to the capability here yet).
  readonly availableModules = signal<{ moduleId: string; name: string }[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // URL-driven selection (master-detail standard): /ar/analysis/:id.
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() => this.categories().find((c) => c.id === this.selectedId()) || null);
  readonly selectedOptions = computed(() => {
    const id = this.selectedId();
    return id ? this.options().filter((o) => o.categoryId === id) : [];
  });

  readonly sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      const as = a.dimensionNo ?? 99;
      const bs = b.dimensionNo ?? 99;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    }));

  optionCount(categoryId: string): number {
    return this.options().filter((o) => o.categoryId === categoryId).length;
  }

  // --- Dimension dialog (create/edit) ---
  readonly catOpen = signal(false);
  readonly catSaving = signal(false);
  readonly catEditId = signal<string | null>(null);
  readonly catForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    dimensionNo: [''],
    parentCategoryId: [''],
    modules: this.fb.array<ModuleRowForm>([]),
  });
  // Mirrors the parent select, so the warning below can react to it (form
  // controls are not signals).
  readonly catParentSel = signal('');
  // Dimensions this one may sit under: stamped, active, and neither itself nor
  // one of its own descendants (that would close a cycle).
  readonly parentChoices = computed(() => {
    const selfId = this.catEditId();
    const banned = new Set<string>();
    if (selfId) {
      banned.add(selfId);
      const all = this.categories();
      for (let pass = 0; pass < all.length; pass += 1) {
        let grew = false;
        for (const c of all) {
          if (!banned.has(c.id) && c.parentCategoryId && banned.has(c.parentCategoryId)) {
            banned.add(c.id);
            grew = true;
          }
        }
        if (!grew) break;
      }
    }
    return this.categories()
      .filter((c) => c.isActive !== false && c.dimensionNo !== null && !banned.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  // Repointing the parent invalidates every option link at once, so say what
  // it will cost BEFORE the clerk saves rather than reporting it afterwards.
  readonly parentUnlinkWarning = computed(() => {
    const id = this.catEditId();
    if (!id) return '';
    const original = this.categories().find((c) => c.id === id)?.parentCategoryId || null;
    if ((this.catParentSel() || null) === original) return '';
    const linked = this.options().filter((o) => o.categoryId === id && o.parentOptionId).length;
    if (!linked) return '';
    return `Changing the parent will unlink ${linked} option(s) from their current parent. They will need reassigning before they appear on entry screens.`;
  });
  // Stored ticks for modules the company no longer subscribes to: shown greyed
  // and read-only, and left untouched by a save, so re-subscribing restores
  // the original intent instead of silently losing it.
  readonly orphanModules = signal<ArAnalysisCategoryModule[]>([]);
  // Is this dimension stamped on documents? Catalog-only dimensions stamp
  // nothing, so they apply to no module and the list is hidden.
  readonly catStamped = signal(false);
  readonly moduleTouched = signal(false);
  // Shown once the clerk has tried to save: a stamped dimension that applies
  // nowhere would burn one of the six slots with nothing able to write it.
  readonly moduleError = computed(() => {
    if (!this.moduleTouched() || !this.catStamped()) return '';
    if (this.availableModules().length === 0) return '';
    return this.catForm.controls.modules.controls.some((m) => m.controls.applies.value)
      ? ''
      : 'Pick at least one module - a dimension stamped on documents must apply somewhere.';
  });
  // Dimensions 1..6 with the current holder named (show-expected-results).
  readonly dimensionChoices = computed(() => [1, 2, 3, 4, 5, 6].map((n) => {
    const holder = this.categories().find((c) => c.dimensionNo === n && c.id !== this.catEditId());
    return { n, holder: holder ? holder.name : null };
  }));

  // --- Option dialog (create/edit, for the selected dimension) ---
  readonly optOpen = signal(false);
  readonly optSaving = signal(false);
  readonly optEditId = signal<string | null>(null);
  readonly optForm = this.fb.nonNullable.group({
    parentOptionId: [''],
    code: ['', [Validators.required, Validators.maxLength(30)]],
    description: ['', [Validators.maxLength(255)]],
  });
  // The parent dimension's options, when the selected dimension has a parent.
  readonly parentOptionChoices = computed(() => {
    const cat = this.selected();
    if (!cat?.parentCategoryId) return [];
    return this.options()
      .filter((o) => o.categoryId === cat.parentCategoryId && o.isActive !== false)
      .sort((a, b) => a.code.localeCompare(b.code));
  });
  readonly parentCategoryName = computed(() => {
    const cat = this.selected();
    if (!cat?.parentCategoryId) return '';
    return this.categories().find((c) => c.id === cat.parentCategoryId)?.name || 'Parent';
  });
  // The options pane groups by parent once the dimension has one, with the
  // UNASSIGNED ones first: they are kept and editable here, but withheld from
  // entry pickers until linked, so the gap must be impossible to miss.
  readonly optionGroups = computed(() => {
    const cat = this.selected();
    const opts = this.selectedOptions();
    if (!cat?.parentCategoryId) return [{ key: 'all', label: '', options: opts }];
    const parents = new Map(this.options()
      .filter((o) => o.categoryId === cat.parentCategoryId)
      .map((o) => [o.id, o] as const));
    const groups = new Map<string, { key: string; label: string; options: ArAnalysisOption[] }>();
    const unassigned: ArAnalysisOption[] = [];
    for (const o of opts) {
      if (!o.parentOptionId) { unassigned.push(o); continue; }
      const parent = parents.get(o.parentOptionId);
      const label = parent
        ? parent.code + (parent.description ? ' - ' + parent.description : '')
        : 'Unknown parent';
      if (!groups.has(o.parentOptionId)) groups.set(o.parentOptionId, { key: o.parentOptionId, label, options: [] });
      groups.get(o.parentOptionId)!.options.push(o);
    }
    const out = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
    if (unassigned.length) out.unshift({ key: '__unassigned__', label: 'Unassigned', options: unassigned });
    return out;
  });

  // Options of a parented dimension that are not linked yet - the master card
  // shows this as a warning chip.
  unassignedCount(c: ArAnalysisCategory): number {
    if (!c.parentCategoryId) return 0;
    return this.options().filter((o) => o.categoryId === c.id && !o.parentOptionId).length;
  }

  parentNameOf(c: ArAnalysisCategory): string {
    if (!c.parentCategoryId) return '';
    return this.categories().find((p) => p.id === c.parentCategoryId)?.name || '';
  }

  // Rebuild the tickable rows: every available module, pre-ticked from the
  // dimension's stored rows (a NEW dimension starts with all of them ticked -
  // the common case is a company-wide dimension).
  private setModuleRows(existing: ArAnalysisCategoryModule[] | null): void {
    const arr = this.catForm.controls.modules;
    arr.clear();
    for (const m of this.availableModules()) {
      const found = existing ? existing.find((e) => e.moduleId === m.moduleId) : null;
      const applies = existing ? !!found : true;
      const row: ModuleRowForm = this.fb.nonNullable.group({
        moduleId: m.moduleId,
        moduleName: m.name,
        applies,
        isRequired: found?.isRequired === true,
      });
      // "Required" is meaningless while the module is unticked - disable it
      // rather than leave a live checkbox that changes nothing on save.
      if (!applies) row.controls.isRequired.disable({ emitEvent: false });
      row.controls.applies.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((on) => {
        if (on) row.controls.isRequired.enable({ emitEvent: false });
        else row.controls.isRequired.disable({ emitEvent: false });
      });
      arr.push(row);
    }
    this.orphanModules.set(
      (existing || []).filter((e) => !this.availableModules().some((m) => m.moduleId === e.moduleId)),
    );
  }

  constructor() {
    // The module list only applies to a dimension that is actually stamped.
    this.catForm.controls.dimensionNo.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.catStamped.set(v !== ''));
    this.catForm.controls.parentCategoryId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.catParentSel.set(v));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id');
      this.selectedId.set(id);
      if (id) this.returnScroll.remember(ArAnalysisComponent.LIST_PATH, id);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.analysisSetup().subscribe({
      next: (res) => {
        this.categories.set(res.categories);
        this.options.set(res.options);
        this.availableModules.set(res.availableModules || []);
        this.loading.set(false);
        if (!this.selectedId()) this.returnScroll.consume(ArAnalysisComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the analysis setup.');
      },
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  select(c: ArAnalysisCategory): void {
    this.router.navigate(['/ar/analysis', c.id]);
  }

  back(): void {
    this.router.navigate(['/ar/analysis']);
  }

  // --- Dimension CRUD ---

  openAddCategory(): void {
    this.clearMessages();
    this.catEditId.set(null);
    this.moduleTouched.set(false);
    this.catForm.reset({ name: '', dimensionNo: '', parentCategoryId: '' });
    this.catStamped.set(false);
    this.catParentSel.set('');
    this.setModuleRows(null);
    this.catOpen.set(true);
  }

  openEditCategory(c: ArAnalysisCategory): void {
    this.clearMessages();
    this.catEditId.set(c.id);
    this.moduleTouched.set(false);
    this.catForm.reset({
      name: c.name,
      dimensionNo: c.dimensionNo === null ? '' : String(c.dimensionNo),
      parentCategoryId: c.parentCategoryId || '',
    });
    this.catStamped.set(c.dimensionNo !== null);
    this.catParentSel.set(c.parentCategoryId || '');
    this.setModuleRows(c.modules || []);
    this.catOpen.set(true);
  }

  // The applicable modules of a listed dimension, for its summary chips.
  moduleChips(c: ArAnalysisCategory): ArAnalysisCategoryModule[] {
    return [...(c.modules || [])].sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  }

  onSaveCategory(): void {
    this.clearMessages();
    this.moduleTouched.set(true);
    if (this.catForm.invalid) { this.catForm.markAllAsTouched(); return; }
    if (this.moduleError()) return;
    const f = this.catForm.getRawValue();
    const stamped = f.dimensionNo !== '';
    const payload = {
      name: f.name.trim(),
      dimensionNo: stamped ? Number(f.dimensionNo) : null,
      parentCategoryId: f.parentCategoryId || null,
      // A catalog-only dimension stamps nothing, so it applies nowhere.
      modules: stamped
        ? f.modules.filter((m) => m.applies).map((m) => ({ moduleId: m.moduleId, isRequired: m.isRequired }))
        : [],
    };
    this.catSaving.set(true);
    const id = this.catEditId();
    const req$ = id ? this.service.updateAnalysisCategory(id, payload) : this.service.createAnalysisCategory(payload);
    req$.subscribe({
      next: (res) => {
        this.errorMessage.set('');
        this.successMessage.set(res.message);
        this.catSaving.set(false);
        this.catOpen.set(false);
        this.returnScroll.remember(ArAnalysisComponent.LIST_PATH, res.category.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the dimension.');
        this.catSaving.set(false);
      },
    });
  }

  toggleCategory(c: ArAnalysisCategory): void {
    this.clearMessages();
    const next = !(c.isActive !== false);
    this.togglingId.set(c.id);
    this.service.setAnalysisCategoryActive(c.id, next).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.togglingId.set(null);
        this.returnScroll.remember(ArAnalysisComponent.LIST_PATH, c.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the dimension.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Option CRUD (within the selected dimension) ---

  // The parent link is required exactly when the dimension has a parent, so
  // the validator is set per open rather than declared once.
  private syncParentOptionValidator(): void {
    const control = this.optForm.controls.parentOptionId;
    if (this.selected()?.parentCategoryId) control.setValidators([Validators.required]);
    else control.clearValidators();
    control.updateValueAndValidity({ emitEvent: false });
  }

  openAddOption(): void {
    this.clearMessages();
    this.optEditId.set(null);
    this.optForm.reset({ parentOptionId: '', code: '', description: '' });
    this.syncParentOptionValidator();
    this.optOpen.set(true);
  }

  openEditOption(o: ArAnalysisOption): void {
    this.clearMessages();
    this.optEditId.set(o.id);
    this.optForm.reset({
      parentOptionId: o.parentOptionId || '',
      code: o.code,
      description: o.description || '',
    });
    this.syncParentOptionValidator();
    this.optOpen.set(true);
  }

  onSaveOption(): void {
    this.clearMessages();
    const cat = this.selected();
    if (!cat) return;
    if (this.optForm.invalid) { this.optForm.markAllAsTouched(); return; }
    const f = this.optForm.getRawValue();
    this.optSaving.set(true);
    const id = this.optEditId();
    const parentOptionId = cat.parentCategoryId ? (f.parentOptionId || null) : null;
    const req$ = id
      ? this.service.updateAnalysisOption(id, { parentOptionId, code: f.code.trim(), description: f.description.trim() || null })
      : this.service.createAnalysisOption({ categoryId: cat.id, parentOptionId, code: f.code.trim(), description: f.description.trim() || null });
    req$.subscribe({
      next: (res) => {
        this.errorMessage.set('');
        this.successMessage.set(res.message);
        this.optSaving.set(false);
        this.optOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the option.');
        this.optSaving.set(false);
      },
    });
  }

  toggleOption(o: ArAnalysisOption): void {
    this.clearMessages();
    const next = !(o.isActive !== false);
    this.togglingId.set(o.id);
    this.service.setAnalysisOptionActive(o.id, next).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the option.');
        this.togglingId.set(null);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
