import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ScrollReturnService } from '../services/scroll-return.service';
import { GolfGolferService, Golfer } from '../services/golf-golfer.service';

// Golf Management → Golfers (/golf/golfers; user decisions 2026-09-29).
// Listing of every golfer identity (member + public) with the golf-owned
// handicap fields - index + status (Established / Provisional / Beginner) -
// editable in a drawer dialog. The handicap-control rules on the Golf
// Specification screen read these fields. Names/member numbers are
// snapshots of the profile source and stay read-only here.
@Component({
  selector: 'app-golf-golfers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent],
  templateUrl: './golf-golfers.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class GolfGolfersComponent implements OnInit {
  private readonly service = inject(GolfGolferService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly golfers = signal<Golfer[]>([]);
  readonly typeLabels = signal<Map<string, string>>(new Map());
  readonly statuses = signal<{ key: string; label: string }[]>([]);

  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.golfers();
    if (!q) return list;
    return list.filter((g) => g.name.toLowerCase().includes(q)
      || (g.memberNo || '').toLowerCase().includes(q));
  });

  readonly editing = signal<Golfer | null>(null);
  readonly form = this.fb.nonNullable.group({
    handicapIndex: ['', [Validators.pattern(/^\d{1,2}(\.\d)?$/), Validators.min(0), Validators.max(54)]],
    handicapStatus: [''],
    remarks: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  statusLabel(key: string | null): string {
    if (!key) return 'Not recorded';
    const s = this.statuses().find((x) => x.key === key);
    return s ? s.label : key;
  }

  typeLabel(key: string): string {
    return this.typeLabels().get(key) || key;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.golfers.set(res.golfers);
        this.typeLabels.set(new Map(res.golferTypes.map((t) => [t.key, t.label])));
        this.statuses.set(res.handicapStatuses);
        this.loading.set(false);
        this.returnScroll.consume('/golf/golfers', this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load golfers.');
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
  }

  openEdit(golfer: Golfer): void {
    this.clearMessages();
    this.editing.set(golfer);
    this.form.reset({
      handicapIndex: golfer.handicapIndex === null ? '' : String(golfer.handicapIndex),
      handicapStatus: golfer.handicapStatus || '',
      remarks: golfer.remarks || '',
    });
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  onSave(): void {
    this.clearMessages();
    const golfer = this.editing();
    if (!golfer) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    // The number input's value accessor yields a NUMBER (or null when
    // cleared) even on a string-typed control - normalize via String().
    const idx = v.handicapIndex === null || v.handicapIndex === undefined ? '' : String(v.handicapIndex).trim();
    this.saving.set(true);
    this.service.update(golfer.id, {
      handicapIndex: idx === '' ? null : Number(idx),
      handicapStatus: v.handicapStatus || null,
      remarks: (v.remarks || '').trim() || null,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.editing.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember('/golf/golfers', golfer.id);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the golfer.');
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
