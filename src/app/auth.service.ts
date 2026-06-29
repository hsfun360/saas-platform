import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../environments/environment';
import {
  AuthResponse,
  ProfileResponse,
  LeadRegistrationData,
  UpdateProfileData,
  ChangePasswordData,
  MenuItem,
  Role,
  RoleDetail,
  TenantUser,
  CreateTenantUserData,
  ModuleOption,
  CompanyEntity,
  CreateCompanyData,
  UpdateCompanyData,
  WorkspaceOption,
  CompanyInvitation,
  MyInvitation,
  AccountUsersResponse,
} from './models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiBaseUrl = environment.apiUrl;
  private userEmail: string | null = null;

  private avatarSubject = new BehaviorSubject<string>(localStorage.getItem('profilePicture') || 'assets/default-avatar.svg');
  avatar$ = this.avatarSubject.asObservable();

  private fullNameSubject = new BehaviorSubject<string>('Loading...');
  fullName$ = this.fullNameSubject.asObservable();

  constructor(private http: HttpClient) { }

  updateAvatarState(newUrl: string): void {
    if (newUrl) {
      localStorage.setItem('profilePicture', newUrl);
      this.avatarSubject.next(newUrl);
    }
  }

  updateFullNameState(name: string): void {
    this.fullNameSubject.next(name);
  }

  register(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/register-user`, { email, password });
  }

  login(email: string, password: string, selectedCompanyId?: string | null): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/login`, { email, password, selectedCompanyId });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/reset-password`, { token, newPassword });
  }

  googleLogin(accessToken: string, selectedCompanyId?: string | null): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/google`, { accessToken, selectedCompanyId });
  }

  microsoftLogin(accessToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/microsoft-login`, { accessToken });
  }

  registerLead(leadData: LeadRegistrationData): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/register-lead`, leadData);
  }

  activateAccount(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/activate`, { token, password });
  }

  setEmail(email: string): void {
    this.userEmail = email;
    localStorage.setItem('userEmail', email);
  }

  getEmail(): string | null {
    return this.userEmail || localStorage.getItem('userEmail');
  }

  storeToken(token: string): void {
    localStorage.setItem('token', token);
  }

  storeUserMenus(menus: MenuItem[] | undefined): void {
    if (menus) {
      localStorage.setItem('userMenus', JSON.stringify(menus));
    }
  }

  getProfile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${this.apiBaseUrl}/auth/profile`);
  }

  uploadProfilePicture(formData: FormData): Observable<{ message: string; url: string }> {
    return this.http.post<{ message: string; url: string }>(`${this.apiBaseUrl}/auth/upload-avatar`, formData);
  }

  updateProfile(profileData: UpdateProfileData): Observable<ProfileResponse> {
    return this.http.put<ProfileResponse>(`${this.apiBaseUrl}/auth/profile`, profileData);
  }

  changePassword(passwordData: ChangePasswordData): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/change-password`, passwordData);
  }

  // --- Account-level Roles (RBAC) — a Role is an account-wide named set of menu
  // permissions, NOT tied to a company. Company enters only at entitlement
  // (module subscription) and assignment (user↔role within a company). ---

  // Menu catalogue for the role builder: menus from the modules the subscriber
  // account is entitled to. Backend: GET /auth/account/menus.
  getAccountMenus(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${this.apiBaseUrl}/auth/account/menus`);
  }

  createRole(roleName: string, description: string, menuIds: string[]): Observable<{ message: string; role: Role }> {
    return this.http.post<{ message: string; role: Role }>(`${this.apiBaseUrl}/auth/account/roles`, { roleName, description, menuIds });
  }

  // A single role with the exact set of menu IDs it grants — prefills the edit form.
  getRoleDetail(roleId: string): Observable<RoleDetail> {
    return this.http.get<RoleDetail>(`${this.apiBaseUrl}/auth/account/roles/${roleId}`);
  }

  updateRole(
    roleId: string,
    data: { roleName?: string; description?: string; menuIds: string[] },
  ): Observable<{ message: string; role: Role }> {
    return this.http.put<{ message: string; role: Role }>(`${this.apiBaseUrl}/auth/account/roles/${roleId}`, data);
  }

  deleteRole(roleId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiBaseUrl}/auth/account/roles/${roleId}`);
  }

  // Account-wide, person-centric view (people + their per-company roles +
  // administrable companies/roles + pending invitations) for User Management.
  getAccountUsers(): Observable<AccountUsersResponse> {
    return this.http.get<AccountUsersResponse>(`${this.apiBaseUrl}/auth/account/users`);
  }

  // All account-level roles. Backend: GET /auth/account/roles.
  getAccountRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.apiBaseUrl}/auth/account/roles`);
  }

  getCompanyUsers(companyId?: string): Observable<TenantUser[]> {
    const q = companyId ? `?companyId=${companyId}` : '';
    return this.http.get<TenantUser[]>(`${this.apiBaseUrl}/auth/company/users${q}`);
  }

  createCompanyUser(data: CreateTenantUserData, companyId?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/company/users`, { ...data, companyId });
  }

  assignCompanyUserRole(userId: string, roleId: string, companyId?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/company/users/assign-role`, { userId, roleId, companyId });
  }

  revokeCompanyUser(userId: string, companyId?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/company/users/revoke`, { userId, companyId });
  }

  // --- Company (business entity) management (Tenant Admin within their account) ---
  getAvailableModules(): Observable<ModuleOption[]> {
    return this.http.get<ModuleOption[]>(`${this.apiBaseUrl}/auth/company/available-modules`);
  }

  getCompanies(): Observable<CompanyEntity[]> {
    return this.http.get<CompanyEntity[]>(`${this.apiBaseUrl}/auth/companies`);
  }

  createCompany(data: CreateCompanyData): Observable<{ message: string; company: CompanyEntity }> {
    return this.http.post<{ message: string; company: CompanyEntity }>(`${this.apiBaseUrl}/auth/companies`, data);
  }

  // Set a company's modules to an exact set (diff-based add/revoke on the backend).
  updateCompanyModules(companyId: string, moduleIds: string[]): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiBaseUrl}/auth/companies/${companyId}/modules`, { moduleIds });
  }

  // Update a company's profile / billing details.
  updateCompany(companyId: string, data: UpdateCompanyData): Observable<{ message: string; company: CompanyEntity }> {
    return this.http.put<{ message: string; company: CompanyEntity }>(`${this.apiBaseUrl}/auth/companies/${companyId}`, data);
  }

  // Add an existing same-account user as a collaborator on a company.
  addCollaborator(email: string, roleId?: string, companyId?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/company/collaborators`, { email, roleId, companyId });
  }

  // --- Collaborator invitations (admin side) ---
  createInvitation(email: string, roleId?: string, companyId?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/company/invitations`, { email, roleId, companyId });
  }

  getCompanyInvitations(companyId?: string): Observable<CompanyInvitation[]> {
    const q = companyId ? `?companyId=${companyId}` : '';
    return this.http.get<CompanyInvitation[]>(`${this.apiBaseUrl}/auth/company/invitations${q}`);
  }

  revokeInvitation(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/company/invitations/${id}/revoke`, {});
  }

  // --- Collaborator invitations (invitee side) ---
  getMyInvitations(): Observable<MyInvitation[]> {
    return this.http.get<MyInvitation[]>(`${this.apiBaseUrl}/auth/invitations`);
  }

  acceptInvitation(id: string): Observable<{ message: string; company?: { id: string; name: string } }> {
    return this.http.post<{ message: string; company?: { id: string; name: string } }>(`${this.apiBaseUrl}/auth/invitations/${id}/accept`, {});
  }

  declineInvitation(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/auth/invitations/${id}/decline`, {});
  }

  // --- Workspace switching ---
  getWorkspaces(): Observable<WorkspaceOption[]> {
    return this.http.get<WorkspaceOption[]>(`${this.apiBaseUrl}/auth/workspaces`);
  }

  switchWorkspace(companyId: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/switch-workspace`, { companyId });
  }
}
