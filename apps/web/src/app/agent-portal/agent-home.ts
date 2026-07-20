import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule],
  templateUrl: './agent-home.html',
  styleUrls: ['../portal/portal-home.css'],
})
export class AgentHomeComponent implements OnInit {
  private readonly sales = inject(SalesService);
  private readonly router = inject(Router);

  readonly engagements = signal<AgentEngagement[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');

  readonly tiles = [
    { icon: '📈', title: 'My sales', blurb: 'The memberships you closed.' },
    { icon: '📇', title: 'My prospects', blurb: 'Leads and follow-ups.' },
    { icon: '💰', title: 'My commission', blurb: 'Earnings from your sales.' },
    { icon: '👤', title: 'My profile', blurb: 'Keep your contact details up to date.' },
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
