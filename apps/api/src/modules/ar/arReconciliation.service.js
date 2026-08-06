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
//   ledger.settledAmount    == SUM(Allocation rows on that row's side)
//   receipt.allocatedAmount == SUM(Allocation rows on its side)
//   deposit.collectedAmount == SUM(receipt->deposit allocations)
//   deposit.utilizedAmount  == SUM(deposit->refund allocations)
//                            + SUM(non-void conversion CN gross, sourceRef = deposit)
//
// Report-only by default; `fix: true` updates the drifted counters (pool row
// locked first, per the standard lock order). Documents themselves are never
// touched - counters only.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const CreditAccount = require('./creditAccount.model');
const CreditMemberLimit = require('./creditMemberLimit.model');
const Ledger = require('./ledger.model');
const Receipt = require('./receipt.model');
const Deposit = require('./deposit.model');
const Allocation = require('./allocation.model');
const { cents, money } = require('./arPosting.service');

// Reconcile one company. Returns { checked, discrepancies }; with fix=true the
// drifted counters are repaired and each discrepancy is marked fixed.
async function reconcileCompany(companyId, { fix = false } = {}) {
    const [debtors, pools, caps, ledger, receipts, deposits, allocations] = await Promise.all([
        Debtor.findAll({ where: { companyId }, attributes: ['id'] }),
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
        if (row.status !== 'void') {
            const remaining = cents(row.grossAmount) - cents(row.settledAmount);
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
        const expected = side.get(`ledger:${row.id}`) || 0;
        note('ledger', row.docNo, 'settledAmount', expected, cents(row.settledAmount), async (t) => {
            await Ledger.update({ settledAmount: money(expected) }, { where: { id: row.id }, transaction: t });
        });
    }

    for (const row of receipts) {
        if (row.status !== 'void' && row.docKind === 'receipt') {
            bump(expOutstanding, row.debtorId, -(cents(row.amount) - cents(row.allocatedAmount)));
        }
        const side = row.docKind === 'receipt' ? allocByCredit : allocByDebit;
        const expected = side.get(`receipt:${row.id}`) || 0;
        note('receipt', row.docNo, 'allocatedAmount', expected, cents(row.allocatedAmount), async (t) => {
            await Receipt.update({ allocatedAmount: money(expected) }, { where: { id: row.id }, transaction: t });
        });
    }

    for (const row of deposits) {
        const expectedCollected = allocByDebit.get(`deposit:${row.id}`) || 0;
        const expectedUtilized = (allocByCredit.get(`deposit:${row.id}`) || 0) + (conversionByDeposit.get(row.id) || 0);
        note('deposit', row.docNo, 'collectedAmount', expectedCollected, cents(row.collectedAmount), async (t) => {
            await Deposit.update({ collectedAmount: money(expectedCollected) }, { where: { id: row.id }, transaction: t });
        });
        note('deposit', row.docNo, 'utilizedAmount', expectedUtilized, cents(row.utilizedAmount), async (t) => {
            await Deposit.update({ utilizedAmount: money(expectedUtilized) }, { where: { id: row.id }, transaction: t });
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

    if (fix && discrepancies.length) {
        await sequelize.transaction(async (t) => {
            // Standard lock order: every pool row first, then everything else.
            await CreditAccount.findAll({
                where: { companyId }, transaction: t, lock: t.LOCK.UPDATE,
            });
            for (const d of discrepancies) {
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
