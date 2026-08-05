// src/modules/ar/arStatement.service.js
//
// The statement run (approved 2026-08-05): for every debtor with an opening
// balance or activity in the period, freeze a Statement (party name/address
// snapshot via the seams - looked up ONCE, reprints never re-resolve) plus its
// lines. Buckets by docDate (statements/aging use docDate; trxDate is for
// financial-period reporting).
//
// Void documents and their reversal rows net to zero and are EXCLUDED (a void
// pair would only add noise); everything else that was posted appears.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const OtherDebtor = require('./otherDebtor.model');
const Ledger = require('./ledger.model');
const Receipt = require('./receipt.model');
const Allocation = require('./allocation.model');
const Statement = require('./statement.model');
const StatementLine = require('./statementLine.model');
const membershipGateway = require('../../platform/membershipGateway');
const { cents, money } = require('./arPosting.service');

// Signed cents effect of a document on the debtor's AR balance. Deposit money
// is COLLATERAL, not AR credit: the portion of a receipt allocated to a
// deposit, and the portion of a refund funded BY a deposit, are excluded
// (doc.depositC carries those cents).
function docDelta(doc) {
    if (doc.kind === 'ledger') return doc.mode === 'debit' ? cents(doc.grossAmount) : -cents(doc.grossAmount);
    const ar = cents(doc.amount) - (doc.depositC || 0);
    return doc.docKind === 'receipt' ? -ar : ar;
}

// Generate statements for a company period. Skips debtors that already carry a
// non-void statement for this periodEnd (re-runs are safe and reported).
// `issueDocNo(t)` supplies numbers inside the tx.
async function generateStatements({ companyId, periodStart, periodEnd, issueDocNo, stamps }) {
    const debtors = await Debtor.findAll({ where: { companyId, status: { [Op.ne]: 'closed' } } });
    if (!debtors.length) return { generated: 0, skippedExisting: 0, considered: 0 };

    const existing = await Statement.findAll({
        where: { companyId, periodEnd, status: { [Op.ne]: 'void' } },
        attributes: ['debtorId'],
    });
    const blocked = new Set(existing.map((s) => s.debtorId));

    // Bulk-load every posted document once, bucket per debtor in memory.
    const [ledgerRows, receiptRows, depositAllocs] = await Promise.all([
        Ledger.findAll({
            where: { companyId, status: { [Op.ne]: 'void' }, reversalOfId: null, docDate: { [Op.lte]: periodEnd } },
        }),
        Receipt.findAll({
            where: { companyId, status: { [Op.ne]: 'void' }, docDate: { [Op.lte]: periodEnd } },
        }),
        // Deposit-side allocations: receipt->deposit (collection) and
        // deposit->refund (deposit paid back) - both OUTSIDE the AR balance.
        Allocation.findAll({
            where: {
                companyId,
                [Op.or]: [
                    { creditDocType: 'receipt', debitDocType: 'deposit' },
                    { creditDocType: 'deposit', debitDocType: 'refund' },
                ],
            },
        }),
    ]);
    // Per-document cents that belong to deposits, not AR.
    const depositCByDoc = new Map();
    for (const a of depositAllocs) {
        const key = a.creditDocType === 'receipt' ? a.creditDocId : a.debitDocId;
        depositCByDoc.set(key, (depositCByDoc.get(key) || 0) + cents(a.amount));
    }
    const byDebtor = new Map();
    const push = (debtorId, doc) => {
        if (!byDebtor.has(debtorId)) byDebtor.set(debtorId, []);
        byDebtor.get(debtorId).push(doc);
    };
    for (const r of ledgerRows) push(r.debtorId, { kind: 'ledger', row: r, mode: r.mode, docKind: r.docKind, docDate: r.docDate, grossAmount: r.grossAmount, createdAt: r.createdAt });
    for (const r of receiptRows) {
        push(r.debtorId, {
            kind: 'receipt', row: r, mode: r.mode, docKind: r.docKind, docDate: r.docDate,
            amount: r.amount, createdAt: r.createdAt, depositC: depositCByDoc.get(r.id) || 0,
        });
    }

    // Person-name snapshots for incurredBy lines, resolved per debtor lazily.
    let generated = 0;
    await sequelize.transaction(async (t) => {
        for (const debtor of debtors) {
            if (blocked.has(debtor.id)) continue;
            const docs = (byDebtor.get(debtor.id) || []).sort((a, b) =>
                a.docDate < b.docDate ? -1 : a.docDate > b.docDate ? 1 : (a.createdAt < b.createdAt ? -1 : 1));

            let openingC = 0;
            const period = [];
            for (const doc of docs) {
                // A receipt fully consumed by deposit collection (or a refund
                // fully funded by a deposit) has zero AR effect - it belongs
                // on a deposit report, not the statement.
                if (doc.kind === 'receipt' && docDelta(doc) === 0) continue;
                if (doc.docDate < periodStart) openingC += docDelta(doc);
                else period.push(doc);
            }
            if (openingC === 0 && period.length === 0) continue;

            // Party snapshot through the seams (other debtors resolve locally).
            let billName = null;
            let billAddress = null;
            if (debtor.debtorType === 'other') {
                const o = await OtherDebtor.findByPk(debtor.sourceId);
                if (o) {
                    billName = `${o.name} (${o.code})`;
                    billAddress = {
                        line1: o.address1, line2: o.address2, line3: o.address3,
                        city: o.city, state: o.state, postcode: o.postcode, countryCode: o.countryCode,
                    };
                }
            } else {
                const b = await membershipGateway.lookupPartyBilling(companyId, debtor.debtorType, debtor.sourceId);
                if (b) {
                    billName = `${b.name} (${b.no})`;
                    billAddress = b.address;
                }
            }
            if (!billName) billName = 'Unknown debtor';

            const persons = await membershipGateway.listDebtorPersons(companyId, debtor.debtorType, debtor.sourceId);
            const personName = new Map(persons.map((p) => [p.id, p.name]));

            let closingC = openingC;
            const lines = period.map((doc, i) => {
                const delta = docDelta(doc);
                closingC += delta;
                return {
                    companyId,
                    lineNo: i + 1,
                    txnDate: doc.docDate,
                    docType: doc.docKind,
                    docId: doc.row.id,
                    docNo: doc.row.docNo,
                    description: doc.row.description || null,
                    incurredByMemberId: doc.kind === 'ledger' ? doc.row.incurredByMemberId : null,
                    incurredByName: doc.kind === 'ledger' && doc.row.incurredByMemberId
                        ? (personName.get(doc.row.incurredByMemberId) || null) : null,
                    debit: delta > 0 ? money(delta) : '0.00',
                    credit: delta < 0 ? money(-delta) : '0.00',
                };
            });

            const st = await Statement.create({
                companyId,
                debtorId: debtor.id,
                statementNo: await issueDocNo(t),
                statementDate: periodEnd,
                periodStart,
                periodEnd,
                openingBalance: money(openingC),
                closingBalance: money(closingC),
                billName,
                billAddress,
                status: 'generated',
                ...stamps,
            }, { transaction: t });
            if (lines.length) {
                await StatementLine.bulkCreate(lines.map((l) => ({ ...l, statementId: st.id })), { transaction: t });
            }
            generated += 1;
        }
    });

    return { generated, skippedExisting: blocked.size, considered: debtors.length };
}

module.exports = { generateStatements };
