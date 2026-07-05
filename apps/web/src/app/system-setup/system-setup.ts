import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { Role, UserSummary } from '../models/auth.models';

// Assign Role — the last of the old System Setup tabs, now its own single-purpose
// screen (Roles and Users were split into /admin/system-roles and
// /admin/platform-users). Grants a platform role to a user.
@Component({
  selector: 'app-system-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './system-setup.html',
  styleUrl: './system-setup.css',
})
export class SystemSetupComponent implements OnInit {
  roles = signal<Role[]>([]);
  users = signal<UserSummary[]>([]);

  // Current assignments = platform users who already hold a system role.
  assignedUsers = computed(() => this.users().filter((u) => !!u.roleName));

  assignForm = { userId: '', roleId: '' };
  assignSubmitting = signal(false);

  successMessage = signal('');
  errorMessage = signal('');

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadRoles();
    this.loadUsers();
  }

  loadRoles(): void {
    this.adminService.getRoles().subscribe({
      next: (data) => this.roles.set(data),
      error: () => {},
    });
  }

  loadUsers(): void {
    this.adminService.listUsers().subscribe({
      next: (data) => this.users.set(data),
      error: () => {},
    });
  }

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
          this.successMessage.set(res.message || 'Role assigned.');
          this.assignForm = { userId: '', roleId: '' };
          this.assignSubmitting.set(false);
          this.loadUsers(); // refresh the assignments list below
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to assign role.');
          this.assignSubmitting.set(false);
        },
      });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
