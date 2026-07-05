import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { UserSummary } from '../models/auth.models';

// Platform Users — split out of the old System Setup tab strip into its own
// screen. Lists local platform users with search and creates them (FAB →
// dialog). Reuses the System Setup stylesheet.
@Component({
  selector: 'app-platform-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent, PhoneInputComponent],
  templateUrl: './platform-users.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class PlatformUsersComponent implements OnInit {
  users = signal<UserSummary[]>([]);
  usersLoading = signal(false);
  userForm = { email: '', password: '', fullName: '', phone: '', bio: '' };
  userSubmitting = signal(false);
  userDialogOpen = signal(false);

  // Live filter over the loaded users (email / name / auth method).
  userSearch = signal('');
  filteredUsers = computed(() => {
    const query = this.userSearch().trim().toLowerCase();
    const list = this.users();
    if (!query) return list;
    return list.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(query) ||
        (u.full_name || '').toLowerCase().includes(query) ||
        (u.authMethod || '').toLowerCase().includes(query),
    );
  });

  // Edit dialog state (mirrors the create dialog).
  editForm = { id: '', email: '', fullName: '', phone: '', bio: '' };
  editSubmitting = signal(false);
  editDialogOpen = signal(false);

  // Id of the user whose active/inactive toggle is in flight (disables its button).
  togglingId = signal<string | null>(null);

  successMessage = signal('');
  errorMessage = signal('');

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.usersLoading.set(true);
    this.adminService.listUsers().subscribe({
      next: (data) => {
        this.users.set(data);
        this.usersLoading.set(false);
      },
      error: () => this.usersLoading.set(false),
    });
  }

  clearSearch(): void {
    this.userSearch.set('');
  }

  openCreate(): void {
    this.clearMessages();
    this.userForm = { email: '', password: '', fullName: '', phone: '', bio: '' };
    this.userDialogOpen.set(true);
  }

  cancelCreate(): void {
    this.userDialogOpen.set(false);
  }

  onCreate(): void {
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
        bio: this.userForm.bio.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`User "${this.userForm.email.trim()}" created.`);
          this.userForm = { email: '', password: '', fullName: '', phone: '', bio: '' };
          this.userSubmitting.set(false);
          this.userDialogOpen.set(false);
          this.loadUsers();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create user.');
          this.userSubmitting.set(false);
        },
      });
  }

  openEdit(user: UserSummary): void {
    this.clearMessages();
    this.editForm = {
      id: user.id,
      email: user.email || '',
      fullName: user.full_name || '',
      phone: user.phone || '',
      bio: user.bio || '',
    };
    this.editDialogOpen.set(true);
  }

  cancelEdit(): void {
    this.editDialogOpen.set(false);
  }

  onUpdate(): void {
    this.clearMessages();
    if (!this.editForm.email.trim()) {
      this.errorMessage.set('Email is required.');
      return;
    }
    if (!this.editForm.fullName.trim()) {
      this.errorMessage.set('Full name is required.');
      return;
    }

    this.editSubmitting.set(true);
    this.adminService
      .updateUser(this.editForm.id, {
        email: this.editForm.email.trim(),
        fullName: this.editForm.fullName.trim(),
        phone: this.editForm.phone.trim(),
        bio: this.editForm.bio.trim(),
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`User "${this.editForm.email.trim()}" updated.`);
          this.editSubmitting.set(false);
          this.editDialogOpen.set(false);
          this.loadUsers();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update user.');
          this.editSubmitting.set(false);
        },
      });
  }

  toggleStatus(user: UserSummary): void {
    this.clearMessages();
    const next = !(user.isActive !== false);
    this.togglingId.set(user.id);
    this.adminService.setUserStatus(user.id, next).subscribe({
      next: () => {
        this.successMessage.set(
          `User "${user.email}" ${next ? 'activated' : 'deactivated'}.`,
        );
        this.togglingId.set(null);
        this.loadUsers();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update user status.');
        this.togglingId.set(null);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
