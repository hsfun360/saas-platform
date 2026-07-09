// src/modules/notification/emailBrand.js
//
// Builds the branded email header from a TEMPLATE's brand settings (accent colour
// + include-logo flag) and the SENDING company's logo. The colour is configured
// per template (EmailTemplate.brandColor); the logo is never stored on the
// template — it always comes from Company.logo at render, and only when the
// template's includeLogo flag is on. Emitted as {{{brandHeaderHtml}}} + {{brandColor}}.

// Fallback accent when a template has no colour set (or a company-less platform
// email). A calm, accessible blue.
const DEFAULT_BRAND_COLOR = '#2563eb';

// Accept only a plain hex colour so a stray value can never inject markup/CSS.
function safeColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : null;
}

// Only allow http(s) image URLs in the header (no data:/javascript: etc.).
function safeUrl(value) {
    return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? value.trim() : null;
}

// The full-bleed header band that becomes the top of the branded card. The card's
// overflow:hidden clips its top corners round. Returns '' when there is nothing to
// brand (no colour and no shown logo). The logo has NO background of its own — a
// transparent PNG blends with the band; a logo saved with a white background will
// still show that white (that lives in the image file, not here).
function buildHeaderHtml({ brandColor, logoUrl, showLogo }) {
    const hasLogo = showLogo && !!logoUrl;
    if (!brandColor && !hasLogo) return '';
    const bg = brandColor || DEFAULT_BRAND_COLOR;
    const inner = hasLogo
        ? `<img src="${logoUrl}" alt="" style="display:block;margin:0 auto;max-height:52px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;">`
        : '&nbsp;';
    return `<div style="background-color:${bg};padding:26px 24px;text-align:center;line-height:0;">${inner}</div>`;
}

// Unwrap a body that is a single outer CARD <div> (has border / max-width /
// border-radius) so we don't end up with a card inside a card. A plain semantic
// wrapper (e.g. a text-align:center div) is left untouched, and content that isn't
// a single wrapping div is returned as-is.
function unwrapOuterCard(html) {
    const trimmed = (html || '').trim();
    const m = trimmed.match(/^<div\b([^>]*)>([\s\S]*)<\/div>$/i);
    if (!m) return trimmed;
    if (/border|max-width|border-radius/i.test(m[1])) return m[2].trim();
    return trimmed;
}

// Shape the brand context from the template's settings + the sending company's
// logo. `brandColorSet` records whether a colour was actually configured (vs the
// fallback), which gates the automatic button recolouring below. The logo is
// included only when the template says so AND the company actually has one.
function buildBrand({ brandColor = null, includeLogo = false, companyLogoUrl = null } = {}) {
    const color = safeColor(brandColor);
    const url = safeUrl(companyLogoUrl);
    const showLogo = !!includeLogo && !!url;
    return {
        brandColor: color || DEFAULT_BRAND_COLOR,
        brandColorSet: !!color,
        logoUrl: showLogo ? url : '',
        showLogo,
        brandHeaderHtml: buildHeaderHtml({ brandColor: color, logoUrl: url, showLogo }),
    };
}

// Apply the brand to an already-compiled email body AUTOMATICALLY, so branding
// works on ANY template body without it needing to reference {{brandColor}} or
// {{{brandHeaderHtml}}} (older/customised bodies don't). Steps:
//   1. Recolour CTA buttons — any styled <a> with an inline background — to the
//      brand colour (only when a colour was explicitly set).
//   2. Rebuild into ONE clean card: strip the body's own outer card wrapper (so we
//      don't nest a card in a card), then wrap the content in a bordered, rounded
//      card whose ROUNDED TOP is the header band. The band sits INSIDE the card
//      (full-bleed), matching the in-app preview — not a separate strip above it.
function applyBrandToHtml(compiledHtml, brand) {
    let html = compiledHtml || '';
    if (brand.brandColorSet) {
        html = html.replace(
            /(<a\b[^>]*\bstyle="[^"]*?background(?:-color)?\s*:\s*)[^;"]+/gi,
            `$1${brand.brandColor}`,
        );
    }
    const content = unwrapOuterCard(html);
    return (
        `<div style="max-width:600px;margin:0 auto;background:#ffffff;` +
        `border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;` +
        `font-family:Arial,Helvetica,sans-serif;">` +
        (brand.brandHeaderHtml || '') +
        `<div style="padding:28px 24px;color:#334155;line-height:1.6;">${content}</div>` +
        `</div>`
    );
}

module.exports = { DEFAULT_BRAND_COLOR, safeColor, safeUrl, buildBrand, applyBrandToHtml, unwrapOuterCard };
