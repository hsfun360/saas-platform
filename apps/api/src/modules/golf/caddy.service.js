// Caddy register rules shared by the controller (and, from slice 2, the
// caddy station): leave-range overlap, "on leave on a date", DTOs.

const crypto = require('crypto');
const { Op } = require('sequelize');
const GolfCaddyLeave = require('./caddyLeave.model');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function newQrToken() {
    return crypto.randomBytes(16).toString('hex');
}

// PURE: do two inclusive date ranges overlap?
function rangesOverlap(aFrom, aTo, bFrom, bTo) {
    return aFrom <= bTo && bFrom <= aTo;
}

// PURE: the leave rows (of ONE caddy) that overlap [dateFrom, dateTo],
// excluding `selfId` (an edit never clashes with itself).
function overlappingLeaves(leaves, dateFrom, dateTo, selfId = null) {
    return (leaves || []).filter((l) => l.id !== selfId && rangesOverlap(String(l.dateFrom), String(l.dateTo), dateFrom, dateTo));
}

// PURE: is the caddy on leave on `date` given its leave rows?
function onLeaveOn(leaves, date) {
    return (leaves || []).some((l) => String(l.dateFrom) <= date && date <= String(l.dateTo));
}

// The caddy ids on leave on `date` (one query for a listing).
async function caddyIdsOnLeave(companyId, date, { transaction } = {}) {
    const rows = await GolfCaddyLeave.findAll({
        where: { companyId, dateFrom: { [Op.lte]: date }, dateTo: { [Op.gte]: date } },
        attributes: ['caddyId', 'leaveType'],
        transaction,
    });
    return new Map(rows.map((r) => [r.caddyId, r.leaveType]));
}

function leaveDto(l) {
    return {
        id: l.id,
        caddyId: l.caddyId,
        leaveType: l.leaveType,
        dateFrom: l.dateFrom,
        dateTo: l.dateTo,
        remarks: l.remarks || null,
    };
}

function noteDto(n) {
    return {
        id: n.id,
        caddyId: n.caddyId,
        noteDate: n.noteDate,
        kind: n.kind,
        points: Number(n.points) || 0,
        description: n.description,
        followUp: n.followUp || null,
    };
}

module.exports = { DATE_RE, newQrToken, rangesOverlap, overlappingLeaves, onLeaveOn, caddyIdsOnLeave, leaveDto, noteDto };
