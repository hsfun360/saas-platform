import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AccountEmailTemplateService } from '../services/account-email-template.service';
import { AccountEmailTemplateDetail, EmailTemplateVariable } from '../models/auth.models';
import { EmailHtmlEditorComponent } from '../shared/email-html-editor/email-html-editor';
import { VariableMenuComponent } from '../shared/variable-menu/variable-menu';

// Tenant Admin: edit this subscriber's OWN version of a platform email template.
// Saving creates/updates the override; "Revert" deletes it (back to the default).
@Component({
  selector: 'app-account-email-template-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, EmailHtmlEditorComponent, VariableMenuComponent],
  templateUrl: './account-email-template-edit.html',
  styleUrls: ['../email-templates/email-template-edit.css'],
})
export class AccountEmailTemplateEditComponent implements OnInit {
  private readonly service = inject(AccountEmailTemplateService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly key = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly reverting = signal(false);
  readonly testing = signal(false);

  readonly name = signal('');
  readonly description = signal<string | null>(null);
  readonly variables = signal<EmailTemplateVariable[]>([]);
  readonly hasOverride = signal(false);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly previewSubject = signal('');
  readonly previewHtml = signal<SafeHtml>('');
  readonly previewError = signal('');

  readonly companyLogoUrl = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required]],
    bodyHtml: ['', [Validators.required]],
    fromName: [''],
    isActive: [true],
    brandColor: ['#2563eb'],
    includeLogo: [false],
  });

  readonly testEmail = this.fb.nonNullable.control('');

  private readonly subjectBox = viewChild<ElementRef<HTMLInputElement>>('subjectBox');

  // Insert {{variable}} into the Subject at the caret (append if unfocused).
  insertIntoSubject(name: string): void {
    const token = `{{${name}}}`;
    const el = this.subjectBox()?.nativeElement;
    const ctrl = this.form.controls.subject;
    const value = ctrl.value || '';
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    ctrl.setValue(value.slice(0, start) + token + value.slice(end));
    queueMicrotask(() => {
      if (!el) return;
      const pos = start + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  ngOnInit(): void {
    this.form.valueChanges.pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refreshPreview());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const key = p.get('key');
      if (key) this.load(key);
    });
  }

  private load(key: string): void {
    this.key.set(key);
    this.loading.set(true);
    this.clearMessages();
    this.service.get(key).subscribe({
      next: (t) => {
        this.apply(t);
        this.loading.set(false);
        this.refreshPreview();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load the template.');
        this.loading.set(false);
      },
    });
  }

  private apply(t: AccountEmailTemplateDetail): void {
    this.name.set(t.name);
    this.description.set(t.description ?? null);
    this.variables.set(t.variables || []);
    this.hasOverride.set(t.hasOverride);
    this.companyLogoUrl.set(t.companyLogoUrl ?? null);
    this.form.setValue({
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      fromName: t.fromName || '',
      isActive: t.isActive,
      brandColor: t.brandColor || '#2563eb',
      includeLogo: !!t.includeLogo,
    });
  }

  private refreshPreview(): void {
    const { subject, bodyHtml, brandColor, includeLogo } = this.form.getRawValue();
    if (!subject && !bodyHtml) return;
    this.service.preview(this.key(), subject, bodyHtml, { brandColor, includeLogo }).subscribe({
      next: (p) => {
        this.previewError.set('');
        this.previewSubject.set(p.subject);
        this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(p.html));
      },
      error: (err) => this.previewError.set(err.error?.message || 'Preview failed.'),
    });
  }

  save(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Subject and body are required.');
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service
      .save(this.key(), {
        subject: v.subject.trim(),
        bodyHtml: v.bodyHtml,
        fromName: v.fromName.trim() || null,
        isActive: v.isActive,
        brandColor: v.brandColor.trim() || null,
        includeLogo: v.includeLogo,
      })
      .subscribe({
        next: (res) => {
          this.hasOverride.set(true);
          this.successMessage.set(res.message || 'Saved.');
          this.saving.set(false);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to save.');
          this.saving.set(false);
        },
      });
  }

  revert(): void {
    this.clearMessages();
    if (!confirm('Revert to the platform default? Your customised version will be removed.')) return;
    this.reverting.set(true);
    this.service.revert(this.key()).subscribe({
      next: () => {
        this.reverting.set(false);
        this.load(this.key()); // reload the platform default as the starting point
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to revert.');
        this.reverting.set(false);
      },
    });
  }

  sendTest(): void {
    this.clearMessages();
    const to = this.testEmail.value.trim();
    if (!to) {
      this.errorMessage.set('Enter an email address to send the test to.');
      return;
    }
    const v = this.form.getRawValue();
    this.testing.set(true);
    this.service.sendTest(this.key(), to, v.subject, v.bodyHtml, v.fromName.trim() || null, { brandColor: v.brandColor, includeLogo: v.includeLogo }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || `Test queued to ${to}.`);
        this.testing.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to send the test email.');
        this.testing.set(false);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
