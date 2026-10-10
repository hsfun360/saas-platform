import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly msalService = inject(MsalService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    // Initialise MSAL once at boot; a Microsoft redirect return carries the
    // token that completes the login (the login screen handles the UI).
    this.msalService.instance.initialize().then(() => {
      this.msalService.handleRedirectObservable().subscribe({
        next: (response) => {
          if (response !== null && response.accessToken) {
            this.authService.microsoftLogin(response.accessToken).subscribe({
              next: (res) => {
                if (res.token) localStorage.setItem('token', res.token);
                if (res.email) localStorage.setItem('userEmail', res.email);
                if (res.fullName) this.authService.updateFullNameState(res.fullName);
                this.router.navigate(['/home']);
              },
              error: () => {}, // the login screen reports the failure
            });
          }
        },
        error: () => {},
      });
    }).catch(() => {});
  }
}
