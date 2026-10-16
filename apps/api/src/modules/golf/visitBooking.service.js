// The golf side of an affiliated visit (2026-10-16): the Membership service
// owns the letter of introduction; when it confirms a visit that includes
// golf it books the flight HERE through platform/golfGateway.js - an
// ordinary flight booking under the visitor's own golfer identity, judged by
// the booking channel's own availability and the club's playing rights.
// Nothing in this file reads the membership tables: the visit facts arrive
// as plain values.

const { Op } = require('sequelize');
const { getCallerPlacement } = require('../../platform/serviceContext');
const numberingGateway = require('../../platform/numberingGateway');
const { classifyDateRangeForCompany } = require('../../platform/calendarGateway');
const availability = require('./bookingAvailability.service');
const shared = require('./bookingShared');
const playerTypes = require('./playerType.service');
const Course = require('./course.model');
const OtherGolfer = require('./otherGolfer.model');
const Golfer = require('./golfer.model');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');

function fail(message, status = 400) {
    return { error: message, status };
}
function dateText(dateOnly) {
    return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Resolve a visit's requested course + tee time to a bookable flight for the
// party, under the club's playing rights. `visit` = { visitDate, playerCount,
// visitorName, affiliatedClubId, clubName, clubPlayerTypeId, golf: { courseId,
// teeTime, holes } }.
async function findFlight(companyId, visit, { transaction } = {}) {
    const golf = visit.golf || {};
    if (!golf.courseId || !golf.teeTime) return fail('Golf: the request needs a course and a tee time before it can be confirmed - edit the visit.');
    const course = await Course.findOne({ where: { companyId, id: golf.courseId, isActive: true }, transaction });
    if (!course) return fail('Golf: the requested course is no longer active.');
    const days = await classifyDateRangeForCompany(companyId, visit.visitDate, visit.visitDate);
    const dayType = days.length ? days[0].dayType : 'weekday';
    const { setting, minRules } = await availability.loadRules(companyId);
    const ctx = await availability.dayContext(companyId, visit.visitDate, dayType, { transaction });
    const [occ, locks] = await Promise.all([
        availability.occupancy(companyId, visit.visitDate, { transaction, ctx }),
        availability.activeLockCells(companyId, visit.visitDate, { transaction }),
    ]);
    const result = await availability.courseFlights({
        course, ctx, playDate: visit.visitDate, dayType, holes: golf.holes || 18, players: visit.playerCount, setting, minRules, occ, locks,
    });
    if (!result) return fail(`No tee sheet is configured for ${course.courseCode} on ${dateText(visit.visitDate)}.`);
    // The club's playing rights (blackout days, time bands, courses).
    const rights = require('./playingRights.service');
    const types = await playerTypes.catalog(companyId, { transaction });
    const clubType = types.find((t) => t.id === visit.clubPlayerTypeId) || null;
    const rightsFail = await rights.checkBooking(companyId, {
        course, playDate: visit.visitDate, teeTime: golf.teeTime, dayType,
        lines: [{ label: visit.visitorName, playerType: clubType ? clubType.code : 'guest', golferId: null, affiliatedClubId: visit.affiliatedClubId, clubName: visit.clubName }],
        transaction,
    });
    if (rightsFail) return fail(rightsFail);
    const flight = result.flights.find((x) => x.teeTime === golf.teeTime);
    if (!flight) {
        const near = availability.nearestFlights(result.flights, golf.teeTime, 3).map((x) => x.teeTime).join(', ');
        return fail(`${course.courseCode} ${golf.teeTime} cannot take ${visit.playerCount} player(s) on ${dateText(visit.visitDate)}${near ? ' - nearest available: ' + near : ''}. Edit the visit's tee time.`, 409);
    }
    return {
        flight: {
            courseId: course.id, courseCode: course.courseCode, courseName: `${course.courseCode}${course.description ? ' - ' + course.description : ''}`,
            teeTime: flight.teeTime, crossTime: flight.crossTime || null, holes: golf.holes || 18, seatsLeft: flight.seatsLeft, dayType,
        },
        course, dayType, clubType,
    };
}

// The visitor's golfer identity: dedupe like a walk-in guest (identity no,
// then mobile, then the same club + number), stamped with the affiliation.
async function visitorGolfer(companyId, visit, stamps, { transaction }) {
    let profile = null;
    if (visit.visitorIdentityNo) profile = await OtherGolfer.findOne({ where: { companyId, identityNo: visit.visitorIdentityNo }, transaction });
    if (!profile && visit.visitorMobile) profile = await OtherGolfer.findOne({ where: { companyId, mobile: visit.visitorMobile }, transaction });
    if (!profile) profile = await OtherGolfer.findOne({ where: { companyId, affiliatedClubId: visit.affiliatedClubId, affiliationNo: { [Op.iLike]: visit.visitorMemberNo } }, transaction });
    if (profile) {
        if (!profile.identityNo && visit.visitorIdentityNo) profile.identityNo = visit.visitorIdentityNo;
        if (!profile.mobile && visit.visitorMobile) profile.mobile = visit.visitorMobile;
        if (!profile.email && visit.visitorEmail) profile.email = visit.visitorEmail;
        profile.affiliatedClubId = visit.affiliatedClubId;
        profile.affiliationNo = visit.visitorMemberNo;
        profile.updatedBy = stamps.updatedBy;
        await profile.save({ transaction });
    } else {
        profile = await OtherGolfer.create({
            companyId, name: visit.visitorName, identityNo: visit.visitorIdentityNo || null, mobile: visit.visitorMobile || null, email: visit.visitorEmail || null,
            affiliatedClubId: visit.affiliatedClubId, affiliationNo: visit.visitorMemberNo, ...stamps,
        }, { transaction });
    }
    const [golfer] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'other', sourceId: profile.id },
        defaults: { companyId, golferType: 'other', sourceId: profile.id, name: profile.name, ...stamps },
        transaction,
    });
    return golfer;
}

// Book the visit's golf (inside the caller's transaction): the visitor's
// identity + an ordinary flight booking under it. `req` is null on the
// approval-handler path (numbers then issue by company). Returns
// { golferId, bookingProfileId, bookingNo, flight } or { error }.
async function bookForVisit(req, companyId, visit, { transaction, userId }) {
    const placement = req ? await getCallerPlacement(req) : { departmentId: null };
    const stamps = { createdBy: userId, createdByDepartmentId: placement.departmentId, updatedBy: userId };
    const golfer = await visitorGolfer(companyId, visit, stamps, { transaction });
    if (!visit.golf) return { golferId: golfer.id, bookingProfileId: null, bookingNo: null, flight: null };

    await shared.advisoryLock(transaction, companyId, visit.visitDate);
    const f = await findFlight(companyId, visit, { transaction });
    if (f.error) return f;
    if (!f.clubType) return fail('The home club has no active affiliate player type - fix the club record first.');
    const issued = req
        ? await numberingGateway.issueNumber(req, 'golf-booking', { transaction })
        : await numberingGateway.issueNumberForCompany(companyId, 'golf-booking', { transaction });
    if (!issued || !issued.number) return fail('Configure the Booking No. numbering scheme (auto-generate) first - a visit books under it.');
    const bookingNo = issued.number;
    const profileRow = await BookingProfile.create({
        companyId, bookingNo, bookingType: 'flight', courseId: f.course.id, playDate: visit.visitDate,
        bookerGolferId: golfer.id, contactMobile: visit.visitorMobile || null, remarks: `Affiliated visit ${visit.visitNo} - ${visit.clubName}`,
        status: 'booked', ...stamps,
    }, { transaction });
    const base = Date.now();
    const lines = [{ playerType: f.clubType.code, golferId: golfer.id, playerName: visit.visitorName }];
    for (let i = 1; i < visit.playerCount; i += 1) {
        const guest = i <= visit.guestCount;
        lines.push({ playerType: guest ? 'guest' : f.clubType.code, golferId: null, playerName: guest ? `Guest of ${visit.visitorName}` : `${visit.clubCode} member ${i + 1}` });
    }
    for (let i = 0; i < lines.length; i += 1) {
        const l = lines[i];
        const common = {
            companyId, bookingProfileId: profileRow.id, courseId: f.course.id, playDate: visit.visitDate,
            playerType: l.playerType, golferId: l.golferId, playerName: l.playerName, memberNo: null, status: 'booked', ...stamps,
        };
        const first = await Player.create({
            ...common, secondNineFlag: 0, unitCourseId: f.course.firstNineId, teeTime: f.flight.teeTime, createdAt: new Date(base + i * 2),
        }, { transaction });
        if (f.flight.crossTime) {
            await Player.create({
                ...common, secondNineFlag: 1, firstNinePlayerId: first.id, unitCourseId: f.course.secondNineId, teeTime: f.flight.crossTime, createdAt: new Date(base + i * 2 + 1),
            }, { transaction });
        }
    }
    return { golferId: golfer.id, bookingProfileId: profileRow.id, bookingNo, flight: f.flight };
}

// Cancel a visit's booking (its booked records); refused while any is
// registered. Returns { error } or {}.
async function cancelVisitBooking(companyId, bookingProfileId, { transaction, userId, reason }) {
    const profile = await BookingProfile.findOne({ where: { companyId, id: bookingProfileId }, transaction });
    if (!profile || profile.status !== 'booked') return {};
    const registered = await Player.count({ where: { bookingProfileId: profile.id, status: 'registered' }, transaction });
    if (registered) return fail('The visit has registered players - cancel their registrations at the desk first.', 409);
    profile.status = 'cancelled';
    profile.cancelledAt = new Date();
    profile.cancelledBy = userId;
    profile.cancelReason = reason || null;
    profile.updatedBy = userId;
    await profile.save({ transaction });
    await Player.update({ status: 'cancelled', updatedBy: userId }, { where: { bookingProfileId: profile.id, status: 'booked' }, transaction });
    return {};
}

// The booking number of a visit's booking (for the listing).
async function bookingNoOf(bookingProfileId) {
    const p = await BookingProfile.findOne({ where: { id: bookingProfileId }, attributes: ['bookingNo', 'status'] });
    return p ? { bookingNo: p.bookingNo, status: p.status } : null;
}

// Every registered starting-nine player of a booking has a settled bill?
async function bookingFullySettled(companyId, bookingProfileId, { transaction } = {}) {
    const Bill = require('./bill.model');
    const registered = await Player.findAll({ where: { bookingProfileId, secondNineFlag: 0, status: 'registered' }, attributes: ['id'], transaction });
    if (!registered.length) return false;
    const settled = await Bill.count({ where: { companyId, playerId: { [Op.in]: registered.map((r) => r.id) }, status: 'settled' }, transaction });
    return settled >= registered.length;
}

module.exports = { findFlight, bookForVisit, cancelVisitBooking, bookingNoOf, bookingFullySettled };
