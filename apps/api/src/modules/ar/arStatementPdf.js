// src/modules/ar/arStatementPdf.js
//
// Statement of Account PDF renderer (2026-08-09). Renders EXCLUSIVELY from the
// frozen ar.Statement + ar.StatementDetail snapshots (letterhead, party,
// contact person, running balances, aging buckets, deposit) - no joins, no
// re-resolution, so a reprint is always byte-identical to what the month-end
// run froze. Built on pdfkit (pure JS - no headless browser in the container);
// the same renderer is the seam for emailing monthly statements as
// attachments later.
//
// Level 1 layout options (2026-08-11): the ar.Setting statement* columns brand
// and trim this ONE standard layout per company - club logo, accent colour
// (band fills + title, label text auto-flips white/dark by luminance),
// section toggles, remittance text. Structural custom layouts are Level 2
// (layout-as-data), never code forks.
//
// Note: the builtin Helvetica fonts cover Latin scripts only; CJK party names
// need a bundled TTF registered here before non-Latin clubs go live.

const PDFDocument = require('pdfkit');
const axios = require('axios');

const PAGE = { size: 'A4', margin: 48 };
const COLORS = {
    text: '#1e293b',
    muted: '#64748b',
    line: '#cbd5e1',
    bandBg: '#f1f5f9',
    void: '#dc2626',
};

// Lines-table column catalogue. Widths are RELATIVE weights on an A4 page
// (595pt - 2x48 margin = 499pt usable); the resolved set is scaled to fill
// the page, so hiding columns stretches the rest automatically.
const BASE_COLS = {
    date: { label: 'DATE', width: 62, align: 'left' },
    docNo: { label: 'DOCUMENT', width: 92, align: 'left' },
    details: { label: 'DETAILS', width: 155, align: 'left' },
    debit: { label: 'DEBIT', width: 60, align: 'right' },
    credit: { label: 'CREDIT', width: 60, align: 'right' },
    balance: { label: 'BALANCE', width: 70, align: 'right' },
};
const DEFAULT_COL_ORDER = ['date', 'docNo', 'details', 'debit', 'credit', 'balance'];

// The company's column layout (Level "1.5": reorder / hide / rename via
// ar.Setting.statementColumns) resolved against the catalogue and scaled to
// the usable width. Unknown keys are ignored; an empty result falls back to
// the standard.
function resolveColumns(layoutColumns, usable) {
    let spec = Array.isArray(layoutColumns) && layoutColumns.length
        ? layoutColumns.filter((c) => c && BASE_COLS[c.key])
        : DEFAULT_COL_ORDER.map((key) => ({ key }));
    if (!spec.length) spec = DEFAULT_COL_ORDER.map((key) => ({ key }));
    const total = spec.reduce((s, c) => s + BASE_COLS[c.key].width, 0);
    const factor = usable / total;
    return spec.map((c) => ({
        key: c.key,
        label: (c.label || BASE_COLS[c.key].label).toUpperCase(),
        width: BASE_COLS[c.key].width * factor,
        align: BASE_COLS[c.key].align,
    }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return String(iso);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Accounting presentation: negative amounts print in brackets - (100.00).
function fmtAmount(s) {
    const str = String(s === null || s === undefined ? '0.00' : s);
    return str.startsWith('-') ? `(${str.slice(1)})` : str;
}

function addressLines(a) {
    if (!a) return [];
    return [
        a.line1, a.line2, a.line3,
        [a.postcode, a.city].filter(Boolean).join(' '),
        a.state,
        a.countryCode ? String(a.countryCode).toUpperCase() : null,
    ].filter(Boolean);
}

// The printed aging buckets, derived from the boundaries snapshotted at
// generation (same rule as the viewer: N boundaries -> N+1 buckets).
function agingBuckets(st) {
    const b = Array.isArray(st.agingBoundaries) ? st.agingBoundaries : [];
    if (!b.length) return [];
    const amounts = [st.aging1, st.aging2, st.aging3, st.aging4, st.aging5, st.aging6, st.aging7];
    const out = [];
    for (let i = 0; i < b.length && i < 6; i += 1) {
        out.push({ label: i === 0 ? `<=${b[0]}` : `${b[i - 1] + 1}-${b[i]}`, amount: amounts[i] });
    }
    out.push({ label: `>${b[Math.min(b.length, 6) - 1]}`, amount: amounts[Math.min(b.length, 6)] });
    return out;
}

// Best-effort logo fetch (Company.logo is a public GCS URL). Any failure -
// missing, oversized, unsupported format - just means no logo on the print.
async function fetchLogo(url) {
    if (!url) return null;
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 3000,
            maxContentLength: 2 * 1024 * 1024,
        });
        return Buffer.from(res.data);
    } catch {
        return null;
    }
}

// Mix a hex colour toward white (f = 0..1 fraction of the way).
function tintHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * f);
    const r = mix((n >> 16) & 255);
    const g = mix((n >> 8) & 255);
    const b = mix(n & 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Readable label colour on a coloured band fill.
function textColorOn(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return COLORS.text;
    const n = parseInt(m[1], 16);
    const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.55 ? COLORS.text : '#ffffff';
}

// Render to a Buffer (callers stream it or attach it to an email).
// `layout` = the company's Level 1 options: { logoUrl, brandColor, showAging,
// showDeposit, showIncurredBy, showGeneratedNote, footerText } - every field
// optional; absent means the standard look.
async function renderStatementPdf(statement, details, layout = {}) {
    const logoBuffer = layout.logoUrl ? await fetchLogo(layout.logoUrl) : null;
    const brand = /^#[0-9a-fA-F]{6}$/.test(layout.brandColor || '') ? layout.brandColor : null;
    const bandFill = brand || COLORS.bandBg;
    const bandText = brand ? textColorOn(brand) : COLORS.muted;
    const bandRowText = brand ? textColorOn(brand) : COLORS.text;
    // Light tint for the opening-balance row (a second dark band right under
    // the dark table header read badly - user feedback 2026-08-11).
    const bandFillLight = brand ? tintHex(brand, 0.85) : COLORS.bandBg;
    const accent = brand || COLORS.text;
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ ...PAGE, bufferPages: true });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const left = PAGE.margin;
        const right = doc.page.width - PAGE.margin;
        const usable = right - left;
        const bottom = doc.page.height - PAGE.margin - 24; // keep room for the footer

        // --- Letterhead: logo + company identity, full width (the title moved
        // below the divider so a long club name can never collide with it) ---
        let headX = left;
        let headW = usable;
        let logoDrawn = false;
        if (layout.showLogo !== false && logoBuffer) {
            try {
                doc.image(logoBuffer, left, PAGE.margin, { fit: [88, 44] });
                headX = left + 100;
                headW = usable - 100;
                logoDrawn = true;
            } catch {
                // Unsupported image format - print without the logo.
            }
        }
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(14)
            .text(statement.companyName || '', headX, PAGE.margin, { width: headW });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
        if (statement.companyRegistrationNo) doc.text(`(${statement.companyRegistrationNo})`, { width: headW });
        doc.fontSize(8);
        for (const line of addressLines(statement.companyAddress)) doc.text(line, { width: headW });
        if (logoDrawn) doc.y = Math.max(doc.y, PAGE.margin + 48);

        doc.moveTo(left, doc.y + 8).lineTo(right, doc.y + 8).strokeColor(brand || COLORS.line).lineWidth(1).stroke();
        doc.y += 16;

        // --- Bill-to (left) + title with statement meta (right) ---
        const bandTop = doc.y;
        const leftColW = Math.floor(usable * 0.55);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
            .text(`${statement.billName}${statement.debtorNo ? `  (${statement.debtorNo})` : ''}`, left, bandTop, { width: leftColW });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
        for (const line of addressLines(statement.billAddress)) doc.text(line, { width: leftColW });
        if (statement.contactPerson) doc.text(`Attn: ${statement.contactPerson}`, { width: leftColW });
        const leftEnd = doc.y;

        const metaX = left + leftColW;
        const metaW = usable - leftColW;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(accent)
            .text('STATEMENT OF ACCOUNT', metaX, bandTop, { width: metaW, align: 'right' });
        if (statement.status === 'void') {
            doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.void)
                .text('VOID', metaX, doc.y, { width: metaW, align: 'right' });
        }
        // Meta pair aligned at the ':' (labels right-aligned into the colon,
        // values left-aligned after it) - a plain right-justified stack read
        // badly (user feedback 2026-08-11).
        doc.font('Helvetica').fontSize(9);
        const metaLines = [['Statement Date', fmtDate(statement.statementDate)]];
        if (layout.showDeposit !== false) metaLines.push(['Deposit', statement.deposit]);
        const labelW = Math.max(...metaLines.map((l) => doc.widthOfString(`${l[0]}:`))) + 2;
        const valueW = Math.max(...metaLines.map((l) => doc.widthOfString(l[1]))) + 2;
        const blockX = right - (labelW + 5 + valueW);
        let metaY = doc.y + 4;
        const metaLineH = doc.currentLineHeight() + 2;
        for (const [label, value] of metaLines) {
            doc.fillColor(COLORS.muted).text(`${label}:`, blockX, metaY, { width: labelW, align: 'right', lineBreak: false });
            doc.fillColor(COLORS.text).text(value, blockX + labelW + 5, metaY, { lineBreak: false });
            metaY += metaLineH;
        }
        doc.y = Math.max(leftEnd, metaY) + 10;

        // --- Lines table (columns are per-company data: order/visibility/
        // labels from the Setting; widths auto-scale to fill the page) ---
        const cols = resolveColumns(layout.columns, usable);
        const colX = [];
        let x = left;
        for (const c of cols) { colX.push(x); x += c.width; }

        const drawHeaderRow = () => {
            const y = doc.y;
            doc.rect(left, y, usable, 16).fill(bandFill);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(bandText);
            cols.forEach((c, i) => {
                doc.text(c.label, colX[i] + 4, y + 5, { width: c.width - 8, align: c.align });
            });
            doc.y = y + 16;
        };

        const ensureRoom = (rowHeight) => {
            if (doc.y + rowHeight <= bottom) return;
            doc.addPage();
            doc.y = PAGE.margin;
            drawHeaderRow();
        };

        // One table row; returns its height. `opts.band` shades it (opening /
        // closing), `opts.bold` for the balance rows.
        const drawRow = (cells, opts = {}) => {
            const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
            doc.font(font).fontSize(8.5);
            // Measure the tallest cell to size the row (details can wrap).
            let h = 0;
            cols.forEach((c) => {
                const t = cells[c.key] || '';
                h = Math.max(h, doc.heightOfString(t, { width: c.width - 8 }));
            });
            const rowH = Math.max(h + 8, 16);
            ensureRoom(rowH);
            const y = doc.y;
            if (opts.band === 'light') doc.rect(left, y, usable, rowH).fill(bandFillLight);
            else if (opts.band) doc.rect(left, y, usable, rowH).fill(bandFill);
            doc.font(font).fontSize(8.5)
                .fillColor(opts.band && opts.band !== 'light' ? bandRowText : COLORS.text);
            cols.forEach((c, i) => {
                doc.text(cells[c.key] || '', colX[i] + 4, y + 4, { width: c.width - 8, align: c.align });
            });
            doc.moveTo(left, y + rowH).lineTo(right, y + rowH).strokeColor(COLORS.line).lineWidth(0.5).stroke();
            doc.y = y + rowH;
        };

        // Balance rows anchor their caption/amount to whichever columns are
        // actually visible in this company's layout.
        const captionKey = (cols.find((c) => c.key === 'docNo') || cols.find((c) => c.key === 'details') || cols[0]).key;
        const totalKey = (cols.find((c) => c.key === 'balance') || [...cols].reverse().find((c) => c.align === 'right') || cols[cols.length - 1]).key;

        drawHeaderRow();
        drawRow({ [captionKey]: 'Opening balance', [totalKey]: statement.openingBalance }, { band: 'light', bold: true });
        for (const l of details) {
            const detail = [
                l.description || l.docType,
                layout.showIncurredBy !== false && l.incurredByName ? `- ${l.incurredByName}` : null,
            ].filter(Boolean).join(' ');
            drawRow({
                date: fmtDate(l.docDate),
                docNo: l.docNo,
                details: detail,
                debit: l.debit !== '0.00' ? l.debit : '',
                credit: l.credit !== '0.00' ? l.credit : '',
                balance: l.balance,
            });
        }
        drawRow({ [captionKey]: 'Closing balance', [totalKey]: statement.closingBalance }, { band: true, bold: true });

        // --- Aging strip (+ the unallocated credit side and the total, so the
        // row always reconciles: buckets + unallocated = balance) ---
        const buckets = layout.showAging !== false ? agingBuckets(statement) : [];
        if (buckets.length) {
            // The two summary cells get fixed wider tracks so their labels
            // never wrap; the buckets share the rest equally.
            const SUMMARY_W = 74;
            const bucketW = (usable - 2 * SUMMARY_W) / buckets.length;
            const cells = [
                ...buckets.map((b, i) => ({ ...b, x: left + i * bucketW, w: bucketW })),
                { label: 'UNALLOCATED', amount: fmtAmount(statement.unallocatedAmount), x: left + buckets.length * bucketW, w: SUMMARY_W },
                { label: 'BALANCE', amount: statement.closingBalance, x: left + buckets.length * bucketW + SUMMARY_W, w: SUMMARY_W },
            ];
            const stripH = 30;
            ensureRoom(stripH + 18);
            doc.y += 10;
            const y = doc.y;
            doc.rect(left, y, usable, 14).fill(bandFill);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(bandText);
            cells.forEach((b) => doc.text(b.label, b.x, y + 4, { width: b.w - 6, align: 'right' }));
            doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text);
            cells.forEach((b) => doc.text(b.amount, b.x, y + 18, { width: b.w - 6, align: 'right' }));
            doc.rect(left, y, usable, stripH).strokeColor(COLORS.line).lineWidth(0.5).stroke();
            doc.y = y + stripH;
        }

        // --- Remittance + closing notes (deposit moved to the header meta) ---
        ensureRoom(30);
        doc.y += 8;
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
        if (layout.footerText) {
            doc.fillColor(COLORS.text).text(String(layout.footerText), left, doc.y, { width: usable });
            doc.moveDown(0.6);
            doc.fillColor(COLORS.muted);
        }
        if (layout.showGeneratedNote !== false) {
            doc.fontSize(7.5)
                .text('This is a computer-generated statement of account; no signature is required.', left, doc.y, { width: usable });
        }

        // --- Page footer: statement number left, page counter right ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i += 1) {
            doc.switchToPage(i);
            const footY = doc.page.height - PAGE.margin - 10;
            doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
                .text(statement.statementNo, left, footY, { width: usable / 2, align: 'left' })
                .text(`Page ${i + 1} of ${range.count}`, left + usable / 2, footY, { width: usable / 2, align: 'right' });
        }

        doc.end();
    });
}

// A dummy statement for the AR Specification "preview layout" download - shows
// the saved layout options on representative content without touching real
// debtor data. Boundaries come from the company's saved aging settings.
function sampleStatement({ companyName, companyAddress, boundaries }) {
    const b = (boundaries && boundaries.length ? boundaries : [30, 60, 90, 120, 150, 180]).slice(0, 6);
    const aging = new Array(7).fill('0.00');
    aging[0] = '750.00';
    if (b.length > 1) aging[1] = '316.00';
    const statement = {
        statementNo: 'ST-SAMPLE',
        statementDate: '2026-08-31',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        companyName: companyName || 'Your Club Name',
        companyRegistrationNo: '199601001234 (376546-P)',
        companyAddress: companyAddress || null,
        billName: 'Sample Member',
        debtorNo: 'MBR-000123',
        billAddress: { line1: '1 Jalan Contoh', city: 'Kuala Lumpur', postcode: '50000', countryCode: 'MY' },
        contactPerson: 'Jane Tan',
        status: 'generated',
        openingBalance: '216.00',
        closingBalance: '966.00',
        deposit: '500.00',
        unallocatedAmount: b.length > 1 ? '-100.00' : '216.00',
        aging1: aging[0], aging2: aging[1], aging3: aging[2], aging4: aging[3],
        aging5: aging[4], aging6: aging[5], aging7: aging[6],
        agingBoundaries: b,
    };
    const details = [
        { docDate: '2026-08-01', docNo: 'INV-000101', description: 'Monthly subscription fee', docType: 'invoice', incurredByName: 'Sample Member', debit: '270.00', credit: '0.00', balance: '486.00' },
        { docDate: '2026-08-05', docNo: 'INV-000102', description: 'F&B charge to account', docType: 'invoice', incurredByName: 'Junior Member', debit: '480.00', credit: '0.00', balance: '966.00' },
        { docDate: '2026-08-12', docNo: 'OR-000045', description: 'Payment received - thank you', docType: 'receipt', incurredByName: null, debit: '0.00', credit: '100.00', balance: '866.00' },
        { docDate: '2026-08-20', docNo: 'CN-000012', description: 'Goodwill adjustment', docType: 'credit-note', incurredByName: null, debit: '0.00', credit: '0.00', balance: '866.00' },
        { docDate: '2026-08-28', docNo: 'DN-000007', description: 'Late-payment interest', docType: 'debit-note', incurredByName: null, debit: '100.00', credit: '0.00', balance: '966.00' },
    ];
    return { statement, details };
}

module.exports = { renderStatementPdf, sampleStatement };
