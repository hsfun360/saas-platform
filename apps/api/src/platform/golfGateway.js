// src/platform/golfGateway.js
//
// PLATFORM SEAM: other services -> Golf Management (2026-10-16). The
// Membership service's affiliated visits book a golf flight when a letter of
// introduction is confirmed, and its club record picks a golf player type
// and a golf fee item; everything crosses here, never by requiring the golf
// models. In-process today; WHEN SPLIT each call becomes an HTTP request to
// internalServiceUrl('golf'). A gateway WRITE (bookForVisit, cancel) is the
// same shape as arGateway.postCharge: the caller's transaction is honoured
// in-process and becomes a sagas-style call when the service splits.

// The affiliate-base player types (the club's "billed as" picker).
async function listAffiliatePlayerTypes(companyId) {
    // WHEN SPLIT: GET {internalServiceUrl('golf')}/internal/player-types?base=affiliate
    const playerTypes = require('../modules/golf/playerType.service');
    return (await playerTypes.catalog(companyId)).filter((t) => t.baseIdentity === 'affiliate')
        .map((t) => ({ id: t.id, code: t.code, description: t.description, isActive: t.isActive, requiresApproval: t.requiresApproval }));
}

// One player type by id (code, base, approval flag) or null.
async function getPlayerType(companyId, id) {
    const playerTypes = require('../modules/golf/playerType.service');
    const t = (await playerTypes.catalog(companyId)).find((x) => x.id === id);
    return t ? { id: t.id, code: t.code, description: t.description, baseIdentity: t.baseIdentity, isActive: t.isActive, requiresApproval: t.requiresApproval } : null;
}

// Flat-priced golf transaction types a visit fee may be (miscellaneous).
async function listVisitFeeTypes(companyId) {
    // WHEN SPLIT: GET {internalServiceUrl('golf')}/internal/transaction-types?chargeType=miscellaneous
    const GolfTransactionType = require('../modules/golf/transactionType.model');
    const rows = await GolfTransactionType.findAll({ where: { companyId, chargeType: 'miscellaneous' }, attributes: ['id', 'transactionType', 'description', 'isActive'], order: [['transactionType', 'ASC']] });
    return rows.map((t) => ({ id: t.id, transactionType: t.transactionType, description: t.description, isActive: t.isActive }));
}

// Active courses (the visit form's course picker).
async function listCourses(companyId) {
    const Course = require('../modules/golf/course.model');
    const rows = await Course.findAll({ where: { companyId, isActive: true }, attributes: ['id', 'courseCode', 'description'], order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']] });
    return rows.map((c) => ({ id: c.id, courseCode: c.courseCode, description: c.description }));
}

// Preview the flight a visit would book (availability + the club's rights).
async function previewVisitFlight(companyId, visit, { transaction } = {}) {
    const svc = require('../modules/golf/visitBooking.service');
    return svc.findFlight(companyId, visit, { transaction });
}

// Book the visit's golf under the visitor's identity (inside `transaction`).
async function bookForVisit(req, companyId, visit, opts) {
    const svc = require('../modules/golf/visitBooking.service');
    return svc.bookForVisit(req, companyId, visit, opts);
}

async function cancelVisitBooking(companyId, bookingProfileId, opts) {
    const svc = require('../modules/golf/visitBooking.service');
    return svc.cancelVisitBooking(companyId, bookingProfileId, opts);
}

async function bookingNoOf(bookingProfileId) {
    const svc = require('../modules/golf/visitBooking.service');
    return svc.bookingNoOf(bookingProfileId);
}

async function bookingFullySettled(companyId, bookingProfileId, opts) {
    const svc = require('../modules/golf/visitBooking.service');
    return svc.bookingFullySettled(companyId, bookingProfileId, opts);
}

module.exports = {
    listAffiliatePlayerTypes, getPlayerType, listVisitFeeTypes, listCourses,
    previewVisitFlight, bookForVisit, cancelVisitBooking, bookingNoOf, bookingFullySettled,
};
