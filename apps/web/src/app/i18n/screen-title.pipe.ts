import { Pipe, PipeTransform, inject } from '@angular/core';
import { ScreenTitleService } from './screen-title.service';

// Usage in a screen header (the argument is the hardcoded English fallback,
// used when the screen isn't menu-backed or the menu has no translation):
//   <h1>{{ 'Memberships' | screenTitle }}</h1>
//   <p class="saas-subtitle">{{ 'Individual and corporate...' | screenSubtitle }}</p>
//
// Impure for the same reason as TranslatePipe: the service reads the
// I18nService `lang` signal during transform, so the view re-renders when the
// user toggles the language (zoneless-friendly).
@Pipe({ name: 'screenTitle', standalone: true, pure: false })
export class ScreenTitlePipe implements PipeTransform {
  private readonly titles = inject(ScreenTitleService);

  transform(fallback: string): string {
    return this.titles.title(fallback);
  }
}

@Pipe({ name: 'screenSubtitle', standalone: true, pure: false })
export class ScreenSubtitlePipe implements PipeTransform {
  private readonly titles = inject(ScreenTitleService);

  transform(fallback: string): string {
    return this.titles.subtitle(fallback);
  }
}
