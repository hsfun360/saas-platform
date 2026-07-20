import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { SalesService } from '../services/sales.service';
import { SalesAgent, SalesAgentMeta } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';

// Membership Management → Sales Agents (SRS 2.2). Every salesperson - agency
// staff, external individuals and internal sales staff - with an
// invite-to-login flow onto the /agent portal.
@Component({
  selector: 'app-sales-agents',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, PhoneInputComponent],
  templateUrl: './sales-agents.html',
  styleUrls: ['../system-setup/system-setup.css', '../memberships/memberships.css'],
})
export class SalesAgentsComponent implements OnInit {
  private readonly service = inject(SalesService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<SalesAgent[]>([]);
  readonly meta = signal<SalesAgentMeta | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly invitingId = signal<string | null>(null);
  readonly search = signal('');
  readonly kindFilter = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly dialogOpen = signal(false);
  readonly editRow = signal<SalesAgent | null>(null);

  readonly form = this.fb.nonNullable.group({
    agentCode: ['', [Validators.required, Validators.maxLength(30)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    agentKind: ['internal', [Validators.required]],
    salesAgencyId: [''],
    identityNo: ['', [Validators.maxLength(100)]],
    phone: [''],
    mobile: [''],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    joinedDate: [''],
    leftDate: [''],
    remarks: ['', [Validators.maxLength(2000)]],
  });

  // Zoneless: the agency picker shows only for agency staff.
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((r) =>
      [r.agentCode, r.name, r.email, r.identityNo, r.mobile]
        .some((v) => (v || '').toLowerCase().includes(q)));
  });

  readonly activeAgencies = computed(() => (this.meta()?.agencies || []).filter((a) => a.isActive));

  ngOnInit(): void {
    this.service.agentsMeta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.listAgents(this.kindFilter()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load agents.');
      },
    });
  }

  setKind(kind: string): void {
    this.kindFilter.set(kind);
    this.load();
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  kindLabel(key: string): string {
    // Meta ships only the kinds the Club Specification enables; existing rows
    // of a since-disabled kind still need their label.
    const fallback: Record<string, string> = {
      'agency-staff': 'Agency staff', external: 'External individual', internal: 'Internal sales staff',
    };
    return this.meta()?.agentKinds.find((k) => k.key === key)?.label || fallback[key] || key;
  }

  agencyName(id: string | null | undefined): string {
    return id ? this.meta()?.agencies.find((a) => a.id === id)?.agencyName || '' : '';
  }

  openAdd(): void {
    this.clearMessages();
    this.editRow.set(null);
    // Default to the first kind the Club Specification enables ('internal'
    // when everything is on, since it lists last but internal is the common case).
    const kinds = this.meta()?.agentKinds || [];
    const defaultKind = kinds.some((k) => k.key === 'internal') ? 'internal' : (kinds[0]?.key || 'internal');
    this.form.reset({
      agentCode: '', name: '', agentKind: defaultKind, salesAgencyId: '',
      identityNo: '', phone: '', mobile: '', email: '', joinedDate: '', leftDate: '', remarks: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(row: SalesAgent): void {
    this.clearMessages();
    this.editRow.set(row);
    this.form.reset({
      agentCode: row.agentCode,
      name: row.name,
      agentKind: row.agentKind,
      salesAgencyId: row.salesAgencyId || '',
      identityNo: row.identityNo || '',
      phone: row.phone || '',
      mobile: row.mobile || '',
      email: row.email,
      joinedDate: row.joinedDate || '',
      leftDate: row.leftDate || '',
      remarks: row.remarks || '',
    });
    this.dialogOpen.set(true);
  }

  close(): void {
    this.dialogOpen.set(false);
    this.editRow.set(null);
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const payload = this.form.getRawValue();
    if (payload.agentKind === 'agency-staff' && !payload.salesAgencyId) {
      this.errorMessage.set('Select the agency this staff member belongs to.');
      return;
    }
    const editing = this.editRow();
    this.saving.set(true);
    const req$ = editing ? this.service.updateAgent(editing.id, payload) : this.service.createAgent(payload);
    req$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.dialogOpen.set(false);
        this.editRow.set(null);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the agent.');
      },
    });
  }

  toggleActive(row: SalesAgent): void {
    this.clearMessages();
    this.service.setAgentActive(row.id, !row.isActive).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to update the agent.'),
    });
  }

  invite(row: SalesAgent): void {
    this.clearMessages();
    this.invitingId.set(row.id);
    this.service.inviteAgent(row.id).subscribe({
      next: (res) => {
        this.invitingId.set(null);
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.invitingId.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to send the invitation.');
      },
    });
  }

  showError(control: { touched: boolean; invalid: boolean }): boolean {
    return control.touched && control.invalid;
  }
}
