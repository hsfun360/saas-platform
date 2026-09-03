import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { DepartmentService } from '../services/department.service';
import { PositionService } from '../services/position.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { AccountCompany, AccountPerson, AccountPendingInvite, Department, Position, Role } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';

// Per-membership placement form: role + org placement within one company.
type PlacementForm = FormGroup<{
  roleId: FormControl<string>;
  departmentId: FormControl<string>;
  positionId: FormControl<string>;
}>;

// Person-centric User Management. Each person card shows their companies + roles;
// the visible Edit opens the PROFILE drawer (global identity fields), and the
// kebab's "Companies & placement" opens the assignment drawer (per-company role /
// department / position rows + add / remove) - the app's one-visible-action +
// overflow standard.
//
// Every form is reactive, including the per-company placement rows: each row is
// its own FormGroup (formControlName keeps the <select>s in sync even though the
// role/department option lists load asynchronously - the raw [value] binding this
// replaced was applied before the options existed and silently showed "No role").
@Component({
  selector: 'app-tenant-users',
  standalone: true,
  imports: [
    FavStarComponent, LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule,
    ReactiveFormsModule, DialogComponent, PhoneInputComponent, OverflowMenuComponent, MenuItemDirective,
  ],
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

  // The person whose PROFILE drawer is open. Derived from the id so it stays
  // fresh after each reload (and auto-closes if they lose all access).
  readonly profilePersonId = signal<string | null>(null);
  readonly profilePerson = computed(() => this.people().find((p) => p.id === this.profilePersonId()) ?? null);
  // The open person's global profile fields — seeded via reset() on open.
  readonly editProfileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    phone: [''],
    bio: ['', [Validators.maxLength(500)]],
  });
  readonly savingProfile = signal(false);

  // The person whose COMPANIES & PLACEMENT drawer is open (kebab action).
  readonly placePersonId = signal<string | null>(null);
  readonly placePerson = computed(() => this.people().find((p) => p.id === this.placePersonId()) ?? null);
  // One FormGroup per membership row (companyId -> form), rebuilt on open and
  // re-seeded after each reload (dirty rows are preserved so an in-progress
  // change never resets under the user).
  private placementForms = new Map<string, PlacementForm>();
  // Add-to-company row for the open person.
  readonly placeAddForm = this.fb.nonNullable.group({
    companyId: [''],
    roleId: [''],
  });

  // Key of the action in flight (e.g. `role:<userId>:<companyId>`) — disables that button.
  readonly pendingKey = signal<string | null>(null);

  // Subscriber org masters for the assignment dropdowns (active only).
  readonly departments = signal<Department[]>([]);
  readonly positions = signal<Position[]>([]);

  // Create-user form: identity + the initial placement (company, role, and
  // optional department/position so data scope is complete on day one).
  readonly createForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    phone: [''],
    companyId: ['', [Validators.required]],
    roleId: [''],
    departmentId: [''],
    positionId: [''],
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
  // After-save return-to-row (app standard): the reload can move the person the
  // user just touched, so their card is scrolled back into view and flashed.
  // (Creates/invites are exempt: those endpoints don't return the new row's id.)
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/admin/users';

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
        // Keep the open placement drawer's rows in step with the fresh data
        // (the computed person updates itself; the forms need re-seeding).
        const openPerson = this.placePerson();
        if (openPerson) this.buildPlacementForms(openPerson, true);
        this.loading.set(false);
        this.returnScroll.consume(TenantUsersComponent.LIST_PATH, this.injector);
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

  // ---------- Profile drawer (visible Edit) ----------

  openProfile(person: AccountPerson): void {
    this.clearMessages();
    this.placePersonId.set(null);
    this.editProfileForm.reset({
      fullName: person.full_name || '',
      email: person.email || '',
      phone: person.phone || '',
      bio: person.bio || '',
    });
    this.profilePersonId.set(person.id);
  }

  closeProfile(): void {
    this.profilePersonId.set(null);
  }

  onSaveProfile(): void {
    const person = this.profilePerson();
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
          this.profilePersonId.set(null);
          this.returnScroll.remember(TenantUsersComponent.LIST_PATH, person.id);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update profile.');
          this.savingProfile.set(false);
        },
      });
  }

  // ---------- Companies & placement drawer (kebab) ----------

  openPlacement(person: AccountPerson): void {
    this.clearMessages();
    this.profilePersonId.set(null);
    this.buildPlacementForms(person, false);
    this.placePersonId.set(person.id);
  }

  closePlacement(): void {
    this.placePersonId.set(null);
    this.placementForms.clear();
  }

  placementFormFor(companyId: string): PlacementForm | null {
    return this.placementForms.get(companyId) ?? null;
  }

  // Any uncommitted row change keeps the drawer behind the unsaved-changes guard.
  placementDirty(): boolean {
    if (this.placeAddForm.dirty) return true;
    for (const form of this.placementForms.values()) if (form.dirty) return true;
    return false;
  }

  // (Re)build the per-membership forms. preserveDirty keeps rows the user has
  // edited but not committed, so a background reload never wipes their input.
  private buildPlacementForms(person: AccountPerson, preserveDirty: boolean): void {
    const next = new Map<string, PlacementForm>();
    for (const m of person.memberships) {
      const existing = this.placementForms.get(m.companyId);
      if (preserveDirty && existing?.dirty) {
        next.set(m.companyId, existing);
        continue;
      }
      next.set(m.companyId, this.fb.nonNullable.group({
        roleId: [m.roleId || ''],
        departmentId: [m.departmentId || ''],
        positionId: [m.positionId || ''],
      }));
    }
    this.placementForms = next;
    if (!preserveDirty || !this.placeAddForm.dirty) {
      this.placeAddForm.reset({ companyId: '', roleId: '' });
    }
  }

  onUpdatePlacement(person: AccountPerson, companyId: string): void {
    this.clearMessages();
    const form = this.placementForms.get(companyId);
    if (!form) return;
    const value = form.getRawValue();
    if (!value.roleId) {
      this.errorMessage.set('Please choose a role.');
      return;
    }
    this.pendingKey.set(`role:${person.id}:${companyId}`);
    this.authService.assignCompanyUserRole(person.id, value.roleId, companyId, {
      departmentId: value.departmentId || null,
      positionId: value.positionId || null,
    }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Role updated.');
        this.pendingKey.set(null);
        form.markAsPristine(); // committed - the reload re-seeds it with fresh data
        this.returnScroll.remember(TenantUsersComponent.LIST_PATH, person.id);
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
        this.placementForms.delete(companyId);
        this.returnScroll.remember(TenantUsersComponent.LIST_PATH, person.id);
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
    const value = this.placeAddForm.getRawValue();
    if (!value.companyId) {
      this.errorMessage.set('Choose a company to add them to.');
      return;
    }
    this.pendingKey.set(`add:${person.id}`);
    this.authService.addCollaborator(person.email, value.roleId || undefined, value.companyId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Added to company.');
        this.placeAddForm.reset({ companyId: '', roleId: '' });
        this.pendingKey.set(null);
        this.returnScroll.remember(TenantUsersComponent.LIST_PATH, person.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add to company.');
        this.pendingKey.set(null);
      },
    });
  }

  // ---------- Create / invite ----------

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
    this.createForm.reset({ email: '', password: '', fullName: '', phone: '', companyId: '', roleId: '', departmentId: '', positionId: '' });
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
          departmentId: value.departmentId || undefined,
          positionId: value.positionId || undefined,
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
