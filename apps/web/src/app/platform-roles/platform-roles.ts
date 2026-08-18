import { Component, Injector, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Role, RoleDataScope, RoleMenuPermission, AdminMenu } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { FULL_ACCESS, GrantFlags, PermissionPickerComponent } from '../shared/permission-picker/permission-picker';

// Platform (system-level) Roles — split out of the old System Setup tab strip
// into its own screen. Lists system roles with search and creates/edits them
// (FAB → dialog) from the PLATFORM menu catalogue (the SaaS Administration
// module; GET /admin/menus is audience-filtered server-side).
//
// The permission selection is the SHARED <app-permission-picker> (same tree /
// tri-state / Create-Edit-Delete toggles as tenant Role Management), and roles
// carry a data scope — platform RBAC mirrors the tenant model exactly. The
// seeded "System Admin" role is implicit-full-access and stays system-managed.
@Component({
  selector: 'app-platform-roles',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, PermissionPickerComponent],
  templateUrl: './platform-roles.html',
  // system-setup.css = the screen chrome; role-management.css = the shared
  // data-scope fieldset styles (.scope-*).
  styleUrls: ['../system-setup/system-setup.css', '../role-management/role-management.css'],
})
export class PlatformRolesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the reload can move the role the
  // user just touched, so its card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/admin/system-roles';

  roles = signal<Role[]>([]);
  rolesLoading = signal(false);
  // roleName/description/dataScope; permissions live in `selectedGrants`. The
  // edited role's id isn't an input, so it lives outside the form.
  readonly editRoleId = signal('');
  readonly roleForm = this.fb.nonNullable.group({
    roleName: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(255)]],
    dataScope: ['all' as RoleDataScope],
  });
  roleSubmitting = signal(false);
  roleDialogOpen = signal(false);
  dialogMode = signal<'create' | 'edit'>('create');
  editLoading = signal(false);
  deletingId = signal<string | null>(null);

  // Live filter over the loaded roles (name / description).
  roleSearch = signal('');
  filteredRoles = computed(() => {
    const query = this.roleSearch().trim().toLowerCase();
    const list = this.roles();
    if (!query) return list;
    return list.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(query) ||
        (r.description || '').toLowerCase().includes(query),
    );
  });

  // The platform menu catalogue (picker input) + the two-way selection model.
  menus = signal<AdminMenu[]>([]);
  menusLoading = signal(false);
  selectedGrants = signal<ReadonlyMap<string, GrantFlags>>(new Map<string, GrantFlags>());
  private readonly picker = viewChild(PermissionPickerComponent);

  successMessage = signal('');
  errorMessage = signal('');

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadRoles();
    this.loadMenus();
  }

  loadRoles(): void {
    this.rolesLoading.set(true);
    this.adminService.getRoles().subscribe({
      next: (data) => {
        this.roles.set(data);
        this.rolesLoading.set(false);
        this.returnScroll.consume(PlatformRolesComponent.LIST_PATH, this.injector);
      },
      error: () => this.rolesLoading.set(false),
    });
  }

  loadMenus(): void {
    this.menusLoading.set(true);
    this.adminService.listMenus().subscribe({
      next: (menus) => {
        this.menus.set(menus);
        this.menusLoading.set(false);
      },
      error: () => this.menusLoading.set(false),
    });
  }

  clearSearch(): void {
    this.roleSearch.set('');
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // The seeded "System Admin" role is system-managed: implicit full access to
  // every platform menu, and it can't be edited or deleted (backend enforces
  // this too), so the UI hides those actions.
  isSystemManaged(role: Role): boolean {
    return role.name === 'System Admin';
  }

  openCreate(): void {
    this.clearMessages();
    this.dialogMode.set('create');
    this.editRoleId.set('');
    this.roleForm.reset({ roleName: '', description: '', dataScope: 'all' });
    this.selectedGrants.set(new Map<string, GrantFlags>());
    this.roleDialogOpen.set(true);
  }

  openEdit(role: Role): void {
    this.clearMessages();
    this.dialogMode.set('edit');
    this.editRoleId.set(role.id);
    this.roleForm.reset({ roleName: role.name, description: role.description || '', dataScope: role.dataScope || 'all' });
    this.selectedGrants.set(new Map<string, GrantFlags>());
    this.roleDialogOpen.set(true);

    // Prefill the exact grants (action flags) from the detail endpoint.
    this.editLoading.set(true);
    this.adminService.getRoleDetail(role.id).subscribe({
      next: (detail) => {
        this.roleForm.reset({ roleName: detail.name, description: detail.description || '', dataScope: detail.dataScope || 'all' });
        const next = new Map<string, GrantFlags>();
        if (detail.permissions) {
          for (const p of detail.permissions) {
            next.set(p.menuId, { create: p.canCreate !== false, edit: p.canEdit !== false, delete: p.canDelete !== false });
          }
        } else {
          for (const id of detail.menuIds) next.set(id, { ...FULL_ACCESS });
        }
        this.selectedGrants.set(next);
        this.editLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load this role for editing.');
        this.roleDialogOpen.set(false);
        this.editLoading.set(false);
      },
    });
  }

  closeDialog(): void {
    this.roleDialogOpen.set(false);
  }

  onSubmit(): void {
    this.clearMessages();
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched(); // reveal the role-name error
      return;
    }
    const value = this.roleForm.getRawValue();
    const name = value.roleName.trim();

    // The picker returns only grantable (leaf) permissions with their flags.
    const permissions: RoleMenuPermission[] = this.picker()?.permissions() ?? [];
    if (permissions.length === 0) {
      this.errorMessage.set('Please select at least one menu permission.');
      return;
    }
    this.roleSubmitting.set(true);

    if (this.dialogMode() === 'edit') {
      this.adminService
        .updateRole(this.editRoleId(), { name, description: value.description.trim(), dataScope: value.dataScope, permissions })
        .subscribe({
          next: () => {
            this.successMessage.set(`Role "${name}" updated.`);
            this.roleSubmitting.set(false);
            this.roleDialogOpen.set(false);
            this.returnScroll.remember(PlatformRolesComponent.LIST_PATH, this.editRoleId());
            this.loadRoles();
          },
          error: (err) => {
            this.errorMessage.set(err.error?.message || 'Failed to update role.');
            this.roleSubmitting.set(false);
          },
        });
      return;
    }

    this.adminService
      .createRole({ name, description: value.description.trim(), dataScope: value.dataScope, permissions })
      .subscribe({
        next: (res) => {
          this.successMessage.set(`Role "${name}" created with ${permissions.length} menu permission(s).`);
          this.roleSubmitting.set(false);
          this.roleDialogOpen.set(false);
          if (res.role?.id) this.returnScroll.remember(PlatformRolesComponent.LIST_PATH, res.role.id);
          this.loadRoles();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create role.');
          this.roleSubmitting.set(false);
        },
      });
  }

  onDelete(role: Role): void {
    this.clearMessages();
    if (!confirm(`Delete the role "${role.name}"? This removes the role and its menu permissions. This can't be undone.`)) {
      return;
    }

    this.deletingId.set(role.id);
    this.adminService.deleteRole(role.id).subscribe({
      next: () => {
        this.successMessage.set(`Role "${role.name}" deleted.`);
        this.deletingId.set(null);
        this.loadRoles();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete role.');
        this.deletingId.set(null);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
