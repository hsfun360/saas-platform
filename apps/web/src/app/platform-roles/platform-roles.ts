import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Role, AdminMenu } from '../models/auth.models';

// Platform (system-level) Roles — split out of the old System Setup tab strip
// into its own screen. Lists system roles with search and creates them (FAB →
// dialog) from the platform menu catalogue. Reuses the System Setup stylesheet.
@Component({
  selector: 'app-platform-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './platform-roles.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class PlatformRolesComponent implements OnInit {
  roles = signal<Role[]>([]);
  rolesLoading = signal(false);
  roleForm = { id: '', name: '', description: '' };
  roleSubmitting = signal(false);
  roleDialogOpen = signal(false);
  dialogMode = signal<'create' | 'edit'>('create');
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

  // Menu permissions for role creation (grouped by module for the UI).
  menusByModule: { [moduleName: string]: AdminMenu[] } = {};
  moduleNames: string[] = [];
  selectedMenuIds = new Set<string>();
  menusLoading = signal(false);

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
      },
      error: () => this.rolesLoading.set(false),
    });
  }

  loadMenus(): void {
    this.menusLoading.set(true);
    this.adminService.listMenus().subscribe({
      next: (menus) => {
        this.menusByModule = {};
        this.moduleNames = [];
        menus.forEach((menu) => {
          const modName = menu.Module?.name || 'Uncategorized';
          if (!this.menusByModule[modName]) {
            this.menusByModule[modName] = [];
            this.moduleNames.push(modName);
          }
          this.menusByModule[modName].push(menu);
        });
        this.menusLoading.set(false);
      },
      error: () => this.menusLoading.set(false),
    });
  }

  toggleMenu(menuId: string): void {
    if (this.selectedMenuIds.has(menuId)) {
      this.selectedMenuIds.delete(menuId);
    } else {
      this.selectedMenuIds.add(menuId);
    }
  }

  clearSearch(): void {
    this.roleSearch.set('');
  }

  // The seeded "System Admin" role is system-managed: it can't be edited or
  // deleted (backend enforces this too), so the UI hides those actions.
  isSystemManaged(role: Role): boolean {
    return role.name === 'System Admin';
  }

  openCreate(): void {
    this.clearMessages();
    this.dialogMode.set('create');
    this.roleForm = { id: '', name: '', description: '' };
    this.selectedMenuIds.clear();
    this.loadMenus();
    this.roleDialogOpen.set(true);
  }

  openEdit(role: Role): void {
    this.clearMessages();
    this.dialogMode.set('edit');
    this.roleForm = { id: role.id, name: role.name, description: role.description || '' };
    this.selectedMenuIds = new Set((role.PermittedMenus || []).map((m) => m.id));
    this.loadMenus();
    this.roleDialogOpen.set(true);
  }

  closeDialog(): void {
    this.roleDialogOpen.set(false);
  }

  onSubmit(): void {
    this.clearMessages();
    const name = this.roleForm.name.trim();
    if (!name) {
      this.errorMessage.set('Role name is required.');
      return;
    }

    const menuIds = Array.from(this.selectedMenuIds);
    this.roleSubmitting.set(true);

    if (this.dialogMode() === 'edit') {
      this.adminService
        .updateRole(this.roleForm.id, { name, description: this.roleForm.description.trim(), menuIds })
        .subscribe({
          next: () => {
            this.successMessage.set(`Role "${name}" updated.`);
            this.roleSubmitting.set(false);
            this.roleDialogOpen.set(false);
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
      .createRole({ name, description: this.roleForm.description.trim(), menuIds })
      .subscribe({
        next: () => {
          this.successMessage.set(`Role "${name}" created with ${menuIds.length} menu permission(s).`);
          this.roleSubmitting.set(false);
          this.roleDialogOpen.set(false);
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
