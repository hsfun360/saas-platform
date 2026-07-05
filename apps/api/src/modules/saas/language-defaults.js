// Bundled default language set for the "Load defaults" action on the Languages
// maintenance screen. Codes are ISO 639-1 (region-qualified where a script split
// matters, e.g. zh / zh-tw), aligned with the languages the country reference is
// already synced in (see country.controller.js WORLD_COUNTRIES_LANGS) plus the
// SE-Asia languages this platform cares about (Malay, Indonesian, Vietnamese,
// Hindi, Tamil). Extend as needed; the seed is idempotent and preserves each
// row's isActive flag, so re-running it only adds new codes and refreshes names.
const DEFAULT_LANGUAGES = [
    { languageCode: 'en', name: 'English' },
    { languageCode: 'ms', name: 'Malay' },
    { languageCode: 'zh', name: 'Chinese (Simplified)' },
    { languageCode: 'zh-tw', name: 'Chinese (Traditional)' },
    { languageCode: 'ta', name: 'Tamil' },
    { languageCode: 'hi', name: 'Hindi' },
    { languageCode: 'id', name: 'Indonesian' },
    { languageCode: 'vi', name: 'Vietnamese' },
    { languageCode: 'th', name: 'Thai' },
    { languageCode: 'ja', name: 'Japanese' },
    { languageCode: 'ko', name: 'Korean' },
    { languageCode: 'ar', name: 'Arabic' },
    { languageCode: 'fa', name: 'Persian' },
    { languageCode: 'bg', name: 'Bulgarian' },
    { languageCode: 'br', name: 'Breton' },
    { languageCode: 'cs', name: 'Czech' },
    { languageCode: 'da', name: 'Danish' },
    { languageCode: 'de', name: 'German' },
    { languageCode: 'el', name: 'Greek' },
    { languageCode: 'eo', name: 'Esperanto' },
    { languageCode: 'es', name: 'Spanish' },
    { languageCode: 'et', name: 'Estonian' },
    { languageCode: 'eu', name: 'Basque' },
    { languageCode: 'fi', name: 'Finnish' },
    { languageCode: 'fr', name: 'French' },
    { languageCode: 'hr', name: 'Croatian' },
    { languageCode: 'hu', name: 'Hungarian' },
    { languageCode: 'hy', name: 'Armenian' },
    { languageCode: 'it', name: 'Italian' },
    { languageCode: 'lt', name: 'Lithuanian' },
    { languageCode: 'nl', name: 'Dutch' },
    { languageCode: 'no', name: 'Norwegian' },
    { languageCode: 'pl', name: 'Polish' },
    { languageCode: 'pt', name: 'Portuguese' },
    { languageCode: 'ro', name: 'Romanian' },
    { languageCode: 'ru', name: 'Russian' },
    { languageCode: 'sk', name: 'Slovak' },
    { languageCode: 'sl', name: 'Slovenian' },
    { languageCode: 'sr', name: 'Serbian' },
    { languageCode: 'sv', name: 'Swedish' },
    { languageCode: 'tr', name: 'Turkish' },
    { languageCode: 'uk', name: 'Ukrainian' },
];

module.exports = { DEFAULT_LANGUAGES };
