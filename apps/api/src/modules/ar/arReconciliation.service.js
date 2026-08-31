// src/modules/ar/arReconciliation.service.js
//
// The reconciliation job (approved design): every balance in AR is MATERIALIZED
// in the same transaction as the posting that moves it - never SUMmed at check
// time - so this job is the drift detector that proves the invariants still
// hold, and (in fix mode) repairs a counter to the computed truth.
//
// Invariants checked, all in integer cents from the live rows:
//   pool.outstanding        == SUM(non-void debit Ledger remaining)
//                            - SUM(non-void credit Ledger unapplied)
//                            - SUM(non-void Receipt unallocated)
//   cap.personalUsed        == SUM(person's non-void debit Ledger remaining)
//   ledger.balanceAmount    == grossAmount - SUM(Allocation rows on that row's side)
//   receipt.balanceAmount   == amount - SUM(Allocation rows on its side)
//   deposit.balanceAmount   == amount - SUM(receipt->deposit allocations)
//   deposit.heldAmount      == SUM(receipt->deposit) - SUM(deposit->refund) - conversions
//                            + SUM(non-void conversion CN gross, sourceRef = deposit)
//   allocation.fxGainLoss   == amount x (credit doc rate - debit doc rate)
//                              at the two documents' frozen rates (multicurrency
//                              step 4; NULL rows predate the column and are
//                              STAMPED additively, like the display snapshots)
//
// Report-only by default; `fix: true` updates the drifted counters (pool row
// locked first, per the standard lock order). Documents themselves are never
// touched - counters only.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const membershipGateway = require('../../platform/membershipGateway');
const Debtor = require('./debtor.model');
const OtherDebtor = require('./otherDebtor.model');
const CreditAccount = require('./creditAccount.model');
const CreditMemberLimit = require('./creditMemberLimit.model');
const Ledger = require('./ledger.model');
const Receipt = require('./receipt.model');
const Deposit = require('./deposit.model');
const Allocation = require('./allocation.model');
const { cents, money } = require('./arPosting.service');
const { baseCents } = require('./arCurrency.service');

// Reconcile one company. Returns { checked, discrepancies }; with fix=true the
// drifted counters are repaired and each discrepancy is marked fixed.
async function reconcileCompany(companyId, { fix = false } = {}) {
    const [debtors, pools, caps, ledger, receipts, deposits, allocations] = await Promise.all([
        Debtor.findAll({ where: { companyId }, attributes: ['id', 'debtorType', 'sourceId', 'debtorAccount', 'name'] }),
        CreditAccount.findAll({ where: { companyId } }),
        CreditMemberLimit.findAll({ where: { companyId } }),
        Ledger.findAll({ where: { companyId } }),
        Receipt.findAll({ where: { companyId } }),
        Deposit.findAll({ where: { companyId } }),
        Allocation.findAll({ where: { companyId } }),
    ]);

    // --- allocation sums per document side ---
    const allocByCredit = new Map(); // `${type}:${id}` -> cents
    const allocByDebit = new Map();
    for (const a of allocations) {
        const c = cents(a.amount);
        const ck = `${a.creditDocType}:${a.creditDocId}`;
        const dk = `${a.debitDocType}:${a.debitDocId}`;
        allocByCredit.set(ck, (allocByCredit.get(ck) || 0) + c);
        allocByDebit.set(dk, (allocByDebit.get(dk) || 0) + c);
    }

    // --- expected per-debtor aggregates from the documents ---
    const expOutstanding = new Map(); // debtorId -> cents
    const expPersonal = new Map();    // `${debtorId}:${memberId}` -> cents
    const bump = (map, key, delta) => map.set(key, (map.get(key) || 0) + delta);

    // Conversion CNs per deposit (utilized includes them; no allocation row).
    const conversionByDeposit = new Map();

    const discrepancies = [];
    const note = (type, ref, field, expectedC, actualC, apply) => {
        if (expectedC === actualC) return;
        discrepancies.push({
            type, ref, field,
            expected: money(expectedC),
            actual: money(actualC),
            fixed: false,
            _apply: apply,
        });
    };

    for (const row of ledger) {
        // Drafts / pending approvals are not financial (invoice lifecycle
        // 2026-08-13): they carry no counters and never enter outstanding.
        if (['draft', 'pending-approval'].includes(row.status)) continue;
        if (row.status !== 'void') {
            const remaining = cents(row.balanceAmount);
            if (row.mode === 'debit') {
                bump(expOutstanding, row.debtorId, remaining);
                if (row.incurredByMemberId) bump(expPersonal, `${row.debtorId}:${row.incurredByMemberId}`, remaining);
            } else {
                bump(expOutstanding, row.debtorId, -remaining);
                if (row.docKind === 'credit-note' && row.sourceModule === 'ar') {
                    // Deposit-conversion CN: sourceRef carries the Deposit id.
                    bump(conversionByDeposit, row.sourceRef, cents(row.grossAmount));
                }
            }
        }
        // Counter vs the allocation web (void rows must sit at their frozen
        // amounts too - a void with allocations would itself be drift).
        const side = row.mode === 'debit' ? allocByDebit : allocByCredit;
        const expectedBalance = cents(row.grossAmount) - (side.get(`ledger:${row.id}`) || 0);
        note('ledger', row.docNo, 'balanceAmount', expectedBalance, cents(row.balanceAmount), async (t) => {
            await Ledger.update({ balanceAmount: money(expectedBalance) }, { where: { id: row.id }, transaction: t });
        });
    }

    for (const row of receipts) {
        // Draft receipts (lifecycle 2026-08-20) are not financial: no counters,
        // never in outstanding - same as ledger drafts above.
        if (row.status === 'draft') continue;
        if (row.status !== 'void' && row.docKind === 'receipt') {
            bump(expOutstanding, row.debtorId, -cents(row.balanceAmount));
        }
        // Receipts sit on the CREDIT side of their allocations under docType
        // 'receipt'; refunds sit on the DEBIT side under docType 'refund'
        // (deposit->refund / receipt->refund pairs).
        const side = row.docKind === 'receipt' ? allocByCredit : allocByDebit;
        const expectedBalance = cents(row.amount) - (side.get(`${row.docKind}:${row.id}`) || 0);
        note('receipt', row.docNo, 'balanceAmount', expectedBalance, cents(row.balanceAmount), async (t) => {
            await Receipt.update({ balanceAmount: money(expectedBalance) }, { where: { id: row.id }, transaction: t });
        });
    }

    for (const row of deposits) {
        const collected = allocByDebit.get(`deposit:${row.id}`) || 0;
        const utilized = (allocByCredit.get(`deposit:${row.id}`) || 0) + (conversionByDeposit.get(row.id) || 0);
        const expectedBalance = cents(row.amount) - collected;
        const expectedHeld = collected - utilized;
        note('deposit', row.docNo, 'balanceAmount', expectedBalance, cents(row.balanceAmount), async (t) => {
            await Deposit.update({ balanceAmount: money(expectedBalance) }, { where: { id: row.id }, transaction: t });
        });
        note('deposit', row.docNo, 'heldAmount', expectedHeld, cents(row.heldAmount), async (t) => {
            await Deposit.update({ heldAmount: money(expectedHeld) }, { where: { id: row.id }, transaction: t });
        });
    }

    const poolByDebtor = new Map(pools.map((p) => [p.debtorId, p]));
    for (const d of debtors) {
        const pool = poolByDebtor.get(d.id);
        const expected = expOutstanding.get(d.id) || 0;
        const actual = pool ? cents(pool.outstanding) : 0;
        note('pool', d.id, 'outstanding', expected, actual, async (t) => {
            const [row] = await CreditAccount.findOrCreate({
                where: { debtorId: d.id },
                defaults: { companyId, creditLimit: 0, outstanding: money(expected) },
                transaction: t,
            });
            await row.update({ outstanding: money(expected) }, { transaction: t });
        });
    }

    for (const cap of caps) {
        const expected = expPersonal.get(`${cap.debtorId}:${cap.memberId}`) || 0;
        note('personal-cap', cap.memberId, 'personalUsed', expected, cents(cap.personalUsed), async (t) => {
            await CreditMemberLimit.update({ personalUsed: money(expected) }, { where: { id: cap.id }, transaction: t });
        });
    }

    // --- realized fx per allocation (multicurrency step 4) ---
    // Both documents' rates are frozen, so the expected value is exact. A NULL
    // fxGainLoss predates the column: stamped every run, both modes - additive
    // backfill, not drift (same treatment as the display snapshots).
    const ledgerById = new Map(ledger.map((r) => [r.id, r]));
    const receiptById = new Map(receipts.map((r) => [r.id, r]));
    const depositById = new Map(deposits.map((r) => [r.id, r]));
    const docOf = (type, id) => (type === 'ledger' ? ledgerById.get(id)
        : type === 'deposit' ? depositById.get(id)
            : receiptById.get(id)); // 'receipt' and 'refund' are both ar.Receipt rows
    let fxStamped = 0;
    for (const a of allocations) {
        const creditDoc = docOf(a.creditDocType, a.creditDocId);
        const debitDoc = docOf(a.debitDocType, a.debitDocId);
        if (!creditDoc || !debitDoc) {
            discrepancies.push({
                type: 'allocation', ref: a.id, field: 'documents',
                expected: 'both documents resolvable',
                actual: `${a.creditDocType}:${creditDoc ? 'ok' : 'missing'} -> ${a.debitDocType}:${debitDoc ? 'ok' : 'missing'}`,
                fixed: false, _apply: null,
            });
            continue;
        }
        const creditRate = Number(creditDoc.exchangeRate || 1);
        const debitRate = Number(debitDoc.exchangeRate || 1);
        const expectedFx = creditRate === debitRate ? 0
            : baseCents(cents(a.amount), creditRate) - baseCents(cents(a.amount), debitRate);
        if (a.fxGainLoss === null) {
            await Allocation.update({ fxGainLoss: money(expectedFx) }, { where: { id: a.id } });
            fxStamped += 1;
            continue;
        }
        note('allocation', `${creditDoc.docNo} -> ${debitDoc.docNo}`, 'fxGainLoss', expectedFx, cents(a.fxGainLoss), async (t) => {
            await Allocation.update({ fxGainLoss: money(expectedFx) }, { where: { id: a.id }, transaction: t });
        });
    }

    // --- sort-key snapshots (debtorAccount / name) ---
    // Missing snapshots are STAMPED every run, both modes - that's additive
    // backfill, not drift repair, and it is what fills rows that predate the
    // columns. A snapshot that DIFFERS from the live party value is drift:
    // reported, repaired in fix mode. A party that no longer resolves at all
    // is reported as unresolvable (nothing to stamp - real integrity problem).
    let snapshotsStamped = 0;
    {
        const ids = { membershipIds: [], memberIds: [], otherIds: [] };
        for (const d of debtors) {
            if (d.debtorType === 'membership') ids.membershipIds.push(d.sourceId);
            else if (d.debtorType === 'member') ids.memberIds.push(d.sourceId);
            else ids.otherIds.push(d.sourceId);
        }
        const display = await membershipGateway.lookupPartyDisplay(companyId, ids);
        const others = ids.otherIds.length
            ? await OtherDebtor.findAll({ where: { id: { [Op.in]: ids.otherIds } }, attributes: ['id', 'code', 'name'] })
            : [];
        const otherById = new Map(others.map((o) => [o.id, o]));

        for (const d of debtors) {
            let live = null;
            if (d.debtorType === 'membership') {
                const m = display.memberships[d.sourceId];
                live = m ? { no: m.no, name: m.name } : null;
            } else if (d.debtorType === 'member') {
                const m = display.members[d.sourceId];
                live = m ? { no: m.no, name: m.name } : null;
            } else {
                const o = otherById.get(d.sourceId);
                live = o ? { no: o.code, name: o.name } : null;
            }

            if (!live) {
                if (!d.debtorAccount || !d.name) {
                    discrepancies.push({
                        type: 'debtor', ref: d.id, field: 'displaySnapshot',
                        expected: '(party unresolvable)',
                        actual: `${d.debtorAccount || '∅'} / ${d.name || '∅'}`,
                        fixed: false, _apply: null,
                    });
                }
                continue;
            }

            const wantAccount = live.no ? String(live.no).slice(0, 64) : null;
            const wantName = live.name ? String(live.name).slice(0, 255) : null;
            const stamp = {};
            if (!d.debtorAccount && wantAccount) stamp.debtorAccount = wantAccount;
            if (!d.name && wantName) stamp.name = wantName;
            if (Object.keys(stamp).length) {
                await Debtor.update(stamp, { where: { id: d.id } });
                snapshotsStamped += 1;
            }
            const stale = (d.debtorAccount && wantAccount && d.debtorAccount !== wantAccount)
                || (d.name && wantName && d.name !== wantName);
            if (stale) {
                discrepancies.push({
                    type: 'debtor', ref: d.debtorAccount || d.id, field: 'displaySnapshot',
                    expected: `${wantAccount || '∅'} / ${wantName || '∅'}`,
                    actual: `${d.debtorAccount || '∅'} / ${d.name || '∅'}`,
                    fixed: false,
                    _apply: async (t) => {
                        await Debtor.update(
                            { debtorAccount: wantAccount || d.debtorAccount, name: wantName || d.name },
                            { where: { id: d.id }, transaction: t },
                        );
                    },
                });
            }
        }
    }

    if (fix && discrepancies.length) {
        await sequelize.transaction(async (t) => {
            // Standard lock order: every pool row first, then everything else.
            await CreditAccount.findAll({
                where: { companyId }, transaction: t, lock: t.LOCK.UPDATE,
            });
            for (const d of discrepancies) {
                if (!d._apply) continue; // unresolvable-party reports have no repair
                await d._apply(t);
                d.fixed = true;
            }
        });
    }
    for (const d of discrepancies) delete d._apply;

    return {
        checked: {
            debtors: debtors.length,
            ledgerDocs: ledger.length,
            receipts: receipts.length,
            deposits: deposits.length,
            personCaps: caps.length,
            allocations: allocations.length,
            snapshotsStamped,
            fxStamped,
        },
        discrepancies,
    };
}

// Sweep entry (nightly, all companies with AR data): report-only - drift is
// LOGGED for ops, never silently repaired. Companies come from the Debtor
// table itself (no Control-Plane read needed).
async function reconcileAllCompanies() {
    const companies = await Debtor.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('companyId')), 'companyId']],
        raw: true,
    });
    let totalDrift = 0;
    for (const c of companies) {
        const result = await reconcileCompany(c.companyId, { fix: false });
        if (result.discrepancies.length) {
            totalDrift += result.discrepancies.length;
            console.error(`[AR RECONCILE] company ${c.companyId}: ${result.discrepancies.length} discrepancy(ies):`,
                JSON.stringify(result.discrepancies.slice(0, 20)));
        }
    }
    if (totalDrift === 0) console.log(`[AR RECONCILE] ${companies.length} company(ies) checked - no drift.`);
    return totalDrift;
}

module.exports = { reconcileCompany, reconcileAllCompanies };
