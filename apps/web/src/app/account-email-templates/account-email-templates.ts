import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AccountEmailTemplateService } from '../services/account-email-template.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { AccountEmailTemplateSummary } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// Tenant Admin: the platform emails this subscriber may customise. Each row shows
// whether they currently use their own version or the platform default.
@Component({
  selector: 'app-account-email-templates',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, RouterModule],
  templateUrl: './account-email-templates.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class AccountEmailTemplatesComponent implements OnInit {
  private readonly service = inject(AccountEmailTemplateService);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);

  readonly templates = signal<AccountEmailTemplateSummary[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loading.set(false);
        // Coming back from the editor: scroll to the template the user was editing.
        this.returnScroll.consume('/admin/account-email-templates', this.injector);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load email templates.');
        this.loading.set(false);
      },
    });
  }
}
