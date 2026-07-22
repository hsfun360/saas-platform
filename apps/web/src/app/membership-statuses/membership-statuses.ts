import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MembershipStatusService } from '../services/membership-status.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { MembershipStatus, MembershipStatusOption, MembershipStatusCopySource } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// Membership Management → Master File Setup → Membership Status.
// Per-company master file: company-defined status codes with a lifecycle class,
// system control and display colour. Enable/disable (no hard delete). Reuses the
// System Setup stylesheet for the shared admin-screen look.
//
// Forms use typed Reactive Forms (canonical reference: platform-users): validators
// live on the controls, `form.dirty` feeds the shared dialog's unsaved-changes guard.
@Component({
  selector: 'app-membership-statuses',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective],
  templateUrl: './membership-statuses.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-statuses.css'],
})
export class MembershipStatusesComponent implements OnInit {
  private readonly service = inject(MembershipStatusService);
  private readonly fb = inject(FormBuilder);

  readonly statuses = signal<MembershipStatus[]>([]);
  readonly classes = signal<MembershipStatusOption[]>([]);
  readonly controls = signal<MembershipStatusOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  // Add dialog. nonNullable keeps every control a non-null string.
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  readonly addForm = this.fb.nonNullable.group({
    membershipStatus: ['', [Validators.required, Validators.maxLength(255)]],
    statusClass: ['', [Validators.required]],
    systemControl: ['', [Validators.required]],
    description: ['', [Validators.maxLength(255)]],
    statusColor: ['#000000'],
  });

  // Edit dialog. The edited record's id isn't an input, so it lives outside the form.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  editId = '';
  readonly editForm = this.fb.nonNullable.group({
    membershipStatus: ['', [Validators.required, Validators.maxLength(255)]],
    statusClass: ['', [Validators.required]],
    systemControl: ['', [Validators.required]],
    description: ['', [Validators.maxLength(255)]],
    statusColor: ['#000000'],
  });

  // Copy-from-another-company dialog (first-time setup only).
  readonly copyOpen = signal(false);
  readonly copyLoading = signal(false);
  readonly copySaving = signal(false);
  readonly copySources = signal<MembershipStatusCopySource[]>([]);
  readonly copyFromCompanyId = signal<string>('');
  readonly copySelectedIds = signal<Set<string>>(new Set());
  readonly copySelectedSource = computed(
    () => this.copySources().find((s) => s.companyId === this.copyFromCompanyId()) || null,
  );

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    // Active first, then alphabetical by code.
    const sorted = [...this.statuses()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.membershipStatus.localeCompare(b.membershipStatus);
    });
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.membershipStatus.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        this.classLabel(s.statusClass).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.statuses().filter((s) => s.isActive !== false).length);

  ngOnInit(): void {
    this.loadMeta();
    this.load();
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  classLabel(key: string): string {
    return this.classes().find((c) => c.key === key)?.label || key;
  }

  controlLabel(key: string): string {
    return this.controls().find((c) => c.key === key)?.label || key;
  }

  loadMeta(): void {
    this.service.meta().subscribe({
      next: (m) => {
        this.classes.set(m.classes);
        this.controls.set(m.controls);
      },
      error: () => {
        /* dropdowns fall back to raw keys if meta fails */
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.statuses.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load membership statuses.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.addForm.reset({ membershipStatus: '', statusClass: '', systemControl: '', description: '', statusColor: '#000000' });
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  onSaveAdd(): void {
    this.clearMessages();
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const f = this.addForm.getRawValue();
    this.addSaving.set(true);
    this.service
      .create({
        membershipStatus: f.membershipStatus.trim(),
        statusClass: f.statusClass,
        description: f.description.trim() || null,
        systemControl: f.systemControl,
        statusColor: f.statusColor || null,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`${f.membershipStatus.trim()} added.`);
          this.addSaving.set(false);
          this.addOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to add status.');
          this.addSaving.set(false);
        },
      });
  }

  openEdit(s: MembershipStatus): void {
    this.clearMessages();
    this.editId = s.id;
    this.editForm.reset({
      membershipStatus: s.membershipStatus,
      statusClass: s.statusClass,
      systemControl: s.systemControl,
      description: s.description || '',
      statusColor: s.statusColor || '#000000',
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const f = this.editForm.getRawValue();
    this.editSaving.set(true);
    this.service
      .update(this.editId, {
        membershipStatus: f.membershipStatus.trim(),
        statusClass: f.statusClass,
        description: f.description.trim() || null,
        systemControl: f.systemControl,
        statusColor: f.statusColor || null,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`${f.membershipStatus.trim()} updated.`);
          this.editSaving.set(false);
          this.editOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update status.');
          this.editSaving.set(false);
        },
      });
  }

  toggleActive(s: MembershipStatus): void {
    this.clearMessages();
    const next = !(s.isActive !== false);
    this.togglingId.set(s.id);
    this.service.update(s.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${s.membershipStatus} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update status.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Copy from another company ---
  openCopy(): void {
    this.clearMessages();
    this.copyFromCompanyId.set('');
    this.copySelectedIds.set(new Set());
    this.copySources.set([]);
    this.copyOpen.set(true);
    this.copyLoading.set(true);
    this.service.copySources().subscribe({
      next: (data) => {
        this.copySources.set(data);
        this.copyLoading.set(false);
        if (data.length) this.selectCopySource(data[0].companyId);
      },
      error: (err) => {
        this.copyLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load companies to copy from.');
      },
    });
  }

  closeCopy(): void {
    this.copyOpen.set(false);
  }

  selectCopySource(companyId: string): void {
    this.copyFromCompanyId.set(companyId);
    const src = this.copySources().find((s) => s.companyId === companyId);
    // Default: all of the source's statuses selected.
    this.copySelectedIds.set(new Set((src?.statuses || []).map((s) => s.id)));
  }

  isCopySelected(id: string): boolean {
    return this.copySelectedIds().has(id);
  }

  toggleCopyStatus(id: string): void {
    const next = new Set(this.copySelectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.copySelectedIds.set(next);
  }

  onCopy(): void {
    this.clearMessages();
    const fromCompanyId = this.copyFromCompanyId();
    const ids = Array.from(this.copySelectedIds());
    if (!fromCompanyId) {
      this.errorMessage.set('Select a company to copy from.');
      return;
    }
    if (ids.length === 0) {
      this.errorMessage.set('Select at least one status to copy.');
      return;
    }
    this.copySaving.set(true);
    this.service.copy(fromCompanyId, ids).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.copySaving.set(false);
        this.copyOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to copy statuses.');
        this.copySaving.set(false);
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
