import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { Role } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';

// Account-level Role Management. A Role is just a named set of menu permissions
// (RBAC) — NOT tied to a company. Company enters only at entitlement (module
// subscription) and assignment (user↔role within a company). The permission
// catalogue is the subscriber account's entitled menus.
//
// The name/description dialog is a typed Reactive Form (canonical reference:
// platform-users); validators live on the controls and `roleForm.dirty` feeds
// the shared dialog's unsaved-changes guard. The menu/permission checkboxes are
// managed separately (a Set), not part of the form.
@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './role-management.html',
  styleUrls: ['./role-management.css'],
})
export class RoleManagementComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  // Dialog form (name + description). nonNullable keeps controls non-null strings.
  readonly roleForm = this.fb.nonNullable.group({
    roleName: ['', [Validators.required, Validators.maxLength(100)]],
    roleDescription: ['', [Validators.maxLength(255)]],
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

  // The account's entitled menu catalogue (grouped by module), loaded once.
  menusByModule = signal<{ [key: string]: any[] }>({});
  moduleNames = signal<string[]>([]);
  menusLoading = signal(false);
  selectedMenuIds: Set<string> = new Set();

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
      },
      error: () => this.rolesLoading.set(false),
    });
  }

  // The account-wide entitled menu catalogue for the role builder.
  loadMenus() {
    this.menusLoading.set(true);
    this.authService.getAccountMenus().subscribe({
      next: (menus) => {
        const byModule: { [key: string]: any[] } = {};
        const names: string[] = [];
        menus.forEach((menu) => {
          const modName = menu.Module ? menu.Module.name : 'Uncategorized';
          if (!byModule[modName]) {
            byModule[modName] = [];
            names.push(modName);
          }
          byModule[modName].push(menu);
        });
        this.menusByModule.set(byModule);
        this.moduleNames.set(names);
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

  toggleMenu(menuId: string) {
    if (this.selectedMenuIds.has(menuId)) {
      this.selectedMenuIds.delete(menuId);
    } else {
      this.selectedMenuIds.add(menuId);
    }
  }

  openCreate() {
    this.clearMessages();
    this.editingRoleId.set(null);
    this.roleForm.reset({ roleName: '', roleDescription: '' });
    this.selectedMenuIds = new Set();
    this.roleDialogOpen.set(true);
  }

  // Load a role into the dialog for editing (prefill name, description and the
  // checked permissions from the server).
  startEdit(role: Role) {
    this.clearMessages();
    this.editingRoleId.set(role.id);
    this.roleDialogOpen.set(true);
    this.roleForm.reset({ roleName: role.name, roleDescription: role.description || '' });
    this.selectedMenuIds = new Set();

    this.editLoading.set(true);
    this.authService.getRoleDetail(role.id).subscribe({
      next: (detail) => {
        this.roleForm.reset({ roleName: detail.name, roleDescription: detail.description || '' });
        this.selectedMenuIds = new Set(detail.menuIds);
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
    this.roleForm.reset({ roleName: '', roleDescription: '' });
    this.selectedMenuIds = new Set();
  }

  onSubmit() {
    this.clearMessages();

    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    if (this.selectedMenuIds.size === 0) {
      this.errorMessage.set('Please select at least one menu permission.');
      return;
    }

    const { roleName, roleDescription } = this.roleForm.getRawValue();
    const menuIdsArray = Array.from(this.selectedMenuIds);
    const editingId = this.editingRoleId();

    this.isLoading.set(true);

    if (editingId) {
      this.authService
        .updateRole(editingId, { roleName, description: roleDescription, menuIds: menuIdsArray })
        .subscribe({
          next: (res) => {
            this.successMessage.set(`Role '${res.role.name}' updated successfully!`);
            this.isLoading.set(false);
            this.cancelEdit();
            this.loadRoles();
          },
          error: (err) => {
            this.errorMessage.set(err.error?.message || 'Failed to update role. Please try again.');
            this.isLoading.set(false);
          },
        });
      return;
    }

    this.authService.createRole(roleName, roleDescription, menuIdsArray).subscribe({
      next: (res) => {
        this.successMessage.set(`Role '${res.role.name}' created successfully!`);
        this.isLoading.set(false);
        this.cancelEdit();
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
