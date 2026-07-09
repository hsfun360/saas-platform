import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EmailTemplateService } from '../services/email-template.service';
import { EmailTemplateDetail, EmailTemplateVariable } from '../models/auth.models';
import { EmailHtmlEditorComponent } from '../shared/email-html-editor/email-html-editor';
import { VariableMenuComponent } from '../shared/variable-menu/variable-menu';

// System Admin: edit ONE platform email template — subject/body (Handlebars),
// from-name, active + tenant-overridable toggles — with a variables reference,
// a debounced live preview, reset-to-default, and a queued test send.
@Component({
  selector: 'app-email-template-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, EmailHtmlEditorComponent, VariableMenuComponent],
  templateUrl: './email-template-edit.html',
  styleUrls: ['./email-template-edit.css'],
})
export class EmailTemplateEditComponent implements OnInit {
  private readonly service = inject(EmailTemplateService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly key = signal<string>('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly resetting = signal(false);
  readonly testing = signal(false);

  readonly name = signal('');
  readonly description = signal<string | null>(null);
  readonly variables = signal<EmailTemplateVariable[]>([]);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Live preview (compiled server-side against sample data).
  readonly previewSubject = signal('');
  readonly previewHtml = signal<SafeHtml>('');
  readonly previewError = signal('');

  readonly companyLogoUrl = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required]],
    bodyHtml: ['', [Validators.required]],
    fromName: [''],
    tenantOverridable: [false],
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
    // Re-render the preview shortly after the content stops changing.
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

  private apply(t: EmailTemplateDetail): void {
    this.name.set(t.name);
    this.description.set(t.description ?? null);
    this.variables.set(t.variables || []);
    this.companyLogoUrl.set(t.companyLogoUrl ?? null);
    this.form.setValue({
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      fromName: t.fromName || '',
      tenantOverridable: t.tenantOverridable,
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
      .update(this.key(), {
        subject: v.subject.trim(),
        bodyHtml: v.bodyHtml,
        fromName: v.fromName.trim() || null,
        tenantOverridable: v.tenantOverridable,
        isActive: v.isActive,
        brandColor: v.brandColor.trim() || null,
        includeLogo: v.includeLogo,
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || 'Template saved.');
          this.saving.set(false);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to save the template.');
          this.saving.set(false);
        },
      });
  }

  resetToDefault(): void {
    this.clearMessages();
    if (!confirm('Reset this template to the platform default? Your changes to it will be lost.')) return;
    this.resetting.set(true);
    this.service.reset(this.key()).subscribe({
      next: (res) => {
        this.apply(res.template);
        this.successMessage.set(res.message || 'Template reset to default.');
        this.resetting.set(false);
        this.refreshPreview();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to reset the template.');
        this.resetting.set(false);
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
