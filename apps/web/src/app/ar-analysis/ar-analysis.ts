import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';
import { ScrollReturnService } from '../services/scroll-return.service';
import { ArService } from '../services/ar.service';
import { ArAnalysisCategory, ArAnalysisOption } from '../models/ar.models';

// Account Receivable → Master File Setup → Analysis Setup (hybrid design
// locked in 2026-08-25). Master-detail: DIMENSIONS (categories) on the left -
// each optionally assigned to one of six Ledger slots - and the selected
// dimension's OPTIONS on the right. Documents reference options by id, so
// everything renames freely; enable/disable only, no deletes. The slot of a
// used dimension is immutable (the API enforces the repurpose lock).
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
  private static readonly LIST_PATH = '/ar/analysis';

  readonly categories = signal<ArAnalysisCategory[]>([]);
  readonly options = signal<ArAnalysisOption[]>([]);
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
    isRequired: [false],
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
    code: ['', [Validators.required, Validators.maxLength(30)]],
    description: ['', [Validators.maxLength(255)]],
  });

  constructor() {
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
    this.catForm.reset({ name: '', dimensionNo: '', isRequired: false });
    this.catOpen.set(true);
  }

  openEditCategory(c: ArAnalysisCategory): void {
    this.clearMessages();
    this.catEditId.set(c.id);
    this.catForm.reset({ name: c.name, dimensionNo: c.dimensionNo === null ? '' : String(c.dimensionNo), isRequired: c.isRequired === true });
    this.catOpen.set(true);
  }

  onSaveCategory(): void {
    this.clearMessages();
    if (this.catForm.invalid) { this.catForm.markAllAsTouched(); return; }
    const f = this.catForm.getRawValue();
    const payload = {
      name: f.name.trim(),
      dimensionNo: f.dimensionNo === '' ? null : Number(f.dimensionNo),
      isRequired: f.isRequired,
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

  openAddOption(): void {
    this.clearMessages();
    this.optEditId.set(null);
    this.optForm.reset({ code: '', description: '' });
    this.optOpen.set(true);
  }

  openEditOption(o: ArAnalysisOption): void {
    this.clearMessages();
    this.optEditId.set(o.id);
    this.optForm.reset({ code: o.code, description: o.description || '' });
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
    const req$ = id
      ? this.service.updateAnalysisOption(id, { code: f.code.trim(), description: f.description.trim() || null })
      : this.service.createAnalysisOption({ categoryId: cat.id, code: f.code.trim(), description: f.description.trim() || null });
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
