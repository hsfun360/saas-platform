// The Registration Counter (user decisions 2026-11-14; Membership Management
// -> Registration Counter) - the club's ONE control counter for everyone who
// is not a member: a member's guest, and a visiting member of an affiliated
// or reciprocal club. Every one of them leaves it with the same thing, a DAY
// PASS (QR code) that the golf desk, the Facility station and the outlets
// scan.
//
//   - A member's guest is registered as before (guestRegistration.service
//     create); this file adds the other side of the counter.
//   - A visiting affiliated / reciprocal member presents the letter of
//     introduction HERE, not at a station. The letter itself stays the
//     Membership office's file (affiliatedVisit.service: request, approval,
//     confirmation, the golf flights); the counter does its received step.
//   - The pass is a DAILY pass, always. A letter may cover several days and
//     the visitor stops at the counter on EACH day they come: the letter and
//     the ID are sighted the first time, the ID alone after that, and that
//     day's pass is issued. One registration row is one day at the club, and
//     that day is one visit against the club's limits.
//   - A walk-up with no letter on file is recorded and received on the spot
//     only when the arrangement needs no approval; where it does, the request
//     is recorded and submitted, and no pass is issued until it is approved.
//   - The guests a visitor brings get a pass each, up to the club's guests
//     per visit, on the visitor's own registration of the day.
//   - A plain Visitor (no member, no club) is not registered here yet.
//
// The pure piece (receivableOn) is unit-tested.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement, getCompanyProfile } = require('../../platform/serviceContext');
const golfGateway = require('../../platform/golfGateway');
const registrations = require('./guestRegistration.service');
const visits = require('./affiliatedVisit.service');
const GuestRegistration = require('./guestRegistration.model');
const AffiliatedVisit = require('./affiliatedVisit.model');
const AffiliatedClub = require('./affiliatedClub.model');

const { fail, txFail, str, dateText, clubToday, visitorParty, nameOf, dto, passFacts, queuePassEmail, issueRegistrationNo, resolveGuest } = registrations.internals;

// ---- pure rule ---------------------------------------------------------------

// May a letter be received on `today`? Its own days, or - a one-day letter -
// its alternate date. `visit` = { visitDate, visitDateTo, alternateDate }.
function receivableOn(visit, today) {
    const first = String(visit.visitDate);
    const last = String(visit.visitDateTo || visit.visitDate);
    if (today >= first && today <= last) return true;
    return !visit.visitDateTo && !!visit.alternateDate && String(visit.alternateDate) === today;
}

function letterDatesText(visit) {
    return `${visits.dateRangeText(visit)}${!visit.visitDateTo && visit.alternateDate ? ` (or ${dateText(visit.alternateDate)})` : ''}`;
}

// ---- the day's listing -----------------------------------------------------------

// GET /guest-registrations - the registrations of the period (every patron
// group) plus what the counter needs to act: the letters it may receive
// TODAY and the clubs a walk-up may come from.
async function list(req, query) {
    const out = await registrations.list(req, query);
    if (out.error) return out;
    const companyId = getUserContext(req).companyId;
    const [expectedVisits, clubs] = await Promise.all([expectedToday(companyId, out.today), walkUpClubs(companyId, out.today)]);
    return { ...out, expectedVisits, clubs };
}

// The confirmed (or already running) inbound letters valid today whose
// visitor has not registered yet today.
async function expectedToday(companyId, today) {
    const open = await AffiliatedVisit.findAll({
        where: {
            companyId, direction: 'inbound', status: { [Op.in]: ['confirmed', 'arrived'] },
            [Op.or]: [
                { visitDate: { [Op.lte]: today }, visitDateTo: { [Op.gte]: today } },
                { visitDate: today, visitDateTo: null },
                { alternateDate: today, visitDateTo: null },
            ],
        },
        order: [['visitorName', 'ASC']], limit: 300,
    });
    if (!open.length) return [];
    const done = await GuestRegistration.findAll({
        where: { companyId, affiliatedVisitId: { [Op.in]: open.map((v) => v.id) }, guestId: null, visitDate: today, status: { [Op.ne]: 'cancelled' } },
        attributes: ['affiliatedVisitId'],
    });
    const received = new Set(done.map((r) => r.affiliatedVisitId));
    const waiting = open.filter((v) => !received.has(v.id));
    if (!waiting.length) return [];
    const clubs = await AffiliatedClub.findAll({ where: { companyId, id: { [Op.in]: [...new Set(waiting.map((v) => v.affiliatedClubId))] } }, attributes: ['id', 'code', 'name', 'kind', 'maxGuestsPerVisit'] });
    const clubById = new Map(clubs.map((c) => [c.id, c]));
    const attended = await visits.attendedDays(companyId, waiting.map((v) => v.id));
    return waiting.map((v) => {
        const c = clubById.get(v.affiliatedClubId);
        const days = attended.get(v.id) || [];
        return {
            id: v.id,
            visitNo: v.visitNo,
            visitorName: v.visitorName,
            visitorMemberNo: v.visitorMemberNo,
            club: c ? { id: c.id, code: c.code, name: c.name, kind: c.kind } : null,
            visitDate: String(v.visitDate),
            lastDay: visits.lastDayOf(v),
            datesText: letterDatesText(v),
            facilitiesText: visits.facilitiesText(v.facilities),
            // The first time at the counter: the letter itself is sighted too.
            firstDay: v.status === 'confirmed',
            letterSightedOn: days.length ? days[0] : null,
            daysAttended: days.length,
        };
    });
}

// The active clubs a walk-up may come from, with whether the arrangement
// lets the counter issue the pass on the spot (no approval needed).
async function walkUpClubs(companyId, today) {
    const clubs = await AffiliatedClub.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
    const out = [];
    for (const c of clubs) {
        if (c.agreementFrom && today < String(c.agreementFrom)) continue;
        if (c.agreementTo && today > String(c.agreementTo)) continue;
        const type = c.playerTypeId ? await golfGateway.getPlayerType(companyId, c.playerTypeId) : null;
        out.push({
            id: c.id, code: c.code, name: c.name, kind: c.kind,
            needsApproval: c.requiresApproval === true || !!(type && type.requiresApproval === true),
            maxGuestsPerVisit: c.maxGuestsPerVisit,
        });
    }
    return out;
}

// ---- receive a visitor for the day -------------------------------------------------

// POST /guest-registrations/visits/:id/receive { letterSighted, idSighted,
// registrationNo? } - the visitor of a letter registers for TODAY and gets
// the day pass. The first time both the letter and the ID are sighted and the
// letter turns 'arrived'; on a later day of the same letter the ID alone.
// Receiving twice on one day answers the pass already issued. `channel` says
// whose counter did it ('desk' = the Registration Counter; the golf desk
// reaches this through the membership seam).
async function receiveVisit(req, visitId, body, { channel = 'desk' } = {}) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const found = await AffiliatedVisit.findOne({ where: { companyId, id: String(visitId) }, attributes: ['id', 'visitNo', 'direction', 'status'] });
    if (!found) return fail('Visit not found.', 404);
    if (found.direction !== 'inbound') return fail('Only an inbound visit is received - an outbound letter is our own member visiting another club.');
    if (!['confirmed', 'arrived'].includes(found.status)) return fail(`Visit ${found.visitNo} is ${found.status} - only a confirmed visit can be received.`);
    const b = body || {};
    const today = await clubToday(companyId);
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };

    const out = await sequelize.transaction(async (transaction) => {
        // Serialise the letter: two desks cannot both issue today's pass.
        const visit = await AffiliatedVisit.findOne({ where: { companyId, id: found.id }, lock: transaction.LOCK.UPDATE, transaction });
        if (!['confirmed', 'arrived'].includes(visit.status)) throw txFail(`Visit ${visit.visitNo} is ${visit.status} - only a confirmed visit can be received.`);
        if (!receivableOn(visit, today)) throw txFail(`Visit ${visit.visitNo} is for ${letterDatesText(visit)} - ${visit.visitorName} cannot be received today.`);
        const club = await AffiliatedClub.findOne({ where: { companyId, id: visit.affiliatedClubId }, transaction });
        if (!club) throw txFail('The visitor\'s home club no longer exists.', 409);
        if (club.isActive === false) throw txFail(`${club.name} is disabled - the arrangement is no longer in force.`);

        const live = await GuestRegistration.findOne({
            where: { companyId, affiliatedVisitId: visit.id, guestId: null, visitDate: today, status: { [Op.ne]: 'cancelled' } }, transaction,
        });
        if (live) return { visit, club, row: live, created: false, first: false };

        const first = visit.status === 'confirmed';
        if (first && b.letterSighted !== true) throw txFail('Tick that the letter of introduction was sighted.');
        if (b.idSighted !== true) throw txFail('Tick that the home club card and ID were sighted.');
        const registrationNo = await issueRegistrationNo(req, companyId, b.registrationNo, { transaction });
        const now = new Date();
        const row = await GuestRegistration.create({
            companyId, registrationNo, patronGroup: club.kind === 'reciprocal' ? 'reciprocal' : 'affiliate',
            affiliatedVisitId: visit.id, affiliatedClubId: club.id, visitDate: today,
            status: 'arrived', arrivedAt: now, arrivedBy: callerId, channel,
            passToken: crypto.randomBytes(32).toString('hex'), remarks: str(b.remarks), ...stamps,
        }, { transaction });
        if (first) Object.assign(visit, { status: 'arrived', arrivedAt: now, letterSightedBy: callerId });
        Object.assign(visit, { idSightedBy: callerId, updatedBy: callerId });
        await visit.save({ transaction });
        return { visit, club, row, created: true, first };
    }).catch((err) => {
        if (err && err.httpStatus) return { error: err.message, status: err.httpStatus };
        if (err && err.name === 'SequelizeUniqueConstraintError') return { error: 'This visitor has just been received at another counter - reload the list.', status: 409 };
        throw err;
    });
    if (out.error) return out;

    const { visit, club, row } = out;
    const party = visitorParty(visit, club);
    const company = await getCompanyProfile(companyId);
    const several = visits.lastDayOf(visit) !== String(visit.visitDate);
    let message;
    if (!out.created) message = `${visit.visitorName} was already received today - pass ${row.registrationNo}.`;
    else if (out.first) message = `${visit.visitorName} received - visit ${visit.visitNo}; day pass ${row.registrationNo} issued for ${dateText(today)}${several ? '. They register here again on each further day of the letter' : ''}.`;
    else message = `${visit.visitorName} registered for ${dateText(today)} - visit ${visit.visitNo}; day pass ${row.registrationNo} issued.`;
    return {
        message,
        visit: await visits.dto(visit),
        registration: dto(row, party, today),
        pass: await passFacts(row, party, company),
    };
}

// ---- a walk-up: no letter on file --------------------------------------------------

// POST /guest-registrations/walk-ups - a visiting member who stands at the
// counter with a letter the office never recorded. The counter keys the
// letter; where the arrangement needs NO approval it is confirmed and the
// visitor received at once (the pass is issued). Where approval is needed the
// request is recorded and submitted, and nothing is issued until it is
// approved - the visitor then registers from the day's list.
// Golf is not booked here: the office (or the golf desk) adds the flight on
// the confirmed letter.
async function walkUp(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const b = body || {};
    if (b.letterSighted !== true) return fail('Tick that the letter of introduction was sighted.');
    if (b.idSighted !== true) return fail('Tick that the home club card and ID were sighted.');
    const today = await clubToday(companyId);
    const created = await visits.create(req, {
        direction: 'inbound',
        affiliatedClubId: b.affiliatedClubId,
        visitNo: b.visitNo,
        visitorName: b.visitorName,
        visitorMemberNo: b.visitorMemberNo,
        visitorIdentityNo: b.visitorIdentityNo,
        visitorMobile: b.visitorMobile,
        visitorEmail: b.visitorEmail,
        loiReference: b.loiReference,
        loiDocumentUrl: b.loiDocumentUrl,
        visitDate: today,
        visitDateTo: b.visitDateTo,
        facilities: { golf: null, dining: b.dining, accommodation: b.accommodation, sports: b.sports, other: b.other },
        playerCount: 1,
        guestCount: 0,
        remarks: b.remarks,
    });
    if (created.error) return created;
    const visitNo = created.visit.visitNo;
    const confirmed = await visits.confirm(req, created.visit.id);
    if (confirmed.error) {
        return { message: `Visit ${visitNo} was recorded, but could not be confirmed: ${confirmed.error} No pass was issued - the office completes it in Affiliated Visits.`, visit: created.visit, issued: false };
    }
    if (confirmed.visit.status !== 'confirmed') {
        return { message: `Visit ${visitNo} recorded and submitted for approval - no pass is issued until it is approved. ${created.visit.visitorName} registers here once it is.`, visit: confirmed.visit, issued: false };
    }
    const received = await receiveVisit(req, created.visit.id, { letterSighted: true, idSighted: true, registrationNo: b.registrationNo, remarks: null });
    if (received.error) {
        return { message: `Visit ${visitNo} was recorded and confirmed, but the pass could not be issued: ${received.error}`, visit: confirmed.visit, issued: false };
    }
    return { ...received, message: `Visit ${visitNo} recorded for ${created.visit.visitorName}. ${received.message}`, issued: true };
}

// ---- the guests a visitor brings -----------------------------------------------------

// POST /guest-registrations/:id/guests { guest } - a pass for a guest the
// visitor brought, on the visitor's own registration of TODAY and inside the
// club's guests-per-visit limit. The guest is a membership.Guest like any
// other (a returning one is recognised); no member's allowance is drawn.
async function addVisitorGuest(req, registrationId, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const g = registrations.normalizeGuest((body || {}).guest);
    if (g.error) return g;
    const today = await clubToday(companyId);
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };

    const out = await sequelize.transaction(async (transaction) => {
        const own = await GuestRegistration.findOne({ where: { companyId, id: String(registrationId) }, transaction });
        if (!own) throw txFail('Registration not found.', 404);
        if (!own.affiliatedVisitId || own.guestId) throw txFail('A guest is added on the registration of the visiting member who brings them.');
        if (own.status === 'cancelled') throw txFail(`Registration ${own.registrationNo} is cancelled.`);
        if (String(own.visitDate) !== today) throw txFail(`Registration ${own.registrationNo} is for ${dateText(own.visitDate)} - a guest is added on the visitor's registration of today.`);
        const visit = await AffiliatedVisit.findOne({ where: { companyId, id: own.affiliatedVisitId }, lock: transaction.LOCK.UPDATE, transaction });
        const club = visit ? await AffiliatedClub.findOne({ where: { companyId, id: visit.affiliatedClubId }, transaction }) : null;
        if (!visit || !club) throw txFail('The letter of introduction behind this registration no longer exists.', 409);

        const max = club.maxGuestsPerVisit;
        if (max !== null && max !== undefined) {
            const have = await GuestRegistration.count({
                where: { companyId, affiliatedVisitId: visit.id, visitDate: today, guestId: { [Op.ne]: null }, status: { [Op.ne]: 'cancelled' } }, transaction,
            });
            if (have >= max) {
                throw txFail(max === 0
                    ? `${club.name} members may not bring guests.`
                    : `${visit.visitorName} already has ${have} guest${have === 1 ? '' : 's'} registered today - ${club.name} members may bring at most ${max} per visit.`);
            }
        }
        const guestRow = await resolveGuest(companyId, body || {}, g.value, stamps, { transaction });
        const dup = await GuestRegistration.findOne({
            where: { companyId, affiliatedVisitId: visit.id, guestId: guestRow.id, visitDate: today, status: { [Op.ne]: 'cancelled' } }, attributes: ['registrationNo'], transaction,
        });
        if (dup) throw txFail(`${guestRow.name} is already registered as ${visit.visitorName}'s guest today (${dup.registrationNo}).`, 409);
        const registrationNo = await issueRegistrationNo(req, companyId, (body || {}).registrationNo, { transaction });
        const now = new Date();
        const row = await GuestRegistration.create({
            companyId, registrationNo, patronGroup: own.patronGroup, guestId: guestRow.id,
            affiliatedVisitId: visit.id, affiliatedClubId: club.id, visitDate: today,
            status: 'arrived', arrivedAt: now, arrivedBy: callerId, channel: 'desk',
            passToken: crypto.randomBytes(32).toString('hex'), remarks: str((body || {}).remarks), ...stamps,
        }, { transaction });
        const party = visitorParty(visit, club, guestRow);
        let emailed = false;
        if ((body || {}).sendEmail === true && guestRow.email) {
            await queuePassEmail(row, party, await getCompanyProfile(companyId), { transaction });
            Object.assign(row, { passSentAt: now, passSentVia: 'email', passSentTo: guestRow.email });
            await row.save({ transaction });
            emailed = true;
        }
        return { row, party, emailed };
    }).catch((err) => {
        if (err && err.httpStatus) return { error: err.message, status: err.httpStatus };
        if (err && err.name === 'SequelizeUniqueConstraintError') return { error: 'This guest is already registered with this visitor today.', status: 409 };
        throw err;
    });
    if (out.error) return out;

    const parts = [`${nameOf(out.party)} registered as ${out.party.visit.visitorName}'s guest for ${dateText(today)} (${out.row.registrationNo}).`];
    if (out.emailed) parts.push(`The pass was emailed to ${out.party.person.email}.`);
    return { message: parts.join(' '), registration: dto(out.row, out.party, today), pass: await passFacts(out.row, out.party, await getCompanyProfile(companyId)) };
}

module.exports = { receivableOn, list, expectedToday, walkUpClubs, receiveVisit, walkUp, addVisitorGuest };
