import { Component, OnInit, signal } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { ActiveSystemService } from '../services/active-system.service';
import { MenuItem, WorkspaceOption, MyInvitation } from '../models/auth.models';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.html',
    styleUrl: './dashboard.css',
    imports: [CommonModule, RouterModule],
    host: {
      '(document:click)': 'closeDropdown()',
      '(document:keydown.escape)': 'onEscape()'
    }
})
export class Dashboard implements OnInit {
  loggedInUser: string | null = '';
  // Updated asynchronously from the avatar$/fullName$ streams, so held in signals
  // to refresh the view without relying on zone-based change detection.
  userFullName = signal<string | null>(null);
  userAvatar: string | null = null;
  isAppsDropdownOpen = false;
  isSystemAdmin = false;
  userRoleName = 'User';
  profilePictureUrl = signal<string | null>(null);
  activeCompanyName = 'Loading...';
  allowedMenus: MenuItem[] = [];
  displayedMenus: MenuItem[] = [];
  availableModules: { name: string; icon: string }[] = [];
  activeModule = '';
  isDropdownOpen = false;
  isSidebarPinned = false;

  // Workspace (company) switching. Async-loaded state is held in signals so the
  // switcher/banner refresh on the HTTP callback (zone-based CD isn't reliable here).
  workspaces = signal<WorkspaceOption[]>([]);
  currentCompanyId = 'SYSTEM';
  isWorkspaceDropdownOpen = false;
  switchingWorkspace = signal(false);

  // Pending collaborator invitations addressed to this user
  myInvitations = signal<MyInvitation[]>([]);
  respondingInvitationId = signal<string | null>(null);

  constructor(
    private router: Router,
    private authService: AuthService,
    private activeSystem: ActiveSystemService,
  ) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.activeCompanyName = payload.companyName || 'SYSTEM ADMINISTRATION';
      this.isSystemAdmin = payload.isSystemAdmin || false;
      this.currentCompanyId = payload.companyId || 'SYSTEM';
    }

    this.loadWorkspaces();
    this.loadMyInvitations();

    const savedAvatar = localStorage.getItem('profilePicture');
    if (savedAvatar) this.profilePictureUrl.set(savedAvatar);

    this.authService.avatar$.subscribe(url => {
      if (url) this.profilePictureUrl.set(url);
    });
    this.authService.fullName$.subscribe(name => {
      if (name && name !== 'Loading...') this.userFullName.set(name);
    });

    this.userRoleName = localStorage.getItem('userRole') || 'User';
    this.loggedInUser = localStorage.getItem('userEmail');

    const savedMenus = localStorage.getItem('userMenus');
    if (savedMenus) {
      const parsedMenus: MenuItem[] = JSON.parse(savedMenus);
      this.allowedMenus = parsedMenus.map(m => ({
        ...m,
        moduleName: m.moduleName || 'Core Club Management',
        moduleIcon: m.moduleIcon || 'business'
      }));
    }

    if (this.userRoleName === 'Tenant Admin') {
      // These admin menus may already be granted to the Tenant Admin role by the
      // backend (seeded "System Setup" menus). Only add the ones that aren't
      // already present — otherwise they show up twice in the sidebar.
      const tenantAdminMenus: MenuItem[] = [
        { name: 'Role Management', route: '/admin/roles', icon: 'badge', moduleName: 'System Setup', moduleIcon: 'admin_panel_settings', Module: undefined },
        { name: 'User Management', route: '/admin/users', icon: 'manage_accounts', moduleName: 'System Setup', moduleIcon: 'admin_panel_settings', Module: undefined },
        { name: 'Companies', route: '/admin/companies', icon: 'corporate_fare', moduleName: 'System Setup', moduleIcon: 'admin_panel_settings', Module: undefined },
      ];
      for (const menu of tenantAdminMenus) {
        if (!this.allowedMenus.some(m => m.route === menu.route)) {
          this.allowedMenus.push(menu);
        }
      }
    }

    // System Admin gets the SaaS Administration (control plane) system + its menus.
    if (this.isSystemAdmin) {
      this.allowedMenus.push(
        { name: 'Internal Staff & Roles', route: '/admin/system-setup', icon: 'manage_accounts', moduleName: 'SaaS Administration', moduleIcon: 'admin_panel_settings', Module: undefined },
        { name: 'Modules & Menus', route: '/admin/modules-menus', icon: 'category', moduleName: 'SaaS Administration', moduleIcon: 'admin_panel_settings', Module: undefined },
      );
    }

    // Build the apps (systems) list from the granted menus.
    const moduleMap = new Map<string, string>();
    this.allowedMenus.forEach(m => {
      if (m.moduleName) moduleMap.set(m.moduleName, m.moduleIcon || 'widgets');
    });
    this.availableModules = Array.from(moduleMap.entries()).map(([name, icon]) => ({ name, icon }));

    // Apply Control-Plane landing config (Module.landingRoute) over the defaults.
    this.allowedMenus.forEach(m => {
      if (m.moduleName && m.moduleLanding) this.moduleLanding[m.moduleName] = m.moduleLanding;
    });

    // Active system follows the URL (deep link / refresh / back-forward) so the
    // correct sidebar shows on load. We never auto-navigate here — that would
    // fight a deep link and surprise users on login; entering a system (via the
    // apps switcher) is what navigates to its dashboard.
    const fallbackModule = this.isSystemAdmin ? 'SaaS Administration' : this.availableModules[0]?.name;
    const initialModule = this.moduleForUrl(this.router.url) || fallbackModule;
    if (initialModule) this.selectModule(initialModule, false);

    this.authService.getProfile().subscribe({
      next: (response) => {
        if (response.user.profilePicture) {
          this.authService.updateAvatarState(response.user.profilePicture);
        }
        const fetchedName = response.user.full_name || response.user.fullName;
        const finalName = (fetchedName && fetchedName.trim() !== '') ? fetchedName : 'New User';
        this.authService.updateFullNameState(finalName);
      },
      error: () => {
        this.authService.updateFullNameState('New User');
      }
    });
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  onAvatarError(): void {
    if (this.profilePictureUrl() !== 'assets/default-avatar.svg') {
      this.profilePictureUrl.set('assets/default-avatar.svg');
    }
  }

  toggleSidebar(): void {
    this.isSidebarPinned = !this.isSidebarPinned;
  }

  onLogout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('profilePicture');
    this.authService.updateAvatarState('');
    this.router.navigate(['/login']);
  }

  toggleAppsDropdown(event: Event): void {
    event.stopPropagation();
    this.isAppsDropdownOpen = !this.isAppsDropdownOpen;
    this.isDropdownOpen = false;
  }

  // Per-system landing routes. Seeded with sensible defaults for the known
  // systems, then OVERRIDDEN by Control-Plane config (Module.landingRoute, carried
  // on each menu as `moduleLanding`) in ngOnInit. If a system has neither, entering
  // it falls back to the first menu the role is permitted (permitted-first).
  private moduleLanding: Record<string, string> = {
    'SaaS Administration': '/platform',
    'Membership Management': '/membership',
    'Golf Management': '/golf',
    'Facility Management': '/facility',
  };

  // The active system's dashboard route (its configured landing). Powers the
  // sidebar / bottom-nav "Dashboard" link, so it always points at THIS system's
  // dashboard. Falls back to /home for a system without a dedicated dashboard.
  get systemDashboardRoute(): string {
    return this.moduleLanding[this.activeModule] || '/home';
  }

  selectModule(moduleName: string, navigate = true): void {
    this.activeModule = moduleName;
    this.displayedMenus = this.allowedMenus.filter(m => m.moduleName === moduleName);
    this.isAppsDropdownOpen = false;
    // Publish this system's dashboard so other screens (e.g. Under Construction)
    // can return to it rather than the generic /home.
    this.activeSystem.dashboardRoute.set(this.systemDashboardRoute);
    if (navigate) {
      const landing = this.moduleLanding[moduleName] || this.displayedMenus[0]?.route;
      if (landing) this.router.navigate([landing]);
    }
  }

  // Which system does the current URL belong to? Sets the active system on load
  // so deep links / refresh show the correct sidebar.
  private moduleForUrl(url: string): string | null {
    for (const [mod, route] of Object.entries(this.moduleLanding)) {
      if (url.startsWith(route)) return mod;
    }
    const menu = this.allowedMenus.find(m => m.route && m.route !== '/home' && url.startsWith(m.route));
    return menu?.moduleName || null;
  }

  closeDropdown(): void {
    this.isDropdownOpen = false;
    this.isAppsDropdownOpen = false;
    this.isWorkspaceDropdownOpen = false;
  }

  // Esc closes any open menu/dropdown and the mobile navigation drawer.
  onEscape(): void {
    this.closeDropdown();
    this.isSidebarPinned = false;
  }

  toggleWorkspaceDropdown(event: Event): void {
    event.stopPropagation();
    this.isWorkspaceDropdownOpen = !this.isWorkspaceDropdownOpen;
    this.isDropdownOpen = false;
    this.isAppsDropdownOpen = false;
  }

  loadWorkspaces(): void {
    this.authService.getWorkspaces().subscribe({
      next: (list) => this.workspaces.set(list),
      error: () => this.workspaces.set([]),
    });
  }

  switchWorkspace(companyId: string): void {
    this.isWorkspaceDropdownOpen = false;
    if (this.switchingWorkspace() || companyId === this.currentCompanyId) {
      return;
    }

    this.switchingWorkspace.set(true);
    this.authService.switchWorkspace(companyId).subscribe({
      next: (res) => {
        if (res.token) {
          localStorage.setItem('token', res.token);
        }
        localStorage.setItem('userRole', res.roleName || 'User');
        localStorage.setItem('userFullName', res.fullName || 'User');
        localStorage.setItem('userProfilePicture', res.profilePicture || '');
        this.authService.storeUserMenus(res.menus);
        // Reload so the dashboard re-initialises with the new workspace's
        // company name, role and menus.
        window.location.reload();
      },
      error: (err) => {
        this.switchingWorkspace.set(false);
        alert(err.error?.message || 'Failed to switch workspace.');
      },
    });
  }

  loadMyInvitations(): void {
    this.authService.getMyInvitations().subscribe({
      next: (list) => this.myInvitations.set(list),
      error: () => this.myInvitations.set([]),
    });
  }

  acceptInvitation(id: string): void {
    if (this.respondingInvitationId()) {
      return;
    }
    this.respondingInvitationId.set(id);
    this.authService.acceptInvitation(id).subscribe({
      next: () => {
        this.respondingInvitationId.set(null);
        this.myInvitations.update((list) => list.filter((i) => i.id !== id));
        // The user now has a new workspace — refresh the switcher list.
        this.loadWorkspaces();
      },
      error: (err) => {
        this.respondingInvitationId.set(null);
        alert(err.error?.message || 'Failed to accept invitation.');
      },
    });
  }

  declineInvitation(id: string): void {
    if (this.respondingInvitationId()) {
      return;
    }
    this.respondingInvitationId.set(id);
    this.authService.declineInvitation(id).subscribe({
      next: () => {
        this.respondingInvitationId.set(null);
        this.myInvitations.update((list) => list.filter((i) => i.id !== id));
      },
      error: (err) => {
        this.respondingInvitationId.set(null);
        alert(err.error?.message || 'Failed to decline invitation.');
      },
    });
  }
}
