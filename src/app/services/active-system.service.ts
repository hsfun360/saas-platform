import { Injectable, signal } from '@angular/core';

// Shares the ACTIVE system's dashboard route (its landing) from the dashboard
// shell to other screens — e.g. the Under Construction placeholder, whose
// "Back to dashboard" should return to the current system's dashboard, not the
// generic /home. The shell keeps this in sync as the active system changes.
@Injectable({ providedIn: 'root' })
export class ActiveSystemService {
  readonly dashboardRoute = signal<string>('/home');
}
