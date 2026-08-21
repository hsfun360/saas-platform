// Child member numbering (nominees + dependents) - ONE source of truth for
// the suffix patterns configured on Club Specification and the next-number
// derivation used by BOTH the interactive suggestion endpoint and the Excel
// import. A child number is a DERIVATION from its principal's number, never a
// Numbering Control series (nothing to count club-wide, no gapless guarantee).
//
// Pattern = "the first suffix", stored per kind on MembershipSetting
// (nomineeNoSuffix / dependentNoSuffix, default '-A'):
//   one SEPARATOR character (non-alphanumeric; % _ \ excluded - LIKE hazards)
//   + one FORM token: 'A' (letters) or '1' | '01' | '001' | '0001' (numeric,
//   the zero-padding is a MINIMUM width, overflow grows naturally).
// Examples: '-A' -> M-0001-A;  '.001' -> CORP-0003.001;  '/01' -> CORP-3/01.
//
// Allocation rules (user decisions 2026-08-21):
//   letters -> first free A..Z (past 26 falls back to a plain number);
//   numeric -> STRICTLY INCREASING (max + 1) - a freed number is never
//   reissued, so seat numbers stay unique in AR history forever.

const DEFAULT_SUFFIX = '-A';
const FORM_TOKENS = ['A', '1', '01', '001', '0001'];

// Returns an error string, or null when the pattern is valid.
function validateSuffixPattern(pattern) {
    if (typeof pattern !== 'string' || pattern.length < 2 || pattern.length > 5) {
        return 'Suffix must be one separator character followed by A, 1, 01, 001 or 0001.';
    }
    const sep = pattern[0];
    const form = pattern.slice(1);
    if (/[A-Za-z0-9]/.test(sep)) return 'The suffix separator must not be a letter or digit.';
    if (['%', '_', '\\'].includes(sep)) return 'The suffix separator cannot be %, _ or \\.';
    if (!FORM_TOKENS.includes(form)) return 'Suffix numbering must be A, 1, 01, 001 or 0001.';
    return null;
}

// pattern -> { separator, alpha, width }; invalid input falls back to '-A'
// (defensive - the setting is validated on save).
function parseSuffixPattern(pattern) {
    const p = validateSuffixPattern(pattern) ? DEFAULT_SUFFIX : pattern;
    const form = p.slice(1);
    return { separator: p[0], alpha: form === 'A', width: form.length };
}

// Escape a literal string for use inside a LIKE pattern (PG default escape \).
function escapeLike(literal) {
    return literal.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// The next child number for `principalNo` under `pattern`, given every
// existing number that starts with the principal's prefix (DB rows plus any
// numbers already taken inside the caller's transaction).
function deriveChildNo(principalNo, pattern, existingNos) {
    const { separator, alpha, width } = parseSuffixPattern(pattern);
    const prefix = `${principalNo}${separator}`;
    const suffixes = existingNos
        .filter((no) => no.toUpperCase().startsWith(prefix.toUpperCase()))
        .map((no) => no.slice(prefix.length));

    if (alpha) {
        const taken = new Set(suffixes.map((s) => s.toUpperCase()));
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i);
            if (!taken.has(letter)) return `${prefix}${letter}`;
        }
        return `${prefix}${taken.size + 1}`;
    }

    // Numeric: strictly increasing - max existing + 1, never reusing a freed
    // slot. Padding is a minimum width; 100 follows 99 under '-01' style.
    let max = 0;
    for (const s of suffixes) {
        if (/^\d+$/.test(s)) max = Math.max(max, Number(s));
    }
    return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

module.exports = { DEFAULT_SUFFIX, validateSuffixPattern, parseSuffixPattern, escapeLike, deriveChildNo };
