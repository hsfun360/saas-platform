import { Component, OnInit, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../auth.service';
import { AuditLogEntry } from '../models/auth.models';
import { LocalDatePipe } from '../shared/local-date.pipe';

// Read-only viewer over the append-only audit trail (audit."AuditLog").
// Filters -> paged list -> expandable field-by-field from/to diff per entry.
// Two scopes, chosen by route data.auditScope:
//   - 'platform' (default): every entry (System Admin, /admin/audit-log)
//   - 'account': the tenant view - "what did my people change?" (Tenant
//     Admin, /admin/account-audit-log; scoped + User table excluded server-side)
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [ReactiveFormsModule, LocalDatePipe],
  templateUrl: './audit-log.html',
  styleUrls: ['./audit-log.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly isAccountScope = inject(ActivatedRoute).snapshot.data['auditScope'] === 'account';

  readonly filters = this.fb.nonNullable.group({
    tableName: [''],
    recordId: [''],
    userEmail: [''],
    from: [''],
    to: [''],
  });

  readonly rows = signal<AuditLogEntry[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = 50;
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly expandedId = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.loading.set(true);
    this.errorMessage.set('');
    const f = this.filters.getRawValue();
    const filters = {
      tableName: f.tableName.trim(),
      recordId: f.recordId.trim(),
      userEmail: f.userEmail.trim(),
      from: f.from ? `${f.from}T00:00:00` : '',
      to: f.to ? `${f.to}T23:59:59` : '',
      page,
      limit: this.limit,
    };
    const source$ = this.isAccountScope
      ? this.auth.getAccountAuditLog(filters)
      : this.admin.listAuditLog(filters);
    source$.subscribe({
      next: (res) => {
        this.rows.set(res.rows);
        this.total.set(res.total);
        this.page.set(res.page);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to load the audit log.');
      },
    });
  }

  applyFilters(): void {
    this.load(1);
  }

  clearFilters(): void {
    this.filters.reset({ tableName: '', recordId: '', userEmail: '', from: '', to: '' });
    this.load(1);
  }

  toggle(id: string): void {
    this.expandedId.update(cur => (cur === id ? null : id));
  }

  changeEntries(e: AuditLogEntry): { field: string; from: string; to: string }[] {
    return Object.entries(e.changes || {}).map(([field, v]) => ({
      field,
      from: this.show(v?.from),
      to: this.show(v?.to),
    }));
  }

  private show(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
