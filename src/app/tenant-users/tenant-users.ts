import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { AccountCompany, AccountPerson, AccountPendingInvite, Role } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';

// Person-centric User Management: each person is shown with the companies they
// belong to and their role in each, with inline add-to-company / change-role /
// remove actions. Everything is scoped to the companies the admin may manage.
@Component({
  selector: 'app-tenant-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './tenant-users.html',
  styleUrl: './tenant-users.css',
})
export class TenantUsersComponent implements OnInit {
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

  readonly expandedUserId = signal<string | null>(null);
  // Key of the action in flight (e.g. `role:<userId>:<companyId>`) — disables that button.
  readonly pendingKey = signal<string | null>(null);

  // Template-driven selection state.
  roleSel: { [key: string]: string } = {};        // `${userId}:${companyId}` -> roleId
  addCompany: { [userId: string]: string } = {};   // userId -> companyId to add to
  addRole: { [userId: string]: string } = {};      // userId -> roleId for the add

  newUser = { email: '', password: '', fullName: '', phone: '', companyId: '', roleId: '' };
  readonly creating = signal(false);
  invite = { email: '', companyId: '', roleId: '' };
  readonly inviting = signal(false);

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.load();
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
        for (const p of res.people) {
          this.addCompany[p.id] = '';
          this.addRole[p.id] = '';
          for (const m of p.memberships) {
            this.roleSel[`${p.id}:${m.companyId}`] = m.roleId || '';
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

  toggleExpand(userId: string): void {
    this.expandedUserId.set(this.expandedUserId() === userId ? null : userId);
  }

  isPending(key: string): boolean {
    return this.pendingKey() === key;
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
    this.newUser = { email: '', password: '', fullName: '', phone: '', companyId: '', roleId: '' };
    this.createDialogOpen.set(true);
  }

  cancelCreate(): void {
    this.createDialogOpen.set(false);
  }

  openInvite(): void {
    this.clearMessages();
    this.invite = { email: '', companyId: '', roleId: '' };
    this.inviteDialogOpen.set(true);
  }

  cancelInvite(): void {
    this.inviteDialogOpen.set(false);
  }

  onChangeRole(userId: string, companyId: string): void {
    this.clearMessages();
    const roleId = this.roleSel[`${userId}:${companyId}`];
    if (!roleId) {
      this.errorMessage.set('Please choose a role.');
      return;
    }
    this.pendingKey.set(`role:${userId}:${companyId}`);
    this.authService.assignCompanyUserRole(userId, roleId, companyId).subscribe({
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
    if (!this.newUser.email.trim()) {
      this.errorMessage.set('Email is required.');
      return;
    }
    if (!this.newUser.password || this.newUser.password.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return;
    }
    if (!this.newUser.fullName.trim()) {
      this.errorMessage.set('Full name is required.');
      return;
    }
    if (!this.newUser.companyId) {
      this.errorMessage.set('Choose a company for the new user.');
      return;
    }
    this.creating.set(true);
    this.authService
      .createCompanyUser(
        {
          email: this.newUser.email.trim(),
          password: this.newUser.password,
          fullName: this.newUser.fullName.trim(),
          phone: this.newUser.phone.trim() || undefined,
          roleId: this.newUser.roleId || undefined,
        },
        this.newUser.companyId,
      )
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || '✅ User created.');
          this.newUser = { email: '', password: '', fullName: '', phone: '', companyId: '', roleId: '' };
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
    if (!this.invite.email.trim()) {
      this.errorMessage.set('Email is required.');
      return;
    }
    if (!this.invite.companyId) {
      this.errorMessage.set('Choose a company to invite them to.');
      return;
    }
    this.inviting.set(true);
    this.authService.createInvitation(this.invite.email.trim(), this.invite.roleId || undefined, this.invite.companyId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Invitation sent.');
        this.invite = { email: '', companyId: '', roleId: '' };
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
