// Affiliated visits (user decisions 2026-10-15 / 16; the Membership
// Department's desk) - the Letter of Introduction flow in both directions.
//
//   INBOUND  - a partner club's member visits us. The office records the
//              incoming letter, confirms (or declines) it; the confirmation
//              creates the visitor's golfer identity and books the golf part
//              through platform/golfGateway.js (an ordinary flight booking
//              under that identity - every tee-sheet rule and the club's
//              playing rights apply), the desk ticks the letter and the ID
//              on arrival before the party can register, and the visit
//              completes when every bill of its registrations is settled. A
//              club or player type that requires approval routes Confirm
//              through the Workflow engine first.
//   OUTBOUND - our member visits the partner. The office keys the request,
//              the member's standing is checked (status action control),
//              ISSUE numbers the letter from the same series and emails it
//              to the partner's contact and the member; the visit counts
//              against the member's cap with that club.
//
// The pure pieces (visitCapWindow, facilitiesText) are unit-tested.

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
const AffiliatedClub = require('./affiliatedClub.model');

const PURPOSE = 'membership-affiliated-visit';
const ENTITY_TYPE = 'MembershipAffiliatedVisit';
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
function clubNow(timezone) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
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
    const alternateDate = str(body.alternateDate, 10);
    if (alternateDate && !DATE_RE.test(alternateDate)) return fail('The alternate date must be a date.');
    if (club.agreementFrom && visitDate < String(club.agreementFrom)) return fail(`The arrangement with ${club.name} starts on ${dateText(club.agreementFrom)}.`);
    if (club.agreementTo && visitDate > String(club.agreementTo)) return fail(`The arrangement with ${club.name} ended on ${dateText(club.agreementTo)}.`);

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
    if (direction === 'inbound' && club.maxGuestsPerVisit !== null && club.maxGuestsPerVisit !== undefined && guestCount > club.maxGuestsPerVisit) {
        return fail(club.maxGuestsPerVisit === 0 ? `${club.name} members may not bring guests.` : `${club.name} members may bring at most ${club.maxGuestsPerVisit} guest(s) per visit.`);
    }

    // The per-member visit cap over the club's calendar period (both directions).
    let visitsThisPeriod = 1;
    if (club.maxVisitsPerPlayer) {
        const w = visitCapWindow(club.maxVisitsPeriod || 'year', visitDate);
        const where = {
            companyId, affiliatedClubId: club.id, direction, visitorMemberNo: { [Op.iLike]: visitorMemberNo },
            status: { [Op.in]: COUNTED_VISIT_STATUS_KEYS }, visitDate: { [Op.gte]: w.from, [Op.lte]: w.to },
        };
        if (existing) where.id = { [Op.ne]: existing.id };
        const prior = await Visit.count({ where });
        visitsThisPeriod = prior + 1;
        if (visitsThisPeriod > club.maxVisitsPerPlayer) {
            return fail(`${visitorName} already has ${prior} visit(s) ${direction === 'outbound' ? 'to' : 'from'} ${club.name} in this ${club.maxVisitsPeriod || 'year'} - the arrangement allows ${club.maxVisitsPerPlayer}.`);
        }
    }
    // The club-wide annual INBOUND quota.
    let clubVisitsThisYear = null;
    if (direction === 'inbound' && club.maxVisitsPerYear) {
        const w = visitCapWindow('year', visitDate);
        const where = { companyId, affiliatedClubId: club.id, direction: 'inbound', status: { [Op.in]: COUNTED_VISIT_STATUS_KEYS }, visitDate: { [Op.gte]: w.from, [Op.lte]: w.to } };
        if (existing) where.id = { [Op.ne]: existing.id };
        const prior = await Visit.count({ where });
        clubVisitsThisYear = prior + 1;
        if (clubVisitsThisYear > club.maxVisitsPerYear) {
            return fail(`${club.name} has already used ${prior} of its ${club.maxVisitsPerYear} visits for ${visitDate.slice(0, 4)}.`);
        }
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
            visitDate, alternateDate,
            facilities, playerCount, guestCount,
            remarks: str(body.remarks),
        },
        club,
        visitsThisPeriod,
        clubVisitsThisYear,
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
    return { message: `Visit ${row.visitNo} recorded for ${row.visitorName} ${where} on ${dateText(row.visitDate)}.`, visit: await dto(row) };
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
        visitDateText: dateText(row.visitDate), reason, companyName: company ? company.name : '',
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
        if (row.bookingProfileId) {
            const c = await golfGateway.cancelVisitBooking(companyId, row.bookingProfileId, { transaction, userId: callerId, reason: `Visit ${row.visitNo} cancelled: ${reason}` });
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

function golfVisitFacts(row, club) {
    return {
        visitNo: row.visitNo, visitDate: String(row.visitDate), playerCount: row.playerCount, guestCount: row.guestCount,
        visitorName: row.visitorName, visitorMemberNo: row.visitorMemberNo, visitorIdentityNo: row.visitorIdentityNo,
        visitorMobile: row.visitorMobile, visitorEmail: row.visitorEmail,
        affiliatedClubId: club.id, clubCode: club.code, clubName: club.name, clubPlayerTypeId: club.playerTypeId,
        golf: row.facilities && row.facilities.golf ? row.facilities.golf : null,
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
    if (flight) parts.push(`books ${flight.courseName} at ${flight.teeTime}${flight.crossTime ? ' (crossover ' + flight.crossTime + ')' : ''}, ${flight.holes} holes, ${row.playerCount} player(s) on ${dateText(row.visitDate)}`);
    else if (row.facilities && row.facilities.golf) parts.push('books no flight (no course or tee time on the request)');
    else parts.push('books no golf');
    parts.push(`${row.visitorName} is recorded as a ${club.name} member and billed as ${club.code}${club.visitFeeTransactionTypeId ? ' with the visit fee on their bill' : ''}`);
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
// path, where `req` is absent).
async function applyConfirmation(row, { transaction, userId, req = null }) {
    const companyId = row.companyId;
    const club = await AffiliatedClub.findOne({ where: { companyId, id: row.affiliatedClubId }, transaction });
    if (!club) return fail('The visitor\'s home club no longer exists.', 409);
    const booked = await golfGateway.bookForVisit(req, companyId, golfVisitFacts(row, club), { transaction, userId });
    if (booked.error) return booked;
    row.golferId = booked.golferId;
    row.bookingProfileId = booked.bookingProfileId;
    row.status = 'confirmed';
    row.confirmedAt = new Date();
    row.confirmedBy = userId;
    row.workflowInstanceId = null;
    row.updatedBy = userId;
    await row.save({ transaction });

    const company = await getCompanyProfile(companyId);
    const data = {
        visitorName: row.visitorName, clubName: club.name, visitNo: row.visitNo, visitDateText: dateText(row.visitDate),
        golfText: booked.flight ? `${booked.flight.courseName} at ${booked.flight.teeTime}, ${booked.flight.holes} holes, ${row.playerCount} player(s) (booking ${booked.bookingNo})` : '',
        facilitiesText: facilitiesText(row.facilities, { golf: false }),
        arrivalText: 'Please present your letter of introduction, your home club membership card and a passport or ID at the front desk.',
        settlementText: club.allowChargeToHomeClub ? `Charges may be signed back to ${club.name} where the arrangement provides for it.` : 'All charges are settled before you leave the club.',
        companyName: company ? company.name : '',
    };
    for (const to of [row.visitorEmail, club.contactEmail]) {
        if (to) await emailAddress({ templateKey: 'membership.visit.confirmed', companyId, to, data, transaction });
    }
    if (!req && row.createdBy) {
        await notifyUser({
            userId: row.createdBy, companyId, type: 'membership.visit.confirmed', title: `Visit ${row.visitNo} approved and confirmed`,
            body: `${row.visitorName} (${club.name}) on ${dateText(row.visitDate)}${booked.bookingNo ? ' - booking ' + booked.bookingNo : ''}.`,
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
            visitDateText: dateText(row.visitDate), alternateDateText: row.alternateDate ? dateText(row.alternateDate) : '',
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

// ---- desk: arrival, completion, the day's tags (called through the
// membership seam by golf) -------------------------------------------------------

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
    if (!(await golfGateway.bookingFullySettled(companyId, bookingProfileId, { transaction }))) return null;
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
    const rows = await Visit.findAll({
        where: { companyId, bookingProfileId: { [Op.in]: bookingProfileIds } },
        attributes: ['id', 'visitNo', 'status', 'bookingProfileId', 'visitorName', 'golferId', 'affiliatedClubId'], transaction,
    });
    const clubIds = [...new Set(rows.map((r) => r.affiliatedClubId))];
    const clubs = clubIds.length ? await AffiliatedClub.findAll({ where: { id: { [Op.in]: clubIds } }, attributes: ['id', 'name', 'visitFeeTransactionTypeId', 'allowChargeToHomeClub'], transaction }) : [];
    const clubById = new Map(clubs.map((c) => [c.id, c]));
    for (const r of rows) {
        const c = clubById.get(r.affiliatedClubId);
        map.set(r.bookingProfileId, {
            id: r.id, visitNo: r.visitNo, status: r.status, visitorName: r.visitorName, golferId: r.golferId,
            clubName: c ? c.name : null, visitFeeTransactionTypeId: c ? c.visitFeeTransactionTypeId : null, allowChargeToHomeClub: c ? c.allowChargeToHomeClub === true : false,
        });
    }
    return map;
}

// Worker tick: open visits whose date is past (club-local) expire.
async function scanVisits() {
    const due = await Visit.findAll({ where: { status: { [Op.in]: ['requested', 'pending-approval', 'confirmed', 'issued'] } }, attributes: ['id', 'companyId', 'visitDate', 'visitNo', 'visitorName', 'createdBy', 'status', 'direction'] });
    let expired = 0;
    for (const row of due) {
        const tz = await companyTimezoneById(row.companyId);
        const today = clubNow(tz);
        if (String(row.visitDate) >= today) continue;
        await sequelize.transaction(async (transaction) => {
            if (row.status === 'pending-approval') await workflowGateway.cancelForEntity(ENTITY_TYPE, row.id, transaction);
            await Visit.update({ status: 'expired', expiredAt: new Date(), workflowInstanceId: null }, { where: { id: row.id, status: row.status }, transaction });
        });
        expired += 1;
        if (row.createdBy) {
            await notifyUser({
                userId: row.createdBy, companyId: row.companyId, type: 'membership.visit.expired',
                title: `Visit ${row.visitNo} expired`, body: `${row.visitorName}'s visit on ${dateText(row.visitDate)} passed ${row.direction === 'outbound' ? 'without completion' : 'without arrival'}.`,
                linkRoute: '/membership/affiliated-visits',
            }).catch(() => {});
        }
    }
    if (expired) console.log(`[MEMBERSHIP VISIT] ${expired} visit(s) expired.`);
    return { expired };
}

// ---- listing ----------------------------------------------------------------

async function list(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status && VISIT_STATUSES.some((s) => s.key === query.status)) where.status = query.status;
    if (query.direction && VISIT_DIRECTION_KEYS.includes(query.direction)) where.direction = query.direction;
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
    return { visits, statuses: VISIT_STATUSES, directions: VISIT_DIRECTIONS };
}

async function get(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
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

async function dto(r) {
    const club = await clubSnapshot(r.companyId, r.affiliatedClubId);
    let bookingNo = null;
    if (r.bookingProfileId) {
        const b = await golfGateway.bookingNoOf(r.bookingProfileId);
        bookingNo = b ? b.bookingNo : null;
    }
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
        alternateDate: r.alternateDate,
        facilities: r.facilities || {},
        facilitiesText: facilitiesText(r.facilities),
        playerCount: r.playerCount,
        guestCount: r.guestCount,
        bookingProfileId: r.bookingProfileId,
        bookingNo,
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
    visitCapWindow, facilitiesText, dateText,
    create, update, decline, cancel, preview, confirm, applyConfirmation, applyDecline, issue,
    arrive, registrationGate, completeIfSettled, complete, byBooking, scanVisits,
    list, get, meta, dto,
};
