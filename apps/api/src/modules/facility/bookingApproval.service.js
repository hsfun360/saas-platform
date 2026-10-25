// Facility booking approval (structure approved 2026-10-25; golf's
// bookingApproval shape). A booking of a Facility Type that requires approval,
// or carrying a participant of a requires-approval Participant Type, is
// created 'pending-approval' with its slots HELD while the Workflow chain
// decides; approval books it and sends the confirmation, rejection or a
// withdrawn chain cancels it (slots released, guest visits voided) and tells
// the booker. The workflow handlers in src/wiring/workflowHandlers.js call
// applyApproval / applyRejection inside the engine's transaction.

const { Op } = require('sequelize');
const { voidGuestVisit } = require('../../platform/membershipGateway');
const shared = require('./bookingShared');
const participantTypes = require('./participantType.service');
const BookingSlot = require('./bookingSlot.model');
const BookingParticipant = require('./bookingParticipant.model');

const PURPOSE = 'facility-booking';
const ENTITY_TYPE = 'FacilityBooking';

// The codes that make a booking need approval: 'facility-type' when the type
// itself requires it, plus every requires-approval participant type on the
// roster.
function approvalCodes(types, lines, type) {
    const out = [];
    if (type && type.requiresApproval === true) out.push('facility-type');
    for (const l of lines) {
        const t = participantTypes.findType(types, l.participantType);
        if (t && t.requiresApproval && !out.includes(t.code)) out.push(t.code);
    }
    return out;
}

function contextFor({ type, dayType, date, startTime, slots, lines, types, codes, guests }) {
    return {
        facilityTypeCode: type.code,
        dayType,
        bookingDate: date,
        startTime,
        slots,
        participants: lines.length,
        guests,
        participantTypes: [...new Set(lines.map((l) => l.participantType))].join(','),
        approvalTypes: codes.join(','),
    };
}

function labelsOf(types) {
    return new Map(types.map((t) => [t.code, t.description]));
}

async function applyApproval(booking, { transaction, userId }) {
    booking.status = 'booked';
    booking.workflowInstanceId = null;
    booking.updatedBy = userId;
    await booking.save({ transaction });
    const facts = await shared.bookingFacts(booking, { transaction });
    const types = await participantTypes.catalog(booking.companyId, { transaction });
    await shared.queueBookingEmail({
        companyId: booking.companyId,
        templateKey: 'facility.booking.confirmed',
        recipients: await shared.recipientsOf(booking.companyId, booking, facts),
        data: shared.emailData(booking, facts, labelsOf(types)),
        transaction,
    });
}

// Cancel the booking as the outcome of the chain: slots released, the guest
// visits voided through the seam, the booker told.
async function applyRejection(booking, reason, { transaction, userId }) {
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = userId;
    booking.cancelReason = reason;
    booking.workflowInstanceId = null;
    booking.updatedBy = userId;
    await booking.save({ transaction });
    await releaseSlots(booking, { transaction });
    const facts = await shared.bookingFacts(booking, { transaction });
    const types = await participantTypes.catalog(booking.companyId, { transaction });
    await shared.queueBookingEmail({
        companyId: booking.companyId,
        templateKey: 'facility.booking.rejected',
        recipients: await shared.recipientsOf(booking.companyId, booking, facts),
        data: shared.emailData(booking, facts, labelsOf(types), { reason }),
        transaction,
    });
}

// Cancel every live slot of a booking and void the guest visits recorded on
// its participant lines. Shared by the desk cancel and the rejection.
async function releaseSlots(booking, { transaction }) {
    const slots = await BookingSlot.findAll({ where: { bookingId: booking.id }, attributes: ['id', 'status'], transaction });
    const slotIds = slots.map((s) => s.id);
    if (slotIds.length) {
        const withVisits = await BookingParticipant.findAll({
            where: { bookingSlotId: { [Op.in]: slotIds }, guestVisitId: { [Op.ne]: null } },
            attributes: ['id'],
            transaction,
        });
        for (const p of withVisits) await voidGuestVisit(booking.companyId, 'facility', p.id, { transaction });
    }
    await BookingSlot.update({ status: 'cancelled', cancelledAt: new Date() }, {
        where: { bookingId: booking.id, status: { [Op.in]: ['booked'] } },
        transaction,
    });
}

module.exports = { PURPOSE, ENTITY_TYPE, approvalCodes, contextFor, labelsOf, applyApproval, applyRejection, releaseSlots };
