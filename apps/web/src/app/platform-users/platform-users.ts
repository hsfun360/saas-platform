import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { UserSummary } from '../models/auth.models';

// Platform Users — split out of the old System Setup tab strip into its own
// screen. Lists local platform users with search and creates them (FAB →
// dialog). Reuses the System Setup stylesheet.
//
// Reactive Forms reference (see docs/coding-standards.md → "Forms"): create/edit
// use typed FormGroups (nonNullable, so controls stay strings), validators live
// on the controls (not scattered across the template or hand-rolled in the
// submit handler), and `form.dirty` feeds the shared dialog's unsaved-changes
// guard directly. Every field carries the correct HTML5 input type.
@Component({
  selector: 'app-platform-users',
  standalone: true,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, PhoneInputComponent],
  templateUrl: './platform-users.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class PlatformUsersComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<UserSummary[]>([]);
  readonly usersLoading = signal(false);

  // Create form. nonNullable keeps every control a non-null string.
  readonly createForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    phone: [''],
    bio: ['', [Validators.maxLength(500)]],
  });
  readonly userSubmitting = signal(false);
  readonly userDialogOpen = signal(false);

  // Live filter over the loaded users (email / name / auth method).
  readonly userSearch = signal('');
  readonly filteredUsers = computed(() => {
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

  // Edit form (no password on edit). The edited user's id isn't an input, so it
  // lives outside the form.
  readonly editingUserId = signal('');
  readonly editForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    phone: [''],
    bio: ['', [Validators.maxLength(500)]],
  });
  readonly editSubmitting = signal(false);
  readonly editDialogOpen = signal(false);

  // Id of the user whose active/inactive toggle is in flight (disables its button).
  readonly togglingId = signal<string | null>(null);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

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

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openCreate(): void {
    this.clearMessages();
    this.createForm.reset({ email: '', password: '', fullName: '', phone: '', bio: '' });
    this.userDialogOpen.set(true);
  }

  cancelCreate(): void {
    this.userDialogOpen.set(false);
  }

  onCreate(): void {
    this.clearMessages();
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const value = this.createForm.getRawValue();
    this.userSubmitting.set(true);
    this.adminService
      .createSaaSUser({
        email: value.email.trim(),
        password: value.password,
        fullName: value.fullName.trim(),
        phone: value.phone.trim() || undefined,
        bio: value.bio.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`User "${value.email.trim()}" created.`);
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
    this.editingUserId.set(user.id);
    this.editForm.reset({
      email: user.email || '',
      fullName: user.full_name || '',
      phone: user.phone || '',
      bio: user.bio || '',
    });
    this.editDialogOpen.set(true);
  }

  cancelEdit(): void {
    this.editDialogOpen.set(false);
  }

  onUpdate(): void {
    this.clearMessages();
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();
    this.editSubmitting.set(true);
    this.adminService
      .updateUser(this.editingUserId(), {
        email: value.email.trim(),
        fullName: value.fullName.trim(),
        phone: value.phone.trim(),
        bio: value.bio.trim(),
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`User "${value.email.trim()}" updated.`);
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
