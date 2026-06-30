import { Component, OnInit } from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    imports: [RouterOutlet],
})
export class AppComponent implements OnInit {
  title = 'ClientApp';

  constructor(private msalService: MsalService) {}

  ngOnInit(): void {
    // 👇 This is the magic line! It turns on the Microsoft Client when the app loads.
    this.msalService.instance.initialize().then(() => {
      console.log('Microsoft MSAL Initialized successfully!');
    }).catch(err => {
      console.error('MSAL Initialization Error:', err);
    });
  }
}