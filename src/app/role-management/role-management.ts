import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // 👈 Needed for ngModel
import { AuthService } from '../auth.service';
import { CompanyEntity, Role } from '../models/auth.models';

// Roles are per-company. The admin first picks a company, then creates roles for
// it (from that company's module menus) and sees its existing roles — making the
// company ↔ role link explicit.
@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-management.html',
  styleUrls: ['./role-management.css']
})
export class RoleManagementComponent implements OnInit {
  roleName: string = '';
  roleDescription: string = '';

  // The subscriber's companies + the one currently selected. Every role action
  // targets the selected company.
  companies = signal<CompanyEntity[]>([]);
  companiesLoading = signal(false);
  selectedCompanyId = signal<string>('');

  // Menus available to the selected company (grouped by module), and its roles.
  menusByModule = signal<{ [key: string]: any[] }>({});
  moduleNames = signal<string[]>([]);
  menusLoading = signal(false);
  selectedMenuIds: Set<string> = new Set();

  roles = signal<Role[]>([]);
  rolesLoading = signal(false);

  // Edit mode: null = creating a new role; otherwise the id of the role being
  // edited (its name/description/permissions are loaded into the form above).
  editingRoleId = signal<string | null>(null);
  editLoading = signal(false);
  deletingRoleId = signal<string | null>(null);

  isLoading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');

  // The system-managed role can't be edited or deleted (mirrors the backend
  // guard), so we hide its action buttons.
  readonly protectedRoleName = 'Tenant Admin';

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.loadCompanies();
  }

  loadCompanies() {
    this.companiesLoading.set(true);
    this.authService.getCompanies().subscribe({
      next: (list) => {
        this.companies.set(list);
        this.companiesLoading.set(false);
        const first = list[0]?.id || '';
        if (first) {
          this.selectedCompanyId.set(first);
          this.loadForCompany(first);
        }
      },
      error: () => this.companiesLoading.set(false),
    });
  }

  onCompanyChange(companyId: string) {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.selectedCompanyId.set(companyId);
    this.cancelEdit();
    this.loadForCompany(companyId);
  }

  private loadForCompany(companyId: string) {
    this.loadMenus(companyId);
    this.loadRoles(companyId);
  }

  loadMenus(companyId: string) {
    this.menusLoading.set(true);
    this.authService.getAvailableMenus(companyId).subscribe({
      next: (menus) => {
        const byModule: { [key: string]: any[] } = {};
        const names: string[] = [];
        menus.forEach(menu => {
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

  loadRoles(companyId: string) {
    this.rolesLoading.set(true);
    this.authService.getCompanyRoles(companyId).subscribe({
      next: (r) => {
        this.roles.set(r);
        this.rolesLoading.set(false);
      },
      error: () => this.rolesLoading.set(false),
    });
  }

  // Toggles the ID inside our Set when a checkbox is clicked
  toggleMenu(menuId: string) {
    if (this.selectedMenuIds.has(menuId)) {
      this.selectedMenuIds.delete(menuId);
    } else {
      this.selectedMenuIds.add(menuId);
    }
  }

  // Load a role into the form for editing (prefilling name, description and the
  // checked permissions from the server).
  startEdit(role: Role) {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editingRoleId.set(role.id);
    this.editLoading.set(true);
    this.roleName = role.name;
    this.roleDescription = role.description || '';
    this.selectedMenuIds = new Set();

    this.authService.getRoleDetail(role.id, this.selectedCompanyId()).subscribe({
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

  // Leave edit mode and reset the form back to "create" state.
  cancelEdit() {
    this.editingRoleId.set(null);
    this.roleName = '';
    this.roleDescription = '';
    this.selectedMenuIds = new Set();
  }

  onSubmit() {
    this.successMessage.set('');
    this.errorMessage.set('');

    if (!this.selectedCompanyId()) {
      this.errorMessage.set('Please select a company.');
      return;
    }
    if (!this.roleName) {
      this.errorMessage.set('Please enter a Role Name.');
      return;
    }
    if (this.selectedMenuIds.size === 0) {
      this.errorMessage.set('Please select at least one menu permission.');
      return;
    }

    const menuIdsArray = Array.from(this.selectedMenuIds);
    const companyId = this.selectedCompanyId();
    const editingId = this.editingRoleId();

    this.isLoading.set(true);

    if (editingId) {
      // --- Update an existing role ---
      this.authService
        .updateRole(
          editingId,
          { roleName: this.roleName, description: this.roleDescription, menuIds: menuIdsArray },
          companyId,
        )
        .subscribe({
          next: (res) => {
            this.successMessage.set(`Role '${res.role.name}' updated successfully!`);
            this.isLoading.set(false);
            // Replace the edited role in the list, keeping it alphabetical.
            this.roles.update((list) =>
              list
                .map((r) => (r.id === res.role.id ? res.role : r))
                .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
            );
            this.cancelEdit();
          },
          error: (err) => {
            this.errorMessage.set(err.error?.message || 'Failed to update role. Please try again.');
            this.isLoading.set(false);
          },
        });
      return;
    }

    // --- Create a new role ---
    this.authService.createRole(this.roleName, menuIdsArray, companyId).subscribe({
      next: (res) => {
        this.successMessage.set(`Role '${res.role.name}' created successfully!`);
        this.isLoading.set(false);
        // Add the just-created role to the list immediately, kept alphabetical to
        // match the server order (the create response is authoritative — no
        // re-fetch needed, which also avoids a stale-list race).
        this.roles.update((list) =>
          [...list, res.role].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        );
        this.cancelEdit();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create role. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  onDelete(role: Role) {
    this.successMessage.set('');
    this.errorMessage.set('');

    const confirmed = confirm(
      `Delete the role "${role.name}"? This removes the role and its permissions. Users must be reassigned first.`,
    );
    if (!confirmed) return;

    this.deletingRoleId.set(role.id);
    this.authService.deleteRole(role.id, this.selectedCompanyId()).subscribe({
      next: () => {
        this.successMessage.set(`Role '${role.name}' deleted.`);
        this.deletingRoleId.set(null);
        this.roles.update((list) => list.filter((r) => r.id !== role.id));
        // If we were editing the role we just deleted, drop out of edit mode.
        if (this.editingRoleId() === role.id) this.cancelEdit();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete role. Please try again.');
        this.deletingRoleId.set(null);
      },
    });
  }
}
