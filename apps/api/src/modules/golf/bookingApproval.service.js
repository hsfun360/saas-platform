// Flight-booking approval (spec 2.3.1 needs-approval flag; user decisions
// 2026-10-15) - a booking that carries a player of a PLAYER TYPE marked
// requiresApproval is created 'pending-approval': its Player records hold
// the seats as usual, the booker is told the booking awaits approval, and
// the 'golf-booking' Workflow purpose decides: approval books it and sends
// the confirmation; rejection (or a withdrawn chain) cancels it and tells
// the booker. With no chain configured the booking is booked at once.
// The desk cannot register a pending booking; the booker can cancel it.

const { Op } = require('sequelize');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const shared = require('./bookingShared');
const availability = require('./bookingAvailability.service');
const playerTypes = require('./playerType.service');
const Player = require('./player.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');

const PURPOSE = 'golf-booking';
const ENTITY_TYPE = 'GolfBooking';

// The codes of the keyed lines whose type requires approval (unique, in order).
function approvalCodes(types, lines) {
    const out = [];
    for (const l of lines) {
        const t = playerTypes.findType(types, l.playerType);
        if (t && t.requiresApproval && !out.includes(t.code)) out.push(t.code);
    }
    return out;
}

// What the approval chain's conditions can test.
function contextFor({ course, dayType, holes, teeTime, lines, types, codes }) {
    return {
        courseCode: course.courseCode,
        dayType,
        holes,
        teeTime,
        players: lines.length,
        guests: lines.filter((l) => playerTypes.isGuestLike(types, l.playerType)).length,
        playerTypes: [...new Set(lines.map((l) => l.playerType))].join(','),
        approvalTypes: codes.join(','),
    };
}

// The booking's players with an address (members through the seam).
async function recipientsOf(companyId, firsts) {
    const out = [];
    for (const p of firsts) {
        if (!p.memberNo) continue;
        const s = await getGolfMemberStanding(companyId, p.memberNo);
        if (s && s.email) out.push({ name: p.playerName, email: s.email });
    }
    return out;
}

async function flightFacts(profile, { transaction }) {
    const records = await Player.findAll({ where: { bookingProfileId: profile.id }, order: [['secondNineFlag', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']], transaction });
    const firsts = records.filter((r) => Number(r.secondNineFlag) === 0 && r.status !== 'cancelled');
    const seconds = records.filter((r) => Number(r.secondNineFlag) === 1);
    const course = await Course.findOne({ where: { id: profile.courseId }, attributes: ['courseCode', 'description'], transaction });
    return {
        firsts,
        teeTime: firsts.length ? availability.hhmm(firsts[0].teeTime) : '',
        crossTime: seconds.length ? availability.hhmm(seconds[0].teeTime) : '',
        holes: seconds.length ? 18 : 9,
        courseName: course ? `${course.courseCode}${course.description ? ' - ' + course.description : ''}` : '',
    };
}

// Approved: the booking is booked and every player gets the confirmation.
async function applyApproval(profile, { transaction, userId }) {
    profile.status = 'booked';
    profile.workflowInstanceId = null;
    profile.updatedBy = userId;
    await profile.save({ transaction });
    const f = await flightFacts(profile, { transaction });
    const types = await playerTypes.catalog(profile.companyId, { transaction });
    await shared.queueBookingEmail({
        companyId: profile.companyId,
        templateKey: 'golf.booking.confirmed',
        recipients: await recipientsOf(profile.companyId, f.firsts),
        data: {
            bookingNo: profile.bookingNo, playDateText: shared.playDateText(String(profile.playDate)), teeTime: f.teeTime, crossTime: f.crossTime,
            courseName: f.courseName, holes: f.holes,
            playersTable: shared.playersTableHtml(f.firsts.map((p, i) => ({ sortOrder: i + 1, playerName: p.playerName, memberNo: p.memberNo, playerType: p.playerType })), playerTypes.labelsOf(types)),
        },
        transaction,
    });
}

// Rejected or withdrawn: the booking is cancelled, the seats freed, the
// booker told why.
async function applyRejection(profile, reason, { transaction, userId }) {
    profile.status = 'cancelled';
    profile.cancelledAt = new Date();
    profile.cancelledBy = userId;
    profile.cancelReason = reason;
    profile.workflowInstanceId = null;
    profile.updatedBy = userId;
    await profile.save({ transaction });
    await Player.update({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason, updatedBy: userId }, {
        where: { bookingProfileId: profile.id, status: { [Op.in]: ['booked'] } }, transaction,
    });
    const f = await flightFacts(profile, { transaction });
    const booker = profile.bookerGolferId ? await Golfer.findOne({ where: { id: profile.bookerGolferId }, attributes: ['memberNo', 'name'], transaction }) : null;
    const recipients = booker && booker.memberNo ? await recipientsOf(profile.companyId, [{ memberNo: booker.memberNo, playerName: booker.name }]) : [];
    await shared.queueBookingEmail({
        companyId: profile.companyId,
        templateKey: 'golf.booking.rejected',
        recipients,
        data: {
            bookingNo: profile.bookingNo, playDateText: shared.playDateText(String(profile.playDate)), teeTime: f.teeTime, courseName: f.courseName, holes: f.holes, reason,
        },
        transaction,
    });
}

module.exports = { PURPOSE, ENTITY_TYPE, approvalCodes, contextFor, applyApproval, applyRejection, recipientsOf };
