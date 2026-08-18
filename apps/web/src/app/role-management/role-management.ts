import { Component, Injector, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MenuItem, Role, RoleDataScope, RoleMenuPermission } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { FULL_ACCESS, GrantFlags, PermissionPickerComponent } from '../shared/permission-picker/permission-picker';

// Account-level Role Management. A Role is just a named set of menu permissions
// (RBAC) — NOT tied to a company. Company enters only at entitlement (module
// subscription) and assignment (user↔role within a company). The permission
// catalogue is the subscriber account's entitled menus.
//
// The name/description dialog is a typed Reactive Form (canonical reference:
// platform-users); validators live on the controls and `roleForm.dirty` feeds
// the shared dialog's unsaved-changes guard. The menu/permission selection is
// the SHARED <app-permission-picker> (also used by the platform System Roles
// editor), bound to the `selectedGrants` map signal.
@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, PermissionPickerComponent],
  templateUrl: './role-management.html',
  styleUrls: ['./role-management.css'],
})
export class RoleManagementComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the reload can move the role the
  // user just touched, so its card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/admin/roles';

  // Dialog form (name + description + data scope). nonNullable keeps controls
  // non-null; dataScope defaults to 'all' (the pre-Phase-3 behaviour).
  readonly roleForm = this.fb.nonNullable.group({
    roleName: ['', [Validators.required, Validators.maxLength(100)]],
    roleDescription: ['', [Validators.maxLength(255)]],
    dataScope: ['all' as RoleDataScope],
  });

  roles = signal<Role[]>([]);
  rolesLoading = signal(false);

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

  // The account's entitled menu catalogue, loaded once; the picker's input.
  accountMenus = signal<MenuItem[]>([]);
  menusLoading = signal(false);

  // menuId -> action flags (the picker's two-way model). A key existing = the
  // role may VIEW that menu. Group grants loaded from an old role are tolerated:
  // the picker ignores them and strips them from the save payload.
  selectedGrants = signal<ReadonlyMap<string, GrantFlags>>(new Map<string, GrantFlags>());

  private readonly picker = viewChild(PermissionPickerComponent);

  // Edit mode: null = creating; otherwise the id of the role being edited.
  editingRoleId = signal<string | null>(null);
  editLoading = signal(false);
  deletingRoleId = signal<string | null>(null);
  roleDialogOpen = signal(false);

  isLoading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');

  // The system-managed role can't be edited or deleted (mirrors the backend
  // guard), so we hide its action buttons.
  readonly protectedRoleName = 'Tenant Admin';

  ngOnInit() {
    this.loadRoles();
    this.loadMenus();
  }

  loadRoles() {
    this.rolesLoading.set(true);
    this.authService.getAccountRoles().subscribe({
      next: (r) => {
        this.roles.set(r);
        this.rolesLoading.set(false);
        this.returnScroll.consume(RoleManagementComponent.LIST_PATH, this.injector);
      },
      error: () => this.rolesLoading.set(false),
    });
  }

  // The account-wide entitled menu catalogue for the role builder.
  loadMenus() {
    this.menusLoading.set(true);
    this.authService.getAccountMenus().subscribe({
      next: (menus) => {
        this.accountMenus.set(menus);
        this.menusLoading.set(false);
      },
      error: () => this.menusLoading.set(false),
    });
  }

  clearSearch() {
    this.roleSearch.set('');
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openCreate() {
    this.clearMessages();
    this.editingRoleId.set(null);
    this.roleForm.reset({ roleName: '', roleDescription: '', dataScope: 'all' });
    this.selectedGrants.set(new Map<string, GrantFlags>());
    this.roleDialogOpen.set(true);
  }

  // Load a role into the dialog for editing (prefill name, description and the
  // checked permissions from the server).
  startEdit(role: Role) {
    this.clearMessages();
    this.editingRoleId.set(role.id);
    this.roleDialogOpen.set(true);
    this.roleForm.reset({ roleName: role.name, roleDescription: role.description || '', dataScope: role.dataScope || 'all' });
    this.selectedGrants.set(new Map<string, GrantFlags>());

    this.editLoading.set(true);
    this.authService.getRoleDetail(role.id).subscribe({
      next: (detail) => {
        this.roleForm.reset({ roleName: detail.name, roleDescription: detail.description || '', dataScope: detail.dataScope || 'all' });
        const next = new Map<string, GrantFlags>();
        if (detail.permissions) {
          for (const p of detail.permissions) {
            next.set(p.menuId, { create: p.canCreate !== false, edit: p.canEdit !== false, delete: p.canDelete !== false });
          }
        } else {
          // Older backend: menu ids only = full access per menu.
          for (const id of detail.menuIds) next.set(id, { ...FULL_ACCESS });
        }
        this.selectedGrants.set(next);
        this.editLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load this role for editing.');
        this.cancelEdit();
        this.editLoading.set(false);
      },
    });
  }

  cancelEdit() {
    this.roleDialogOpen.set(false);
    this.editingRoleId.set(null);
    this.roleForm.reset({ roleName: '', roleDescription: '', dataScope: 'all' });
    this.selectedGrants.set(new Map<string, GrantFlags>());
  }

  onSubmit() {
    this.clearMessages();

    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    // The picker owns the leaf/group knowledge - it returns only grantable
    // (leaf) permissions, so legacy group grants age out on the next save.
    const permissions: RoleMenuPermission[] = this.picker()?.permissions() ?? [];
    if (permissions.length === 0) {
      this.errorMessage.set('Please select at least one menu permission.');
      return;
    }

    const { roleName, roleDescription, dataScope } = this.roleForm.getRawValue();
    const editingId = this.editingRoleId();

    this.isLoading.set(true);

    if (editingId) {
      this.authService
        .updateRole(editingId, { roleName, description: roleDescription, dataScope, permissions })
        .subscribe({
          next: (res) => {
            this.successMessage.set(`Role '${res.role.name}' updated successfully!`);
            this.isLoading.set(false);
            this.cancelEdit();
            this.returnScroll.remember(RoleManagementComponent.LIST_PATH, editingId);
            this.loadRoles();
          },
          error: (err) => {
            this.errorMessage.set(err.error?.message || 'Failed to update role. Please try again.');
            this.isLoading.set(false);
          },
        });
      return;
    }

    this.authService.createRole(roleName, roleDescription, permissions, dataScope).subscribe({
      next: (res) => {
        this.successMessage.set(`Role '${res.role.name}' created successfully!`);
        this.isLoading.set(false);
        this.cancelEdit();
        if (res.role?.id) this.returnScroll.remember(RoleManagementComponent.LIST_PATH, res.role.id);
        this.loadRoles();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create role. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  onDelete(role: Role) {
    this.clearMessages();

    const confirmed = confirm(
      `Delete the role "${role.name}"? This removes the role and its permissions. Users must be reassigned first.`,
    );
    if (!confirmed) return;

    this.deletingRoleId.set(role.id);
    this.authService.deleteRole(role.id).subscribe({
      next: () => {
        this.successMessage.set(`Role '${role.name}' deleted.`);
        this.deletingRoleId.set(null);
        if (this.editingRoleId() === role.id) this.cancelEdit();
        this.loadRoles();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete role. Please try again.');
        this.deletingRoleId.set(null);
      },
    });
  }

  private clearMessages() {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
