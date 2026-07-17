import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PortalService, PortalMembershipCard } from '../services/portal.service';

// Member Portal home - the member's own landing page after registration/login.
// Deliberately OUTSIDE the staff dashboard shell (a member has no workspace,
// menus or RBAC). Shows their membership card(s) and the portal capabilities;
// booking / dining / requests are coming-soon tiles until those product lines
// gain member-facing endpoints.
@Component({
  selector: 'app-portal-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './portal-home.html',
  styleUrls: ['./portal-home.css'],
})
export class PortalHomeComponent implements OnInit {
  private readonly portal = inject(PortalService);
  private readonly router = inject(Router);

  readonly cards = signal<PortalMembershipCard[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');

  readonly tiles = [
    { icon: '⛳', title: 'Golf booking', blurb: 'Book a tee time.' },
    { icon: '🏸', title: 'Facility booking', blurb: 'Reserve courts and rooms.' },
    { icon: '🍽️', title: 'Dining', blurb: 'Reserve a table at the restaurant.' },
    { icon: '👤', title: 'My profile', blurb: 'Keep your contact details up to date.' },
    { icon: '🎫', title: 'My requests', blurb: 'Raise and track requests with the club.' },
  ];

  ngOnInit(): void {
    this.portal.me().subscribe({
      next: (res) => {
        this.cards.set(res.memberships);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load your memberships.');
      },
    });
  }

  signOut(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    this.router.navigate(['/login']);
  }

  kindLabel(kind: string): string {
    return kind === 'individual' ? 'Member' : kind === 'nominee' ? 'Nominee' : 'Dependent';
  }
}
