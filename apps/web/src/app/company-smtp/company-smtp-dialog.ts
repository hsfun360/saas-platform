import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogComponent } from '../shared/dialog/dialog';
import { CompanySmtpService } from '../services/company-smtp.service';
import { CompanyEntity, CompanySmtp } from '../models/auth.models';

// Tenant Admin: configure a single company's outgoing SMTP server. Emails sent on
// that company's behalf (e.g. collaborator invitations) then go through it. Opens
// as a dialog from the Companies screen.
@Component({
  selector: 'app-company-smtp-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalDatePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './company-smtp-dialog.html',
  styles: [`
    .smtp-field { display: flex; flex-direction: column; gap: var(--space-xs); margin-bottom: var(--space-md); }
    .smtp-field label { font-size: var(--font-body-2); font-weight: var(--weight-semibold); color: #334155; }
    .smtp-field input { padding: var(--space-sm); border: 1px solid #cbd5e1; border-radius: 8px; font-size: var(--font-body); min-height: 44px; box-sizing: border-box; }
    .smtp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-sm); }
    .smtp-hint { font-weight: var(--weight-regular); color: #64748b; font-size: var(--font-caption); }
    .smtp-check { display: flex; align-items: flex-start; gap: var(--space-sm); font-size: var(--font-body-2); color: #334155; cursor: pointer; margin-bottom: var(--space-md); }
    .smtp-check input { width: 18px; height: 18px; margin-top: 2px; flex-shrink: 0; }
    .smtp-status { border-radius: 8px; padding: var(--space-sm); font-size: var(--font-body-2); margin-bottom: var(--space-md); }
    .smtp-test { border-top: 1px solid #e2e8f0; padding-top: var(--space-md); }
    .smtp-test__row { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
    .smtp-test__row input { flex: 1; min-width: 200px; padding: var(--space-sm); border: 1px solid #cbd5e1; border-radius: 8px; font-size: var(--font-body); min-height: 44px; box-sizing: border-box; }
  `],
})
export class CompanySmtpDialogComponent implements OnInit {
  readonly company = input.required<CompanyEntity>();
  readonly close = output<void>();

  private readonly service = inject(CompanySmtpService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly removing = signal(false);
  readonly configured = signal(false);
  readonly hasPassword = signal(false);
  readonly lastVerifiedAt = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    host: ['', Validators.required],
    port: [587, Validators.required],
    secure: [false],
    username: [''],
    password: [''],
    fromEmail: ['', [Validators.required, Validators.email]],
    fromName: [''],
    isActive: [true],
  });
  readonly testEmail = this.fb.nonNullable.control('');

  ngOnInit(): void {
    this.service.get(this.company().id).subscribe({
      next: (c) => { this.apply(c); this.loading.set(false); },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Failed to load SMTP settings.'); this.loading.set(false); },
    });
  }

  private apply(c: CompanySmtp): void {
    this.configured.set(c.configured);
    this.hasPassword.set(!!c.hasPassword);
    this.lastVerifiedAt.set(c.lastVerifiedAt || null);
    this.lastError.set(c.lastError || null);
    if (c.configured) {
      this.form.patchValue({
        host: c.host || '', port: c.port || 587, secure: !!c.secure, username: c.username || '',
        password: '', fromEmail: c.fromEmail || '', fromName: c.fromName || '', isActive: c.isActive !== false,
      });
    }
  }

  private payload() {
    const v = this.form.getRawValue();
    return {
      host: v.host.trim(), port: Number(v.port), secure: v.secure, username: v.username.trim(),
      password: v.password, fromEmail: v.fromEmail.trim(), fromName: v.fromName.trim(), isActive: v.isActive,
    };
  }

  save(): void {
    this.clear();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Host and a valid From email are required.');
      return;
    }
    this.saving.set(true);
    this.service.save(this.company().id, this.payload()).subscribe({
      next: (res) => { this.apply(res.smtp); this.successMessage.set(res.message || 'Saved.'); this.saving.set(false); },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Failed to save.'); this.saving.set(false); },
    });
  }

  sendTest(): void {
    this.clear();
    const to = this.testEmail.value.trim();
    if (!to) { this.errorMessage.set('Enter an address to send the test to.'); return; }
    if (this.form.controls.host.invalid || this.form.controls.fromEmail.invalid) {
      this.errorMessage.set('Fill in host and From email before testing.');
      return;
    }
    this.testing.set(true);
    this.service.test(this.company().id, { ...this.payload(), to }).subscribe({
      next: (res) => { this.successMessage.set(res.message || 'Test sent.'); this.lastError.set(null); this.testing.set(false); },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Test failed.'); this.lastError.set(err.error?.message || null); this.testing.set(false); },
    });
  }

  remove(): void {
    this.clear();
    if (!confirm('Remove this SMTP server? Emails for this company will use the platform default.')) return;
    this.removing.set(true);
    this.service.remove(this.company().id).subscribe({
      next: (res) => {
        this.configured.set(false);
        this.hasPassword.set(false);
        this.lastVerifiedAt.set(null);
        this.lastError.set(null);
        this.form.reset({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '', isActive: true });
        this.successMessage.set(res.message || 'Removed.');
        this.removing.set(false);
      },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Failed to remove.'); this.removing.set(false); },
    });
  }

  onClose(): void {
    this.close.emit();
  }

  private clear(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
