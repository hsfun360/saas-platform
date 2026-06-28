export interface MenuItem {
  Module: any;
  name: string;
  route: string;
  icon?: string;
  moduleName?: string;
  moduleIcon?: string;
  // The owning system's default landing route (Module.landingRoute), carried on
  // each menu so the shell can navigate to a system's dashboard when switching.
  moduleLanding?: string | null;
}

export interface Workspace {
  companyId: string;
  companyName: string;
}

// A workspace the logged-in user can access, plus the role they hold in it.
// Used by the dashboard workspace switcher.
export interface WorkspaceOption {
  companyId: string;
  companyName: string;
  roleName: string;
}

// A pending collaborator invitation, as seen by the inviting Tenant Admin.
export interface CompanyInvitation {
  id: string;
  email: string;
  roleId?: string | null;
  roleName?: string | null;
  status: string;
  expiresAt?: string;
  createdAt?: string;
}

// --- Person-centric User Management (account-wide) ---
export interface AccountCompanyRole {
  id: string;
  name: string;
}

export interface AccountCompany {
  id: string;
  name: string;
  roles: AccountCompanyRole[];
}

export interface PersonMembership {
  companyId: string;
  companyName?: string;
  roleId?: string | null;
  roleName?: string | null;
}

export interface AccountPerson {
  id: string;
  email: string;
  full_name?: string;
  memberships: PersonMembership[];
}

export interface AccountPendingInvite {
  id: string;
  email: string;
  companyId: string;
  companyName?: string;
  roleName?: string | null;
  expiresAt?: string;
}

export interface AccountUsersResponse {
  companies: AccountCompany[];
  people: AccountPerson[];
  invitations: AccountPendingInvite[];
}

// A pending invitation addressed to the logged-in user (the invitee view).
export interface MyInvitation {
  id: string;
  companyId: string;
  companyName?: string;
  subscriberName?: string;
  roleName?: string | null;
  expiresAt?: string;
}

export interface AuthResponse {
  token?: string;
  message: string;
  email?: string;
  menus?: MenuItem[];
  roleName?: string;
  fullName?: string;
  profilePicture?: string;
  clubs?: Workspace[];
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  fullName?: string;
  phone?: string;
  bio?: string;
  profilePicture?: string;
  authMethod: 'local' | 'google' | 'microsoft';
}

export interface ProfileResponse {
  message: string;
  user: UserProfile;
}

export interface LeadRegistrationData {
  email: string;
  name: string;
  companyName: string;
  phone?: string;
}

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  bio?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  companyId?: string;
  PermittedMenus?: PermittedMenu[];
}

// A role together with the exact menu IDs it grants — returned by GET
// /company/roles/:roleId to prefill the Role Management edit form.
export interface RoleDetail {
  id: string;
  name: string;
  description?: string | null;
  menuIds: string[];
}

export interface PermittedMenu {
  id: string;
  name: string;
}

export interface AdminMenu {
  id: string;
  name: string;
  route?: string;
  icon?: string;
  moduleId?: string;
  parentId?: string | null;
  Module?: { name: string; icon?: string };
}

export interface AdminModule {
  id: string;
  name: string;
  icon?: string;
  description?: string | null;
  landingRoute?: string | null;
}

// Request payloads for the Modules & Menus maintenance screen.
export interface ModuleInput {
  name: string;
  icon?: string;
  description?: string;
  landingRoute?: string;
}

export interface MenuInput {
  name: string;
  route: string;
  icon?: string;
  moduleId: string;
  parentId?: string | null;
}

export interface CreateRoleRequest {
  name: string;
  description: string;
  companyId?: string;
  menuIds?: string[];
}

export interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  full_name?: string;
  authMethod?: string;
  createdAt?: string;
}

export interface AssignRoleData {
  userId: string;
  roleId: string;
  companyId?: string;
}

// 👇 NEW: For System Admin Subscriber Provisioning
export interface CreateSubscriptionData {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
  subscriptionPlan?: string;
  registrationNumber?: string;
  timezone?: string;
  phone?: string;
  moduleIds?: string[];
}

// Tenant-scoped user management (Tenant Admin within their own company)
export interface TenantUser {
  id: string;
  email: string;
  full_name?: string;
  authMethod?: string;
  roleId?: string | null;
  roleName?: string | null;
}

export interface CreateTenantUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleId?: string;
}

export interface SubscriptionInfo {
  id: string;
  subscriberName: string;
  subscriptionPlan: string;
  status: string;
  createdAt: string;
  Companies?: CompanyInfo[];
}

// Platform-admin amendment of a subscriber. The backend applies the
// account-level fields (subscriberName / subscriptionPlan / status) to the
// Account and the company-level fields to the subscriber's primary Company.
export interface UpdateSubscriptionData {
  subscriberName?: string;
  subscriptionPlan?: string;
  status?: string;
  registrationNumber?: string;
  timezone?: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  registrationNumber?: string;
  timezone?: string;
  isActive: boolean;
}

// A module a Tenant Admin can attach to a company (chosen from all system modules).
export interface ModuleOption {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

// A company (business entity) under the subscriber's account, with its modules.
export interface CompanyEntity {
  id: string;
  name: string;
  registrationNumber?: string;
  taxRegistrationNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  isActive: boolean;
  createdAt?: string;
  SubscribedModules?: ModuleOption[];
}

// Editable company profile / billing fields (PUT /auth/companies/:id).
export interface UpdateCompanyData {
  name?: string;
  registrationNumber?: string;
  taxRegistrationNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
}

// Payload to create a new company under the caller's account.
export interface CreateCompanyData {
  name: string;
  registrationNumber?: string;
  timezone?: string;
  moduleIds?: string[];
}

