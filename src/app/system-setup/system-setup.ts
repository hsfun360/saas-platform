import { Component, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import {
  SubscriptionInfo,
  Role,
  UserSummary,
  AdminMenu,
  AdminModule,
  TenantUser,
} from '../models/auth.models';

// The section tabs, in order. Each is also a URL segment
// (/admin/system-setup/:tab) so tabs are deep-linkable and survive a refresh.
type TabId = 'create' | 'list' | 'roles' | 'users' | 'assign';
const TAB_IDS: readonly TabId[] = ['create', 'list', 'roles', 'users', 'assign'];

@Component({
  selector: 'app-system-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './system-setup.html',
  styleUrl: './system-setup.css',
})
export class SystemSetupComponent implements OnInit {
  // ── Tab control (derived from the URL :tab param) ────────────
  activeTab = signal<TabId>('create');

  // ── Form model ───────────────────────────────────────────────
  formModel = {
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    subscriberName: '',      // ← renamed from companyName
    subscriptionPlan: 'BASIC',
    registrationNumber: '',
    phone: '',
  };

  subscriptionPlans = ['BASIC', 'PRO', 'ENTERPRISE'];

  // ── Modules the new subscriber is granted (flagged per-subscriber) ───
  // NOTE: the async-loaded data below is plain, but every load/submit toggles a
  // signal flag (loading/submitting/message) which schedules change detection —
  // so the view refreshes even though the app runs without reliable zone CD.
  modules: AdminModule[] = [];
  modulesLoading = signal(false);
  selectedModuleIds = new Set<string>();

  // ── Subscriber list ──────────────────────────────────────────
  subscriptions: SubscriptionInfo[] = [];

  // Manage Admin: which company's users are expanded, and their list
  managingCompanyId: string | null = null;
  companyUsers: TenantUser[] = [];
  companyUsersLoading = signal(false);
  settingAdminUserId: string | null = null;

  // ── Roles (system-level) ─────────────────────────────────────
  roles: Role[] = [];
  rolesLoading = signal(false);
  roleForm = { name: '', description: '' };
  roleSubmitting = signal(false);

  // Menu permissions for role creation (grouped by module for the UI)
  menusByModule: { [moduleName: string]: AdminMenu[] } = {};
  moduleNames: string[] = [];
  selectedMenuIds = new Set<string>();
  menusLoading = signal(false);

  // ── Users ────────────────────────────────────────────────────
  users: UserSummary[] = [];
  usersLoading = signal(false);
  userForm = { email: '', password: '', fullName: '', phone: '' };
  userSubmitting = signal(false);

  // ── Assign user → role ───────────────────────────────────────
  assignForm = { userId: '', roleId: '' };
  assignSubmitting = signal(false);

  // ── UI state ─────────────────────────────────────────────────
  loading = signal(false);
  listLoading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');

  constructor(
    private adminService: AdminService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    // The URL is the single source of truth for the active tab. React to the
    // :tab param (clicks, deep links, browser back/forward, refresh).
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const tab = params.get('tab');
      this.applyTab(this.isValidTab(tab) ? tab : 'create');
    });
  }

  ngOnInit(): void {
    this.loadSubscriptions();
    this.loadModules();
  }

  private isValidTab(tab: string | null): tab is TabId {
    return !!tab && (TAB_IDS as readonly string[]).includes(tab);
  }

  // Load all modules; default to ALL selected so the subscriber gets full access
  // unless the admin unchecks some.
  loadModules(): void {
    this.modulesLoading.set(true);
    this.adminService.listModules().subscribe({
      next: (mods) => {
        this.modules = mods;
        this.selectedModuleIds = new Set(mods.map((m) => m.id));
        this.modulesLoading.set(false);
      },
      error: () => {
        this.modulesLoading.set(false);
      },
    });
  }

  toggleModule(moduleId: string): void {
    if (this.selectedModuleIds.has(moduleId)) {
      this.selectedModuleIds.delete(moduleId);
    } else {
      this.selectedModuleIds.add(moduleId);
    }
  }

  // ── TAB SWITCHING ────────────────────────────────────────────
  // Clicking a tab just navigates; the param subscription applies the change
  // (so it works identically for clicks, deep links and back/forward).
  switchTab(tab: TabId): void {
    this.router.navigate(['/admin/system-setup', tab]);
  }

  private applyTab(tab: TabId): void {
    this.activeTab.set(tab);
    this.clearMessages();
    if (tab === 'list') {
      this.loadSubscriptions();
    } else if (tab === 'roles') {
      this.loadRoles();
      this.loadMenus();
    } else if (tab === 'users') {
      this.loadUsers();
    } else if (tab === 'assign') {
      this.loadRoles();
      this.loadUsers();
    }
  }

  // ── FORM VALIDATION ──────────────────────────────────────────
  private isValid(): boolean {
    this.clearMessages();

    if (!this.formModel.email.trim()) {
      this.errorMessage.set('Email is required.');
      return false;
    }
    if (!this.formModel.password) {
      this.errorMessage.set('Password is required.');
      return false;
    }
    if (this.formModel.password.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return false;
    }
    if (this.formModel.password !== this.formModel.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return false;
    }
    if (!this.formModel.fullName.trim()) {
      this.errorMessage.set('Full name is required.');
      return false;
    }
    if (!this.formModel.subscriberName.trim()) {
      this.errorMessage.set('Subscriber / Company name is required.');
      return false;
    }
    return true;
  }

  // ── CREATE SUBSCRIBER ────────────────────────────────────────
  onSubmit(): void {
    if (!this.isValid()) return;

    this.loading.set(true);
    this.clearMessages();

    const payload = {
      email: this.formModel.email.trim(),
      password: this.formModel.password,
      fullName: this.formModel.fullName.trim(),
      companyName: this.formModel.subscriberName.trim(),   // backend still expects companyName
      subscriptionPlan: this.formModel.subscriptionPlan,
      registrationNumber: this.formModel.registrationNumber.trim() || undefined,
      phone: this.formModel.phone.trim() || undefined,
      moduleIds: Array.from(this.selectedModuleIds),
    };

    this.adminService.createSubscription(payload).subscribe({
      next: (res) => {
        this.successMessage.set(`✅ Subscriber "${payload.companyName}" (${payload.email}) created with ${payload.moduleIds.length} module(s)!`);
        this.resetForm();
        this.selectedModuleIds = new Set(this.modules.map((m) => m.id));
        this.loading.set(false);
        this.loadSubscriptions();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create subscriber.');
        this.loading.set(false);
      },
    });
  }

  // ── LOAD SUBSCRIBERS ─────────────────────────────────────────
  loadSubscriptions(): void {
    this.listLoading.set(true);
    this.adminService.listSubscriptions().subscribe({
      next: (data) => {
        this.subscriptions = data;
        this.listLoading.set(false);
      },
      error: () => {
        this.listLoading.set(false);
      },
    });
  }

  // ── MANAGE TENANT ADMIN (platform override) ──────────────────
  manageAdmin(companyId: string | undefined): void {
    this.clearMessages();
    if (!companyId) {
      this.errorMessage.set('This subscriber has no company to manage.');
      return;
    }
    if (this.managingCompanyId === companyId) {
      this.managingCompanyId = null;
      this.companyUsers = [];
      return;
    }
    this.managingCompanyId = companyId;
    this.loadCompanyUsers(companyId);
  }

  loadCompanyUsers(companyId: string): void {
    this.companyUsersLoading.set(true);
    this.adminService.getCompanyUsers(companyId).subscribe({
      next: (users) => {
        this.companyUsers = users;
        this.companyUsersLoading.set(false);
      },
      error: () => {
        this.companyUsersLoading.set(false);
      },
    });
  }

  setTenantAdmin(companyId: string, userId: string): void {
    this.clearMessages();
    const target = this.companyUsers.find((u) => u.id === userId);
    const email = target?.email || 'this user';
    if (!window.confirm(`Transfer Tenant Admin to ${email}? This removes admin rights from the current Tenant Admin.`)) {
      return;
    }
    this.settingAdminUserId = userId;
    this.adminService.setTenantAdmin(companyId, userId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || '✅ Tenant Admin updated.');
        this.settingAdminUserId = null;
        this.loadCompanyUsers(companyId);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to set Tenant Admin.');
        this.settingAdminUserId = null;
      },
    });
  }

  // ── ROLES ────────────────────────────────────────────────────
  loadRoles(): void {
    this.rolesLoading.set(true);
    this.adminService.getRoles().subscribe({
      next: (data) => {
        this.roles = data;
        this.rolesLoading.set(false);
      },
      error: () => {
        this.rolesLoading.set(false);
      },
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
      error: () => {
        this.menusLoading.set(false);
      },
    });
  }

  toggleMenu(menuId: string): void {
    if (this.selectedMenuIds.has(menuId)) {
      this.selectedMenuIds.delete(menuId);
    } else {
      this.selectedMenuIds.add(menuId);
    }
  }

  onCreateRole(): void {
    this.clearMessages();
    if (!this.roleForm.name.trim()) {
      this.errorMessage.set('Role name is required.');
      return;
    }

    this.roleSubmitting.set(true);
    this.adminService
      .createRole({
        name: this.roleForm.name.trim(),
        description: this.roleForm.description.trim(),
        menuIds: Array.from(this.selectedMenuIds),
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(`✅ Role "${this.roleForm.name.trim()}" created with ${this.selectedMenuIds.size} menu permission(s).`);
          this.roleForm = { name: '', description: '' };
          this.selectedMenuIds.clear();
          this.roleSubmitting.set(false);
          this.loadRoles();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create role.');
          this.roleSubmitting.set(false);
        },
      });
  }

  // ── USERS ────────────────────────────────────────────────────
  loadUsers(): void {
    this.usersLoading.set(true);
    this.adminService.listUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.usersLoading.set(false);
      },
      error: () => {
        this.usersLoading.set(false);
      },
    });
  }

  onCreateUser(): void {
    this.clearMessages();
    if (!this.userForm.email.trim()) {
      this.errorMessage.set('Email is required.');
      return;
    }
    if (!this.userForm.password || this.userForm.password.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return;
    }
    if (!this.userForm.fullName.trim()) {
      this.errorMessage.set('Full name is required.');
      return;
    }

    this.userSubmitting.set(true);
    this.adminService
      .createSaaSUser({
        email: this.userForm.email.trim(),
        password: this.userForm.password,
        fullName: this.userForm.fullName.trim(),
        phone: this.userForm.phone.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`✅ User "${this.userForm.email.trim()}" created.`);
          this.userForm = { email: '', password: '', fullName: '', phone: '' };
          this.userSubmitting.set(false);
          this.loadUsers();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create user.');
          this.userSubmitting.set(false);
        },
      });
  }

  // ── ASSIGN USER → ROLE ───────────────────────────────────────
  onAssignRole(): void {
    this.clearMessages();
    if (!this.assignForm.userId) {
      this.errorMessage.set('Please select a user.');
      return;
    }
    if (!this.assignForm.roleId) {
      this.errorMessage.set('Please select a role.');
      return;
    }

    this.assignSubmitting.set(true);
    this.adminService
      .assignUserToRole({
        userId: this.assignForm.userId,
        roleId: this.assignForm.roleId,
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || '✅ Role assigned.');
          this.assignForm = { userId: '', roleId: '' };
          this.assignSubmitting.set(false);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to assign role.');
          this.assignSubmitting.set(false);
        },
      });
  }

  // ── HELPERS ──────────────────────────────────────────────────
  resetForm(): void {
    this.formModel = {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      subscriberName: '',
      subscriptionPlan: 'BASIC',
      registrationNumber: '',
      phone: '',
    };
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
