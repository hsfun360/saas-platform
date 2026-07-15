import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { DepartmentService } from '../services/department.service';
import { PositionService } from '../services/position.service';
import { AccountCompany, AccountPerson, AccountPendingInvite, Department, Position, Role } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';

// Person-centric User Management: each person is shown with the companies they
// belong to and their role in each, with inline add-to-company / change-role /
// remove actions. Everything is scoped to the companies the admin may manage.
//
// Every data-entry form here is a Reactive Form (see the canonical reference in
// platform-users): typed nonNullable FormGroups, control validators, correct
// HTML5 input types, and `form.dirty` feeding the shared dialog's unsaved-changes
// guard. This covers the Create-user and Invite-collaborator dialogs and the Edit
// dialog's "Edit profile" sub-form. The Edit dialog's per-row assignment selects
// are inline action controls (pick a value → click Update/Add/Remove, which
// commits immediately), not a validated form, so they bind [value] + (change)
// straight to plain selection-state objects rather than a FormGroup.
@Component({
  selector: 'app-tenant-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, PhoneInputComponent],
  templateUrl: './tenant-users.html',
  styleUrl: './tenant-users.css',
})
export class TenantUsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly companies = signal<AccountCompany[]>([]);
  readonly people = signal<AccountPerson[]>([]);
  readonly invitations = signal<AccountPendingInvite[]>([]);
  // Account-level roles — any role can be assigned in any company (roles are no
  // longer company-scoped), so every assignment dropdown uses this one list.
  readonly accountRoles = signal<Role[]>([]);
  readonly loading = signal(false);

  // Live filter over the loaded people (email / name / their companies + roles).
  readonly search = signal('');
  readonly filteredPeople = computed(() => {
    const query = this.search().trim().toLowerCase();
    const list = this.people();
    if (!query) return list;
    return list.filter(
      (p) =>
        (p.email || '').toLowerCase().includes(query) ||
        (p.full_name || '').toLowerCase().includes(query) ||
        p.memberships.some(
          (m) =>
            (m.companyName || '').toLowerCase().includes(query) ||
            (m.roleName || '').toLowerCase().includes(query),
        ),
    );
  });

  // Create-user and invite-collaborator dialogs.
  readonly createDialogOpen = signal(false);
  readonly inviteDialogOpen = signal(false);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // The person whose management dialog is open. Derived from the id so it stays
  // fresh after each reload (and auto-closes if they lose all access).
  readonly editPersonId = signal<string | null>(null);
  readonly editPerson = computed(() => this.people().find((p) => p.id === this.editPersonId()) ?? null);
  // The open person's global profile fields — a reactive form, seeded via reset()
  // when the edit dialog opens.
  readonly editProfileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    phone: [''],
    bio: ['', [Validators.maxLength(500)]],
  });
  readonly savingProfile = signal(false);
  // Key of the action in flight (e.g. `role:<userId>:<companyId>`) — disables that button.
  readonly pendingKey = signal<string | null>(null);

  // Template-driven selection state.
  roleSel: { [key: string]: string } = {};        // `${userId}:${companyId}` -> roleId
  deptSel: { [key: string]: string } = {};         // `${userId}:${companyId}` -> departmentId ('' = none)
  posSel: { [key: string]: string } = {};          // `${userId}:${companyId}` -> positionId ('' = none)
  addCompany: { [userId: string]: string } = {};   // userId -> companyId to add to
  addRole: { [userId: string]: string } = {};      // userId -> roleId for the add

  // Subscriber org masters for the assignment dropdowns (active only).
  readonly departments = signal<Department[]>([]);
  readonly positions = signal<Position[]>([]);

  // Create-user form. nonNullable keeps every control a non-null string.
  readonly createForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    phone: [''],
    companyId: ['', [Validators.required]],
    roleId: [''],
  });
  readonly creating = signal(false);

  // Invite-collaborator form.
  readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    companyId: ['', [Validators.required]],
    roleId: [''],
  });
  readonly inviting = signal(false);

  private readonly departmentService = inject(DepartmentService);
  private readonly positionService = inject(PositionService);

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.load();
    // Org masters for the per-membership Department/Position dropdowns.
    this.departmentService.listActive().subscribe({
      next: (rows) => this.departments.set(rows),
      error: () => {}, // none configured -> dropdowns just offer "None"
    });
    this.positionService.listActive().subscribe({
      next: (rows) => this.positions.set(rows),
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    // Account-level roles for every assignment dropdown.
    this.authService.getAccountRoles().subscribe({
      next: (roles) => this.accountRoles.set(roles),
      error: () => {},
    });
    this.authService.getAccountUsers().subscribe({
      next: (res) => {
        this.companies.set(res.companies);
        this.people.set(res.people);
        this.invitations.set(res.invitations);
        // Seed selection state so the bound <select>s show the current values.
        this.roleSel = {};
        this.deptSel = {};
        this.posSel = {};
        for (const p of res.people) {
          this.addCompany[p.id] = '';
          this.addRole[p.id] = '';
          for (const m of p.memberships) {
            this.roleSel[`${p.id}:${m.companyId}`] = m.roleId || '';
            this.deptSel[`${p.id}:${m.companyId}`] = m.departmentId || '';
            this.posSel[`${p.id}:${m.companyId}`] = m.positionId || '';
          }
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // Roles are account-level now, so the same list applies in every company. The
  // companyId param is kept for call-site clarity but no longer filters.
  rolesFor(_companyId?: string | null): Role[] {
    return this.accountRoles();
  }

  companiesNotJoined(person: AccountPerson): AccountCompany[] {
    const joined = new Set(person.memberships.map((m) => m.companyId));
    return this.companies().filter((c) => !joined.has(c.id));
  }

  openEdit(person: AccountPerson): void {
    this.clearMessages();
    this.editProfileForm.reset({
      fullName: person.full_name || '',
      email: person.email || '',
      phone: person.phone || '',
      bio: person.bio || '',
    });
    this.editPersonId.set(person.id);
  }

  closeEdit(): void {
    this.editPersonId.set(null);
  }

  onSaveProfile(): void {
    const person = this.editPerson();
    if (!person) return;
    this.clearMessages();
    if (this.editProfileForm.invalid) {
      this.editProfileForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const value = this.editProfileForm.getRawValue();
    this.savingProfile.set(true);
    this.authService
      .updateTenantUserProfile(person.id, {
        fullName: value.fullName.trim(),
        email: value.email.trim(),
        phone: value.phone.trim(),
        bio: value.bio.trim(),
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || 'Profile updated.');
          this.savingProfile.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update profile.');
          this.savingProfile.set(false);
        },
      });
  }

  isPending(key: string): boolean {
    return this.pendingKey() === key;
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  clearSearch(): void {
    this.search.set('');
  }

  openCreate(): void {
    this.clearMessages();
    this.createForm.reset({ email: '', password: '', fullName: '', phone: '', companyId: '', roleId: '' });
    this.createDialogOpen.set(true);
  }

  cancelCreate(): void {
    this.createDialogOpen.set(false);
  }

  openInvite(): void {
    this.clearMessages();
    this.inviteForm.reset({ email: '', companyId: '', roleId: '' });
    this.inviteDialogOpen.set(true);
  }

  cancelInvite(): void {
    this.inviteDialogOpen.set(false);
  }

  onChangeRole(userId: string, companyId: string): void {
    this.clearMessages();
    const key = `${userId}:${companyId}`;
    const roleId = this.roleSel[key];
    if (!roleId) {
      this.errorMessage.set('Please choose a role.');
      return;
    }
    this.pendingKey.set(`role:${userId}:${companyId}`);
    this.authService.assignCompanyUserRole(userId, roleId, companyId, {
      departmentId: this.deptSel[key] || null,
      positionId: this.posSel[key] || null,
    }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Role updated.');
        this.pendingKey.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update role.');
        this.pendingKey.set(null);
      },
    });
  }

  onRemove(person: AccountPerson, companyId: string, companyName?: string): void {
    this.clearMessages();
    if (!window.confirm(`Remove ${person.email} from ${companyName || 'this company'}? They keep their account and access to other companies.`)) {
      return;
    }
    this.pendingKey.set(`rm:${person.id}:${companyId}`);
    this.authService.revokeCompanyUser(person.id, companyId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Removed from company.');
        this.pendingKey.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to remove.');
        this.pendingKey.set(null);
      },
    });
  }

  onAddToCompany(person: AccountPerson): void {
    this.clearMessages();
    const companyId = this.addCompany[person.id];
    if (!companyId) {
      this.errorMessage.set('Choose a company to add them to.');
      return;
    }
    this.pendingKey.set(`add:${person.id}`);
    this.authService.addCollaborator(person.email, this.addRole[person.id] || undefined, companyId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Added to company.');
        this.addCompany[person.id] = '';
        this.addRole[person.id] = '';
        this.pendingKey.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add to company.');
        this.pendingKey.set(null);
      },
    });
  }

  onCreateUser(): void {
    this.clearMessages();
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const value = this.createForm.getRawValue();
    this.creating.set(true);
    this.authService
      .createCompanyUser(
        {
          email: value.email.trim(),
          password: value.password,
          fullName: value.fullName.trim(),
          phone: value.phone.trim() || undefined,
          roleId: value.roleId || undefined,
        },
        value.companyId,
      )
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || '✅ User created.');
          this.creating.set(false);
          this.createDialogOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create user.');
          this.creating.set(false);
        },
      });
  }

  onInvite(): void {
    this.clearMessages();
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    const value = this.inviteForm.getRawValue();
    this.inviting.set(true);
    this.authService.createInvitation(value.email.trim(), value.roleId || undefined, value.companyId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Invitation sent.');
        this.inviting.set(false);
        this.inviteDialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to send invitation.');
        this.inviting.set(false);
      },
    });
  }

  onRevokeInvite(id: string): void {
    this.clearMessages();
    this.pendingKey.set(`inv:${id}`);
    this.authService.revokeInvitation(id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Invitation revoked.');
        this.pendingKey.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to revoke invitation.');
        this.pendingKey.set(null);
      },
    });
  }
}
