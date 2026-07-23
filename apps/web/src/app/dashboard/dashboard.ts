import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { LanguageService } from '../services/language.service';
import { I18nService } from '../i18n/i18n.service';
import { RecentScreensService } from '../services/recent-screens.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { HelpButtonComponent } from '../shared/help-button/help-button';
import { MenuItem, WorkspaceOption, MyInvitation, Language } from '../models/auth.models';

// Translation keys for CODE-DEFINED nav labels (the hardcoded admin menus below +
// the module grouping names). DB-driven menus/modules carry their own `names`
// JSONB and don't need an entry here. Anything not listed falls back to its
// English name. Keys live in public/i18n/*.json under the `nav.` namespace.
const NAV_KEYS: Record<string, string> = {
  // Modules (apps switcher / grouping)
  'SaaS Administration': 'nav.mod.saasAdmin',
  'System Setup': 'nav.mod.systemSetup',
  'Core Club Management': 'nav.mod.coreClub',
  'Membership Management': 'nav.mod.membership',
  'Golf Management': 'nav.mod.golf',
  'Facility Management': 'nav.mod.facility',
  // Menu labels
  'Role Management': 'nav.roleManagement',
  'User Management': 'nav.userManagement',
  'Companies': 'nav.companies',
  'Languages': 'nav.languages',
  'Currencies': 'nav.currencies',
  'Subscriber Management': 'nav.subscriberManagement',
  'Roles': 'nav.roles',
  'Users': 'nav.users',
  'Assign Role': 'nav.assignRole',
  'Modules & Menus': 'nav.modulesMenus',
  'Countries': 'nav.countries',
  // Sidebar section headings for the code-defined SaaS Administration tree.
  // (DB-driven parent menus carry their own `names`.)
  'Access': 'nav.group.access',
  'Reference data': 'nav.group.referenceData',
  'Configuration': 'nav.group.configuration',
  'Email Templates': 'nav.emailTemplates',
};

// A node in the sidebar menu tree (adjacency list). A node with children renders
// as a collapsible section heading; a leaf renders as a navigation link.
interface NavNode {
  menu: MenuItem;
  children: NavNode[];
}

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.html',
    styleUrl: './dashboard.css',
    imports: [CommonModule, RouterModule, TranslatePipe, HelpButtonComponent],
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
  // The active module's menus as a tree (parent sections + nested children).
  displayedTree: NavNode[] = [];
  // Ids of the sections the user has collapsed (a signal so toggling re-renders).
  collapsedGroups = signal<Set<string>>(new Set());

  // Bottom-nav (mobile) shows only real destinations — leaf menus with a route,
  // never the code-defined section headers (which have no route).
  get primaryDestinations(): MenuItem[] {
    return this.displayedMenus.filter((m) => !!m.route);
  }
  availableModules: { name: string; icon: string; names?: Record<string, string> }[] = [];
  activeModule = '';

  // The sidebar's active-system banner (.sidebar-module): the module's icon and
  // its name resolved to the active language, same source as the apps switcher.
  get activeModuleIcon(): string {
    return this.availableModules.find((m) => m.name === this.activeModule)?.icon || 'widgets';
  }
  get activeModuleLabel(): string {
    const mod = this.availableModules.find((m) => m.name === this.activeModule);
    return this.resolveLabel(this.activeModule, mod?.names);
  }
  isDropdownOpen = false;
  // Desktop (>=1024px) starts EXPANDED (pinned); tablet starts as the icon
  // rail; mobile treats pinned as "drawer open" so it must start false.
  // The header hamburger toggles this at every tier - on desktop that is
  // the Gmail-style collapse-to-rail (the CSS no longer forces 256px).
  isSidebarPinned = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

  // Workspace (company) switching. Async-loaded state is held in signals so the
  // switcher/banner refresh on the HTTP callback (zone-based CD isn't reliable here).
  workspaces = signal<WorkspaceOption[]>([]);
  // The switcher usually lists only companies, so "Switch Company" reads clearer.
  // But the list can also include the non-company "System Administration" workspace
  // (companyId === 'SYSTEM'); when it does, fall back to the umbrella "Switch
  // Workspace" so that entry isn't mislabelled.
  readonly workspaceSwitchLabel = computed(() =>
    this.workspaces().some((w) => w.companyId === 'SYSTEM') ? 'Switch Workspace' : 'Switch Company',
  );
  currentCompanyId = 'SYSTEM';
  isWorkspaceDropdownOpen = false;
  switchingWorkspace = signal(false);

  // Active company's logo for the header trigger, resolved from the loaded
  // workspaces list ('SYSTEM' and logo-less companies -> null -> icon fallback).
  get activeCompanyLogo(): string | null {
    return this.workspaces().find((w) => w.companyId === this.currentCompanyId)?.logo || null;
  }

  // Pending collaborator invitations addressed to this user
  myInvitations = signal<MyInvitation[]>([]);
  respondingInvitationId = signal<string | null>(null);

  // Header language quick-switch: the languages this user may pick from + a
  // dropdown to switch instantly. Shown only when more than one is available.
  languageOptions: Language[] = [];
  isLanguageDropdownOpen = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private languageService: LanguageService,
    public i18n: I18nService,
    // Instantiated with the shell so screen visits are tracked from the first
    // navigation (feeds the launchpad's "continue where you left off" row).
    _recentScreens: RecentScreensService,
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
    this.loadLanguageOptions();

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

    // The Tenant-Admin "System Setup" nav is now a real DB Module + Menus (added
    // manually), delivered through the login response's `menus` (RBAC-filtered) like
    // any product module — so it is no longer hardcoded here. See the
    // system-setup-module-menus memory for the expected Module/Menu shape (routes,
    // icons) if it ever needs re-seeding.

    // System Admin gets the SaaS Administration (control plane) system + its menus.
    // (Still hardcoded — not yet a DB Module.)
    if (this.isSystemAdmin) {
      // Modelled as an adjacency-list tree so this (the longest) sidebar stays
      // tidy: two collapsible sections (Access, Reference data) plus two
      // top-level items. Section headers carry no route (render as toggles).
      const saas = { moduleName: 'SaaS Administration', moduleIcon: 'admin_panel_settings', Module: undefined };
      this.allowedMenus.push(
        { id: 'saas-subscribers', name: 'Subscriber Management', route: '/admin/subscribers', icon: 'groups', ...saas, parentId: null, sequence: 0 },
        { id: 'saas-access', name: 'Access', route: '', icon: 'lock', ...saas, parentId: null, sequence: 1 },
        { id: 'saas-roles', name: 'Roles', route: '/admin/system-roles', icon: 'badge', ...saas, parentId: 'saas-access', sequence: 0 },
        { id: 'saas-users', name: 'Users', route: '/admin/platform-users', icon: 'person', ...saas, parentId: 'saas-access', sequence: 1 },
        { id: 'saas-assign', name: 'Assign Role', route: '/admin/system-setup', icon: 'link', ...saas, parentId: 'saas-access', sequence: 2 },
        { id: 'saas-refdata', name: 'Reference data', route: '', icon: 'storage', ...saas, parentId: null, sequence: 2 },
        { id: 'saas-countries', name: 'Countries', route: '/admin/countries', icon: 'public', ...saas, parentId: 'saas-refdata', sequence: 0 },
        { id: 'saas-languages', name: 'Languages', route: '/admin/languages', icon: 'translate', ...saas, parentId: 'saas-refdata', sequence: 1 },
        { id: 'saas-currencies', name: 'Currencies', route: '/admin/currencies', icon: 'payments', ...saas, parentId: 'saas-refdata', sequence: 2 },
        { id: 'saas-config', name: 'Configuration', route: '', icon: 'settings', ...saas, parentId: null, sequence: 3 },
        { id: 'saas-modules', name: 'Modules & Menus', route: '/admin/modules-menus', icon: 'category', ...saas, parentId: 'saas-config', sequence: 0 },
        { id: 'saas-email-templates', name: 'Email Templates', route: '/admin/email-templates', icon: 'mail', ...saas, parentId: 'saas-config', sequence: 1 },
        { id: 'saas-platform-tax', name: 'Platform Tax', route: '/admin/platform-tax', icon: 'receipt_long', ...saas, parentId: 'saas-config', sequence: 2 },
        { id: 'saas-platform-profile', name: 'Platform Profile', route: '/admin/platform-profile', icon: 'store', ...saas, parentId: 'saas-config', sequence: 3 },
      );
    }

    // Build the apps (systems) list from the granted menus, carrying each module's
    // localized names so the apps switcher can translate them.
    const moduleMap = new Map<string, { icon: string; names?: Record<string, string> }>();
    this.allowedMenus.forEach(m => {
      if (m.moduleName && !moduleMap.has(m.moduleName)) {
        moduleMap.set(m.moduleName, { icon: m.moduleIcon || 'widgets', names: m.moduleNames });
      }
    });
    this.availableModules = Array.from(moduleMap.entries()).map(([name, v]) => ({ name, icon: v.icon, names: v.names }));

    // Active system follows the URL (deep link / refresh / back-forward) so the
    // correct sidebar shows on load. We never auto-navigate here — that would
    // fight a deep link and surprise users on login.
    const fallbackModule = this.isSystemAdmin ? 'SaaS Administration' : this.availableModules[0]?.name;
    const initialModule = this.moduleForUrl(this.router.url) || fallbackModule;
    if (initialModule) this.selectModule(initialModule, false);

    this.authService.getProfile().subscribe({
      next: (response) => {
        // Sync the header avatar to the server's truth for THIS user (empty ->
        // default), so a stale avatar from a prior session never shows.
        this.authService.updateAvatarState(response.user.profilePicture || '');
        const fetchedName = response.user.full_name || response.user.fullName;
        const finalName = (fetchedName && fetchedName.trim() !== '') ? fetchedName : 'New User';
        this.authService.updateFullNameState(finalName);
      },
      error: () => {
        this.authService.updateFullNameState('New User');
      }
    });
  }

  // Resolve a nav label to the active language. Order: the row's own localized
  // name (DB Menu/Module.names) -> a static dictionary key for code-defined labels
  // (NAV_KEYS) -> the base English name. Reads the i18n `lang` signal, so the whole
  // sidebar/apps switcher re-labels live when the language changes.
  resolveLabel(name: string, names?: Record<string, string>): string {
    const lang = this.i18n.lang();
    if (names && names[lang]) return names[lang];
    const key = NAV_KEYS[name];
    if (key) return this.i18n.translate(key);
    return name;
  }

  // Build the sidebar tree from the flat menu list (adjacency list): group menus
  // by parentId, ordered by sequence. A menu whose parent isn't in the visible
  // set is treated as a root (defensive — the login already ships ancestors).
  private buildNavTree(menus: MenuItem[]): NavNode[] {
    const bySeq = (a: NavNode, b: NavNode) => (a.menu.sequence ?? 0) - (b.menu.sequence ?? 0);
    const nodes = new Map<string, NavNode>();
    for (const m of menus) if (m.id) nodes.set(m.id, { menu: m, children: [] });

    const roots: NavNode[] = [];
    for (const m of menus) {
      const node = m.id ? nodes.get(m.id)! : { menu: m, children: [] };
      const parent = m.parentId ? nodes.get(m.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    for (const node of nodes.values()) node.children.sort(bySeq);
    roots.sort(bySeq);
    return roots;
  }

  // Every section (a node with children) at any depth, so all start collapsed.
  private collectSectionIds(nodes: NavNode[]): Set<string> {
    const ids = new Set<string>();
    const walk = (list: NavNode[]) => {
      for (const n of list) {
        if (n.children.length && n.menu.id) {
          ids.add(n.menu.id);
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return ids;
  }

  toggleGroup(id: string): void {
    const next = new Set(this.collapsedGroups());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsedGroups.set(next);
  }

  isGroupCollapsed(id: string): boolean {
    return this.collapsedGroups().has(id);
  }

  // All header dropdowns (avatar, apps, workspace, language) are mutually
  // exclusive: each toggle closes every other one first, so only one is ever open
  // at a time. closeDropdown() is the single place that lists them all.
  toggleDropdown(event: Event): void {
    event.stopPropagation();
    const next = !this.isDropdownOpen;
    this.closeDropdown();
    this.isDropdownOpen = next;
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
    const next = !this.isAppsDropdownOpen;
    this.closeDropdown();
    this.isAppsDropdownOpen = next;
  }

  selectModule(moduleName: string, navigate = true): void {
    this.activeModule = moduleName;
    this.displayedMenus = this.allowedMenus.filter(m => m.moduleName === moduleName);
    this.displayedTree = this.buildNavTree(this.displayedMenus);
    // Start with every section collapsed on each (re)load of a module.
    this.collapsedGroups.set(this.collectSectionIds(this.displayedTree));
    this.isAppsDropdownOpen = false;
    // Switching systems lands on My Dashboard (/home) - the ONE personal home
    // page. The per-system launchpad landings (SystemDashboardComponent) were
    // removed 2026-07-23; /home's favorites/recents do their job.
    if (navigate) this.router.navigate(['/home']);
  }

  // Which system does the current URL belong to? Sets the active system on load
  // so deep links / refresh show the correct sidebar. Resolved purely from the
  // granted menus' routes (no landing-route table anymore).
  private moduleForUrl(url: string): string | null {
    const menu = this.allowedMenus.find(m => m.route && m.route !== '/home' && url.startsWith(m.route));
    return menu?.moduleName || null;
  }

  closeDropdown(): void {
    this.isDropdownOpen = false;
    this.isAppsDropdownOpen = false;
    this.isWorkspaceDropdownOpen = false;
    this.isLanguageDropdownOpen = false;
  }

  // --- Header language quick-switch ---
  loadLanguageOptions(): void {
    this.languageService.getMyLanguage().subscribe({
      next: (state) => {
        this.languageOptions = state.options;
        this.i18n.setFallback(state.accountDefault); // subscriber's fallback for missing translations
        this.i18n.use(state.effective); // keep the shell in sync with the server's resolution
      },
      error: () => { this.languageOptions = []; },
    });
  }

  toggleLanguageDropdown(event: Event): void {
    event.stopPropagation();
    const next = !this.isLanguageDropdownOpen;
    this.closeDropdown();
    this.isLanguageDropdownOpen = next;
  }

  chooseLanguage(code: string): void {
    this.isLanguageDropdownOpen = false;
    if (code === this.i18n.lang()) return;
    this.i18n.use(code); // apply immediately
    this.languageService.setMyLanguage(code).subscribe({
      next: (state) => this.i18n.use(state.effective),
      error: () => {}, // stay on the chosen language even if the save fails
    });
  }

  // Esc closes any open menu/dropdown and the mobile navigation drawer.
  onEscape(): void {
    this.closeDropdown();
    this.isSidebarPinned = false;
  }

  toggleWorkspaceDropdown(event: Event): void {
    event.stopPropagation();
    const next = !this.isWorkspaceDropdownOpen;
    this.closeDropdown();
    this.isWorkspaceDropdownOpen = next;
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
