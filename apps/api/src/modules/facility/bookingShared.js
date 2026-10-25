// Helpers shared by the facility booking controller, the approval service and
// the workflow handlers (kept out of the controller so the handlers can
// require them without a circular require): the day-wide advisory lock, the
// lock sweep, day typing through the calendar seam, the booking facts a DTO
// or an email needs, and the booking emails.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getCompanyProfile } = require('../../platform/serviceContext');
const { emailAddress } = require('../../platform/notificationGateway');
const { classifyDateRangeForCompany } = require('../../platform/calendarGateway');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const SlotLock = require('./slotLock.model');
const BookingSlot = require('./bookingSlot.model');
const BookingParticipant = require('./bookingParticipant.model');
const Facility = require('./facility.model');
const FacilityType = require('./facilityType.model');
const Patron = require('./patron.model');
const OtherPatron = require('./otherPatron.model');

// One advisory lock per (company, date) - every claim and save for the same
// day serializes here, so the unique cell indexes only ever fire as a safety
// net and the user gets a friendly "just taken" instead.
async function advisoryLock(transaction, companyId, bookingDate) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `facility-booking:${companyId}:${bookingDate}` },
        transaction,
    });
}

// Remove expired locks for a day (inside the advisory lock, so the unique
// cell index never falsely blocks a new claim).
async function sweepExpiredLocks(companyId, bookingDate, transaction) {
    await SlotLock.destroy({
        where: { companyId, bookingDate, expiresAt: { [Op.lte]: new Date() } },
        transaction,
    });
}

// 'weekday' | 'weekend' (public holidays = weekend) from the calendar seam.
async function dayTypeOf(companyId, bookingDate) {
    const rows = await classifyDateRangeForCompany(companyId, bookingDate, bookingDate);
    return rows.length ? rows[0].dayType : 'weekday';
}

// '27 Sept 2026' for the emails (the screens use the device format).
function bookingDateText(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

// ---- booking facts ---------------------------------------------------------

// Everything a DTO or an email needs about one booking: the type, the booker
// Patron (+ visitor profile), the slots with their unit, and the ROSTER (the
// participants of the first live slot - every slot of a booking carries the
// same roster; cancelled slots keep theirs for the record).
async function bookingFacts(booking, { transaction } = {}) {
    const [type, booker, slots] = await Promise.all([
        FacilityType.findOne({ where: { id: booking.facilityTypeId }, transaction }),
        Patron.findOne({ where: { id: booking.bookerPatronId }, transaction }),
        BookingSlot.findAll({ where: { bookingId: booking.id }, order: [['startTime', 'ASC']], transaction }),
    ]);
    const bookerProfile = booker && booker.patronType === 'other' ? await OtherPatron.findOne({ where: { id: booker.sourceId }, transaction }) : null;
    const units = slots.length
        ? await Facility.findAll({ where: { id: { [Op.in]: [...new Set(slots.map((s) => s.facilityId))] } }, attributes: ['id', 'code', 'name', 'location'], transaction })
        : [];
    const unitById = new Map(units.map((u) => [u.id, u]));
    const participants = slots.length
        ? await BookingParticipant.findAll({ where: { bookingSlotId: { [Op.in]: slots.map((s) => s.id) } }, order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']], transaction })
        : [];
    const live = slots.filter((s) => s.status !== 'cancelled');
    // Display facts (time range, units) come from the LIVE slots; a fully
    // cancelled booking keeps showing what it was.
    const shown = live.length ? live : slots;
    const rosterSlot = shown[0] || null;
    const roster = rosterSlot ? participants.filter((p) => p.bookingSlotId === rosterSlot.id) : [];
    return {
        type,
        booker,
        bookerProfile,
        slots: slots.map((s) => {
            const u = unitById.get(s.facilityId);
            return { row: s, facilityCode: u ? u.code : '', facilityName: u ? u.name : '', facilityLocation: u ? u.location : null };
        }),
        liveSlots: live,
        participants,
        roster,
        shownSlots: shown,
        firstStart: shown.length ? hhmm(shown[0].startTime) : null,
        lastEnd: shown.length ? hhmm(shown[shown.length - 1].endTime) : null,
    };
}

// The email recipients of a booking: the contact email, the booker's member
// email, and every member-standing participant's email (through the seam).
async function recipientsOf(companyId, booking, facts) {
    const out = [];
    if (booking.contactEmail) out.push(booking.contactEmail);
    if (facts.bookerProfile && facts.bookerProfile.email) out.push(facts.bookerProfile.email);
    const memberNos = new Set();
    if (facts.booker && facts.booker.memberNo) memberNos.add(facts.booker.memberNo);
    for (const p of facts.roster) if (p.memberNo) memberNos.add(p.memberNo);
    for (const no of memberNos) {
        const s = await getGolfMemberStanding(companyId, no);
        if (s && s.email) out.push(s.email);
    }
    return out;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The booking's slots as an email-safe HTML table (inline styles - email
// clients ignore stylesheets). Injected via {{{slotsTable}}}.
function slotsTableHtml(facts) {
    const td = 'border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 14px;';
    const th = `${td} background-color: #f8fafc; text-align: left;`;
    const shownIds = new Set(facts.shownSlots.map((s) => s.id));
    const rows = facts.slots.filter((s) => shownIds.has(s.row.id)).map((s) => `<tr>`
        + `<td style='${td}'>${escapeHtml(s.facilityCode)}${s.facilityName ? ' - ' + escapeHtml(s.facilityName) : ''}</td>`
        + `<td style='${td}'>${hhmm(s.row.startTime)} - ${hhmm(s.row.endTime)}</td>`
        + `</tr>`).join('');
    return `<table style='border-collapse: collapse; width: 100%; margin-top: 8px;'>`
        + `<tr><th style='${th}'>Facility</th><th style='${th}'>Time</th></tr>${rows}</table>`;
}

// The roster as an email-safe HTML table. `labels` = participant-type labels
// by code.
function participantsTableHtml(roster, labels = new Map()) {
    if (!roster.length) return '';
    const td = 'border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 14px;';
    const th = `${td} background-color: #f8fafc; text-align: left;`;
    const rows = roster.map((p, i) => `<tr>`
        + `<td style='${td}'>${p.sortOrder || i + 1}</td>`
        + `<td style='${td}'>${escapeHtml(p.name)}</td>`
        + `<td style='${td}'>${p.memberNo ? escapeHtml(p.memberNo) : '-'}</td>`
        + `<td style='${td}'>${escapeHtml(labels.get(p.participantType) || p.participantType)}</td>`
        + `</tr>`).join('');
    return `<table style='border-collapse: collapse; width: 100%; margin-top: 8px;'>`
        + `<tr><th style='${th}'>#</th><th style='${th}'>Participant</th><th style='${th}'>Member No</th><th style='${th}'>Type</th></tr>${rows}</table>`;
}

// The template variables shared by every booking email.
function emailData(booking, facts, labels, extra = {}) {
    const date = facts.shownSlots.length ? String(facts.shownSlots[0].bookingDate) : '';
    const shownIds = new Set(facts.shownSlots.map((s) => s.id));
    return {
        bookingNo: booking.bookingNo,
        bookingDateText: date ? bookingDateText(date) : '',
        timeRange: facts.firstStart ? `${facts.firstStart} - ${facts.lastEnd || ''}` : '',
        facilityType: facts.type ? `${facts.type.code} - ${facts.type.description}` : '',
        facilities: [...new Set(facts.slots.filter((s) => shownIds.has(s.row.id)).map((s) => s.facilityCode))].join(', '),
        bookerName: facts.booker ? facts.booker.name : '',
        slotsTable: slotsTableHtml(facts),
        participantsTable: participantsTableHtml(facts.roster, labels),
        ...extra,
    };
}

// Queue ONE booking email to every recipient address together (golf's
// convention: the addresses are concatenated in To:). NON-CRITICAL: an email
// problem must never abort the booking - the enqueue is caught and logged;
// the queued row still commits or rolls back with the caller's transaction.
async function queueBookingEmail({ companyId, templateKey, recipients, data, transaction }) {
    const company = await getCompanyProfile(companyId);
    const seen = new Set();
    const to = [];
    for (const r of recipients || []) {
        const email = r && (typeof r === 'string' ? r : r.email);
        if (!email) continue;
        const key = String(email).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        to.push(String(email));
    }
    if (!to.length) return;
    try {
        await emailAddress({
            templateKey,
            accountId: company ? company.accountId : null,
            companyId,
            to: to.join(', '),
            data: { companyName: company ? company.name : '', ...data },
            transaction,
        });
    } catch (error) {
        console.error(`Error queueing ${templateKey} email:`, error);
    }
}

module.exports = {
    advisoryLock, sweepExpiredLocks, dayTypeOf, bookingDateText, hhmm, escapeHtml,
    bookingFacts, recipientsOf, slotsTableHtml, participantsTableHtml, emailData, queueBookingEmail,
};
