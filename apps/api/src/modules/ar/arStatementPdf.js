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
// Note: the builtin Helvetica fonts cover Latin scripts only; CJK party names
// need a bundled TTF registered here before non-Latin clubs go live.

const PDFDocument = require('pdfkit');

const PAGE = { size: 'A4', margin: 48 };
const COLORS = {
    text: '#1e293b',
    muted: '#64748b',
    line: '#cbd5e1',
    bandBg: '#f1f5f9',
    void: '#dc2626',
};

// Table geometry (A4 width 595pt - 2x48 margin = 499pt usable).
const COLS = [
    { key: 'date', label: 'DATE', width: 62, align: 'left' },
    { key: 'docNo', label: 'DOCUMENT', width: 92, align: 'left' },
    { key: 'details', label: 'DETAILS', width: 155, align: 'left' },
    { key: 'debit', label: 'DEBIT', width: 60, align: 'right' },
    { key: 'credit', label: 'CREDIT', width: 60, align: 'right' },
    { key: 'balance', label: 'BALANCE', width: 70, align: 'right' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return String(iso);
    return `${d} ${MONTHS[m - 1]} ${y}`;
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

// Render to a Buffer (callers stream it or attach it to an email).
function renderStatementPdf(statement, details) {
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

        // --- Letterhead ---
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(14)
            .text(statement.companyName || '', left, PAGE.margin, { width: usable });
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
        for (const line of addressLines(statement.companyAddress)) doc.text(line, { width: usable });

        // Title block (right-aligned, level with the letterhead).
        doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.text)
            .text('STATEMENT OF ACCOUNT', left, PAGE.margin, { width: usable, align: 'right' });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
            .text(statement.statementNo, { width: usable, align: 'right' })
            .text(`Statement date ${fmtDate(statement.statementDate)}`, { width: usable, align: 'right' })
            .text(`Period ${fmtDate(statement.periodStart)} - ${fmtDate(statement.periodEnd)}`, { width: usable, align: 'right' });
        if (statement.status === 'void') {
            doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.void)
                .text('VOID', { width: usable, align: 'right' });
        }

        doc.moveTo(left, doc.y + 8).lineTo(right, doc.y + 8).strokeColor(COLORS.line).lineWidth(1).stroke();
        doc.y += 16;

        // --- Bill-to ---
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
            .text(`${statement.billName}${statement.debtorNo ? `  (${statement.debtorNo})` : ''}`, left, doc.y, { width: usable });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
        for (const line of addressLines(statement.billAddress)) doc.text(line, { width: usable });
        if (statement.contactPerson) doc.text(`Attn: ${statement.contactPerson}`, { width: usable });
        doc.y += 10;

        // --- Lines table ---
        const colX = [];
        let x = left;
        for (const c of COLS) { colX.push(x); x += c.width; }

        const drawHeaderRow = () => {
            const y = doc.y;
            doc.rect(left, y, usable, 16).fill(COLORS.bandBg);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted);
            COLS.forEach((c, i) => {
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
            COLS.forEach((c, i) => {
                const t = cells[c.key] || '';
                h = Math.max(h, doc.heightOfString(t, { width: c.width - 8 }));
            });
            const rowH = Math.max(h + 8, 16);
            ensureRoom(rowH);
            const y = doc.y;
            if (opts.band) doc.rect(left, y, usable, rowH).fill(COLORS.bandBg);
            doc.font(font).fontSize(8.5).fillColor(COLORS.text);
            COLS.forEach((c, i) => {
                doc.text(cells[c.key] || '', colX[i] + 4, y + 4, { width: c.width - 8, align: c.align });
            });
            doc.moveTo(left, y + rowH).lineTo(right, y + rowH).strokeColor(COLORS.line).lineWidth(0.5).stroke();
            doc.y = y + rowH;
        };

        drawHeaderRow();
        drawRow({ docNo: 'Opening balance', balance: statement.openingBalance }, { band: true, bold: true });
        for (const l of details) {
            const detail = [l.description || l.docType, l.incurredByName ? `- ${l.incurredByName}` : null]
                .filter(Boolean).join(' ');
            drawRow({
                date: fmtDate(l.docDate),
                docNo: l.docNo,
                details: detail,
                debit: l.debit !== '0.00' ? l.debit : '',
                credit: l.credit !== '0.00' ? l.credit : '',
                balance: l.balance,
            });
        }
        drawRow({ docNo: 'Closing balance', balance: statement.closingBalance }, { band: true, bold: true });

        // --- Aging strip ---
        const buckets = agingBuckets(statement);
        if (buckets.length) {
            const stripH = 30;
            ensureRoom(stripH + 18);
            doc.y += 10;
            const y = doc.y;
            const w = usable / buckets.length;
            doc.rect(left, y, usable, 14).fill(COLORS.bandBg);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted);
            buckets.forEach((b, i) => doc.text(b.label, left + i * w, y + 4, { width: w - 6, align: 'right' }));
            doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text);
            buckets.forEach((b, i) => doc.text(b.amount, left + i * w, y + 18, { width: w - 6, align: 'right' }));
            doc.rect(left, y, usable, stripH).strokeColor(COLORS.line).lineWidth(0.5).stroke();
            doc.y = y + stripH;
        }

        // --- Deposit + closing notes ---
        ensureRoom(30);
        doc.y += 8;
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted)
            .text(`Security deposit held: ${statement.deposit}`, left, doc.y, { width: usable });
        doc.moveDown(0.6);
        doc.fontSize(7.5)
            .text('This is a computer-generated statement of account; no signature is required.', { width: usable });

        // --- Page footer (page x of y) ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i += 1) {
            doc.switchToPage(i);
            doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
                .text(`${statement.statementNo}  ·  Page ${i + 1} of ${range.count}`,
                    left, doc.page.height - PAGE.margin - 10, { width: usable, align: 'center' });
        }

        doc.end();
    });
}

module.exports = { renderStatementPdf };
