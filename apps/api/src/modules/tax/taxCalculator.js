// Pure tax calculator - the single source of truth for how tax is computed, shared
// by every product system through the tax gateway. No DB, no I/O: it takes a resolved
// set of rate components + an amount + the scheme's inclusive/exclusive flag, and
// returns a fully-computed breakdown that a consumer snapshots onto its transaction.
//
// The rules (pinned via dry-run with the product owner - see docs/systems/tax.md):
//
//  Rounding: half-up to 2 decimals on every amount.
//
//  Priority = tier. Components sharing a taxPriority form a tier and run in PARALLEL
//  (all tax the same base entering the tier; they never tax each other). Tiers apply
//  in ASCENDING priority order, cascading: the next tier's base = the running total
//  so far (original amount + all prior tiers' rounded tax). This gives tax-on-tax
//  (e.g. service charge at p1, then SST at p2 taxing base + service charge).
//
//  EXCLUSIVE: the amount is the net base; taxes add on top. Gross = base + all tax.
//
//  INCLUSIVE: the amount is the tax-inclusive gross; we back out net + tax.
//    net = round2(gross / D), where D = product over tiers of (1 + tierRateSum).
//    Then cascade forward from that clean net; a 1-sen rounding residual (gross minus
//    the forward-computed gross) is absorbed by the LARGEST tax line in the highest
//    tier (ties -> first by input order). So net stays the correctly-rounded taxable
//    value, and net + tax = gross exactly.
//
//  Claimable (input-tax credit; output-only, never changes net/gross):
//    claimableAmount = round2(taxAmount x claimPercentage / 100),
//    nonClaimableAmount = taxAmount - claimableAmount.

// Half-up to 2 decimals, robust against binary-float representation (e.g. 2.925 must
// round to 2.93, not 2.92). Rounds on magnitude so it is half-away-from-zero.
function round2(x) {
    const sign = x < 0 ? -1 : 1;
    return (sign * Math.round(Math.abs(x) * 100 * (1 + Number.EPSILON))) / 100;
}

// Group components into tiers by taxPriority, tiers ascending, input order preserved
// within a tier (needed for the residual tie-break and for stable display).
function toTiers(components) {
    const byPriority = new Map();
    components.forEach((c, index) => {
        const key = c.taxPriority;
        if (!byPriority.has(key)) byPriority.set(key, []);
        byPriority.get(key).push({ ...c, _index: index });
    });
    return [...byPriority.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([taxPriority, items]) => ({ taxPriority, items }));
}

// Build one output line for a component given the base its tier taxed and its rounded
// tax amount. Claimable is derived from the (possibly residual-adjusted) tax amount.
function toLine(c, taxableAmount, taxAmount) {
    const claimableAmount = c.isClaimable ? round2((taxAmount * Number(c.claimPercentage || 0)) / 100) : 0;
    return {
        taxCode: c.taxCode,
        taxRate: Number(c.taxRate),
        taxPriority: c.taxPriority,
        taxableAmount: round2(taxableAmount),
        taxAmount: round2(taxAmount),
        isClaimable: !!c.isClaimable,
        claimPercentage: Number(c.claimPercentage || 0),
        claimableAmount,
        nonClaimableAmount: round2(taxAmount - claimableAmount),
        glAccountCode: c.glAccountCode || null,
    };
}

// Cascade forward from a net base through the tiers, producing a raw line per
// component (tax rounded, claimable NOT yet finalised so the caller can still adjust
// the residual). Returns { lines, gross } where gross = net + sum of tax.
function cascade(net, tiers) {
    let running = net;
    const lines = [];
    for (const tier of tiers) {
        const tierBase = running;
        let tierTax = 0;
        for (const c of tier.items) {
            const taxAmount = round2((tierBase * Number(c.taxRate)) / 100);
            lines.push({ c, tier: tier.taxPriority, taxableAmount: tierBase, taxAmount });
            tierTax = round2(tierTax + taxAmount);
        }
        running = round2(running + tierTax);
    }
    return { lines, gross: running };
}

// Sum of a tier's rates as a fraction (e.g. two 10% lines -> 0.20).
function tierRateFraction(tier) {
    return tier.items.reduce((s, c) => s + Number(c.taxRate) / 100, 0);
}

// computeTax({ amount, ieFlag, components }) -> breakdown.
//  amount     : the transaction amount (net base if EXCLUSIVE, gross if INCLUSIVE).
//  ieFlag     : 'EXCLUSIVE' | 'INCLUSIVE'.
//  components : [{ taxCode, taxRate, taxPriority, isClaimable, claimPercentage, glAccountCode? }]
//               already resolved + active (e.g. from taxResolver).
function computeTax({ amount, ieFlag, components }) {
    const amt = round2(Number(amount) || 0);
    const list = Array.isArray(components) ? components : [];

    // No tax defined -> the amount is both net and gross.
    if (list.length === 0) {
        return { ieFlag, net: amt, taxTotal: 0, gross: amt, claimableTotal: 0, nonClaimableTotal: 0, lines: [] };
    }

    const tiers = toTiers(list);
    const inclusive = ieFlag === 'INCLUSIVE';

    // Net base: given directly for exclusive; backed out of the gross for inclusive.
    let net;
    if (inclusive) {
        const divisor = tiers.reduce((p, t) => p * (1 + tierRateFraction(t)), 1);
        net = round2(amt / divisor);
    } else {
        net = amt;
    }

    const { lines: raw, gross: forwardGross } = cascade(net, tiers);

    // Inclusive: reconcile the rounding residual so net + tax = the actual gross.
    if (inclusive) {
        const residual = round2(amt - forwardGross);
        if (residual !== 0) {
            const topPriority = tiers[tiers.length - 1].taxPriority;
            const topLines = raw.filter((l) => l.tier === topPriority);
            // Largest tax amount in the top tier; ties -> first by input order.
            let target = topLines[0];
            for (const l of topLines) {
                if (l.taxAmount > target.taxAmount) target = l;
            }
            target.taxAmount = round2(target.taxAmount + residual);
        }
    }

    const lines = raw.map((l) => toLine(l.c, l.taxableAmount, l.taxAmount));
    const taxTotal = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
    const claimableTotal = round2(lines.reduce((s, l) => s + l.claimableAmount, 0));

    return {
        ieFlag,
        net,
        taxTotal,
        gross: round2(net + taxTotal),
        claimableTotal,
        nonClaimableTotal: round2(taxTotal - claimableTotal),
        lines,
    };
}

module.exports = { computeTax, round2 };
