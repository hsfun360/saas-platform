import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { UserSummary } from '../models/auth.models';

// Platform Users — split out of the old System Setup tab strip into its own
// screen. Lists local platform users with search and creates them (FAB →
// dialog). Reuses the System Setup stylesheet.
@Component({
  selector: 'app-platform-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './platform-users.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class PlatformUsersComponent implements OnInit {
  users = signal<UserSummary[]>([]);
  usersLoading = signal(false);
  userForm = { email: '', password: '', fullName: '', phone: '' };
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
    this.userForm = { email: '', password: '', fullName: '', phone: '' };
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
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`✅ User "${this.userForm.email.trim()}" created.`);
          this.userForm = { email: '', password: '', fullName: '', phone: '' };
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

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
