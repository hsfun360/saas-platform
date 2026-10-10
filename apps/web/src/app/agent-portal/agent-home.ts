import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { Router } from '@angular/router';
import { SalesService, AgentEngagement } from '../services/sales.service';

// Agent Portal home - the salesperson's own landing page after registration or
// login. OUTSIDE the staff dashboard shell (an agent holds no workspace).
// Cross-club by design: shows every engagement linked to this login, whichever
// club or subscriber it belongs to. Future §2.2 features (my sales, prospects,
// commission) slot into the tiles.
@Component({
  selector: 'app-agent-home',
  standalone: true,
  imports: [LocalDatePipe],
  templateUrl: './agent-home.html',
  styleUrls: ['../portal/portal-home.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentHomeComponent implements OnInit {
  private readonly sales = inject(SalesService);
  private readonly router = inject(Router);

  readonly engagements = signal<AgentEngagement[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');

  readonly tiles = [
    { icon: 'trending_up', title: 'My sales', blurb: 'The memberships you closed.' },
    { icon: 'contacts', title: 'My prospects', blurb: 'Leads and follow-ups.' },
    { icon: 'payments', title: 'My commission', blurb: 'Earnings from your sales.' },
    { icon: 'person', title: 'My profile', blurb: 'Keep your contact details up to date.' },
  ];

  ngOnInit(): void {
    this.sales.me().subscribe({
      next: (res) => {
        this.engagements.set(res.engagements);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load your engagements.');
      },
    });
  }

  signOut(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    this.router.navigate(['/login']);
  }
}
