import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

// Landing page for the self-register activation email. The email links HERE
// (the frontend), never the raw API host - a bare API link in an email is a
// phishing pattern that got the API domain flagged by Chrome Safe Browsing.
@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './verify-email.html',
  styleUrls: ['./verify-email.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly state = signal<'verifying' | 'success' | 'error'>('verifying');
  readonly message = signal('');

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('error');
      this.message.set('This activation link is incomplete. Please use the link from your email.');
      return;
    }

    this.auth.verifyEmail(token).subscribe({
      next: (res) => {
        this.state.set('success');
        this.message.set(res.message || 'Email verified successfully! You can now log in.');
      },
      error: (err) => {
        this.state.set('error');
        this.message.set(err?.error?.message || 'This activation link is invalid or has expired.');
      },
    });
  }
}
