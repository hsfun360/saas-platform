// Caddy Rounds (slice 3, 2026-10-18) - the rounds-of-service report the club
// settles caddy pay from OUTSIDE the system (user decision 2026-10-17: pay
// outside, but every round is tracked). One row per caddy over a date range
// from golf.CaddyAssignment: rounds counted (completed, or swapped with a
// reason that counts) vs not counted (a complaint swap), 9H / 18H rounds,
// holes served, golfers served, rounds requested by name, plus the detail.

const { Op } = require('sequelize');
const { getUserContext } = require('../../platform/serviceContext');
const availability = require('./bookingAvailability.service');
const GolfCaddy = require('./caddy.model');
const GolfCaddyGrade = require('./caddyGrade.model');
const GolfCaddyGroup = require('./caddyGroup.model');
const GolfCaddyAssignment = require('./caddyAssignment.model');
const GolfCaddyAssignmentPlayer = require('./caddyAssignmentPlayer.model');
const Course = require('./course.model');
const { SWAP_REASONS } = require('./caddy.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message, status = 400) {
    return { error: message, status };
}

// PURE: does a closed assignment count as a round of service?
function roundCounts(a) {
    if (a.status === 'completed') return true;
    if (a.status === 'swapped') return a.countsAsRound === true;
    return false;
}

// PURE: fold closed assignments into per-caddy totals.
function summarise(assignments) {
    const byCaddy = new Map();
    for (const a of assignments) {
        if (!byCaddy.has(a.caddyId)) {
            byCaddy.set(a.caddyId, { caddyId: a.caddyId, caddyNo: a.caddyNo, rounds: 0, roundsNotCounted: 0, rounds9: 0, rounds18: 0, holesServed: 0, golfersServed: 0, requestedByName: 0, open: 0 });
        }
        const t = byCaddy.get(a.caddyId);
        if (a.status === 'assigned') { t.open += 1; continue; }
        if (roundCounts(a)) {
            t.rounds += 1;
            if (Number(a.holes) === 9) t.rounds9 += 1; else t.rounds18 += 1;
            if (a.requestedByName) t.requestedByName += 1;
        } else {
            t.roundsNotCounted += 1;
        }
        t.holesServed += Number(a.holesPlayed || 0);
        t.golfersServed += (a.players || []).length;
    }
    return [...byCaddy.values()].sort((x, y) => String(x.caddyNo).localeCompare(String(y.caddyNo)));
}

function totalsOf(rows) {
    return rows.reduce((acc, r) => ({
        caddies: acc.caddies + 1, rounds: acc.rounds + r.rounds, roundsNotCounted: acc.roundsNotCounted + r.roundsNotCounted,
        rounds9: acc.rounds9 + r.rounds9, rounds18: acc.rounds18 + r.rounds18, holesServed: acc.holesServed + r.holesServed,
        golfersServed: acc.golfersServed + r.golfersServed, requestedByName: acc.requestedByName + r.requestedByName, open: acc.open + r.open,
    }), { caddies: 0, rounds: 0, roundsNotCounted: 0, rounds9: 0, rounds18: 0, holesServed: 0, golfersServed: 0, requestedByName: 0, open: 0 });
}

// GET /caddy-rounds?dateFrom&dateTo&caddyId
async function report(req, query) {
    const companyId = getUserContext(req).companyId || null;
    if (!companyId) return fail('Select a workspace first.');
    const dateFrom = String(query.dateFrom || '');
    const dateTo = String(query.dateTo || '');
    if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) return fail('Pick the date range.');
    if (dateFrom > dateTo) return fail('The from date is after the to date.');
    const where = { companyId, playDate: { [Op.between]: [dateFrom, dateTo] } };
    if (query.caddyId) where.caddyId = String(query.caddyId);
    const [assignments, caddies, courses] = await Promise.all([
        GolfCaddyAssignment.findAll({ where, include: [{ model: GolfCaddyAssignmentPlayer, as: 'players', attributes: ['playerId', 'playerName', 'memberNo'] }], order: [['playDate', 'ASC'], ['teeTime', 'ASC'], ['assignedAt', 'ASC']] }),
        GolfCaddy.findAll({ where: { companyId }, include: [{ model: GolfCaddyGrade, as: 'grade', attributes: ['code', 'name'] }, { model: GolfCaddyGroup, as: 'group', attributes: ['code', 'name'] }], attributes: ['id', 'caddyNo', 'name', 'status'] }),
        Course.findAll({ where: { companyId }, attributes: ['id', 'courseCode'] }),
    ]);
    const caddyById = new Map(caddies.map((c) => [c.id, c]));
    const courseById = new Map(courses.map((c) => [c.id, c.courseCode]));
    const reasonLabel = (key) => (SWAP_REASONS.find((r) => r.key === key) || {}).label || key || null;
    const rows = summarise(assignments).map((t) => {
        const c = caddyById.get(t.caddyId);
        return {
            ...t,
            caddyName: c ? c.name : null,
            caddyStatus: c ? c.status : null,
            grade: c && c.grade ? { code: c.grade.code, name: c.grade.name } : null,
            group: c && c.group ? { code: c.group.code, name: c.group.name } : null,
        };
    });
    return {
        dateFrom, dateTo,
        rows,
        totals: totalsOf(rows),
        detail: assignments.map((a) => ({
            id: a.id, caddyId: a.caddyId, caddyNo: a.caddyNo, playDate: a.playDate, teeTime: a.teeTime ? availability.hhmm(a.teeTime) : null,
            courseCode: courseById.get(a.courseId) || null, holes: Number(a.holes), holesPlayed: a.holesPlayed === null ? null : Number(a.holesPlayed),
            status: a.status, counts: a.status === 'assigned' ? null : roundCounts(a), requestedByName: a.requestedByName === true,
            swapReason: a.swapReason || null, swapReasonLabel: a.swapReason ? reasonLabel(a.swapReason) : null, swapHole: a.swapHole,
            assignedAt: a.assignedAt, completedAt: a.completedAt,
            players: (a.players || []).map((p) => ({ playerName: p.playerName, memberNo: p.memberNo || null })),
        })),
        caddies: caddies.map((c) => ({ id: c.id, caddyNo: c.caddyNo, name: c.name, status: c.status })).sort((x, y) => x.caddyNo.localeCompare(y.caddyNo)),
    };
}

module.exports = { roundCounts, summarise, totalsOf, report };
