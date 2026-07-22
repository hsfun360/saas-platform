import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { Role, UserSummary } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// Assign Role — the last of the old System Setup tabs, now its own single-purpose
// screen (Roles and Users were split into /admin/system-roles and
// /admin/platform-users). Grants a platform role to a user.
@Component({
  selector: 'app-system-setup',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule],
  templateUrl: './system-setup.html',
  styleUrl: './system-setup.css',
})
export class SystemSetupComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  roles = signal<Role[]>([]);
  users = signal<UserSummary[]>([]);

  // Current assignments = platform users who already hold a system role.
  assignedUsers = computed(() => this.users().filter((u) => !!u.roleName));

  readonly assignForm = this.fb.nonNullable.group({
    userId: ['', Validators.required],
    roleId: ['', Validators.required],
  });
  assignSubmitting = signal(false);

  successMessage = signal('');
  errorMessage = signal('');

  constructor(private adminService: AdminService) {}

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

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
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const { userId, roleId } = this.assignForm.getRawValue();
    this.assignSubmitting.set(true);
    this.adminService
      .assignUserToRole({ userId, roleId })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || 'Role assigned.');
          this.assignForm.reset({ userId: '', roleId: '' });
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
