// Affiliated visits (user decisions 2026-10-15; HOST side only) - the Letter
// of Introduction flow for members of affiliated associations and reciprocal
// clubs. They never book or walk in like a guest: the office records the
// incoming letter as a visit, confirms (or declines) it, the confirmation
// finds or creates the visitor's golfer identity and books the golf part as
// an ordinary flight booking under that identity (every seat-level rule of
// the tee sheet applies), the desk ticks the letter and the ID on arrival
// before the player can be registered, and the visit completes when every
// bill of its registrations is settled. A club or player type that requires
// approval routes Confirm through the Workflow engine first.
//
// The pure pieces (visitCapWindow, periodOf, facilitiesText) are unit-tested.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement, canModifyRecord, annotateCanModify, getCompanyProfile } = require('../../platform/serviceContext');
const { emailAddress, notifyUser } = require('../../platform/notificationGateway');
const { companyTimezoneById, classifyDateRangeForCompany } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const workflowGateway = require('../../platform/workflowGateway');
const availability = require('./bookingAvailability.service');
const shared = require('./bookingShared');
const playerTypes = require('./playerType.service');
const { VISIT_STATUSES, OPEN_VISIT_STATUS_KEYS, COUNTED_VISIT_STATUS_KEYS, VISIT_FACILITIES, VISIT_FACILITY_KEYS } = require('./affiliatedVisit.constants');
const { AFFILIATED_CLUB_KINDS } = require('./affiliatedClub.constants');
const Visit = require('./affiliatedVisit.model');
const AffiliatedClub = require('./affiliatedClub.model');
const OtherGolfer = require('./otherGolfer.model');
const Golfer = require('./golfer.model');
const Course = require('./course.model');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const Bill = require('./bill.model');

const PURPOSE = 'golf-affiliated-visit';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function fail(message, status = 400) {
    return { error: message, status };
}
function str(v, max = 255) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function dateText(dateOnly) {
    return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---- pure rules ------------------------------------------------------------

// The calendar period that holds `date`: [from, to] inclusive, 'YYYY-MM-DD'.
function visitCapWindow(period, date) {
    const d = new Date(`${date}T00:00:00Z`);
    if (period === 'week') {
        const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // ISO: Monday = 1
        const from = new Date(d.getTime() - (dow - 1) * 86400000);
        const to = new Date(from.getTime() + 6 * 86400000);
        return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    if (period === 'month') {
        const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
        return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    return { from: `${d.getUTCFullYear()}-01-01`, to: `${d.getUTCFullYear()}-12-31` };
}

// The requested facilities as one sentence for emails and the listing.
function facilitiesText(facilities, { golf = true } = {}) {
    const f = facilities || {};
    const parts = [];
    if (golf && f.golf) parts.push(`Golf: ${f.golf.holes || 18} holes${f.golf.teeTime ? ' at ' + f.golf.teeTime : ''}`);
    for (const key of ['dining', 'accommodation', 'other']) {
        if (f[key]) parts.push(`${key.charAt(0).toUpperCase()}${key.slice(1)}: ${f[key]}`);
    }
    return parts.join('; ');
}

// ---- validation ----------------------------------------------------------

// Normalise the request body against the club's terms. Returns { value } or
// { error }. `existing` = the visit being edited (its own count is excluded
// from the cap).
async function normalize(companyId, body, { existing = null } = {}) {
    const club = await AffiliatedClub.findOne({ where: { companyId, id: String(body.affiliatedClubId || '') } });
    if (!club) return fail('Pick the visitor\'s home club.');
    if (club.isActive === false) return fail(`${club.name} is disabled - the arrangement is no longer in force.`);
    const visitorName = str(body.visitorName);
    if (!visitorName) return fail('Key in the visiting member\'s name as the letter states it.');
    const visitorMemberNo = str(body.visitorMemberNo, 50);
    if (!visitorMemberNo) return fail(`Key in the visitor's membership number at ${club.name}.`);
    const visitDate = str(body.visitDate, 10);
    if (!visitDate || !DATE_RE.test(visitDate)) return fail('Pick the visit date.');
    const alternateDate = str(body.alternateDate, 10);
    if (alternateDate && !DATE_RE.test(alternateDate)) return fail('The alternate date must be a date.');
    if (club.agreementFrom && visitDate < String(club.agreementFrom)) return fail(`The arrangement with ${club.name} starts on ${dateText(club.agreementFrom)}.`);
    if (club.agreementTo && visitDate > String(club.agreementTo)) return fail(`The arrangement with ${club.name} ended on ${dateText(club.agreementTo)}.`);
    const visitorEmail = str(body.visitorEmail);
    if (visitorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail)) return fail('The visitor\'s email is not a valid address.');

    const raw = body.facilities && typeof body.facilities === 'object' ? body.facilities : {};
    const facilities = {};
    let golf = null;
    if (raw.golf && typeof raw.golf === 'object') {
        const holes = Number(raw.golf.holes);
        if (![9, 18].includes(holes)) return fail('Golf: pick 9 or 18 holes.');
        const teeTime = str(raw.golf.teeTime, 5);
        if (teeTime && !TIME_RE.test(teeTime)) return fail('Golf: the preferred tee time must be HH:MM.');
        const courseId = str(raw.golf.courseId, 64);
        if (courseId) {
            const course = await Course.findOne({ where: { companyId, id: courseId, isActive: true }, attributes: ['id'] });
            if (!course) return fail('Golf: pick an active course.');
        }
        golf = { courseId, teeTime, holes };
    }
    facilities.golf = golf;
    for (const key of VISIT_FACILITY_KEYS) {
        if (key === 'golf') continue;
        facilities[key] = str(raw[key]);
    }
    const playerCount = golf ? Number(body.playerCount) : 1;
    if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 10) return fail('The golf party must be between 1 and 10 players, the visitor included.');
    const guestCount = golf ? Number(body.guestCount === undefined || body.guestCount === null || body.guestCount === '' ? 0 : body.guestCount) : 0;
    if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount >= playerCount) return fail('Guests must be fewer than the party (the visitor is not a guest).');
    if (club.maxGuestsPerVisit !== null && club.maxGuestsPerVisit !== undefined && guestCount > club.maxGuestsPerVisit) {
        return fail(club.maxGuestsPerVisit === 0 ? `${club.name} members may not bring guests.` : `${club.name} members may bring at most ${club.maxGuestsPerVisit} guest(s) per visit.`);
    }

    // The per-player visit cap over the club's calendar period.
    let visitsThisPeriod = 1;
    if (club.maxVisitsPerPlayer) {
        const w = visitCapWindow(club.maxVisitsPeriod || 'year', visitDate);
        const where = {
            companyId, affiliatedClubId: club.id, visitorMemberNo: { [Op.iLike]: visitorMemberNo },
            status: { [Op.in]: COUNTED_VISIT_STATUS_KEYS }, visitDate: { [Op.gte]: w.from, [Op.lte]: w.to },
        };
        if (existing) where.id = { [Op.ne]: existing.id };
        const prior = await Visit.count({ where });
        visitsThisPeriod = prior + 1;
        if (visitsThisPeriod > club.maxVisitsPerPlayer) {
            return fail(`${visitorName} already has ${prior} visit(s) from ${club.name} in this ${club.maxVisitsPeriod || 'year'} - the arrangement allows ${club.maxVisitsPerPlayer}.`);
        }
    }

    return {
        value: {
            affiliatedClubId: club.id,
            visitorName, visitorMemberNo,
            visitorIdentityNo: str(body.visitorIdentityNo, 50),
            visitorMobile: str(body.visitorMobile, 30),
            visitorEmail,
            loiReference: str(body.loiReference, 100),
            loiDocumentUrl: str(body.loiDocumentUrl, 500),
            visitDate, alternateDate,
            facilities, playerCount, guestCount,
            remarks: str(body.remarks),
        },
        club,
        visitsThisPeriod,
    };
}

// ---- create / update / decline / cancel -------------------------------------

async function create(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const n = await normalize(companyId, body);
    if (n.error) return n;
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
    const row = await sequelize.transaction(async (transaction) => {
        const issued = await numberingGateway.issueNumber(req, 'golf-visit', { transaction });
        let visitNo = null;
        if (issued && issued.number) visitNo = issued.number;
        else if (issued && issued.manual) {
            visitNo = str(body.visitNo, 50);
            if (!visitNo) throw Object.assign(new Error('The Visit No. scheme is manual - key in a visit number.'), { httpStatus: 400 });
        } else {
            throw Object.assign(new Error('Configure the Visit No. numbering scheme first (Golf Management -> Numbering Control).'), { httpStatus: 400 });
        }
        return Visit.create({ companyId, visitNo, status: 'requested', ...n.value, ...stamps }, { transaction });
    }).catch((err) => {
        if (err && err.httpStatus) return { error: err.message, status: err.httpStatus };
        throw err;
    });
    if (row.error) return row;
    return { message: `Visit ${row.visitNo} recorded for ${row.visitorName} (${n.club.name}) on ${dateText(row.visitDate)}.`, visit: await dto(row) };
}

async function load(req, id) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const row = await Visit.findOne({ where: { companyId, id } });
    if (!row) return fail('Visit not found.', 404);
    return { row, companyId };
}

async function update(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (row.status !== 'requested') return fail(`Visit ${row.visitNo} is ${row.status} - only a requested visit can be edited.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const n = await normalize(companyId, body, { existing: row });
    if (n.error) return n;
    Object.assign(row, n.value);
    row.updatedBy = getUserContext(req).userId;
    await row.save();
    return { message: `Visit ${row.visitNo} updated.`, visit: await dto(row) };
}

async function decline(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row } = l;
    if (!['requested', 'pending-approval'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status} and cannot be declined.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const reason = str(body.reason);
    if (!reason) return fail('Give the reason for declining the visit.');
    await sequelize.transaction(async (transaction) => {
        if (row.status === 'pending-approval') await workflowGateway.cancelForEntity('GolfAffiliatedVisit', row.id, transaction);
        await applyDecline(row, reason, { transaction, userId: getUserContext(req).userId });
    });
    return { message: `Visit ${row.visitNo} declined.`, visit: await dto(row) };
}

// Mark declined + email the visitor and the home club (inside the caller's tx).
async function applyDecline(row, reason, { transaction, userId }) {
    row.status = 'declined';
    row.declinedAt = new Date();
    row.declineReason = reason;
    row.workflowInstanceId = null;
    row.updatedBy = userId;
    await row.save({ transaction });
    const club = await AffiliatedClub.findOne({ where: { id: row.affiliatedClubId }, transaction });
    const company = await getCompanyProfile(row.companyId);
    const data = {
        visitorName: row.visitorName, clubName: club ? club.name : '', visitNo: row.visitNo,
        visitDateText: dateText(row.visitDate), reason, companyName: company ? company.name : '',
    };
    for (const to of [row.visitorEmail, club && club.contactEmail]) {
        if (to) await emailAddress({ templateKey: 'golf.visit.declined', companyId: row.companyId, to, data, transaction });
    }
}

async function cancel(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (!['requested', 'pending-approval', 'confirmed'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status} and cannot be cancelled.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const reason = str(body.reason);
    if (!reason) return fail('Give the reason for cancelling the visit.');
    const callerId = getUserContext(req).userId;
    const out = await sequelize.transaction(async (transaction) => {
        if (row.status === 'pending-approval') await workflowGateway.cancelForEntity('GolfAffiliatedVisit', row.id, transaction);
        if (row.bookingProfileId) {
            const profile = await BookingProfile.findOne({ where: { companyId, id: row.bookingProfileId }, transaction });
            if (profile && profile.status === 'booked') {
                const registered = await Player.count({ where: { bookingProfileId: profile.id, status: 'registered' }, transaction });
                if (registered) return fail(`Visit ${row.visitNo} has registered players - cancel their registrations at the desk first.`, 409);
                profile.status = 'cancelled';
                profile.cancelledAt = new Date();
                profile.cancelledBy = callerId;
                profile.updatedBy = callerId;
                await profile.save({ transaction });
                await Player.update({ status: 'cancelled', updatedBy: callerId }, { where: { bookingProfileId: profile.id, status: 'booked' }, transaction });
            }
        }
        row.status = 'cancelled';
        row.cancelledAt = new Date();
        row.cancelReason = reason;
        row.workflowInstanceId = null;
        row.updatedBy = callerId;
        await row.save({ transaction });
        return {};
    });
    if (out.error) return out;
    return { message: `Visit ${row.visitNo} cancelled.`, visit: await dto(row) };
}

// ---- confirm ----------------------------------------------------------------

// What Confirm will do (the preview the office sees): the flight to be
// booked, the party, the visitor identity, and whether approval runs first.
async function preview(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (!['requested'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status}.`);
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId } });
    if (!club) return fail('The visitor\'s home club no longer exists.', 409);
    const types = await playerTypes.catalog(companyId);
    const type = types.find((t) => t.id === club.playerTypeId) || null;
    const n = await normalize(companyId, { ...row.get({ plain: true }), facilities: row.facilities }, { existing: row });
    if (n.error) return n;
    const needsApproval = club.requiresApproval === true || (type && type.requiresApproval === true);
    const chain = needsApproval ? await workflowGateway.previewChain(req, PURPOSE, await approvalContext(companyId, row, club)) : null;
    let flight = null;
    const golf = row.facilities && row.facilities.golf;
    if (golf) {
        const f = await findFlight(companyId, row, golf);
        if (f.error) return f;
        flight = f.flight;
    }
    return {
        visit: await dto(row),
        playerType: type ? { code: type.code, description: type.description } : null,
        needsApproval,
        chain,
        flight,
        visitsThisPeriod: n.visitsThisPeriod,
        summary: summaryOf(row, club, flight, needsApproval, chain),
    };
}

function summaryOf(row, club, flight, needsApproval, chain) {
    const parts = [];
    if (flight) parts.push(`books ${flight.courseName} at ${flight.teeTime}${flight.crossTime ? ' (crossover ' + flight.crossTime + ')' : ''}, ${flight.holes} holes, ${row.playerCount} player(s) on ${dateText(row.visitDate)}`);
    else if (row.facilities && row.facilities.golf) parts.push('books no flight (no course or tee time on the request)');
    else parts.push('books no golf');
    parts.push(`${row.visitorName} is recorded as a ${club.name} member and billed as ${club.code}`);
    const head = needsApproval
        ? (chain && chain.steps && chain.steps.length ? `Confirming routes the visit through ${chain.steps.length} approval step(s) first; on approval it ` : 'No approval chain is configured, so confirming ')
        : 'Confirming ';
    return `${head}${parts.join('; ')}.`;
}

// Context the approval chain's conditions can test.
async function approvalContext(companyId, row, club) {
    const days = await classifyDateRangeForCompany(companyId, row.visitDate, row.visitDate);
    const n = await normalize(companyId, { ...row.get({ plain: true }), facilities: row.facilities }, { existing: row });
    const f = row.facilities || {};
    return {
        clubKind: club.kind, clubCode: club.code,
        dayType: days.length ? days[0].dayType : 'weekday',
        playerCount: row.playerCount, guestCount: row.guestCount,
        visitsThisPeriod: n.error ? 1 : n.visitsThisPeriod,
        facilities: VISIT_FACILITY_KEYS.filter((k) => f[k]).join(','),
    };
}

// Resolve the requested course + tee time to a bookable flight for the party
// (the booking channel's own availability: slot roles, closures, holds,
// capacity under the merge rule, minimum players).
async function findFlight(companyId, row, golf, { transaction } = {}) {
    if (!golf.courseId || !golf.teeTime) return fail('Golf: the request needs a course and a tee time before it can be confirmed - edit the visit.');
    const course = await Course.findOne({ where: { companyId, id: golf.courseId, isActive: true }, transaction });
    if (!course) return fail('Golf: the requested course is no longer active.');
    const days = await classifyDateRangeForCompany(companyId, row.visitDate, row.visitDate);
    const dayType = days.length ? days[0].dayType : 'weekday';
    const { setting, minRules } = await availability.loadRules(companyId);
    const ctx = await availability.dayContext(companyId, row.visitDate, dayType, { transaction });
    const [occ, locks] = await Promise.all([
        availability.occupancy(companyId, row.visitDate, { transaction, ctx }),
        availability.activeLockCells(companyId, row.visitDate, { transaction }),
    ]);
    const result = await availability.courseFlights({
        course, ctx, playDate: row.visitDate, dayType, holes: golf.holes, players: row.playerCount, setting, minRules, occ, locks,
    });
    if (!result) return fail(`No tee sheet is configured for ${course.courseCode} on ${dateText(row.visitDate)}.`);
    const flight = result.flights.find((x) => x.teeTime === golf.teeTime);
    if (!flight) {
        const near = availability.nearestFlights(result.flights, golf.teeTime, 3).map((x) => x.teeTime).join(', ');
        return fail(`${course.courseCode} ${golf.teeTime} cannot take ${row.playerCount} player(s) on ${dateText(row.visitDate)}${near ? ' - nearest available: ' + near : ''}. Edit the visit's tee time.`, 409);
    }
    return {
        flight: {
            courseId: course.id, courseCode: course.courseCode, courseName: `${course.courseCode}${course.description ? ' - ' + course.description : ''}`,
            teeTime: flight.teeTime, crossTime: flight.crossTime || null, holes: golf.holes, seatsLeft: flight.seatsLeft, dayType,
        },
        course, dayType, setting,
    };
}

// Confirm: approval first when the club or its player type requires it,
// else confirm at once.
async function confirm(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (row.status !== 'requested') return fail(`Visit ${row.visitNo} is ${row.status}.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId } });
    if (!club) return fail('The visitor\'s home club no longer exists.', 409);
    const types = await playerTypes.catalog(companyId);
    const type = types.find((t) => t.id === club.playerTypeId) || null;
    if (!type || type.baseIdentity !== 'affiliate' || type.isActive === false) return fail(`${club.name} has no active affiliate player type - fix the club record first.`);
    const n = await normalize(companyId, { ...row.get({ plain: true }), facilities: row.facilities }, { existing: row });
    if (n.error) return n;
    const needsApproval = club.requiresApproval === true || type.requiresApproval === true;
    const callerId = getUserContext(req).userId;
    const out = await sequelize.transaction(async (transaction) => {
        if (needsApproval) {
            const wf = await workflowGateway.startWorkflow(req, PURPOSE, {
                entityId: row.id, entityLabel: `Visit ${row.visitNo} - ${row.visitorName} (${club.name})`,
                context: await approvalContext(companyId, row, club), transaction,
            });
            if (wf) {
                row.status = 'pending-approval';
                row.workflowInstanceId = wf.instanceId;
                row.updatedBy = callerId;
                await row.save({ transaction });
                return { pending: true };
            }
        }
        return applyConfirmation(row, { transaction, userId: callerId, req });
    });
    if (out.error) return out;
    if (out.pending) return { message: `Visit ${row.visitNo} submitted for approval.`, visit: await dto(row) };
    return { message: `Visit ${row.visitNo} confirmed${out.bookingNo ? ' - booking ' + out.bookingNo : ''}.`, visit: await dto(row) };
}

// The confirmation itself (inside a transaction; also the approval handler's
// path, where `req` is absent and numbers issue by company).
async function applyConfirmation(row, { transaction, userId, req = null }) {
    const companyId = row.companyId;
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId }, transaction });
    if (!club) return fail('The visitor\'s home club no longer exists.', 409);
    const types = await playerTypes.catalog(companyId, { transaction });
    const type = types.find((t) => t.id === club.playerTypeId) || null;
    if (!type) return fail(`${club.name} has no affiliate player type.`);
    const placement = req ? await getCallerPlacement(req) : { departmentId: null };
    const stamps = { createdBy: userId, createdByDepartmentId: placement.departmentId, updatedBy: userId };

    // The visitor's identity: dedupe like a walk-in guest (identity no, then
    // mobile, then the same club + number), stamped with the affiliation.
    let profile = null;
    if (row.visitorIdentityNo) profile = await OtherGolfer.findOne({ where: { companyId, identityNo: row.visitorIdentityNo }, transaction });
    if (!profile && row.visitorMobile) profile = await OtherGolfer.findOne({ where: { companyId, mobile: row.visitorMobile }, transaction });
    if (!profile) profile = await OtherGolfer.findOne({ where: { companyId, affiliatedClubId: club.id, affiliationNo: { [Op.iLike]: row.visitorMemberNo } }, transaction });
    if (profile) {
        if (!profile.identityNo && row.visitorIdentityNo) profile.identityNo = row.visitorIdentityNo;
        if (!profile.mobile && row.visitorMobile) profile.mobile = row.visitorMobile;
        if (!profile.email && row.visitorEmail) profile.email = row.visitorEmail;
        profile.affiliatedClubId = club.id;
        profile.affiliationNo = row.visitorMemberNo;
        profile.updatedBy = userId;
        await profile.save({ transaction });
    } else {
        profile = await OtherGolfer.create({
            companyId, name: row.visitorName, identityNo: row.visitorIdentityNo, mobile: row.visitorMobile, email: row.visitorEmail,
            affiliatedClubId: club.id, affiliationNo: row.visitorMemberNo, ...stamps,
        }, { transaction });
    }
    const [golfer] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'other', sourceId: profile.id },
        defaults: { companyId, golferType: 'other', sourceId: profile.id, name: profile.name, ...stamps },
        transaction,
    });

    // The golf part: an ordinary flight booking under the visitor.
    let bookingNo = null;
    let flight = null;
    const golf = row.facilities && row.facilities.golf;
    if (golf) {
        await shared.advisoryLock(transaction, companyId, row.visitDate);
        const f = await findFlight(companyId, row, golf, { transaction });
        if (f.error) return f;
        flight = f.flight;
        const issued = req
            ? await numberingGateway.issueNumber(req, 'golf-booking', { transaction })
            : await numberingGateway.issueNumberForCompany(companyId, 'golf-booking', { transaction });
        if (!issued || !issued.number) return fail('Configure the Booking No. numbering scheme (auto-generate) first - a visit books under it.');
        bookingNo = issued.number;
        const profileRow = await BookingProfile.create({
            companyId, bookingNo, bookingType: 'flight', courseId: f.course.id, playDate: row.visitDate,
            bookerGolferId: golfer.id, contactMobile: row.visitorMobile, remarks: `Affiliated visit ${row.visitNo} - ${club.name}`,
            status: 'booked', ...stamps,
        }, { transaction });
        const base = Date.now();
        const lines = [{ playerType: type.code, golferId: golfer.id, playerName: row.visitorName, memberNo: null }];
        for (let i = 1; i < row.playerCount; i += 1) {
            const guest = i <= row.guestCount;
            lines.push({ playerType: guest ? 'guest' : type.code, golferId: null, playerName: guest ? `Guest of ${row.visitorName}` : `${club.code} member ${i + 1}`, memberNo: null });
        }
        for (let i = 0; i < lines.length; i += 1) {
            const l = lines[i];
            const common = {
                companyId, bookingProfileId: profileRow.id, courseId: f.course.id, playDate: row.visitDate,
                playerType: l.playerType, golferId: l.golferId, playerName: l.playerName, memberNo: null, status: 'booked', ...stamps,
            };
            const first = await Player.create({
                ...common, secondNineFlag: 0, unitCourseId: f.course.firstNineId, teeTime: flight.teeTime, createdAt: new Date(base + i * 2),
            }, { transaction });
            if (flight.crossTime) {
                await Player.create({
                    ...common, secondNineFlag: 1, firstNinePlayerId: first.id, unitCourseId: f.course.secondNineId, teeTime: flight.crossTime, createdAt: new Date(base + i * 2 + 1),
                }, { transaction });
            }
        }
        row.bookingProfileId = profileRow.id;
    }

    row.golferId = golfer.id;
    row.status = 'confirmed';
    row.confirmedAt = new Date();
    row.confirmedBy = userId;
    row.workflowInstanceId = null;
    row.updatedBy = userId;
    await row.save({ transaction });

    const company = await getCompanyProfile(companyId);
    const data = {
        visitorName: row.visitorName, clubName: club.name, visitNo: row.visitNo, visitDateText: dateText(row.visitDate),
        golfText: flight ? `${flight.courseName} at ${flight.teeTime}, ${flight.holes} holes, ${row.playerCount} player(s) (booking ${bookingNo})` : '',
        facilitiesText: facilitiesText(row.facilities, { golf: false }),
        arrivalText: 'Please present your letter of introduction, your home club membership card and a passport or ID at the front desk.',
        settlementText: club.allowChargeToHomeClub ? `Charges may be signed back to ${club.name} where the arrangement provides for it.` : 'All charges are settled before you leave the club.',
        companyName: company ? company.name : '',
    };
    for (const to of [row.visitorEmail, club.contactEmail]) {
        if (to) await emailAddress({ templateKey: 'golf.visit.confirmed', companyId, to, data, transaction });
    }
    if (!req && row.createdBy) {
        await notifyUser({
            userId: row.createdBy, companyId, type: 'golf.visit.confirmed', title: `Visit ${row.visitNo} approved and confirmed`,
            body: `${row.visitorName} (${club.name}) on ${dateText(row.visitDate)}${bookingNo ? ' - booking ' + bookingNo : ''}.`,
            linkRoute: '/golf/affiliated-visits', transaction,
        }).catch(() => {});
    }
    return { bookingNo };
}

// ---- desk: arrival, completion, the day's tags -------------------------------

// The desk ticks the letter and the ID; only then can the player register.
async function arrive(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row } = l;
    if (row.status !== 'confirmed') return fail(`Visit ${row.visitNo} is ${row.status} - only a confirmed visit can be received.`);
    if (body.letterSighted !== true) return fail('Tick that the letter of introduction was sighted.');
    if (body.idSighted !== true) return fail('Tick that the home club card and ID were sighted.');
    const callerId = getUserContext(req).userId;
    row.status = 'arrived';
    row.arrivedAt = new Date();
    row.letterSightedBy = callerId;
    row.idSightedBy = callerId;
    row.updatedBy = callerId;
    await row.save();
    return { message: `${row.visitorName} received - visit ${row.visitNo} may register.`, visit: await dto(row) };
}

// The registration gate: a booked player whose booking belongs to a visit
// registers only once the visit is arrived. Returns an error string or null.
async function registrationGate(companyId, bookingProfileId, { transaction } = {}) {
    if (!bookingProfileId) return null;
    const visit = await Visit.findOne({ where: { companyId, bookingProfileId }, attributes: ['id', 'visitNo', 'status', 'visitorName'], transaction });
    if (!visit) return null;
    if (visit.status === 'arrived' || visit.status === 'completed') return null;
    if (visit.status === 'confirmed') return `Visit ${visit.visitNo}: record ${visit.visitorName}'s arrival first (letter of introduction and ID sighted).`;
    return `Visit ${visit.visitNo} is ${visit.status} - this player cannot register.`;
}

// After a settlement: complete the visit once every registered player of its
// booking has a settled bill.
async function completeIfSettled(companyId, bookingProfileId, { transaction } = {}) {
    if (!bookingProfileId) return null;
    const visit = await Visit.findOne({ where: { companyId, bookingProfileId, status: 'arrived' }, transaction });
    if (!visit) return null;
    const registered = await Player.findAll({ where: { bookingProfileId, secondNineFlag: 0, status: 'registered' }, attributes: ['id'], transaction });
    if (!registered.length) return null;
    const settled = await Bill.count({ where: { companyId, playerId: { [Op.in]: registered.map((r) => r.id) }, status: 'settled' }, transaction });
    if (settled < registered.length) return null;
    visit.status = 'completed';
    visit.completedAt = new Date();
    await visit.save({ transaction });
    return visit;
}

async function complete(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row } = l;
    if (row.status !== 'arrived') return fail(`Visit ${row.visitNo} is ${row.status} - only an arrived visit completes.`);
    row.status = 'completed';
    row.completedAt = new Date();
    row.updatedBy = getUserContext(req).userId;
    await row.save();
    return { message: `Visit ${row.visitNo} completed.`, visit: await dto(row) };
}

// The visit behind each booking of a day (the tee sheet's tag).
async function byBooking(companyId, bookingProfileIds, { transaction } = {}) {
    const map = new Map();
    if (!bookingProfileIds.length) return map;
    const rows = await Visit.findAll({
        where: { companyId, bookingProfileId: { [Op.in]: bookingProfileIds } },
        attributes: ['id', 'visitNo', 'status', 'bookingProfileId', 'visitorName'], transaction,
    });
    for (const r of rows) map.set(r.bookingProfileId, { id: r.id, visitNo: r.visitNo, status: r.status, visitorName: r.visitorName });
    return map;
}

// Worker tick: open visits whose date is past (club-local) expire.
async function scanVisits() {
    const due = await Visit.findAll({ where: { status: { [Op.in]: ['requested', 'pending-approval', 'confirmed'] } }, attributes: ['id', 'companyId', 'visitDate', 'visitNo', 'visitorName', 'createdBy', 'status', 'bookingProfileId'] });
    let expired = 0;
    for (const row of due) {
        const tz = await companyTimezoneById(row.companyId);
        const today = availability.clubNow(tz).date;
        if (String(row.visitDate) >= today) continue;
        await sequelize.transaction(async (transaction) => {
            if (row.status === 'pending-approval') await workflowGateway.cancelForEntity('GolfAffiliatedVisit', row.id, transaction);
            await Visit.update({ status: 'expired', expiredAt: new Date(), workflowInstanceId: null }, { where: { id: row.id, status: row.status }, transaction });
        });
        expired += 1;
        if (row.createdBy) {
            await notifyUser({
                userId: row.createdBy, companyId: row.companyId, type: 'golf.visit.expired',
                title: `Visit ${row.visitNo} expired`, body: `${row.visitorName}'s visit on ${dateText(row.visitDate)} passed without arrival.`,
                linkRoute: '/golf/affiliated-visits',
            }).catch(() => {});
        }
    }
    if (expired) console.log(`[GOLF VISIT] ${expired} visit(s) expired.`);
    return { expired };
}

// ---- listing ----------------------------------------------------------------

async function list(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status && VISIT_STATUSES.some((s) => s.key === query.status)) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
        where.visitDate = {};
        if (query.dateFrom) where.visitDate[Op.gte] = String(query.dateFrom);
        if (query.dateTo) where.visitDate[Op.lte] = String(query.dateTo);
    }
    if (query.affiliatedClubId) where.affiliatedClubId = String(query.affiliatedClubId);
    const rows = await Visit.findAll({ where, order: [['visitDate', 'ASC'], ['createdAt', 'ASC']], limit: 500 });
    await annotateCanModify(req, rows);
    const visits = [];
    for (const r of rows) visits.push(await dto(r));
    return { visits, statuses: VISIT_STATUSES };
}

async function get(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    return { visit: await dto(l.row) };
}

// The pickers the screen needs: active clubs (with their terms), courses,
// the vocabularies.
async function meta(req) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const [clubs, courses] = await Promise.all([
        AffiliatedClub.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
        Course.findAll({ where: { companyId, isActive: true }, attributes: ['id', 'courseCode', 'description'], order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']] }),
    ]);
    return {
        clubs: clubs.map((c) => ({
            id: c.id, code: c.code, name: c.name, kind: c.kind, agreementFrom: c.agreementFrom, agreementTo: c.agreementTo,
            maxGuestsPerVisit: c.maxGuestsPerVisit, maxVisitsPerPlayer: c.maxVisitsPerPlayer, maxVisitsPeriod: c.maxVisitsPeriod,
            requiresApproval: c.requiresApproval === true, allowChargeToHomeClub: c.allowChargeToHomeClub === true, contactEmail: c.contactEmail,
        })),
        courses: courses.map((c) => ({ id: c.id, courseCode: c.courseCode, description: c.description })),
        statuses: VISIT_STATUSES,
        facilities: VISIT_FACILITIES,
        kinds: AFFILIATED_CLUB_KINDS,
    };
}

const clubCache = new Map();
async function clubSnapshot(companyId, clubId) {
    const key = `${companyId}|${clubId}`;
    if (!clubCache.has(key) || Date.now() - clubCache.get(key).at > 60000) {
        const c = await AffiliatedClub.findOne({ where: { companyId, id: clubId }, attributes: ['id', 'code', 'name', 'kind', 'allowChargeToHomeClub'] });
        clubCache.set(key, { at: Date.now(), club: c ? { id: c.id, code: c.code, name: c.name, kind: c.kind, allowChargeToHomeClub: c.allowChargeToHomeClub === true } : null });
    }
    return clubCache.get(key).club;
}

async function dto(r) {
    const club = await clubSnapshot(r.companyId, r.affiliatedClubId);
    let bookingNo = null;
    if (r.bookingProfileId) {
        const p = await BookingProfile.findOne({ where: { id: r.bookingProfileId }, attributes: ['bookingNo', 'status'] });
        bookingNo = p ? p.bookingNo : null;
    }
    return {
        id: r.id,
        visitNo: r.visitNo,
        affiliatedClubId: r.affiliatedClubId,
        club,
        status: r.status,
        visitorName: r.visitorName,
        visitorMemberNo: r.visitorMemberNo,
        visitorIdentityNo: r.visitorIdentityNo,
        visitorMobile: r.visitorMobile,
        visitorEmail: r.visitorEmail,
        golferId: r.golferId,
        loiReference: r.loiReference,
        loiDocumentUrl: r.loiDocumentUrl,
        visitDate: r.visitDate,
        alternateDate: r.alternateDate,
        facilities: r.facilities || {},
        facilitiesText: facilitiesText(r.facilities),
        playerCount: r.playerCount,
        guestCount: r.guestCount,
        bookingProfileId: r.bookingProfileId,
        bookingNo,
        confirmedAt: r.confirmedAt,
        declinedAt: r.declinedAt,
        declineReason: r.declineReason,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        expiredAt: r.expiredAt,
        arrivedAt: r.arrivedAt,
        completedAt: r.completedAt,
        remarks: r.remarks,
        createdAt: r.createdAt,
        isOpen: OPEN_VISIT_STATUS_KEYS.includes(r.status),
        canModify: r.get ? r.get('canModify') : undefined,
    };
}

module.exports = {
    visitCapWindow, facilitiesText, dateText,
    create, update, decline, cancel, preview, confirm, applyConfirmation, applyDecline,
    arrive, registrationGate, completeIfSettled, complete, byBooking, scanVisits,
    list, get, meta, dto,
};
