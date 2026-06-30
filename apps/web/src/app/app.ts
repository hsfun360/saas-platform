import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router'; // 👈 Required to render your routes
import { MsalService } from '@azure/msal-angular';
import { AuthService } from './auth.service'; // 👈 Import your auth service

@Component({
  selector: 'app-root',
  standalone: true, // 👈 Must be true!
  styleUrl: './app.css',
  imports: [RouterOutlet], // 👈 Inject the router outlet directly
//  templateUrl: './app.html',
  template: `<router-outlet></router-outlet> <!-- This is where your routed components will appear -->`
})
export class App implements OnInit {
  protected readonly title = signal('Login');

  constructor(
    private msalService: MsalService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Wake up the Microsoft authentication service when the app loads
    this.msalService.instance.initialize().then(() => {
      console.log('Microsoft MSAL Initialized successfully!');

      // 👇 THIS CATCHES THE TOKEN WHEN MICROSOFT REDIRECTS BACK 👇
      this.msalService.handleRedirectObservable().subscribe({
        next: (response) => {
          if (response !== null && response.accessToken) {
            console.log('Successfully returned from Microsoft with token!');
            
            // Send token to your Node.js backend
            this.authService.microsoftLogin(response.accessToken).subscribe({
              next: (res) => {
                if (res.token) {
                  localStorage.setItem('token', res.token);
                }
                if (res.email) {
                  localStorage.setItem('userEmail', res.email);
                }
                if (res.fullName) {
                  this.authService.updateFullNameState(res.fullName);
                }
                this.router.navigate(['/home']);
              },
              error: (err) => console.error('Backend rejected token:', err)
            });
          }
        },
        error: (error) => console.error('Redirect Error:', error)
      });
    }).catch(err => {
      console.error('MSAL Initialization Error:', err);
    });
  }
}