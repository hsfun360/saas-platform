// Affiliated visits (user decisions 2026-10-15 / 16; the Membership
// Department's desk) - the Letter of Introduction flow in both directions.
//
//   INBOUND  - a partner club's member visits us. The office records the
//              incoming letter, confirms (or declines) it; the confirmation
//              creates the visitor's golfer identity and books the golf part
//              through platform/golfGateway.js (an ordinary flight booking
//              under that identity - every tee-sheet rule and the club's
//              playing rights apply). A letter may cover SEVERAL days
//              (visitDate .. visitDateTo, 2026-11-14): the visitor registers
//              at the Registration Counter on each day they come (letter and
//              ID sighted the first time, ID after that) and receives that
//              day's pass - registrationCounter.service owns that step. Each
//              such day is one visit against the club's limits; the days
//              still to come on an open letter are held against them. Golf
//              hangs off the letter one flight per play day
//              (membership.AffiliatedVisitFlight), and the letter completes
//              after its last day once no flight still owes a bill. A club
//              or player type that requires approval routes Confirm through
//              the Workflow engine first.
//   OUTBOUND - our member visits the partner. The office keys the request,
//              the member's standing is checked (status action control),
//              ISSUE numbers the letter from the same series and emails it
//              to the partner's contact and the member; the visit counts
//              against the member's cap with that club.
//
// The pure pieces (visitCapWindow, facilitiesText, daysBetween, countedDays)
// are unit-tested.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement, canModifyRecord, annotateCanModify, getCompanyProfile } = require('../../platform/serviceContext');
const { emailAddress, notifyUser } = require('../../platform/notificationGateway');
const { companyTimezoneById, classifyDateRangeForCompany } = require('../../platform/calendarGateway');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const numberingGateway = require('../../platform/numberingGateway');
const workflowGateway = require('../../platform/workflowGateway');
const golfGateway = require('../../platform/golfGateway');
const {
    VISIT_DIRECTIONS, VISIT_DIRECTION_KEYS, VISIT_STATUSES, OPEN_VISIT_STATUS_KEYS, COUNTED_VISIT_STATUS_KEYS, VISIT_FACILITIES, VISIT_FACILITY_KEYS,
} = require('./affiliatedVisit.constants');
const { AFFILIATED_CLUB_KINDS } = require('./affiliatedClub.constants');
const Visit = require('./affiliatedVisit.model');
const Flight = require('./affiliatedVisitFlight.model');
const AffiliatedClub = require('./affiliatedClub.model');
const GuestRegistration = require('./guestRegistration.model');

const PURPOSE = 'membership-affiliated-visit';
const ENTITY_TYPE = 'MembershipAffiliatedVisit';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
// A letter covers at most this many days (a stay, not a season).
const MAX_LETTER_DAYS = 31;

function fail(message, status = 400) {
    return { error: message, status };
}
function str(v, max = 255) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function dateText(dateOnly) {
    return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function clubNow(timezone, at = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(at);
}
async function clubToday(companyId) {
    return clubNow(await companyTimezoneById(companyId));
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

// The last day of a letter ('YYYY-MM-DD'): its own date when it covers one day.
function lastDayOf(visit) {
    return String(visit.visitDateTo || visit.visitDate);
}

// Every day from `from` to `to` inclusive, 'YYYY-MM-DD'.
function daysBetween(from, to) {
    const out = [];
    const end = new Date(`${to}T00:00:00Z`).getTime();
    for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end && out.length < 400; t += 86400000) {
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
}

// "14 Nov 2026" or "14 Nov 2026 to 16 Nov 2026".
function dateRangeText(visit) {
    const last = lastDayOf(visit);
    return last === String(visit.visitDate) ? dateText(visit.visitDate) : `${dateText(visit.visitDate)} to ${dateText(last)}`;
}

// The days of ONE letter that count against the club's limits on `today`
// (user decision 2026-11-14: each day counts). `visit` = { direction, status,
// visitDate, visitDateTo, arrivedOn }; `attended` = the days the visitor
// registered at the Registration Counter.
//   outbound            - every day of the letter (we cannot see attendance).
//   inbound, not yet in - the days still to come (held so the office cannot
//                         over-promise); a day that passed without the visitor
//                         is given back.
//   inbound, arrived    - the days attended plus the days still to come.
//   inbound, completed  - the days attended.
// A letter received before the counter existed has no attended days on
// record: its arrival day (`arrivedOn`) stands in for them.
function countedDays(visit, attended, today) {
    if (!COUNTED_VISIT_STATUS_KEYS.includes(visit.status)) return [];
    const days = daysBetween(String(visit.visitDate), lastDayOf(visit));
    if (visit.direction === 'outbound') return days;
    const came = new Set((attended || []).map(String));
    if (!came.size && visit.arrivedOn) came.add(String(visit.arrivedOn));
    if (visit.status === 'completed') return [...came].sort();
    const out = new Set(days.filter((d) => d >= today));
    if (visit.status === 'arrived') for (const d of came) out.add(d);
    return [...out].sort();
}

// The requested facilities as one sentence for emails and the listing.
function facilitiesText(facilities, { golf = true } = {}) {
    const f = facilities || {};
    const parts = [];
    if (golf && f.golf) parts.push(`Golf: ${f.golf.holes || 18} holes${f.golf.teeTime ? ' at ' + f.golf.teeTime : ''}${f.golf.playDate ? ' on ' + dateText(f.golf.playDate) : ''}`);
    for (const key of ['dining', 'accommodation', 'sports', 'other']) {
        if (f[key]) parts.push(`${key.charAt(0).toUpperCase()}${key.slice(1)}: ${f[key]}`);
    }
    return parts.join('; ');
}

// ---- validation ----------------------------------------------------------

// Normalise the request body against the club's terms. Returns { value,
// club, visitsThisPeriod, clubVisitsThisYear } or { error }. `existing` =
// the visit being edited (its own count is excluded from the caps).
async function normalize(companyId, body, { existing = null } = {}) {
    const direction = existing ? existing.direction : (VISIT_DIRECTION_KEYS.includes(body.direction) ? body.direction : 'inbound');
    const club = await AffiliatedClub.findOne({ where: { companyId, id: String(body.affiliatedClubId || '') } });
    if (!club) return fail(direction === 'outbound' ? 'Pick the club the member will visit.' : 'Pick the visitor\'s home club.');
    if (club.isActive === false) return fail(`${club.name} is disabled - the arrangement is no longer in force.`);
    const visitDate = str(body.visitDate, 10);
    if (!visitDate || !DATE_RE.test(visitDate)) return fail('Pick the visit date.');
    // The letter's last day: empty or the same date = a one-day letter.
    let visitDateTo = str(body.visitDateTo, 10);
    if (visitDateTo && !DATE_RE.test(visitDateTo)) return fail('The last day must be a date.');
    if (visitDateTo && visitDateTo < visitDate) return fail('The last day cannot be before the first day of the visit.');
    if (visitDateTo === visitDate) visitDateTo = null;
    const lastDay = visitDateTo || visitDate;
    const letterDays = daysBetween(visitDate, lastDay);
    if (letterDays.length > MAX_LETTER_DAYS) return fail(`A letter covers at most ${MAX_LETTER_DAYS} days - record a second letter for a longer stay.`);
    const alternateDate = str(body.alternateDate, 10);
    if (alternateDate && !DATE_RE.test(alternateDate)) return fail('The alternate date must be a date.');
    if (alternateDate && visitDateTo) return fail('An alternate date applies to a one-day letter only - clear it, or clear the last day.');
    if (club.agreementFrom && visitDate < String(club.agreementFrom)) return fail(`The arrangement with ${club.name} starts on ${dateText(club.agreementFrom)}.`);
    if (club.agreementTo && lastDay > String(club.agreementTo)) return fail(`The arrangement with ${club.name} ended on ${dateText(club.agreementTo)}.`);

    // Who travels: inbound = the letter's visitor, outbound = our member.
    let visitorName;
    let visitorMemberNo;
    let memberId = null;
    let visitorEmail = str(body.visitorEmail);
    if (visitorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail)) return fail('The email is not a valid address.');
    if (direction === 'outbound') {
        const memberNo = str(body.memberNo, 50);
        if (!memberNo) return fail('Key in our member\'s number.');
        const standing = await getGolfMemberStanding(companyId, memberNo);
        if (!standing) return fail(`No member found with number '${memberNo}'.`);
        if (standing.actionControl === 'barred') return fail(`Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is not in good standing - a letter cannot be issued.`);
        memberId = standing.memberId;
        visitorName = standing.name;
        visitorMemberNo = standing.memberNo;
        if (!visitorEmail) visitorEmail = standing.email || null;
    } else {
        visitorName = str(body.visitorName);
        if (!visitorName) return fail('Key in the visiting member\'s name as the letter states it.');
        visitorMemberNo = str(body.visitorMemberNo, 50);
        if (!visitorMemberNo) return fail(`Key in the visitor's membership number at ${club.name}.`);
    }

    const raw = body.facilities && typeof body.facilities === 'object' ? body.facilities : {};
    const facilities = {};
    let golf = null;
    if (raw.golf && typeof raw.golf === 'object') {
        const holes = Number(raw.golf.holes);
        if (![9, 18].includes(holes)) return fail('Golf: pick 9 or 18 holes.');
        const teeTime = str(raw.golf.teeTime, 5);
        if (teeTime && !TIME_RE.test(teeTime)) return fail('Golf: the preferred tee time must be HH:MM.');
        const courseId = direction === 'inbound' ? str(raw.golf.courseId, 64) : null;
        if (courseId) {
            const courses = await golfGateway.listCourses(companyId);
            if (!courses.some((c) => c.id === courseId)) return fail('Golf: pick an active course.');
        }
        // The day the requested flight is played: a day of the letter, its
        // first by default (further days are added as flights once confirmed).
        const playDate = str(raw.golf.playDate, 10) || visitDate;
        if (!DATE_RE.test(playDate) || playDate < visitDate || playDate > lastDay) return fail('Golf: the play date must be a day of the letter.');
        golf = { courseId, teeTime, holes, playDate };
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
    if (direction === 'inbound' && club.maxGuestsPerVisit !== null && club.maxGuestsPerVisit !== undefined && guestCount > club.maxGuestsPerVisit) {
        return fail(club.maxGuestsPerVisit === 0 ? `${club.name} members may not bring guests.` : `${club.name} members may bring at most ${club.maxGuestsPerVisit} guest(s) per visit.`);
    }

    // The limits count DAYS (user decision 2026-11-14): each day of this
    // letter is one visit, added to the counted days of the other letters in
    // the same calendar period.
    const excludeId = existing ? existing.id : null;
    // The per-member visit cap over the club's calendar period (both directions).
    let visitsThisPeriod = letterDays.length;
    if (club.maxVisitsPerPlayer) {
        const period = club.maxVisitsPeriod || 'year';
        const prior = await countedDaysOfOthers(companyId, {
            affiliatedClubId: club.id, direction, visitorMemberNo, excludeId,
            from: visitCapWindow(period, visitDate).from, to: visitCapWindow(period, lastDay).to,
        });
        const over = capBreach(letterDays, prior, (d) => visitCapWindow(period, d), club.maxVisitsPerPlayer);
        if (over) {
            return fail(`${visitorName} already has ${over.used} visit day(s) ${direction === 'outbound' ? 'to' : 'from'} ${club.name} in this ${period}${over.mine > 1 ? ` and this letter asks for ${over.mine} more` : ''} - the arrangement allows ${club.maxVisitsPerPlayer}.`);
        }
        visitsThisPeriod = usedIn(prior, visitCapWindow(period, visitDate)) + usedIn(letterDays, visitCapWindow(period, visitDate));
    }
    // The club-wide annual INBOUND quota.
    let clubVisitsThisYear = null;
    if (direction === 'inbound' && club.maxVisitsPerYear) {
        const prior = await countedDaysOfOthers(companyId, {
            affiliatedClubId: club.id, direction: 'inbound', excludeId,
            from: visitCapWindow('year', visitDate).from, to: visitCapWindow('year', lastDay).to,
        });
        const over = capBreach(letterDays, prior, (d) => visitCapWindow('year', d), club.maxVisitsPerYear);
        if (over) {
            return fail(`${club.name} has already used ${over.used} of its ${club.maxVisitsPerYear} visit days for ${over.window.from.slice(0, 4)}${over.mine > 1 ? ` - this letter asks for ${over.mine} more` : ''}.`);
        }
        clubVisitsThisYear = usedIn(prior, visitCapWindow('year', visitDate)) + usedIn(letterDays, visitCapWindow('year', visitDate));
    }

    return {
        value: {
            direction,
            affiliatedClubId: club.id,
            visitorName, visitorMemberNo, memberId,
            visitorIdentityNo: direction === 'inbound' ? str(body.visitorIdentityNo, 50) : null,
            visitorMobile: str(body.visitorMobile, 30),
            visitorEmail,
            loiReference: direction === 'inbound' ? str(body.loiReference, 100) : null,
            loiDocumentUrl: direction === 'inbound' ? str(body.loiDocumentUrl, 500) : null,
            visitDate, visitDateTo, alternateDate,
            facilities, playerCount, guestCount,
            remarks: str(body.remarks),
        },
        club,
        visitsThisPeriod,
        clubVisitsThisYear,
    };
}

// How many of `days` fall inside the window { from, to }.
function usedIn(days, window) {
    return days.filter((d) => d >= window.from && d <= window.to).length;
}

// The first calendar window in which the letter's own days plus the days
// already counted exceed `cap`: { window, used, mine }, or null.
function capBreach(letterDays, priorDays, windowOf, cap) {
    const seen = new Set();
    for (const d of letterDays) {
        const window = windowOf(d);
        if (seen.has(window.from)) continue;
        seen.add(window.from);
        const used = usedIn(priorDays, window);
        const mine = usedIn(letterDays, window);
        if (used + mine > cap) return { window, used, mine };
    }
    return null;
}

// The days each letter's visitor registered at the Registration Counter:
// Map(visitId -> ['YYYY-MM-DD', ...]). The visitor's own rows only (a guest
// the visitor brought is not a visit of the member).
async function attendedDays(companyId, visitIds, { transaction } = {}) {
    const map = new Map();
    if (!visitIds.length) return map;
    const rows = await GuestRegistration.findAll({
        where: { companyId, affiliatedVisitId: { [Op.in]: visitIds }, guestId: null, status: { [Op.ne]: 'cancelled' } },
        attributes: ['affiliatedVisitId', 'visitDate'], order: [['visitDate', 'ASC']], transaction,
    });
    for (const r of rows) {
        const list = map.get(r.affiliatedVisitId) || [];
        list.push(String(r.visitDate));
        map.set(r.affiliatedVisitId, list);
    }
    return map;
}

// The counted days of every OTHER letter that touches [from, to] - one entry
// per day per letter - for the limits.
async function countedDaysOfOthers(companyId, { affiliatedClubId, direction, visitorMemberNo = null, excludeId = null, from, to }) {
    const where = {
        companyId, affiliatedClubId, direction, status: { [Op.in]: COUNTED_VISIT_STATUS_KEYS },
        visitDate: { [Op.lte]: to },
        [Op.or]: [{ visitDateTo: { [Op.gte]: from } }, { visitDateTo: null, visitDate: { [Op.gte]: from } }],
    };
    if (visitorMemberNo) where.visitorMemberNo = { [Op.iLike]: visitorMemberNo };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const rows = await Visit.findAll({ where, attributes: ['id', 'direction', 'status', 'visitDate', 'visitDateTo', 'arrivedAt'] });
    if (!rows.length) return [];
    const timezone = await companyTimezoneById(companyId);
    const today = clubNow(timezone);
    const attended = await attendedDays(companyId, rows.map((r) => r.id));
    const out = [];
    for (const r of rows) {
        const facts = { direction: r.direction, status: r.status, visitDate: r.visitDate, visitDateTo: r.visitDateTo, arrivedOn: r.arrivedAt ? clubNow(timezone, r.arrivedAt) : null };
        for (const d of countedDays(facts, attended.get(r.id) || [], today)) if (d >= from && d <= to) out.push(d);
    }
    return out;
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
        const issued = await numberingGateway.issueNumber(req, 'membership-visit', { transaction });
        let visitNo = null;
        if (issued && issued.number) visitNo = issued.number;
        else if (issued && issued.manual) {
            visitNo = str(body.visitNo, 50);
            if (!visitNo) throw Object.assign(new Error('The Visit No. scheme is manual - key in a visit number.'), { httpStatus: 400 });
        } else {
            throw Object.assign(new Error('Configure the Visit No. numbering scheme first (Membership Management -> Numbering Control).'), { httpStatus: 400 });
        }
        return Visit.create({ companyId, visitNo, status: 'requested', ...n.value, ...stamps }, { transaction });
    }).catch((err) => {
        if (err && err.httpStatus) return { error: err.message, status: err.httpStatus };
        throw err;
    });
    if (row.error) return row;
    const where = row.direction === 'outbound' ? `to ${n.club.name}` : `(${n.club.name})`;
    return { message: `Visit ${row.visitNo} recorded for ${row.visitorName} ${where} on ${dateRangeText(row)}.`, visit: await dto(row) };
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
    if (row.direction !== 'inbound') return fail('Only an inbound visit is declined - cancel an outbound one instead.');
    if (!['requested', 'pending-approval'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status} and cannot be declined.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const reason = str(body.reason);
    if (!reason) return fail('Give the reason for declining the visit.');
    await sequelize.transaction(async (transaction) => {
        if (row.status === 'pending-approval') await workflowGateway.cancelForEntity(ENTITY_TYPE, row.id, transaction);
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
        visitDateText: dateRangeText(row), reason, companyName: company ? company.name : '',
    };
    for (const to of [row.visitorEmail, club && club.contactEmail]) {
        if (to) await emailAddress({ templateKey: 'membership.visit.declined', companyId: row.companyId, to, data, transaction });
    }
}

async function cancel(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (!['requested', 'pending-approval', 'confirmed', 'issued'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status} and cannot be cancelled.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const reason = str(body.reason);
    if (!reason) return fail('Give the reason for cancelling the visit.');
    const callerId = getUserContext(req).userId;
    const out = await sequelize.transaction(async (transaction) => {
        if (row.status === 'pending-approval') await workflowGateway.cancelForEntity(ENTITY_TYPE, row.id, transaction);
        for (const fl of await Flight.findAll({ where: { companyId, affiliatedVisitId: row.id }, transaction })) {
            const c = await golfGateway.cancelVisitBooking(companyId, fl.bookingProfileId, { transaction, userId: callerId, reason: `Visit ${row.visitNo} cancelled: ${reason}` });
            if (c.error) return c;
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

// ---- inbound: confirm ---------------------------------------------------------

// The club facts the golf seam needs.
async function clubFacts(companyId, row) {
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId } });
    if (!club) return fail('The visitor\'s home club no longer exists.', 409);
    const type = await golfGateway.getPlayerType(companyId, club.playerTypeId);
    return { club, type };
}

// `flight` = { playDate, courseId, teeTime, holes } books THAT flight (a
// further day of the letter); without one, the flight the letter asks for.
function golfVisitFacts(row, club, flight = null) {
    const golf = flight || (row.facilities && row.facilities.golf ? row.facilities.golf : null);
    return {
        visitNo: row.visitNo, visitDate: String((golf && golf.playDate) || row.visitDate), playerCount: row.playerCount, guestCount: row.guestCount,
        visitorName: row.visitorName, visitorMemberNo: row.visitorMemberNo, visitorIdentityNo: row.visitorIdentityNo,
        visitorMobile: row.visitorMobile, visitorEmail: row.visitorEmail,
        affiliatedClubId: club.id, clubCode: club.code, clubName: club.name, clubPlayerTypeId: club.playerTypeId,
        golf: golf ? { courseId: golf.courseId, teeTime: golf.teeTime, holes: golf.holes } : null,
    };
}

// What Confirm will do (the preview the office sees): the flight to be
// booked, the party, the billing type, the caps and whether approval runs.
async function preview(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (row.direction !== 'inbound') return fail('Outbound visits are issued, not confirmed.');
    if (row.status !== 'requested') return fail(`Visit ${row.visitNo} is ${row.status}.`);
    const cf = await clubFacts(companyId, row);
    if (cf.error) return cf;
    const { club, type } = cf;
    const n = await normalize(companyId, { ...row.get({ plain: true }), facilities: row.facilities }, { existing: row });
    if (n.error) return n;
    const needsApproval = club.requiresApproval === true || (type && type.requiresApproval === true);
    const chain = needsApproval ? await workflowGateway.previewChain(req, PURPOSE, await approvalContext(companyId, row, club)) : null;
    let flight = null;
    if (row.facilities && row.facilities.golf) {
        const f = await golfGateway.previewVisitFlight(companyId, golfVisitFacts(row, club));
        if (f.error) return f;
        flight = f.flight;
    }
    await annotateCanModify(req, [row]);
    return {
        visit: await dto(row),
        playerType: type ? { code: type.code, description: type.description } : null,
        needsApproval,
        chain,
        flight,
        visitsThisPeriod: n.visitsThisPeriod,
        clubVisitsThisYear: n.clubVisitsThisYear,
        visitFee: club.visitFeeTransactionTypeId ? 'charged on the visitor\'s bill at registration' : null,
        summary: summaryOf(row, club, flight, needsApproval, chain),
    };
}

function summaryOf(row, club, flight, needsApproval, chain) {
    const parts = [];
    const playDate = (row.facilities && row.facilities.golf && row.facilities.golf.playDate) || row.visitDate;
    if (flight) parts.push(`books ${flight.courseName} at ${flight.teeTime}${flight.crossTime ? ' (crossover ' + flight.crossTime + ')' : ''}, ${flight.holes} holes, ${row.playerCount} player(s) on ${dateText(playDate)}`);
    else if (row.facilities && row.facilities.golf) parts.push('books no flight (no course or tee time on the request)');
    else parts.push('books no golf');
    parts.push(`${row.visitorName} is recorded as a ${club.name} member and billed as ${club.code}${club.visitFeeTransactionTypeId ? ' with the visit fee on their bill' : ''}`);
    const days = daysBetween(String(row.visitDate), lastDayOf(row)).length;
    if (days > 1) parts.push(`the letter covers ${days} days (${dateRangeText(row)}) - the visitor registers at the Registration Counter on each day they come, and each day counts as one visit`);
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
        clubVisitsThisYear: n.error || n.clubVisitsThisYear === null ? 0 : n.clubVisitsThisYear,
        facilities: VISIT_FACILITY_KEYS.filter((k) => f[k]).join(','),
    };
}

// Confirm: approval first when the club or its player type requires it,
// else confirm at once.
async function confirm(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (row.direction !== 'inbound') return fail('Outbound visits are issued, not confirmed.');
    if (row.status !== 'requested') return fail(`Visit ${row.visitNo} is ${row.status}.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const cf = await clubFacts(companyId, row);
    if (cf.error) return cf;
    const { club, type } = cf;
    if (!type || !['affiliate', 'reciprocal'].includes(type.baseIdentity) || type.isActive === false) return fail(`${club.name} has no active club-visitor player type - fix the club record first.`);
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
// path, where `req` is absent).
async function applyConfirmation(row, { transaction, userId, req = null }) {
    const companyId = row.companyId;
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId }, transaction });
    if (!club) return fail('The visitor\'s home club no longer exists.', 409);
    const booked = await golfGateway.bookForVisit(req, companyId, golfVisitFacts(row, club), { transaction, userId });
    if (booked.error) return booked;
    row.golferId = booked.golferId;
    row.status = 'confirmed';
    row.confirmedAt = new Date();
    row.confirmedBy = userId;
    row.workflowInstanceId = null;
    row.updatedBy = userId;
    await row.save({ transaction });
    if (booked.bookingProfileId) {
        const golf = row.facilities && row.facilities.golf ? row.facilities.golf : {};
        await Flight.create({
            companyId, affiliatedVisitId: row.id, playDate: String(golf.playDate || row.visitDate), bookingProfileId: booked.bookingProfileId,
            createdBy: userId, createdByDepartmentId: row.createdByDepartmentId, updatedBy: userId,
        }, { transaction });
    }

    const several = lastDayOf(row) !== String(row.visitDate);
    const company = await getCompanyProfile(companyId);
    const data = {
        visitorName: row.visitorName, clubName: club.name, visitNo: row.visitNo, visitDateText: dateRangeText(row),
        golfText: booked.flight ? `${booked.flight.courseName} at ${booked.flight.teeTime}, ${booked.flight.holes} holes, ${row.playerCount} player(s) (booking ${booked.bookingNo})` : '',
        facilitiesText: facilitiesText(row.facilities, { golf: false }),
        arrivalText: several
            ? 'Please present your letter of introduction, your home club membership card and a passport or ID at the Registration Counter on your first day, and your membership card or ID on each day after - you receive a day pass each time.'
            : 'Please present your letter of introduction, your home club membership card and a passport or ID at the Registration Counter - you receive a day pass there.',
        settlementText: club.allowChargeToHomeClub ? `Charges may be signed back to ${club.name} where the arrangement provides for it.` : 'All charges are settled before you leave the club.',
        companyName: company ? company.name : '',
    };
    for (const to of [row.visitorEmail, club.contactEmail]) {
        if (to) await emailAddress({ templateKey: 'membership.visit.confirmed', companyId, to, data, transaction });
    }
    if (!req && row.createdBy) {
        await notifyUser({
            userId: row.createdBy, companyId, type: 'membership.visit.confirmed', title: `Visit ${row.visitNo} approved and confirmed`,
            body: `${row.visitorName} (${club.name}) on ${dateRangeText(row)}${booked.bookingNo ? ' - booking ' + booked.bookingNo : ''}.`,
            linkRoute: '/membership/affiliated-visits', transaction,
        }).catch(() => {});
    }
    return { bookingNo: booked.bookingNo };
}

// ---- outbound: issue the letter ---------------------------------------------

async function issue(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (row.direction !== 'outbound') return fail('Only an outbound visit issues a letter - inbound visits are confirmed.');
    if (row.status !== 'requested') return fail(`Visit ${row.visitNo} is ${row.status}.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId } });
    if (!club) return fail('The partner club no longer exists.', 409);
    // Standing re-checked at issue (the letter represents the member).
    const standing = await getGolfMemberStanding(companyId, row.visitorMemberNo);
    if (!standing) return fail(`No member found with number '${row.visitorMemberNo}'.`);
    if (standing.actionControl === 'barred') return fail(`Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is not in good standing - the letter cannot be issued.`);
    const n = await normalize(companyId, { ...row.get({ plain: true }), memberNo: row.visitorMemberNo, facilities: row.facilities }, { existing: row });
    if (n.error) return n;
    const callerId = getUserContext(req).userId;
    const company = await getCompanyProfile(companyId);
    const recipients = [club.contactEmail, row.visitorEmail || standing.email].filter(Boolean);
    await sequelize.transaction(async (transaction) => {
        row.status = 'issued';
        row.issuedAt = new Date();
        row.issuedBy = callerId;
        row.sentTo = recipients.join(', ') || null;
        row.updatedBy = callerId;
        await row.save({ transaction });
        const data = {
            memberName: row.visitorName, memberNo: row.visitorMemberNo, clubName: club.name, visitNo: row.visitNo,
            visitDateText: dateRangeText(row), alternateDateText: row.alternateDate ? dateText(row.alternateDate) : '',
            facilitiesText: facilitiesText(row.facilities), playerCount: row.playerCount, guestCount: row.guestCount,
            visitsThisPeriod: n.visitsThisPeriod, companyName: company ? company.name : '',
        };
        for (const to of recipients) await emailAddress({ templateKey: 'membership.visit.loi', companyId, to, data, transaction });
    });
    return {
        message: recipients.length
            ? `Letter ${row.visitNo} issued for ${row.visitorName} and sent to ${recipients.join(' and ')}.`
            : `Letter ${row.visitNo} issued for ${row.visitorName} - no email address on the club or the member; send it by hand.`,
        visit: await dto(row),
    };
}

// ---- flights: the letter's golf, one booking per play day ---------------------

// A flight keyed for a day of the letter: { value } or { error }.
async function normalizeFlight(companyId, row, body) {
    const playDate = str(body.playDate, 10);
    if (!playDate || !DATE_RE.test(playDate)) return fail('Pick the day the flight is played.');
    if (playDate < String(row.visitDate) || playDate > lastDayOf(row)) return fail(`The play date must be a day of the letter (${dateRangeText(row)}).`);
    if (playDate < (await clubToday(companyId))) return fail(`${dateText(playDate)} has passed - a flight is booked for today or a later day.`);
    const holes = Number(body.holes);
    if (![9, 18].includes(holes)) return fail('Golf: pick 9 or 18 holes.');
    const teeTime = str(body.teeTime, 5);
    if (!teeTime || !TIME_RE.test(teeTime)) return fail('Golf: key in the tee time as HH:MM.');
    const courseId = str(body.courseId, 64);
    const courses = await golfGateway.listCourses(companyId);
    if (!courseId || !courses.some((c) => c.id === courseId)) return fail('Golf: pick an active course.');
    return { value: { playDate, courseId, teeTime, holes } };
}

// The letter and its club, for a flight change: inbound, confirmed or arrived.
async function loadForFlight(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (row.direction !== 'inbound') return fail('Only an inbound visit holds golf flights.');
    if (!['confirmed', 'arrived'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status} - a flight is added to a confirmed or arrived visit.`);
    const cf = await clubFacts(companyId, row);
    if (cf.error) return cf;
    return { row, companyId, club: cf.club };
}

// POST /:id/flights/preview - the flight a further day would book (show the
// expected result): availability and the club's playing rights.
async function previewFlight(req, id, body) {
    const l = await loadForFlight(req, id);
    if (l.error) return l;
    const n = await normalizeFlight(l.companyId, l.row, body);
    if (n.error) return n;
    const p = await golfGateway.previewVisitFlight(l.companyId, golfVisitFacts(l.row, l.club, n.value));
    if (p.error) return p;
    const fl = p.flight;
    return {
        flight: fl,
        summary: `Books ${fl.courseName} at ${fl.teeTime}${fl.crossTime ? ' (crossover ' + fl.crossTime + ')' : ''}, ${fl.holes} holes, ${l.row.playerCount} player(s) on ${dateText(n.value.playDate)} for ${l.row.visitorName}.`,
    };
}

// POST /:id/flights - book a flight for a day of the letter.
async function addFlight(req, id, body) {
    const l = await loadForFlight(req, id);
    if (l.error) return l;
    const { row, companyId, club } = l;
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const n = await normalizeFlight(companyId, row, body);
    if (n.error) return n;
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    const out = await sequelize.transaction(async (transaction) => {
        const booked = await golfGateway.bookForVisit(req, companyId, golfVisitFacts(row, club, n.value), { transaction, userId: callerId });
        if (booked.error) return booked;
        await Flight.create({
            companyId, affiliatedVisitId: row.id, playDate: n.value.playDate, bookingProfileId: booked.bookingProfileId,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        }, { transaction });
        return booked;
    });
    if (out.error) return out;
    return { message: `Flight booked for ${row.visitorName} on ${dateText(n.value.playDate)} - booking ${out.bookingNo}.`, visit: await dto(row) };
}

// POST /:id/flights/:flightId/remove - cancel one day's flight (refused by
// golf while any of its players is registered).
async function removeFlight(req, id, flightId) {
    const l = await loadForFlight(req, id);
    if (l.error) return l;
    const { row, companyId } = l;
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const fl = await Flight.findOne({ where: { companyId, affiliatedVisitId: row.id, id: String(flightId) } });
    if (!fl) return fail('That flight is no longer on the visit.', 404);
    const callerId = getUserContext(req).userId;
    const out = await sequelize.transaction(async (transaction) => {
        const c = await golfGateway.cancelVisitBooking(companyId, fl.bookingProfileId, { transaction, userId: callerId, reason: `Visit ${row.visitNo}: flight removed` });
        if (c.error) return c;
        await fl.destroy({ transaction });
        return {};
    });
    if (out.error) return out;
    return { message: `The flight on ${dateText(fl.playDate)} was cancelled.`, visit: await dto(row) };
}

// ---- the golf desk's questions (asked through the membership seam) ---------------

// Did the visitor register at the Registration Counter for `date`? A letter
// received before the counter existed counts on its arrival day.
async function receivedOn(companyId, visit, date, { transaction } = {}) {
    const live = await GuestRegistration.count({
        where: { companyId, affiliatedVisitId: visit.id, guestId: null, visitDate: String(date), status: { [Op.ne]: 'cancelled' } }, transaction,
    });
    if (live) return true;
    return !!visit.arrivedAt && clubNow(await companyTimezoneById(companyId), visit.arrivedAt) === String(date);
}

// The registration gate: a booked player whose booking is a letter's flight
// registers only once the visitor has registered at the Registration Counter
// for that play date. Returns an error string or null.
async function registrationGate(companyId, bookingProfileId, { transaction } = {}) {
    if (!bookingProfileId) return null;
    const fl = await Flight.findOne({ where: { companyId, bookingProfileId }, transaction });
    if (!fl) return null;
    const visit = await Visit.findOne({ where: { companyId, id: fl.affiliatedVisitId }, attributes: ['id', 'visitNo', 'status', 'visitorName', 'arrivedAt'], transaction });
    if (!visit) return null;
    if (!['confirmed', 'arrived', 'completed'].includes(visit.status)) return `Visit ${visit.visitNo} is ${visit.status} - this player cannot register.`;
    if (await receivedOn(companyId, visit, fl.playDate, { transaction })) return null;
    return visit.status === 'confirmed'
        ? `Visit ${visit.visitNo}: receive ${visit.visitorName} first (letter of introduction and ID sighted) - the Registration Counter issues the day pass.`
        : `Visit ${visit.visitNo}: ${visit.visitorName} has not registered at the Registration Counter for ${dateText(fl.playDate)} yet.`;
}

// Does any flight of the letter still owe a bill (a registered player unsettled)?
async function flightsOweBills(companyId, visitId, { transaction } = {}) {
    for (const fl of await Flight.findAll({ where: { companyId, affiliatedVisitId: visitId }, attributes: ['bookingProfileId'], transaction })) {
        if (await golfGateway.bookingUnsettledCount(companyId, fl.bookingProfileId, { transaction })) return true;
    }
    return false;
}

// After a settlement: complete the letter once its LAST day has come and no
// flight of it still owes a bill. A letter with days still to run stays open
// (the worker tick completes it after its last day).
async function completeIfSettled(companyId, bookingProfileId, { transaction } = {}) {
    if (!bookingProfileId) return null;
    const fl = await Flight.findOne({ where: { companyId, bookingProfileId }, transaction });
    if (!fl) return null;
    const visit = await Visit.findOne({ where: { companyId, id: fl.affiliatedVisitId, status: 'arrived' }, transaction });
    if (!visit) return null;
    if (!(await golfGateway.bookingFullySettled(companyId, bookingProfileId, { transaction }))) return null;
    if (lastDayOf(visit) > (await clubToday(companyId))) return null;
    if (await flightsOweBills(companyId, visit.id, { transaction })) return null;
    visit.status = 'completed';
    visit.completedAt = new Date();
    await visit.save({ transaction });
    return visit;
}

async function complete(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row } = l;
    if (!['arrived', 'issued'].includes(row.status)) return fail(`Visit ${row.visitNo} is ${row.status} - only an arrived (inbound) or issued (outbound) visit completes.`);
    row.status = 'completed';
    row.completedAt = new Date();
    row.updatedBy = getUserContext(req).userId;
    await row.save();
    return { message: `Visit ${row.visitNo} completed.`, visit: await dto(row) };
}

// The visit behind each booking of a day (the tee sheet's tag) + the fee
// facts golf needs for the visitor's bill.
async function byBooking(companyId, bookingProfileIds, { transaction } = {}) {
    const map = new Map();
    if (!bookingProfileIds.length) return map;
    const flights = await Flight.findAll({ where: { companyId, bookingProfileId: { [Op.in]: bookingProfileIds } }, transaction });
    if (!flights.length) return map;
    const rows = await Visit.findAll({
        where: { companyId, id: { [Op.in]: [...new Set(flights.map((x) => x.affiliatedVisitId))] } },
        attributes: ['id', 'visitNo', 'status', 'visitorName', 'golferId', 'affiliatedClubId', 'arrivedAt'], transaction,
    });
    const visitById = new Map(rows.map((r) => [r.id, r]));
    const clubIds = [...new Set(rows.map((r) => r.affiliatedClubId))];
    const clubs = clubIds.length ? await AffiliatedClub.findAll({ where: { id: { [Op.in]: clubIds } }, attributes: ['id', 'name', 'visitFeeTransactionTypeId', 'allowChargeToHomeClub'], transaction }) : [];
    const clubById = new Map(clubs.map((c) => [c.id, c]));
    for (const fl of flights) {
        const r = visitById.get(fl.affiliatedVisitId);
        if (!r) continue;
        const c = clubById.get(r.affiliatedClubId);
        // `status` is the standing for THIS flight's day: an open letter reads
        // 'confirmed' (not yet received) until the visitor has registered at
        // the Registration Counter for the play date, then 'arrived' - so the
        // tee sheet offers the arrival check on each day of a longer letter.
        let status = r.status;
        if (status === 'confirmed' || status === 'arrived') status = (await receivedOn(companyId, r, fl.playDate, { transaction })) ? 'arrived' : 'confirmed';
        map.set(fl.bookingProfileId, {
            id: r.id, visitNo: r.visitNo, status, letterStatus: r.status, playDate: String(fl.playDate), visitorName: r.visitorName, golferId: r.golferId,
            clubName: c ? c.name : null, visitFeeTransactionTypeId: c ? c.visitFeeTransactionTypeId : null, allowChargeToHomeClub: c ? c.allowChargeToHomeClub === true : false,
        });
    }
    return map;
}

// Worker tick: open visits whose LAST day is past (club-local) expire; an
// arrived letter whose last day is past completes once no flight owes a bill.
async function scanVisits() {
    const due = await Visit.findAll({ where: { status: { [Op.in]: ['requested', 'pending-approval', 'confirmed', 'issued'] } }, attributes: ['id', 'companyId', 'visitDate', 'visitDateTo', 'visitNo', 'visitorName', 'createdBy', 'status', 'direction'] });
    let expired = 0;
    for (const row of due) {
        const tz = await companyTimezoneById(row.companyId);
        const today = clubNow(tz);
        if (lastDayOf(row) >= today) continue;
        await sequelize.transaction(async (transaction) => {
            if (row.status === 'pending-approval') await workflowGateway.cancelForEntity(ENTITY_TYPE, row.id, transaction);
            await Visit.update({ status: 'expired', expiredAt: new Date(), workflowInstanceId: null }, { where: { id: row.id, status: row.status }, transaction });
        });
        expired += 1;
        if (row.createdBy) {
            await notifyUser({
                userId: row.createdBy, companyId: row.companyId, type: 'membership.visit.expired',
                title: `Visit ${row.visitNo} expired`, body: `${row.visitorName}'s visit on ${dateRangeText(row)} passed ${row.direction === 'outbound' ? 'without completion' : 'without arrival'}.`,
                linkRoute: '/membership/affiliated-visits',
            }).catch(() => {});
        }
    }
    if (expired) console.log(`[MEMBERSHIP VISIT] ${expired} visit(s) expired.`);

    let completed = 0;
    const open = await Visit.findAll({ where: { status: 'arrived', direction: 'inbound' }, attributes: ['id', 'companyId', 'visitDate', 'visitDateTo'] });
    for (const row of open) {
        if (lastDayOf(row) >= clubNow(await companyTimezoneById(row.companyId))) continue;
        if (await flightsOweBills(row.companyId, row.id)) continue;
        const [n] = await Visit.update({ status: 'completed', completedAt: new Date() }, { where: { id: row.id, status: 'arrived' } });
        completed += n;
    }
    if (completed) console.log(`[MEMBERSHIP VISIT] ${completed} visit(s) completed after their last day.`);
    return { expired, completed };
}

// ---- listing ----------------------------------------------------------------

async function list(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status && VISIT_STATUSES.some((s) => s.key === query.status)) where.status = query.status;
    if (query.direction && VISIT_DIRECTION_KEYS.includes(query.direction)) where.direction = query.direction;
    // A letter shows in every period one of its days falls in.
    if (query.dateTo) where.visitDate = { [Op.lte]: String(query.dateTo) };
    if (query.dateFrom) {
        const from = String(query.dateFrom);
        where[Op.or] = [{ visitDateTo: { [Op.gte]: from } }, { visitDateTo: null, visitDate: { [Op.gte]: from } }];
    }
    if (query.affiliatedClubId) where.affiliatedClubId = String(query.affiliatedClubId);
    const rows = await Visit.findAll({ where, order: [['visitDate', 'ASC'], ['createdAt', 'ASC']], limit: 500 });
    await annotateCanModify(req, rows);
    const extras = await extrasFor(companyId, rows);
    const visits = [];
    for (const r of rows) visits.push(await dto(r, extras));
    return { visits, statuses: VISIT_STATUSES, directions: VISIT_DIRECTIONS, today: await clubToday(companyId) };
}

async function get(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    await annotateCanModify(req, [l.row]);
    return { visit: await dto(l.row) };
}

// The pickers the screen needs: active clubs (with their terms), golf
// courses (through the golf seam), the vocabularies.
async function meta(req) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const [clubs, courses] = await Promise.all([
        AffiliatedClub.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
        golfGateway.listCourses(companyId),
    ]);
    return {
        clubs: clubs.map((c) => ({
            id: c.id, code: c.code, name: c.name, kind: c.kind, agreementFrom: c.agreementFrom, agreementTo: c.agreementTo,
            maxGuestsPerVisit: c.maxGuestsPerVisit, maxVisitsPerPlayer: c.maxVisitsPerPlayer, maxVisitsPeriod: c.maxVisitsPeriod, maxVisitsPerYear: c.maxVisitsPerYear,
            requiresApproval: c.requiresApproval === true, allowChargeToHomeClub: c.allowChargeToHomeClub === true, contactEmail: c.contactEmail,
            hasVisitFee: !!c.visitFeeTransactionTypeId,
        })),
        courses,
        statuses: VISIT_STATUSES,
        directions: VISIT_DIRECTIONS,
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

// What a listing needs beside the rows themselves, loaded once: each
// letter's flights (with the booking number) and the days its visitor
// registered at the counter.
async function extrasFor(companyId, rows, { transaction } = {}) {
    const ids = rows.map((r) => r.id);
    const out = { flights: new Map(), attended: new Map() };
    if (!ids.length) return out;
    const flights = await Flight.findAll({ where: { companyId, affiliatedVisitId: { [Op.in]: ids } }, order: [['playDate', 'ASC'], ['createdAt', 'ASC']], transaction });
    for (const fl of flights) {
        const b = await golfGateway.bookingNoOf(fl.bookingProfileId);
        const list = out.flights.get(fl.affiliatedVisitId) || [];
        list.push({ id: fl.id, playDate: String(fl.playDate), bookingProfileId: fl.bookingProfileId, bookingNo: b ? b.bookingNo : null, bookingStatus: b ? b.status : null });
        out.flights.set(fl.affiliatedVisitId, list);
    }
    out.attended = await attendedDays(companyId, ids, { transaction });
    return out;
}

async function dto(r, extras = null) {
    const club = await clubSnapshot(r.companyId, r.affiliatedClubId);
    const x = extras || await extrasFor(r.companyId, [r]);
    const flights = x.flights.get(r.id) || [];
    const lastDay = lastDayOf(r);
    return {
        id: r.id,
        visitNo: r.visitNo,
        direction: r.direction,
        affiliatedClubId: r.affiliatedClubId,
        club,
        status: r.status,
        visitorName: r.visitorName,
        visitorMemberNo: r.visitorMemberNo,
        visitorIdentityNo: r.visitorIdentityNo,
        visitorMobile: r.visitorMobile,
        visitorEmail: r.visitorEmail,
        memberId: r.memberId,
        golferId: r.golferId,
        loiReference: r.loiReference,
        loiDocumentUrl: r.loiDocumentUrl,
        visitDate: r.visitDate,
        // The letter's last day (null = a one-day letter) and its span.
        visitDateTo: r.visitDateTo || null,
        lastDay,
        dayCount: daysBetween(String(r.visitDate), lastDay).length,
        // The days the visitor registered at the Registration Counter.
        attendedDates: x.attended.get(r.id) || [],
        alternateDate: r.alternateDate,
        facilities: r.facilities || {},
        facilitiesText: facilitiesText(r.facilities),
        playerCount: r.playerCount,
        guestCount: r.guestCount,
        // The golf flights, one per booking; `bookingNo` lists their numbers.
        flights,
        bookingNo: flights.map((fl) => fl.bookingNo).filter(Boolean).join(', ') || null,
        confirmedAt: r.confirmedAt,
        issuedAt: r.issuedAt,
        sentTo: r.sentTo,
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
    PURPOSE, ENTITY_TYPE,
    visitCapWindow, facilitiesText, dateText, dateRangeText, lastDayOf, daysBetween, countedDays, capBreach, clubNow,
    create, update, decline, cancel, preview, confirm, applyConfirmation, applyDecline, issue,
    previewFlight, addFlight, removeFlight, attendedDays, receivedOn,
    registrationGate, completeIfSettled, complete, byBooking, scanVisits,
    list, get, meta, dto,
};
