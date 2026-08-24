// TaxLedger writer - freezes a tax quote's per-component lines onto a Ledger
// document (structure + Save-time rule approved 2026-08-24). ONE rule: the
// breakdown rows are written whenever the document row's tax amounts are
// written (draft save/edit, system posting-time creation), and copied onto a
// void reversal - never re-derived later.

const TaxLedger = require('./taxLedger.model');

function money(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2); }
function baseMoney(n, rate) { return (Math.round(Number(n) * Number(rate) * 100) / 100).toFixed(2); }

// Map a quote's lines onto TaxLedger rows for a Ledger document row. The
// base-currency equivalents use the row's FROZEN exchange rate (1 for base
// accounts; legacy rows without a rate fall back to 1).
function rowsFromQuote({ companyId, row, quote, stamps }) {
    const rate = row.exchangeRate ? Number(row.exchangeRate) : 1;
    return (quote.lines || []).map((l, i) => ({
        companyId,
        docType: row.docKind,
        docId: row.id,
        // Parent-row mirrors: mode never changes; status follows the parent
        // through syncStatus below.
        mode: row.mode,
        status: row.status,
        lineNo: i + 1,
        taxSchemeCode: quote.scheme ? quote.scheme.taxSchemeCode : row.taxSchemeCode,
        taxCode: l.taxCode,
        taxType: l.taxType || 'Tax',
        taxPriority: l.taxPriority,
        taxRate: Number(l.taxRate).toFixed(4),
        taxableAmount: money(l.taxableAmount),
        taxAmount: money(l.taxAmount),
        claimablePercentage: Number(l.claimPercentage || 0).toFixed(2),
        claimableAmount: money(l.claimableAmount || 0),
        baseTaxableAmount: baseMoney(l.taxableAmount, rate),
        baseTaxAmount: baseMoney(l.taxAmount, rate),
        baseClaimableAmount: baseMoney(l.claimableAmount || 0, rate),
        ...stamps,
    }));
}

// Replace a document's breakdown with the given quote's lines (inside the
// caller's transaction). quote null / taxless -> the delete alone (an edit
// that switched to a tax-free transaction type clears stale lines).
async function replaceTaxLines({ companyId, row, quote, stamps = {}, t }) {
    await TaxLedger.destroy({ where: { docType: row.docKind, docId: row.id }, transaction: t });
    if (!quote || !Array.isArray(quote.lines) || quote.lines.length === 0) return;
    await TaxLedger.bulkCreate(rowsFromQuote({ companyId, row, quote, stamps }), { transaction: t });
}

// Mirror a document's frozen lines onto its void reversal (same amounts, same
// rate - the reversal reuses the original's fx, so base figures match too).
async function copyTaxLines({ fromRow, toRow, stamps = {}, t }) {
    const lines = await TaxLedger.findAll({
        where: { docType: fromRow.docKind, docId: fromRow.id },
        order: [['lineNo', 'ASC']],
        transaction: t,
    });
    if (!lines.length) return;
    await TaxLedger.bulkCreate(lines.map((l) => ({
        companyId: l.companyId,
        docType: toRow.docKind,
        docId: toRow.id,
        mode: toRow.mode,
        status: toRow.status,
        lineNo: l.lineNo,
        taxSchemeCode: l.taxSchemeCode,
        taxCode: l.taxCode,
        taxType: l.taxType,
        taxPriority: l.taxPriority,
        taxRate: l.taxRate,
        taxableAmount: l.taxableAmount,
        taxAmount: l.taxAmount,
        claimablePercentage: l.claimablePercentage,
        claimableAmount: l.claimableAmount,
        baseTaxableAmount: l.baseTaxableAmount,
        baseTaxAmount: l.baseTaxAmount,
        baseClaimableAmount: l.baseClaimableAmount,
        ...stamps,
    })), { transaction: t });
}

// Mirror a parent Ledger status transition onto its lines (called from every
// place the parent's status is written: post, settle, void, submit-to-
// approval and the workflow's back-to-draft outcomes). No-op for documents
// without lines.
async function syncStatus({ docType, docId, status, t = null }) {
    await TaxLedger.update({ status }, { where: { docType, docId }, transaction: t });
}

module.exports = { replaceTaxLines, copyTaxLines, syncStatus };
