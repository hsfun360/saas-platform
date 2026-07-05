import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

// Usage: {{ 'nav.dashboard' | t }}  or  {{ 'greeting' | t: { name: user } }}
//
// Impure so it re-runs on change detection; it reads the I18nService `lang` signal
// during transform, which makes the host view depend on the active language and
// re-render when it changes (zoneless-friendly, no manual markForCheck needed).
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params);
  }
}
