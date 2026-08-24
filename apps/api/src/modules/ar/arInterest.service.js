// src/modules/ar/arInterest.service.js
//
// The staged interest run (approved 2026-08-05): GENERATE into holding
// (InterestGeneration header per debtor per month + permanent detail
// drill-down), review, then CONFIRM per header (the controller posts the
// summary Debit Note through arPosting and stamps postedLedgerId).
//
// Eligibility: Debtor.chargeInterest AND the item's isInterestChargeable
// snapshot AND past dueDate + graceDays at the cutoff, on OPEN debit items.
// FORMULA (user rule): interest = remaining x rate/100, flat per month, no
// day proration, half-up to 2dp per line; header = sum of rounded lines.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const Ledger = require('./ledger.model');
const InterestGeneration = require('./interestGeneration.model');
const InterestGenerationDetail = require('./interestGenerationDetail.model');
const { cents, money, shiftDate } = require('./arPosting.service');

function daysBetween(fromStr, toStr) {
    const [fy, fm, fd] = String(fromStr).split('-').map(Number);
    const [ty, tm, td] = String(toStr).split('-').map(Number);
    const from = Date.UTC(fy, fm - 1, fd);
    const to = Date.UTC(ty, tm - 1, td);
    return Math.round((to - from) / 86400000);
}

// Run the generation for a whole company-month. Idempotent per debtor: a
// pending/confirmed header blocks the month (skipped + reported); cancelled
// ones are replaced by regeneration. Returns counts for the result flash.
async function generateInterest({ companyId, periodMonth, cutoffDate, ratePercent, graceDays, stamps }) {
    const debtors = await Debtor.findAll({
        where: { companyId, chargeInterest: true, status: 'active' },
        attributes: ['id'],
    });
    if (!debtors.length) return { generated: 0, skippedExisting: 0, considered: 0, totalInterest: '0.00' };

    const existing = await InterestGeneration.findAll({
        where: { companyId, periodMonth, status: { [Op.ne]: 'cancelled' } },
        attributes: ['debtorId'],
    });
    const blocked = new Set(existing.map((e) => e.debtorId));

    // Overdue = dueDate + grace < cutoff  <=>  dueDate < cutoff - grace.
    const overdueBefore = shiftDate(cutoffDate, -(graceDays || 0));

    let generated = 0;
    let totalInterestC = 0;
    await sequelize.transaction(async (t) => {
        for (const d of debtors) {
            if (blocked.has(d.id)) continue;
            const items = await Ledger.findAll({
                where: {
                    debtorId: d.id,
                    mode: 'debit',
                    status: 'open',
                    isInterestChargeable: true,
                    dueDate: { [Op.and]: [{ [Op.ne]: null }, { [Op.lt]: overdueBefore }] },
                },
                order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
                transaction: t,
            });

            const lines = [];
            let overdueC = 0;
            let interestC = 0;
            for (const item of items) {
                const remainingC = cents(item.balanceAmount);
                if (remainingC <= 0) continue;
                // Flat monthly rate, half-up per line.
                const lineInterestC = Math.round((remainingC * Number(ratePercent)) / 100);
                if (lineInterestC <= 0) continue;
                lines.push({
                    chargeId: item.id,
                    docNo: item.docNo,
                    docDate: item.docDate,
                    dueDate: item.dueDate,
                    overdueAmount: money(remainingC),
                    overdueDays: Math.max(0, daysBetween(item.dueDate, cutoffDate) - (graceDays || 0)),
                    interestAmount: money(lineInterestC),
                });
                overdueC += remainingC;
                interestC += lineInterestC;
            }
            if (!lines.length) continue;

            const header = await InterestGeneration.create({
                companyId,
                debtorId: d.id,
                periodMonth,
                cutoffDate,
                interestRate: Number(ratePercent).toFixed(4),
                graceDays: graceDays || 0,
                totalOverdue: money(overdueC),
                interestAmount: money(interestC),
                status: 'pending',
                ...stamps,
            }, { transaction: t });
            await InterestGenerationDetail.bulkCreate(
                lines.map((l) => ({ companyId, interestGenerationId: header.id, ...l })),
                { transaction: t },
            );
            generated += 1;
            totalInterestC += interestC;
        }
    });

    return {
        generated,
        skippedExisting: blocked.size,
        considered: debtors.length,
        totalInterest: money(totalInterestC),
    };
}

module.exports = { generateInterest, daysBetween };
