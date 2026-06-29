import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // 👈 Needed for ngModel
import { AuthService } from '../auth.service';
import { Role } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';

// Account-level Role Management. A Role is just a named set of menu permissions
// (RBAC) — NOT tied to a company. Company enters only at entitlement (module
// subscription) and assignment (user↔role within a company). The permission
// catalogue is the subscriber account's entitled menus.
@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './role-management.html',
  styleUrls: ['./role-management.css'],
})
export class RoleManagementComponent implements OnInit {
  // Dialog form fields
  roleName = '';
  roleDescription = '';

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

  constructor(private authService: AuthService) {}

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
    this.roleName = '';
    this.roleDescription = '';
    this.selectedMenuIds = new Set();
    this.roleDialogOpen.set(true);
  }

  // Load a role into the dialog for editing (prefill name, description and the
  // checked permissions from the server).
  startEdit(role: Role) {
    this.clearMessages();
    this.editingRoleId.set(role.id);
    this.roleDialogOpen.set(true);
    this.roleName = role.name;
    this.roleDescription = role.description || '';
    this.selectedMenuIds = new Set();

    this.editLoading.set(true);
    this.authService.getRoleDetail(role.id).subscribe({
      next: (detail) => {
        this.roleName = detail.name;
        this.roleDescription = detail.description || '';
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
    this.roleName = '';
    this.roleDescription = '';
    this.selectedMenuIds = new Set();
  }

  onSubmit() {
    this.clearMessages();

    if (!this.roleName) {
      this.errorMessage.set('Please enter a Role Name.');
      return;
    }
    if (this.selectedMenuIds.size === 0) {
      this.errorMessage.set('Please select at least one menu permission.');
      return;
    }

    const menuIdsArray = Array.from(this.selectedMenuIds);
    const editingId = this.editingRoleId();

    this.isLoading.set(true);

    if (editingId) {
      this.authService
        .updateRole(editingId, { roleName: this.roleName, description: this.roleDescription, menuIds: menuIdsArray })
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

    this.authService.createRole(this.roleName, this.roleDescription, menuIdsArray).subscribe({
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
