// src/modules/ar/arPosting.service.js
//
// The AR posting/allocation engine (design approved 2026-08-05). Everything
// that changes a balance goes through here, inside ONE transaction per posting,
// with a FIXED lock order: the debtor's CreditAccount pool row FIRST
// (SELECT FOR UPDATE), then CreditMemberLimit person rows by memberId. All
// arithmetic is integer cents - DECIMAL columns round-trip as strings.
//
// The pool invariant (reconciliation asserts it):
//   outstanding = SUM(open debit Ledger remaining)
//               - SUM(unallocated credit: Receipts mode 'credit' + Ledger mode 'credit')
// Every mutation adjusts `outstanding` by the delta of that formula:
//   post debit ledger    -> +gross          post credit ledger -> -gross
//   post receipt         -> -amount         post refund        -> 0 (funding allocations do it)
//   alloc credit->ledger -> 0 (both sides already counted)
//   alloc receipt->deposit / receipt->refund -> +X (credit consumed, nothing settled)
//   alloc deposit->refund -> 0 (deposits live outside outstanding)
// personalUsed (per capped person) = the person's unsettled debit items:
//   +gross when their item posts, -X as allocations settle it.

const Debtor = require('./debtor.model');
const CreditAccount = require('./creditAccount.model');
const CreditMemberLimit = require('./creditMemberLimit.model');
const Ledger = require('./ledger.model');
const Receipt = require('./receipt.model');
const Allocation = require('./allocation.model');
const { LEDGER_DOC_KINDS, ALLOCATION_PAIRS } = require('./ar.constants');
// Multicurrency (step 3): every row that enters the ledger is stamped with
// its account currency + the frozen rate + base equivalents through ONE seam.
const { resolveDocumentFx, ledgerFxColumns, amountFxColumns } = require('./arCurrency.service');

// --- money helpers (integer cents) ---
function cents(v) { return Math.round(Number(v || 0) * 100); }
function money(c) { return (c / 100).toFixed(2); }
function bizError(status, message) { const e = new Error(message); e.httpStatus = status; return e; }

function ledgerKindDef(key) { return LEDGER_DOC_KINDS.find((k) => k.key === key); }

// --- locking (fixed order: pool first, then person rows) ---

// Lock the debtor's pool row FOR UPDATE; repair a missing row (pre-slice-1
// data) instead of failing.
async function lockPool(companyId, debtorId, t) {
    let pool = await CreditAccount.findOne({ where: { debtorId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!pool) {
        await CreditAccount.findOrCreate({
            where: { debtorId },
            defaults: { companyId, creditLimit: 0, outstanding: 0 },
            transaction: t,
        });
        pool = await CreditAccount.findOne({ where: { debtorId }, transaction: t, lock: t.LOCK.UPDATE });
    }
    return pool;
}

// Lock the person's cap row (null = uncapped, pool-only). MUST be called after
// lockPool - never the other way around.
async function lockPersonRow(debtorId, memberId, t) {
    if (!memberId) return null;
    return CreditMemberLimit.findOne({
        where: { debtorId, memberId },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
}

async function bumpOutstanding(pool, deltaCents, t) {
    if (!deltaCents) return;
    pool.outstanding = money(cents(pool.outstanding) + deltaCents);
    await pool.save({ transaction: t });
}

// --- allocation core ---

// Available capacity of a credit-side document, in cents.
// Every remaining counter is stored directly (user decision 2026-08-24), so
// capacities are plain reads: ledger/receipt/refund balanceAmount, deposit
// heldAmount (credit side) / balanceAmount still-to-collect (debit side).
function creditCapacity(type, row) {
    if (type === 'receipt') return cents(row.balanceAmount);
    if (type === 'ledger') return cents(row.balanceAmount);
    return cents(row.heldAmount); // deposit held
}

// Open capacity of a debit-side document, in cents.
function debitCapacity(type, row) {
    if (type === 'ledger') return cents(row.balanceAmount);
    if (type === 'refund') return cents(row.balanceAmount);
    return cents(row.balanceAmount); // deposit collection
}

// Move `amountCents` from a credit doc to a debit doc: validates the pair and
// capacities, upserts the unique-pair Allocation row, updates the materialized
// counters on both sides, personalUsed, and the pool outstanding. The caller
// holds the pool lock and the transaction.
async function applyAllocation({ companyId, creditType, creditRow, debitType, debitRow, amountCents, stamps, pool, t }) {
    if (!ALLOCATION_PAIRS.some((p) => p.from === creditType && p.to === debitType)) {
        throw bizError(400, `Allocation ${creditType} -> ${debitType} is not allowed.`);
    }
    if (amountCents <= 0) return 0;
    if (creditCapacity(creditType, creditRow) < amountCents) {
        throw bizError(400, 'Allocation exceeds the source document’s available credit.');
    }
    if (debitCapacity(debitType, debitRow) < amountCents) {
        throw bizError(400, 'Allocation exceeds the target document’s open amount.');
    }

    const [alloc, created] = await Allocation.findOrCreate({
        where: { creditDocType: creditType, creditDocId: creditRow.id, debitDocType: debitType, debitDocId: debitRow.id },
        defaults: { companyId, amount: money(amountCents), ...stamps },
        transaction: t,
    });
    if (!created) {
        alloc.amount = money(cents(alloc.amount) + amountCents);
        if (stamps && stamps.updatedBy) alloc.updatedBy = stamps.updatedBy;
        await alloc.save({ transaction: t });
    }

    // Credit side counters (every balance counts DOWN toward 0).
    if (creditType === 'receipt') {
        creditRow.balanceAmount = money(cents(creditRow.balanceAmount) - amountCents);
        await creditRow.save({ transaction: t });
    } else if (creditType === 'ledger') {
        // balanceAmount counts DOWN (gross at creation -> 0 = settled).
        creditRow.balanceAmount = money(cents(creditRow.balanceAmount) - amountCents);
        if (cents(creditRow.balanceAmount) <= 0) {
            creditRow.status = 'settled';
            await require('./taxLedger.service').syncStatus({ docType: creditRow.docKind, docId: creditRow.id, status: 'settled', t });
        }
        await creditRow.save({ transaction: t });
    } else {
        // Deposit utilization (refund funding): the held balance drops.
        creditRow.heldAmount = money(cents(creditRow.heldAmount) - amountCents);
        maybeCloseDeposit(creditRow);
        await creditRow.save({ transaction: t });
    }

    // Debit side counters (+ personal cap release for settled ledger items).
    if (debitType === 'ledger') {
        debitRow.balanceAmount = money(cents(debitRow.balanceAmount) - amountCents);
        if (cents(debitRow.balanceAmount) <= 0) {
            debitRow.status = 'settled';
            await require('./taxLedger.service').syncStatus({ docType: debitRow.docKind, docId: debitRow.id, status: 'settled', t });
        }
        await debitRow.save({ transaction: t });
        if (debitRow.incurredByMemberId) {
            const person = await lockPersonRow(debitRow.debtorId, debitRow.incurredByMemberId, t);
            if (person) {
                person.personalUsed = money(Math.max(0, cents(person.personalUsed) - amountCents));
                await person.save({ transaction: t });
            }
        }
    } else if (debitType === 'refund') {
        debitRow.balanceAmount = money(cents(debitRow.balanceAmount) - amountCents);
        await debitRow.save({ transaction: t });
    } else {
        // Deposit collection: to-collect drops, the held balance rises.
        debitRow.balanceAmount = money(cents(debitRow.balanceAmount) - amountCents);
        debitRow.heldAmount = money(cents(debitRow.heldAmount) + amountCents);
        await debitRow.save({ transaction: t });
    }

    // Pool outstanding delta (see the invariant table at the top).
    if (creditType === 'receipt' && (debitType === 'deposit' || debitType === 'refund')) {
        await bumpOutstanding(pool, amountCents, t);
    }
    return amountCents;
}

// FIFO: apply a credit document to the debtor's open debit items, oldest
// docDate first. Returns the cents actually allocated.
async function fifoAllocateCredit({ companyId, pool, creditType, creditRow, stamps, t }) {
    let remaining = creditCapacity(creditType, creditRow);
    if (remaining <= 0) return 0;
    const openDebits = await Ledger.findAll({
        where: { debtorId: creditRow.debtorId, mode: 'debit', status: 'open' },
        order: [['docDate', 'ASC'], ['createdAt', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    let applied = 0;
    for (const item of openDebits) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, debitCapacity('ledger', item));
        if (take <= 0) continue;
        await applyAllocation({ companyId, creditType, creditRow, debitType: 'ledger', debitRow: item, amountCents: take, stamps, pool, t });
        remaining -= take;
        applied += take;
    }
    return applied;
}

function maybeCloseDeposit(deposit) {
    // Something was collected (balance below the billed amount) and every
    // collected cent has been utilized (held balance back at zero).
    if (cents(deposit.balanceAmount) < cents(deposit.amount) && cents(deposit.heldAmount) === 0) {
        deposit.status = 'closed';
    }
}

// --- posting ---

// Post a Ledger document (Invoice / Debit Note / Credit Note, or a void
// reversal). `issueDocNo(t)` supplies the number inside the tx (gapless).
// `amounts` carries the tax-snapshot cents: { netC, taxC, grossC,
// taxSchemeCode, taxRate }. For credits, `targetLedger` allocates against one
// specific debit (bypasses FIFO) and `fifo` sweeps the remainder.
// `enforceCredit` is for PRODUCER charges (frontend consumption) - manual
// Finance postings bill reality and are never blocked by the limit.
// Multicurrency: `exchangeRate` is an optional keyed rate (foreign accounts);
// `fx` is an already-resolved { currencyCode, exchangeRate } (void reversals
// reuse the original document's rate so the pair nets to zero in base).
// `analysisColumns` = the six analysis<N>Id values (manual doors validate the
// selections; void reversals copy the original's; system producers may pass
// them later).
async function postLedgerDoc({
    companyId, debtor, docKind, mode = null, reversalOfId = null,
    issueDocNo, docDate, trxDate, transactionTypeId, isInterestChargeable = false,
    description = null, incurredByMemberId = null, sourceModule, sourceRef,
    amounts, stamps = {}, targetLedger = null, fifo = false, enforceCredit = false,
    exchangeRate = null, fx = null, analysisColumns = {}, t,
}) {
    const kind = ledgerKindDef(docKind);
    if (!kind) throw bizError(400, 'Invalid ledger document kind.');
    const rowMode = mode || kind.mode;
    const grossC = amounts.grossC;
    if (grossC <= 0) throw bizError(400, 'Amount must be greater than zero.');

    const fxUsed = fx || await resolveDocumentFx({ companyId, debtor, docDate, requestedRate: exchangeRate, transaction: t });

    const pool = await lockPool(companyId, debtor.id, t);

    if (rowMode === 'debit' && enforceCredit) {
        const available = cents(pool.creditLimit) - cents(pool.outstanding);
        if (grossC > available) throw bizError(402, 'Credit limit exceeded for this debtor.');
        if (incurredByMemberId) {
            const person = await lockPersonRow(debtor.id, incurredByMemberId, t);
            if (person && cents(person.personalUsed) + grossC > cents(person.personalLimit)) {
                throw bizError(402, 'Personal credit limit exceeded for this member.');
            }
        }
    }

    const docNo = await issueDocNo(t);
    const dueDate = rowMode === 'debit'
        ? (Number.isInteger(debtor.terms) ? shiftDate(docDate, debtor.terms) : docDate)
        : null;

    const row = await Ledger.create({
        companyId,
        debtorId: debtor.id,
        docKind,
        mode: rowMode,
        reversalOfId,
        docNo,
        docDate,
        trxDate: trxDate || docDate,
        dueDate,
        transactionTypeId,
        description,
        incurredByMemberId,
        sourceModule,
        sourceRef,
        netAmount: money(amounts.netC),
        taxSchemeCode: amounts.taxSchemeCode || null,
        taxRate: amounts.taxRate != null ? amounts.taxRate : null,
        taxAmount: money(amounts.taxC),
        grossAmount: money(grossC),
        ...ledgerFxColumns(fxUsed, amounts),
        ...analysisColumns,
        isInterestChargeable: rowMode === 'debit' ? !!isInterestChargeable : false,
        balanceAmount: money(grossC),
        status: 'open',
        ...stamps,
    }, { transaction: t });

    if (rowMode === 'debit') {
        await bumpOutstanding(pool, grossC, t);
        if (incurredByMemberId) {
            const person = await lockPersonRow(debtor.id, incurredByMemberId, t);
            if (person) {
                person.personalUsed = money(cents(person.personalUsed) + grossC);
                await person.save({ transaction: t });
            }
        }
    } else {
        await bumpOutstanding(pool, -grossC, t);
        if (targetLedger) {
            const take = Math.min(grossC, debitCapacity('ledger', targetLedger));
            if (take > 0) {
                await applyAllocation({ companyId, creditType: 'ledger', creditRow: row, debitType: 'ledger', debitRow: targetLedger, amountCents: take, stamps, pool, t });
            }
        }
        if (fifo) await fifoAllocateCredit({ companyId, pool, creditType: 'ledger', creditRow: row, stamps, t });
    }

    return row;
}

// Post an EXISTING draft Ledger row (the Save->Submit lifecycle, 2026-08-13):
// same lock discipline and balance effects as postLedgerDoc, but the row was
// created earlier as a non-financial draft. Issues the gapless number now
// (unless a manual number was keyed on the draft), computes dueDate from the
// debtor's CURRENT terms, stamps postedAt/postedBy, and flips to 'open'.
// Credit drafts (CN lifecycle 2026-08-20) then resolve their stored
// allocation intent: the applyToLedgerId target if it is STILL an open debit
// (settled/voided since entry -> skipped, CN stays available credit). No
// FIFO for manual adjustments (user rule) - that is receipt behaviour.
async function postDraftLedger({ companyId, debtor, row, issueDocNo, stamps = {}, t }) {
    if (!['draft', 'pending-approval'].includes(row.status)) {
        throw bizError(400, `Only a draft can be posted (this document is ${row.status}).`);
    }
    const grossC = cents(row.grossAmount);
    if (grossC <= 0) throw bizError(400, 'Amount must be greater than zero.');

    const pool = await lockPool(companyId, debtor.id, t);

    if (!row.docNo) row.docNo = await issueDocNo(t);
    // A draft saved before its account's rate existed (pre-multicurrency, or
    // keyed with no rate in the table yet) gets the rate NOW - frozen from
    // here on. Drafts saved with a rate keep it.
    if (!row.exchangeRate) {
        const fxNow = await resolveDocumentFx({ companyId, debtor, docDate: row.docDate, transaction: t });
        Object.assign(row, ledgerFxColumns(fxNow, { netC: cents(row.netAmount), taxC: cents(row.taxAmount), grossC }));
    }
    row.dueDate = row.mode === 'debit'
        ? (Number.isInteger(debtor.terms) ? shiftDate(row.docDate, debtor.terms) : row.docDate)
        : null;
    row.status = 'open';
    row.postedAt = new Date();
    if (stamps.updatedBy) {
        row.postedBy = stamps.updatedBy;
        row.updatedBy = stamps.updatedBy;
    }
    await row.save({ transaction: t });
    await require('./taxLedger.service').syncStatus({ docType: row.docKind, docId: row.id, status: row.status, t });

    if (row.mode === 'debit') {
        await bumpOutstanding(pool, grossC, t);
        if (row.incurredByMemberId) {
            const person = await lockPersonRow(debtor.id, row.incurredByMemberId, t);
            if (person) {
                person.personalUsed = money(cents(person.personalUsed) + grossC);
                await person.save({ transaction: t });
            }
        }
    } else {
        await bumpOutstanding(pool, -grossC, t);
        if (row.applyToLedgerId) {
            const target = await Ledger.findOne({
                where: { id: row.applyToLedgerId, debtorId: debtor.id, mode: 'debit', status: 'open' },
                transaction: t,
            });
            if (target) {
                const take = Math.min(grossC, debitCapacity('ledger', target));
                if (take > 0) {
                    await applyAllocation({ companyId, creditType: 'ledger', creditRow: row, debitType: 'ledger', debitRow: target, amountCents: take, stamps, pool, t });
                }
            }
        }
    }
    return row;
}

// Post an Official Receipt. Optional deposit collection first (receipt ->
// deposit), then FIFO auto-allocation of the remainder (design: allocate what
// can be at posting time; only true excess stays unallocated).
async function postReceipt({
    companyId, debtor, issueDocNo, docDate, trxDate, paymentMethod, paymentRef,
    description = null, amountC, depositRow = null, autoAllocate = true, stamps = {}, exchangeRate = null, t,
}) {
    if (amountC <= 0) throw bizError(400, 'Amount must be greater than zero.');
    const fx = await resolveDocumentFx({ companyId, debtor, docDate, requestedRate: exchangeRate, transaction: t });
    const pool = await lockPool(companyId, debtor.id, t);
    const docNo = await issueDocNo(t);
    const row = await Receipt.create({
        companyId, debtorId: debtor.id, docKind: 'receipt', mode: 'credit',
        docNo, docDate, trxDate: trxDate || docDate,
        paymentMethod: paymentMethod || null, paymentRef: paymentRef || null, description,
        amount: money(amountC), balanceAmount: money(amountC), status: 'open',
        ...amountFxColumns(fx, amountC),
        ...stamps,
    }, { transaction: t });
    await bumpOutstanding(pool, -amountC, t);

    if (depositRow) {
        const take = Math.min(amountC, debitCapacity('deposit', depositRow));
        if (take <= 0) throw bizError(400, 'The deposit is already fully collected.');
        await applyAllocation({ companyId, creditType: 'receipt', creditRow: row, debitType: 'deposit', debitRow: depositRow, amountCents: take, stamps, pool, t });
    }
    if (autoAllocate) await fifoAllocateCredit({ companyId, pool, creditType: 'receipt', creditRow: row, stamps, t });
    return row;
}

// Post an EXISTING draft Receipt row (receipt lifecycle 2026-08-20): same
// effects as postReceipt but the row was created earlier as a non-financial
// draft. Issues the gapless number if missing, flips to 'open' with the
// posting audit, reduces pool outstanding, then resolves the stored deposit-
// collection intent (deposit closed since entry -> skipped) and FIFO-
// allocates the remainder (receipt behaviour - payments spread oldest-first).
async function postDraftReceipt({ companyId, debtor, row, issueDocNo, stamps = {}, t }) {
    if (row.status !== 'draft') {
        throw bizError(400, `Only a draft can be posted (this receipt is ${row.status}).`);
    }
    const amountC = cents(row.amount);
    if (amountC <= 0) throw bizError(400, 'Amount must be greater than zero.');

    const pool = await lockPool(companyId, debtor.id, t);

    if (!row.docNo) row.docNo = await issueDocNo(t);
    // Rate frozen at save; a draft that predates its account's rate gets it now.
    if (!row.exchangeRate) {
        const fxNow = await resolveDocumentFx({ companyId, debtor, docDate: row.docDate, transaction: t });
        Object.assign(row, amountFxColumns(fxNow, amountC));
    }
    row.status = 'open';
    row.postedAt = new Date();
    if (stamps.updatedBy) {
        row.postedBy = stamps.updatedBy;
        row.updatedBy = stamps.updatedBy;
    }
    await row.save({ transaction: t });
    await bumpOutstanding(pool, -amountC, t);

    if (row.collectDepositId) {
        const Deposit = require('./deposit.model');
        const depositRow = await Deposit.findOne({
            where: { id: row.collectDepositId, debtorId: debtor.id, status: 'open' },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (depositRow) {
            const take = Math.min(amountC, debitCapacity('deposit', depositRow));
            if (take > 0) {
                await applyAllocation({ companyId, creditType: 'receipt', creditRow: row, debitType: 'deposit', debitRow: depositRow, amountCents: take, stamps, pool, t });
            }
        }
    }
    await fifoAllocateCredit({ companyId, pool, creditType: 'receipt', creditRow: row, stamps, t });
    return row;
}

// Post a Refund (money out). A refund must be FULLY funded at posting: from a
// deposit's held balance, or from unallocated receipt credit (oldest first).
async function postRefund({
    companyId, debtor, issueDocNo, docDate, trxDate, paymentMethod, paymentRef,
    description = null, amountC, depositRow = null, stamps = {}, exchangeRate = null, t,
}) {
    if (amountC <= 0) throw bizError(400, 'Amount must be greater than zero.');
    const fx = await resolveDocumentFx({ companyId, debtor, docDate, requestedRate: exchangeRate, transaction: t });
    const pool = await lockPool(companyId, debtor.id, t);
    const docNo = await issueDocNo(t);
    const row = await Receipt.create({
        companyId, debtorId: debtor.id, docKind: 'refund', mode: 'debit',
        docNo, docDate, trxDate: trxDate || docDate,
        paymentMethod: paymentMethod || null, paymentRef: paymentRef || null, description,
        // A refund's balance is its UNFUNDED portion - the funding allocations
        // below must drive it to 0 or the whole posting throws.
        amount: money(amountC), balanceAmount: money(amountC), status: 'open',
        ...amountFxColumns(fx, amountC),
        ...stamps,
    }, { transaction: t });

    if (depositRow) {
        if (creditCapacity('deposit', depositRow) < amountC) {
            throw bizError(400, 'The deposit’s held balance does not cover this refund.');
        }
        await applyAllocation({ companyId, creditType: 'deposit', creditRow: depositRow, debitType: 'refund', debitRow: row, amountCents: amountC, stamps, pool, t });
    } else {
        let remaining = amountC;
        const credits = await Receipt.findAll({
            where: { debtorId: debtor.id, docKind: 'receipt', status: 'open' },
            order: [['docDate', 'ASC'], ['createdAt', 'ASC']],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        for (const c of credits) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, creditCapacity('receipt', c));
            if (take <= 0) continue;
            await applyAllocation({ companyId, creditType: 'receipt', creditRow: c, debitType: 'refund', debitRow: row, amountCents: take, stamps, pool, t });
            remaining -= take;
        }
        if (remaining > 0) {
            throw bizError(400, 'Not enough unallocated credit to fund this refund.');
        }
    }
    return row;
}

// Convert (part of) a deposit's held balance into a Credit Note that knocks
// off outstanding (user rule 2026-08-05). A PROCESS, not an allocation pair:
// the CN carries sourceRef = the deposit; heldAmount drops in the same tx;
// the CN then FIFO-allocates against open debits.
async function convertDeposit({ companyId, debtor, deposit, amountC, transactionTypeId, issueDocNo, docDate, trxDate, stamps = {}, t }) {
    if (amountC <= 0) throw bizError(400, 'Amount must be greater than zero.');
    if (creditCapacity('deposit', deposit) < amountC) {
        throw bizError(400, 'The deposit’s held balance does not cover this conversion.');
    }
    deposit.heldAmount = money(cents(deposit.heldAmount) - amountC);
    maybeCloseDeposit(deposit);
    if (stamps.updatedBy) deposit.updatedBy = stamps.updatedBy;
    await deposit.save({ transaction: t });

    return postLedgerDoc({
        companyId, debtor, docKind: 'credit-note',
        issueDocNo, docDate, trxDate, transactionTypeId,
        description: `Deposit ${deposit.docNo} conversion`,
        sourceModule: 'ar', sourceRef: deposit.id,
        amounts: { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null },
        stamps, fifo: true, t,
    });
}

// Void a Ledger document. Only documents with NO prior allocations are
// voidable (partially settled = correct via Credit Note instead).
//   debit rows  -> a NEW credit-mode row of the same kind (reversalOfId set),
//                  auto-allocated 100% to the original; original -> 'void'.
//   credit rows -> plain flip to 'void' (nothing was applied out).
async function voidLedgerDoc({ companyId, debtor, row, issueDocNo, docDate, trxDate, stamps = {}, t }) {
    if (row.status === 'void') throw bizError(400, 'This document is already void.');
    if (cents(row.balanceAmount) !== cents(row.grossAmount)) {
        throw bizError(400, 'This document has allocations - correct it with a Credit Note instead of voiding.');
    }
    if (row.mode === 'debit') {
        const reversal = await postLedgerDoc({
            companyId, debtor, docKind: row.docKind, mode: 'credit', reversalOfId: row.id,
            issueDocNo, docDate, trxDate, transactionTypeId: row.transactionTypeId,
            description: `Void of ${row.docNo}`,
            incurredByMemberId: row.incurredByMemberId,
            sourceModule: 'ar', sourceRef: row.docNo,
            amounts: {
                netC: cents(row.netAmount), taxC: cents(row.taxAmount), grossC: cents(row.grossAmount),
                taxSchemeCode: row.taxSchemeCode, taxRate: row.taxRate,
            },
            // The reversal reuses the ORIGINAL rate so the pair nets to zero in
            // base currency too (a pre-multicurrency row resolves normally),
            // and carries the original's analysis dimensions so per-dimension
            // reports net the pair out.
            fx: row.exchangeRate ? { currencyCode: row.currencyCode, exchangeRate: Number(row.exchangeRate), isBase: Number(row.exchangeRate) === 1 } : null,
            analysisColumns: require('./arAnalysis.service').copyColumns(row),
            stamps, targetLedger: row, t,
        });
        // The reversal mirrors the original's frozen tax breakdown (same
        // amounts, same rate - ar.TaxLedger lines are copied, never requoted).
        await require('./taxLedger.service').copyTaxLines({ fromRow: row, toRow: reversal, stamps, t });
        row.status = 'void';
        if (stamps.updatedBy) row.updatedBy = stamps.updatedBy;
        await row.save({ transaction: t });
        await require('./taxLedger.service').syncStatus({ docType: row.docKind, docId: row.id, status: 'void', t });
        return reversal;
    }
    const pool = await lockPool(companyId, debtor.id, t);
    row.status = 'void';
    if (stamps.updatedBy) row.updatedBy = stamps.updatedBy;
    await row.save({ transaction: t });
    await require('./taxLedger.service').syncStatus({ docType: row.docKind, docId: row.id, status: 'void', t });
    await bumpOutstanding(pool, cents(row.grossAmount), t);

    // A deposit-conversion CN (sourceModule 'ar', sourceRef = the Deposit id)
    // dropped heldAmount as a PROCESS, not an allocation - voiding it must
    // give the deposit its money back (and reopen a closed deposit). The held
    // balance can never exceed what was collected (amount - balanceAmount).
    if (row.docKind === 'credit-note' && row.sourceModule === 'ar') {
        const Deposit = require('./deposit.model');
        const deposit = await Deposit.findOne({ where: { id: row.sourceRef, companyId }, transaction: t, lock: t.LOCK.UPDATE });
        if (deposit) {
            const collectedC = cents(deposit.amount) - cents(deposit.balanceAmount);
            deposit.heldAmount = money(Math.min(collectedC, cents(deposit.heldAmount) + cents(row.grossAmount)));
            if (deposit.status === 'closed' && cents(deposit.heldAmount) > 0) {
                deposit.status = 'open';
            }
            if (stamps.updatedBy) deposit.updatedBy = stamps.updatedBy;
            await deposit.save({ transaction: t });
        }
    }
    return null;
}

// Void an Official Receipt (no allocations only). Refunds are not voidable -
// money already left; bring it back with a new receipt.
async function voidReceipt({ companyId, row, stamps = {}, t }) {
    if (row.status === 'void') throw bizError(400, 'This receipt is already void.');
    if (row.docKind !== 'receipt') throw bizError(400, 'Refunds cannot be voided - post a new Official Receipt instead.');
    if (cents(row.balanceAmount) !== cents(row.amount)) {
        throw bizError(400, 'This receipt has allocations - it can no longer be voided.');
    }
    const pool = await lockPool(companyId, row.debtorId, t);
    row.status = 'void';
    if (stamps.updatedBy) row.updatedBy = stamps.updatedBy;
    await row.save({ transaction: t });
    await bumpOutstanding(pool, cents(row.amount), t);
}

// Void a Deposit that has collected nothing.
async function voidDeposit({ row, stamps = {}, t }) {
    if (row.status === 'void') throw bizError(400, 'This deposit is already void.');
    if (cents(row.balanceAmount) !== cents(row.amount)) {
        throw bizError(400, 'This deposit has collections and cannot be voided.');
    }
    row.status = 'void';
    if (stamps.updatedBy) row.updatedBy = stamps.updatedBy;
    await row.save({ transaction: t });
}

// ADVISORY credit precheck (the arGateway authorizeCharge seam). Read-only, no
// locks - enforcement is the posting tx's own locked re-check.
async function authorizeCharge({ companyId, debtorId = null, debtorType = null, sourceId = null, incurredByMemberId = null, amount }) {
    const where = debtorId ? { id: debtorId, companyId } : { companyId, debtorType, sourceId };
    const debtor = await Debtor.findOne({ where });
    if (!debtor) return { authorized: false, reason: 'No ledger account exists for this debtor.' };
    if (debtor.status !== 'active') return { authorized: false, reason: `Debtor account is ${debtor.status}.` };

    const pool = await CreditAccount.findOne({ where: { debtorId: debtor.id } });
    const amountC = cents(amount);
    const limitC = pool ? cents(pool.creditLimit) : 0;
    const outstandingC = pool ? cents(pool.outstanding) : 0;
    if (amountC > limitC - outstandingC) {
        return { authorized: false, reason: 'Credit limit exceeded.', debtorId: debtor.id, available: money(Math.max(0, limitC - outstandingC)) };
    }
    if (incurredByMemberId) {
        const person = await CreditMemberLimit.findOne({ where: { debtorId: debtor.id, memberId: incurredByMemberId } });
        if (person && amountC > cents(person.personalLimit) - cents(person.personalUsed)) {
            return {
                authorized: false,
                reason: 'Personal credit limit exceeded.',
                debtorId: debtor.id,
                available: money(Math.max(0, cents(person.personalLimit) - cents(person.personalUsed))),
            };
        }
    }
    return { authorized: true, debtorId: debtor.id, available: money(limitC - outstandingC) };
}

// date-only string + days -> date-only string (local, no TZ math).
function shiftDate(dateStr, days) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const dt = new Date(y, m - 1, d + (days || 0));
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${dt.getFullYear()}-${mm}-${dd}`;
}

module.exports = {
    cents,
    money,
    bizError,
    lockPool,
    applyAllocation,
    fifoAllocateCredit,
    postLedgerDoc,
    postDraftLedger,
    postReceipt,
    postDraftReceipt,
    postRefund,
    convertDeposit,
    voidLedgerDoc,
    voidReceipt,
    voidDeposit,
    authorizeCharge,
    shiftDate,
};
