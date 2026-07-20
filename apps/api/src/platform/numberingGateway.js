// src/platform/numberingGateway.js
//
// INTER-SERVICE SEAM for Numbering Control (Control-Plane owned). Product systems
// (Membership member numbers now; prospect / golf / facility later) ask HERE for
// the caller's active-company numbering behaviour instead of touching the
// NumberingScheme model directly - same discipline as taxGateway.js.
//
// In-process today; when the Control Plane is split out, swap these bodies for an
// HTTP call and callers never change.

const { getUserContext } = require('./serviceContext');

// The configured mode for a purpose in the caller's active company:
// 'auto' | 'manual' | null (no scheme configured -> caller decides its default).
async function getMode(req, purpose) {
    const { companyId } = getUserContext(req);
    if (!companyId) return null;
    const NumberingScheme = require('../modules/saas/numberingScheme.model');
    const scheme = await NumberingScheme.findOne({
        where: { companyId, purpose, isActive: true },
        attributes: ['mode'],
    });
    return scheme ? scheme.mode : null;
}

// Issue the next number for a purpose in the caller's active company. Returns:
//   null                     - no scheme configured
//   { manual: true }         - scheme is manual (caller collects the number)
//   { number, seq }          - the generated number
// `opts.typeCode` fills the {TYPE} token (the membership type's category code).
// `opts.transaction` - pass the caller's BUSINESS transaction for GAPLESS
// numbering: the counter then rolls back with a failed create, so the number
// is never burned (see numberingGenerator.issue).
async function issueNumber(req, purpose, opts = {}) {
    const { companyId } = getUserContext(req);
    if (!companyId) return null;
    const { sequelize } = require('./db');
    const NumberingScheme = require('../modules/saas/numberingScheme.model');
    const generator = require('../modules/saas/numberingGenerator');
    const result = await generator.issue(NumberingScheme, sequelize, {
        companyId,
        purpose,
        typeCode: opts.typeCode,
        transaction: opts.transaction,
    });
    if (result && result.manual) return { manual: true };
    return result; // null | { number, seq }
}

module.exports = { getMode, issueNumber };
