// Numbering Control - pure render + counter logic, shared by the maintenance
// screen (preview) and the issuing gateway (real numbers). No HTTP/model
// coupling here beyond the row shape.

// The reset period a date belongs to, per the scheme's resetRule. null = never.
function periodTag(resetRule, date) {
    const y = date.getFullYear();
    if (resetRule === 'annually') return String(y);
    if (resetRule === 'monthly') return `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return null;
}

// Render a number from a scheme + a sequence value. `{TYPE}` is filled from
// opts.typeCode (the membership type code, supplied at creation time).
function renderNumber(scheme, seq, opts = {}) {
    const date = opts.date || new Date();
    const pad = Math.max(0, Number(scheme.seqPadLength) || 0);
    const yyyy = String(date.getFullYear());
    const tokens = {
        '{PREFIX}': scheme.prefix || '',
        '{SEQ}': String(seq).padStart(pad, '0'),
        '{YYYY}': yyyy,
        '{YY}': yyyy.slice(-2),
        '{MM}': String(date.getMonth() + 1).padStart(2, '0'),
        '{TYPE}': (opts.typeCode || '').toString().toUpperCase(),
    };
    const fmt = scheme.format || '{PREFIX}{SEQ}';
    return fmt.replace(/\{PREFIX\}|\{SEQ\}|\{YYYY\}|\{YY\}|\{MM\}|\{TYPE\}/g, (m) => tokens[m] ?? '');
}

// The sequence that WOULD be issued next (no state change), honouring a period
// roll-over. Used by the preview endpoint.
function peekNextSeq(scheme, date) {
    const d = date || new Date();
    const newPeriod = periodTag(scheme.resetRule, d);
    const rolled = newPeriod !== null && scheme.currentPeriod !== newPeriod;
    const cur = rolled ? scheme.startingNumber - 1 : scheme.currentNumber;
    return cur >= scheme.startingNumber ? cur + 1 : scheme.startingNumber;
}

// Preview the next number for a (possibly unsaved) scheme draft. `{TYPE}` uses a
// sample when the format references it, so the shape is visible on the screen.
function previewNext(scheme, opts = {}) {
    const date = opts.date || new Date();
    const seq = peekNextSeq(scheme, date);
    const typeCode = opts.typeCode || ((scheme.format || '').includes('{TYPE}') ? 'ORD' : '');
    return { seq, number: renderNumber(scheme, seq, { typeCode, date }) };
}

// Issue the next number, advancing the counter ATOMICALLY (SELECT ... FOR
// UPDATE row lock). Returns:
//   null                      - no scheme configured for (company, purpose)
//   { manual: true, scheme }  - scheme is manual (caller collects the number)
//   { number, seq }           - the generated number
//
// GAPLESS RULE: pass the caller's BUSINESS transaction as `transaction`. The
// counter then commits/rolls back WITH the record that consumes the number, so
// a failed create rewinds the counter and the number is never burned. The row
// lock is held until that transaction ends, briefly serialising creates per
// (company, purpose) - the standard gapless-numbering trade-off. Without
// `transaction` the issue commits on its own (a failure AFTER it burns the
// number - only acceptable for callers that cannot supply a transaction).
async function issue(NumberingScheme, sequelize, { companyId, purpose, typeCode, date, transaction } = {}) {
    const run = async (t) => {
        const scheme = await NumberingScheme.findOne({
            where: { companyId, purpose },
            lock: t.LOCK.UPDATE,
            transaction: t,
        });
        if (!scheme) return null;
        if (scheme.mode !== 'auto') return { manual: true, scheme };

        const d = date || new Date();
        const newPeriod = periodTag(scheme.resetRule, d);
        if (newPeriod !== null && scheme.currentPeriod !== newPeriod) {
            scheme.currentNumber = scheme.startingNumber - 1;
            scheme.currentPeriod = newPeriod;
        }
        const seq = scheme.currentNumber >= scheme.startingNumber ? scheme.currentNumber + 1 : scheme.startingNumber;
        scheme.currentNumber = seq;
        await scheme.save({ transaction: t });

        return { number: renderNumber(scheme, seq, { typeCode, date: d }), seq };
    };
    if (transaction) return run(transaction);
    return sequelize.transaction(run);
}

module.exports = { periodTag, renderNumber, peekNextSeq, previewNext, issue };
