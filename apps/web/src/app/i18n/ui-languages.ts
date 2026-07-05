import { Language } from '../models/auth.models';

// The languages the app ships translation dictionaries for (public/i18n/*.json).
// Used as a fallback for the login screen's language switcher when the public
// active-languages endpoint is empty or unreachable (before login there's no
// user/subscriber context), so a user can always pick a language the UI can show.
export const SHIPPED_UI_LANGUAGES: Language[] = [
  { languageCode: 'en', name: 'English' },
  { languageCode: 'ms', name: 'Bahasa Melayu' },
  { languageCode: 'zh', name: '中文 (简体)' },
];
