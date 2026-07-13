import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { EmailTemplateService } from '../services/email-template.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { EmailTemplateSummary } from '../models/auth.models';

// System Admin: the platform email templates. A fixed catalogue (no create /
// delete) — each row opens the editor. Reuses the shared admin-screen styles.
@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './email-templates.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class EmailTemplatesComponent implements OnInit {
  private readonly service = inject(EmailTemplateService);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);

  readonly templates = signal<EmailTemplateSummary[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loading.set(false);
        // Coming back from the editor: scroll to the template the user was editing.
        this.returnScroll.consume('/admin/email-templates', this.injector);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load email templates.');
        this.loading.set(false);
      },
    });
  }
}
