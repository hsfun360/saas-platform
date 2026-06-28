import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Role,
  CreateRoleRequest,
  CreateUserData,
  UserSummary,
  AdminMenu,
  AdminModule,
  ModuleInput,
  MenuInput,
  AssignRoleData,
  CreateSubscriptionData,
  UpdateSubscriptionData,
  SubscriptionInfo,
  TenantUser,
} from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiBaseUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) { }

  getRoles(companyId?: string): Observable<Role[]> {
    const url = companyId
      ? `${this.apiBaseUrl}/roles?companyId=${companyId}`
      : `${this.apiBaseUrl}/roles`;
    return this.http.get<Role[]>(url);
  }

  createRole(roleData: CreateRoleRequest): Observable<{ message: string; role: Role }> {
    return this.http.post<{ message: string; role: Role }>(`${this.apiBaseUrl}/roles`, roleData);
  }

  listMenus(): Observable<AdminMenu[]> {
    return this.http.get<AdminMenu[]>(`${this.apiBaseUrl}/menus`);
  }

  listModules(): Observable<AdminModule[]> {
    return this.http.get<AdminModule[]>(`${this.apiBaseUrl}/modules`);
  }

  // --- Modules & Menus maintenance (master–detail catalogue) ---
  createModule(data: ModuleInput): Observable<{ message: string; module: AdminModule }> {
    return this.http.post<{ message: string; module: AdminModule }>(`${this.apiBaseUrl}/modules`, data);
  }

  updateModule(moduleId: string, data: ModuleInput): Observable<{ message: string; module: AdminModule }> {
    return this.http.put<{ message: string; module: AdminModule }>(`${this.apiBaseUrl}/modules/${moduleId}`, data);
  }

  deleteModule(moduleId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiBaseUrl}/modules/${moduleId}`);
  }

  listModuleMenus(moduleId: string): Observable<AdminMenu[]> {
    return this.http.get<AdminMenu[]>(`${this.apiBaseUrl}/modules/${moduleId}/menus`);
  }

  createMenu(data: MenuInput): Observable<{ message: string; menu: AdminMenu }> {
    return this.http.post<{ message: string; menu: AdminMenu }>(`${this.apiBaseUrl}/menus`, data);
  }

  updateMenu(menuId: string, data: Partial<MenuInput>): Observable<{ message: string; menu: AdminMenu }> {
    return this.http.put<{ message: string; menu: AdminMenu }>(`${this.apiBaseUrl}/menus/${menuId}`, data);
  }

  deleteMenu(menuId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiBaseUrl}/menus/${menuId}`);
  }

  createSaaSUser(userData: CreateUserData): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/users`, userData);
  }

  listUsers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${this.apiBaseUrl}/users`);
  }

  assignUserToRole(assignmentData: AssignRoleData): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/users/assign-role`, assignmentData);
  }

  createSubscription(data: CreateSubscriptionData): Observable<{ message: string; data: SubscriptionInfo }> {
    return this.http.post<{ message: string; data: SubscriptionInfo }>(`${this.apiBaseUrl}/subscriptions`, data);
  }

  listSubscriptions(): Observable<SubscriptionInfo[]> {
    return this.http.get<SubscriptionInfo[]>(`${this.apiBaseUrl}/subscriptions`);
  }

  // Amend a subscriber (account-level fields + the primary company's details).
  // NOTE: requires the backend PATCH /admin/subscriptions/:id endpoint.
  updateSubscription(id: string, data: UpdateSubscriptionData): Observable<{ message: string; data: SubscriptionInfo }> {
    return this.http.patch<{ message: string; data: SubscriptionInfo }>(`${this.apiBaseUrl}/subscriptions/${id}`, data);
  }

  // --- Tenant Admin management (platform override for a specific company) ---
  getCompanyUsers(companyId: string): Observable<TenantUser[]> {
    return this.http.get<TenantUser[]>(`${this.apiBaseUrl}/companies/${companyId}/users`);
  }

  setTenantAdmin(companyId: string, userId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/companies/${companyId}/tenant-admin`, { userId });
  }
}
