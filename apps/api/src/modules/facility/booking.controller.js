// Facility Bookings (/facility/bookings; structures approved 2026-10-25,
// sub-slice 2b; golf's booking.controller shape). The DESK flow: pick a type
// and a date -> the day grid (availability) -> click slots to CLAIM them
// (short-lived SlotLock rows, one group per booking being keyed) -> key the
// booker and the roster -> confirm. Every binding rule is re-validated here at
// save under the day's advisory lock: the lock rows name the slots (never the
// client), the window resolves override > type > general for the booker,
// slots-per-day counts the booker and every member participant, the run must
// be consecutive on one unit, participants between min and max, guest control
// resolves exception > type policy > general with the monthly allowance drawn
// through the Membership seam, closures and other desks' locks refuse, a
// barred member cannot book. The booking number issues from the
// facility-booking series inside the transaction; approval (type or
// participant type) parks the booking pending with the slots held.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const { getGolfMemberStanding, getGuestAllowanceStanding, recordGuestVisit, voidGuestVisit } = require('../../platform/membershipGateway');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const workflowGateway = require('../../platform/workflowGateway');
const Booking = require('./booking.model');
const BookingSlot = require('./bookingSlot.model');
const BookingParticipant = require('./bookingParticipant.model');
const SlotLock = require('./slotLock.model');
const Facility = require('./facility.model');
const FacilityType = require('./facilityType.model');
const Patron = require('./patron.model');
const availability = require('./bookingAvailability.service');
const rules = require('./bookingRules.service');
const participantTypes = require('./participantType.service');
const patrons = require('./patron.service');
const approval = require('./bookingApproval.service');
const shared = require('./bookingShared');
const billing = require('./billing.service');
const { companyIdOf, stampsFor, DATE_RE, TIME_RE, toMinutes, txFail, runTx } = require('./facilityShared');
const { BOOKING_STATUSES, SLOT_STATUSES, BOOKING_CHANNELS, BOOKING_LIMITS, ACTIVE_SLOT_STATUS_KEYS } = require('./booking.constants');

// ---- DTOs -------------------------------------------------------------------

function typeDto(t) {
    return t ? {
        id: t.id, code: t.code, description: t.description,
        minParticipants: t.minParticipants, maxParticipants: t.maxParticipants,
        maxSlotsPerDayWeekday: t.maxSlotsPerDayWeekday, maxSlotsPerDayWeekend: t.maxSlotsPerDayWeekend,
        maxConsecutiveSlots: t.maxConsecutiveSlots, advanceBookingDays: t.advanceBookingDays,
        guestsAllowed: t.guestsAllowed !== false, memberGuestsAllowed: t.memberGuestsAllowed !== false,
        maxGuestsPerBooking: t.maxGuestsPerBooking, hostMustBePresent: t.hostMustBePresent === true,
        requiresApproval: t.requiresApproval === true,
    } : null;
}

function participantDto(p) {
    return { id: p.id, patronId: p.patronId, participantType: p.participantType, name: p.name, memberNo: p.memberNo, isHost: p.isHost === true, guestVisitId: p.guestVisitId, sortOrder: p.sortOrder };
}

function bookingDto(booking, facts, extras = {}) {
    const shown = facts.shownSlots;
    const shownIds = new Set(shown.map((s) => s.id));
    const date = shown.length ? String(shown[0].bookingDate) : null;
    return {
        id: booking.id,
        bookingNo: booking.bookingNo,
        facilityTypeId: booking.facilityTypeId,
        facilityType: facts.type ? { id: facts.type.id, code: facts.type.code, description: facts.type.description } : null,
        bookingDate: date,
        startTime: facts.firstStart,
        endTime: facts.lastEnd,
        facilities: [...new Set(facts.slots.filter((s) => shownIds.has(s.row.id)).map((s) => s.facilityCode))],
        booker: facts.booker ? patrons.dto(facts.booker, facts.bookerProfile) : null,
        contactMobile: booking.contactMobile,
        contactEmail: booking.contactEmail,
        remarks: booking.remarks,
        status: booking.status,
        channel: booking.channel,
        workflowInstanceId: booking.workflowInstanceId,
        cancelledAt: booking.cancelledAt,
        cancelReason: booking.cancelReason,
        isLateCancel: booking.isLateCancel === true,
        createdAt: booking.createdAt,
        canModify: booking.get ? booking.get('canModify') : undefined,
        slots: facts.slots.map((s) => ({
            id: s.row.id, facilityId: s.row.facilityId, facilityCode: s.facilityCode, facilityName: s.facilityName,
            bookingDate: String(s.row.bookingDate), startTime: shared.hhmm(s.row.startTime), endTime: shared.hhmm(s.row.endTime),
            slotNumber: s.row.slotNumber, sessionId: s.row.sessionId, dayType: s.row.dayType, status: s.row.status,
            checkedInAt: s.row.checkedInAt, cancelledAt: s.row.cancelledAt,
        })),
        participants: facts.roster.map(participantDto),
        ...extras,
    };
}

// ---- shared loaders ---------------------------------------------------------

async function loadType(companyId, facilityTypeId, { transaction } = {}) {
    if (!facilityTypeId) return null;
    return FacilityType.findOne({ where: { companyId, id: facilityTypeId, usageMode: 'slot' }, transaction });
}

async function findOwnedBooking(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const booking = await Booking.findOne({ where: { id: req.params.id, companyId } });
    if (!booking) return { status: 404, message: 'Booking not found.' };
    return { companyId, booking };
}

// The member standing behind a member number, or an error.
async function memberStanding(companyId, memberNo, label) {
    const no = String(memberNo || '').trim();
    if (!no) return { error: `${label}: key in the member number.` };
    const s = await getGolfMemberStanding(companyId, no);
    if (!s) return { error: `${label}: no member found with number '${no}'.`, status: 404 };
    if (s.actionControl === 'barred') return { error: `${label}: member ${s.memberNo} (${s.statusLabel || 'status'}) is barred from booking.` };
    return { standing: s };
}

// Resolve the roster lines keyed at the desk: a member-standing type needs a
// member number (standing looked up), a visitor guest needs a name. Returns
// { lines } or { error }.
async function resolveRoster(companyId, rawParticipants, types) {
    const raw = Array.isArray(rawParticipants) ? rawParticipants : [];
    if (raw.length > BOOKING_LIMITS.maxParticipantsPerBooking) return { error: 'Too many participants.' };
    const lines = [];
    for (let i = 0; i < raw.length; i += 1) {
        const line = raw[i] || {};
        const code = String(line.participantType || '');
        const t = participantTypes.findType(types, code);
        if (!t || t.isActive === false) return { error: `Participant ${i + 1}: pick a participant type.` };
        if (participantTypes.hasMemberStanding(types, code)) {
            const r = await memberStanding(companyId, line.memberNo, `Participant ${i + 1}`);
            if (r.error) return r;
            lines.push({ sortOrder: i + 1, participantType: code, base: t.baseIdentity, standing: r.standing, name: r.standing.name, memberNo: r.standing.memberNo, visitor: null });
        } else {
            const name = String(line.name || '').trim();
            if (!name) return { error: `Participant ${i + 1}: key in the guest's name.` };
            lines.push({
                sortOrder: i + 1, participantType: code, base: t.baseIdentity, standing: null, name, memberNo: null,
                visitor: { name, identityNo: line.identityNo || null, mobile: line.mobile || null, email: line.email || null },
            });
        }
    }
    return { lines };
}

// Rule 5 - guest control for a roster over a set of slots. `host` = the member
// standing whose allowance the guests draw on. Returns { error } or
// { guestLines, allowance }.
async function checkGuests({ companyId, setting, type, guestRules, dayType, date, slots, lines, host, types, transaction }) {
    const guests = lines.filter((l) => participantTypes.isVisitorGuest(types, l.participantType));
    const memberGuests = lines.filter((l) => l.base === 'member-guest');
    const guestLines = [...guests, ...memberGuests];
    if (!guestLines.length) return { guestLines, allowance: null };
    for (const s of slots) {
        const verdict = rules.resolveGuestRule({ setting, type, rules: guestRules, facilityTypeId: type.id, dayType, date, startTime: s.startTime });
        if (guests.length && !verdict.allowGuest) return { error: `Visitor guests are not allowed on ${type.code} at ${s.startTime} on ${date}.` };
        if (memberGuests.length && !verdict.allowMemberGuest) return { error: `Members as guests are not allowed on ${type.code} at ${s.startTime} on ${date}.` };
    }
    if (type.maxGuestsPerBooking != null && guests.length > Number(type.maxGuestsPerBooking)) {
        return { error: `At most ${type.maxGuestsPerBooking} visitor guest${Number(type.maxGuestsPerBooking) === 1 ? '' : 's'} per booking on ${type.code}.` };
    }
    if (!host) return { error: 'A member must host the guests - book as a member or name the host.' };
    if (type.hostMustBePresent === true && !lines.some((l) => l.standing && l.standing.memberId === host.memberId)) {
        return { error: `${type.code} requires the host (${host.memberNo}) to take part - add ${host.name} as a participant.` };
    }
    const allowance = await getGuestAllowanceStanding(companyId, host.memberId, date, { transaction });
    if (allowance && allowance.allowance != null && allowance.remaining < guestLines.length) {
        return { error: `${host.name} (${host.memberNo}) has ${allowance.remaining} of ${allowance.allowance} monthly guest visits left - this booking needs ${guestLines.length}.` };
    }
    return { guestLines, allowance };
}

// Rule 2 - the per-day slots cap for the booker and every member line.
async function checkDailyLimits({ companyId, type, date, dayType, slotCount, people, transaction, excludeBookingId = null }) {
    const limit = dayType === 'weekend' ? Number(type.maxSlotsPerDayWeekend || 0) : Number(type.maxSlotsPerDayWeekday || 0);
    if (!limit) return null;
    const ids = [...new Set(people.map((p) => p.patronId))];
    const held = await availability.heldSlotsByPatron(companyId, type.id, date, ids, { transaction, excludeBookingId });
    for (const p of people) {
        const err = rules.checkDailyLimit({ held: held.get(p.patronId) || 0, adding: slotCount, limit, name: p.name, dayType });
        if (err) return err;
    }
    return null;
}

// Write the roster on every slot given; the guest visits are recorded ONCE per
// guest line (on the first slot's row) so a two-slot booking is one visit.
async function writeRoster({ companyId, slotRows, lines, host, date, stamps, transaction }) {
    for (let si = 0; si < slotRows.length; si += 1) {
        const slot = slotRows[si];
        for (const l of lines) {
            const row = await BookingParticipant.create({
                companyId,
                bookingSlotId: slot.id,
                patronId: l.patronId || null,
                participantType: l.participantType,
                name: l.name,
                memberNo: l.memberNo,
                isHost: !!(host && l.standing && l.standing.memberId === host.memberId),
                sortOrder: l.sortOrder,
            }, { transaction });
            if (si === 0 && l.isGuestLine && host) {
                const visit = await recordGuestVisit(companyId, {
                    memberId: host.memberId, visitDate: date, sourceModule: 'facility', sourceRef: row.id, guestName: l.name, guestCount: 1, stamps,
                }, { transaction });
                if (visit && visit.id) { row.guestVisitId = visit.id; await row.save({ transaction }); }
            }
        }
    }
}

// Patron rows for the roster lines (members found or created from their
// standing, visitors with an identity number or mobile found or created,
// casual names left without a Patron).
async function attachPatrons(companyId, lines, stamps, transaction) {
    for (const l of lines) {
        if (l.standing) {
            const p = await patrons.ensureMemberPatron(companyId, l.standing, stamps, { transaction });
            l.patronId = p.id;
        } else if (l.visitor && (l.visitor.identityNo || l.visitor.mobile)) {
            const r = await patrons.ensureOtherPatron(companyId, l.visitor, stamps, { transaction });
            if (r.error) return r.error;
            l.patronId = r.patron.id;
        } else {
            l.patronId = null;
        }
    }
    return null;
}

// ---- GET /api/facility/bookings/meta ---------------------------------------
exports.meta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [types, ptypes, { setting }] = await Promise.all([
            availability.slotTypes(companyId),
            participantTypes.catalog(companyId, { activeOnly: true }),
            availability.loadRules(companyId),
        ]);
        res.status(200).json({
            facilityTypes: types.map(typeDto),
            participantTypes: participantTypes.asVocabulary(ptypes),
            statuses: BOOKING_STATUSES,
            slotStatuses: SLOT_STATUSES,
            channels: BOOKING_CHANNELS,
            limits: BOOKING_LIMITS,
            setting: {
                guestControlEnabled: setting.guestControlEnabled === true,
                noShowControlEnabled: setting.noShowControlEnabled === true,
                cancellationNoticeHours: setting.cancellationNoticeHours,
                bookingLockMinutes: setting.bookingLockMinutes,
                allowSameDayBooking: setting.allowSameDayBooking === true,
                advanceBookingDays: setting.advanceBookingDays,
            },
        });
    } catch (error) {
        console.error('Error loading facility booking meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bookings/context?memberNo&facilityTypeId&date -------
// A member keyed at the desk: standing, the resolved window for the type, the
// monthly guest allowance and the slots already held that day.
exports.context = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const r = await memberStanding(companyId, req.query.memberNo, 'Member');
        if (r.error && r.status === 404) return res.status(404).json({ message: r.error });
        const standing = r.standing || (await getGolfMemberStanding(companyId, String(req.query.memberNo || '').trim()));
        if (!standing) return res.status(404).json({ message: r.error });
        const type = await loadType(companyId, req.query.facilityTypeId);
        const date = String(req.query.date || '');
        const [{ setting }, timezone] = await Promise.all([availability.loadRules(companyId), companyTimezoneById(companyId)]);
        const window = await availability.windowFor(companyId, { setting, type, membershipTypeId: standing.membershipTypeId, timezone });
        const allowance = await getGuestAllowanceStanding(companyId, standing.memberId, DATE_RE.test(date) ? date : window.now.date);
        let heldSlots = 0;
        if (type && DATE_RE.test(date)) {
            const patron = await Patron.findOne({ where: { companyId, patronType: 'member', sourceId: standing.memberId }, attributes: ['id'] });
            if (patron) heldSlots = (await availability.heldSlotsByPatron(companyId, type.id, date, [patron.id])).get(patron.id) || 0;
        }
        res.status(200).json({
            member: {
                memberId: standing.memberId, memberNo: standing.memberNo, name: standing.name, email: standing.email,
                membershipTypeId: standing.membershipTypeId, membershipTypeCategory: standing.membershipTypeCategory,
                statusLabel: standing.statusLabel, actionControl: standing.actionControl,
            },
            barred: standing.actionControl === 'barred',
            warning: standing.actionControl === 'warning' ? `Member ${standing.memberNo} is ${standing.statusLabel || 'under warning'} - booking allowed with this standing shown.` : null,
            window: { dateFrom: window.dateFrom, dateTo: window.dateTo, effectiveDays: window.effectiveDays, hours: window.hours },
            guestAllowance: allowance,
            heldSlots,
        });
    } catch (error) {
        console.error('Error loading facility booking context:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bookings/availability?facilityTypeId&date -----------
exports.availability = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const date = String(req.query.date || '');
        if (!DATE_RE.test(date)) return res.status(400).json({ message: 'Pick a date.' });
        const type = await loadType(companyId, req.query.facilityTypeId);
        if (!type) return res.status(400).json({ message: 'Pick a slot-booked facility type.' });
        const callerId = getUserContext(req).userId;
        const [dayType, units, timezone, { setting }] = await Promise.all([
            shared.dayTypeOf(companyId, date), availability.unitsOf(companyId, type.id), companyTimezoneById(companyId), availability.loadRules(companyId),
        ]);
        const now = rules.clubNow(timezone);
        const slotSet = await availability.resolveSlotSet(type.id, dayType, date);
        const unitIds = units.map((u) => u.id);
        const [blocks, occ, locks] = await Promise.all([
            availability.closureBlocks(companyId, type.id, unitIds, date),
            availability.occupancy(companyId, type.id, date),
            availability.activeLocks(companyId, date),
        ]);
        const grid = availability.buildGrid({ units, slotSet, blocks, occ, locks, callerId, now, date });
        const generalWindow = rules.bookingWindow({
            now, effectiveDays: rules.effectiveAdvanceDays({ setting, type, overrideDays: null }), hours: Number(setting.advanceBookingHours || 0), allowSameDay: setting.allowSameDayBooking === true,
        });
        res.status(200).json({
            facilityType: typeDto(type),
            date,
            dayType,
            clubNow: now,
            slotSet: slotSet ? { id: slotSet.id, description: slotSet.description, dayScope: slotSet.dayScope, effectiveDate: String(slotSet.effectiveDate), slotMinutes: slotSet.slotMinutes } : null,
            slots: grid.slots,
            columns: grid.columns,
            lockMinutes: setting.bookingLockMinutes,
            window: generalWindow,
        });
    } catch (error) {
        console.error('Error loading facility availability:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- POST /api/facility/bookings/locks -------------------------------------
// Claim a run of slots on one unit for the booking being keyed. Sending an
// existing groupId REPLACES that group's claim with the new selection (the
// desk adds or removes a slot while keying).
exports.claimLocks = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const callerId = getUserContext(req).userId;
        const date = String(req.body.bookingDate || '');
        if (!DATE_RE.test(date)) return res.status(400).json({ message: 'Pick a date.' });
        const unit = await Facility.findOne({ where: { companyId, id: String(req.body.facilityId || ''), isActive: true } });
        if (!unit) return res.status(400).json({ message: 'Pick a facility.' });
        const type = await loadType(companyId, unit.facilityTypeId);
        if (!type || !type.isActive) return res.status(400).json({ message: 'That facility type is not bookable.' });
        const starts = [...new Set((Array.isArray(req.body.startTimes) ? req.body.startTimes : []).map((t) => String(t).slice(0, 5)))];
        if (!starts.length || starts.some((t) => !TIME_RE.test(t))) return res.status(400).json({ message: 'Pick at least one slot.' });
        if (starts.length > BOOKING_LIMITS.maxSlotsPerBooking) return res.status(400).json({ message: 'Too many slots for one booking.' });

        const [dayType, timezone, { setting }] = await Promise.all([shared.dayTypeOf(companyId, date), companyTimezoneById(companyId), availability.loadRules(companyId)]);
        const now = rules.clubNow(timezone);
        const slotSet = await availability.resolveSlotSet(type.id, dayType, date);
        if (!slotSet) return res.status(400).json({ message: `${type.code} has no slot set in force on ${date}.` });
        const picked = starts.map((t) => slotSet.slots.find((s) => s.startTime === t) || null);
        if (picked.some((s) => !s)) return res.status(400).json({ message: 'One of the slots is not on the day\'s slot set - refresh the grid.' });
        const runError = rules.checkRun(picked.map((s) => s.slotNumber), Number(type.maxConsecutiveSlots || 0));
        if (runError) return res.status(400).json({ message: runError });
        if (picked.some((s) => rules.isPast(now, date, s.startTime))) return res.status(400).json({ message: 'That slot has already started.' });

        const lockMinutes = Math.min(Number(setting.bookingLockMinutes || 5), BOOKING_LIMITS.maxLockMinutes);
        const requestedGroup = req.body.groupId ? String(req.body.groupId) : null;
        const out = await sequelize.transaction(async (transaction) => {
            await shared.advisoryLock(transaction, companyId, date);
            await shared.sweepExpiredLocks(companyId, date, transaction);
            if (requestedGroup) await SlotLock.destroy({ where: { companyId, groupId: requestedGroup, lockedBy: callerId }, transaction });
            const [blocks, occ, locks] = await Promise.all([
                availability.closureBlocks(companyId, type.id, [unit.id], date, { transaction }),
                availability.occupancy(companyId, type.id, date, { transaction }),
                availability.activeLocks(companyId, date, { transaction }),
            ]);
            const grid = availability.buildGrid({ units: [unit], slotSet, blocks, occ, locks, callerId, now, date });
            const cells = grid.columns[0].cells;
            for (const s of picked) {
                const cell = cells.find((c) => c.startTime === s.startTime);
                if (!cell || !['open', 'front-desk'].includes(cell.state)) {
                    return { taken: true, message: cell && cell.state === 'closed' ? `${unit.code} is closed at ${s.startTime}.` : `${unit.code} at ${s.startTime} was just taken - refresh the grid.` };
                }
            }
            const groupId = requestedGroup || crypto.randomUUID();
            const expiresAt = new Date(Date.now() + lockMinutes * 60000);
            await SlotLock.bulkCreate(picked.map((s) => ({
                companyId, groupId, facilityId: unit.id, bookingDate: date, startTime: `${s.startTime}:00`, expiresAt, lockedBy: callerId,
            })), { transaction });
            return { groupId, expiresAt };
        });
        if (out.taken) return res.status(409).json({ message: out.message });
        res.status(201).json({
            groupId: out.groupId,
            expiresAt: out.expiresAt.toISOString(),
            lockMinutes,
            facility: { id: unit.id, code: unit.code, name: unit.name },
            facilityType: typeDto(type),
            bookingDate: date,
            dayType,
            slots: picked.sort((a, b) => a.slotNumber - b.slotNumber).map((s) => ({ slotNumber: s.slotNumber, startTime: s.startTime, endTime: s.endTime, isFrontDesk: s.isFrontDesk })),
        });
    } catch (error) {
        console.error('Error claiming facility slots:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- DELETE /api/facility/bookings/locks/:groupId ---------------------------
exports.releaseLock = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        await SlotLock.destroy({ where: { companyId, groupId: req.params.groupId, lockedBy: getUserContext(req).userId } });
        res.status(200).json({ message: 'Slots released.' });
    } catch (error) {
        console.error('Error releasing facility slots:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- POST /api/facility/bookings --------------------------------------------
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const callerId = getUserContext(req).userId;
        const groupId = String(req.body.lockGroupId || '');
        if (!groupId) return res.status(400).json({ message: 'The slot claim is missing - pick the slots again.' });

        // The lock rows name the slots - never the client.
        const lockRows = await SlotLock.findAll({ where: { companyId, groupId, lockedBy: callerId, expiresAt: { [Op.gt]: new Date() } }, order: [['startTime', 'ASC']] });
        if (!lockRows.length) return res.status(409).json({ message: 'Your slot claim has expired - pick the slots again.' });
        const date = String(lockRows[0].bookingDate);
        const unit = await Facility.findOne({ where: { companyId, id: lockRows[0].facilityId } });
        if (!unit || !unit.isActive) return res.status(400).json({ message: 'That facility is no longer bookable.' });
        const type = await loadType(companyId, unit.facilityTypeId);
        if (!type || !type.isActive) return res.status(400).json({ message: 'That facility type is not bookable.' });

        const [dayType, timezone, { setting, sessions, guestRules }, types] = await Promise.all([
            shared.dayTypeOf(companyId, date), companyTimezoneById(companyId), availability.loadRules(companyId), participantTypes.catalog(companyId),
        ]);
        const now = rules.clubNow(timezone);
        const slotSet = await availability.resolveSlotSet(type.id, dayType, date);
        if (!slotSet) return res.status(400).json({ message: `${type.code} has no slot set in force on ${date}.` });
        const picked = lockRows.map((l) => slotSet.slots.find((s) => s.startTime === shared.hhmm(l.startTime)) || null);
        if (picked.some((s) => !s)) return res.status(400).json({ message: 'The claimed slots are no longer on the day\'s slot set - pick them again.' });
        const runError = rules.checkRun(picked.map((s) => s.slotNumber), Number(type.maxConsecutiveSlots || 0));
        if (runError) return res.status(400).json({ message: runError });

        // The booker: a member (standing) or a visitor (profile).
        const bookerIn = req.body.booker || {};
        let bookerStanding = null;
        let bookerVisitor = null;
        if (bookerIn.kind === 'visitor') {
            const name = String(bookerIn.name || '').trim();
            if (!name) return res.status(400).json({ message: 'Key in the visitor\'s name.' });
            bookerVisitor = { name, identityNo: bookerIn.identityNo || null, mobile: bookerIn.mobile || null, email: bookerIn.email || null };
        } else {
            const r = await memberStanding(companyId, bookerIn.memberNo, 'Booker');
            if (r.error) return res.status(r.status || 400).json({ message: r.error });
            bookerStanding = r.standing;
        }

        // Rule 1 - the booker's window (visitors get the general rule).
        const window = await availability.windowFor(companyId, { setting, type, membershipTypeId: bookerStanding ? bookerStanding.membershipTypeId : null, timezone });
        const windowError = rules.windowVerdict(window, date);
        if (windowError) return res.status(400).json({ message: windowError });

        // The roster, rule 4, the host and rule 5.
        const roster = await resolveRoster(companyId, req.body.participants, types);
        if (roster.error) return res.status(roster.status || 400).json({ message: roster.error });
        const { lines } = roster;
        if (Number(type.minParticipants || 0) > 0 || type.maxParticipants != null) {
            const countError = rules.checkParticipantCount(lines.length, type);
            if (countError) return res.status(400).json({ message: countError });
        }
        let host = bookerStanding;
        if (req.body.hostMemberNo) {
            const r = await memberStanding(companyId, req.body.hostMemberNo, 'Host');
            if (r.error) return res.status(r.status || 400).json({ message: r.error });
            host = r.standing;
        }
        const contactMobile = req.body.contactMobile ? String(req.body.contactMobile).slice(0, 30) : (bookerVisitor ? bookerVisitor.mobile : null);
        const contactEmail = req.body.contactEmail ? String(req.body.contactEmail).slice(0, 255) : (bookerVisitor ? bookerVisitor.email : (bookerStanding ? bookerStanding.email : null));
        const remarks = req.body.remarks ? String(req.body.remarks).slice(0, 255) : null;
        const stamps = await stampsFor(req);

        const result = await sequelize.transaction(async (transaction) => {
            await shared.advisoryLock(transaction, companyId, date);
            await shared.sweepExpiredLocks(companyId, date, transaction);
            const live = await SlotLock.count({ where: { companyId, groupId, lockedBy: callerId }, transaction });
            if (live !== lockRows.length) return { fail: 'Your slot claim has expired - pick the slots again.', status: 409 };

            // Rule 6 - closures and occupancy, re-read under the lock.
            const [blocks, occ] = await Promise.all([
                availability.closureBlocks(companyId, type.id, [unit.id], date, { transaction }),
                availability.occupancy(companyId, type.id, date, { transaction }),
            ]);
            for (const s of picked) {
                if (occ.has(availability.cellKey(unit.id, s.startTime))) return { fail: `${unit.code} at ${s.startTime} was just booked - pick the slots again.`, status: 409 };
                if (rules.isBlocked(blocks.get(unit.id) || [], toMinutes(s.startTime), toMinutes(s.endTime))) {
                    return { fail: `${unit.code} is closed at ${s.startTime} on ${date}.`, status: 400 };
                }
            }

            // Rule 5 under the transaction (the allowance read rides it).
            const guests = await checkGuests({ companyId, setting, type, guestRules, dayType, date, slots: picked, lines, host, types, transaction });
            if (guests.error) return { fail: guests.error, status: 400 };
            for (const l of guests.guestLines) l.isGuestLine = true;

            // Patrons: the booker and the roster.
            let bookerPatron;
            if (bookerStanding) bookerPatron = await patrons.ensureMemberPatron(companyId, bookerStanding, stamps, { transaction });
            else {
                const r = await patrons.ensureOtherPatron(companyId, bookerVisitor, stamps, { transaction });
                if (r.error) return { fail: r.error, status: 400 };
                bookerPatron = r.patron;
            }
            const patronError = await attachPatrons(companyId, lines, stamps, transaction);
            if (patronError) return { fail: patronError, status: 400 };

            // Rule 2 - slots per day for the booker (member) and every member line.
            const people = [];
            if (bookerStanding) people.push({ patronId: bookerPatron.id, name: `${bookerStanding.name} (${bookerStanding.memberNo})` });
            for (const l of lines) if (l.standing && !people.some((p) => p.patronId === l.patronId)) people.push({ patronId: l.patronId, name: `${l.name} (${l.memberNo})` });
            const limitError = await checkDailyLimits({ companyId, type, date, dayType, slotCount: picked.length, people, transaction });
            if (limitError) return { fail: limitError, status: 400 };

            // Booking number from the facility-booking series (gapless: the
            // counter rides this transaction).
            let bookingNo = null;
            const issued = await numberingGateway.issueNumber(req, 'facility-booking', { transaction });
            if (issued && issued.number) bookingNo = issued.number;
            else if (issued && issued.manual) {
                bookingNo = String(req.body.bookingNo || '').trim();
                if (!bookingNo) return { fail: 'The Booking No. scheme is manual - key in a booking number.', status: 400 };
            } else {
                return { fail: 'Configure the Booking No. numbering scheme first (Facility Management - Numbering Control).', status: 400 };
            }

            const booking = await Booking.create({
                companyId, bookingNo, facilityTypeId: type.id, bookerPatronId: bookerPatron.id,
                contactMobile, contactEmail, remarks, status: 'booked', channel: 'desk', ...stamps,
            }, { transaction });
            const slotRows = [];
            for (const s of picked) {
                const session = rules.sessionOf(sessions, s.startTime);
                slotRows.push(await BookingSlot.create({
                    companyId, bookingId: booking.id, facilityTypeId: type.id, facilityId: unit.id, bookingDate: date,
                    startTime: `${s.startTime}:00`, endTime: `${s.endTime}:00`, slotNumber: s.slotNumber,
                    sessionId: session ? session.id : null, dayType, status: 'booked',
                }, { transaction }));
            }
            await writeRoster({ companyId, slotRows, lines, host, date, stamps, transaction });
            await SlotLock.destroy({ where: { companyId, groupId }, transaction });

            // Approval: the type or a participant type requiring it parks the
            // booking pending with the slots held; no chain = booked at once.
            const codes = approval.approvalCodes(types, lines, type);
            const facts = await shared.bookingFacts(booking, { transaction });
            const labels = approval.labelsOf(types);
            if (codes.length) {
                const wf = await workflowGateway.startWorkflow(req, approval.PURPOSE, {
                    entityId: booking.id,
                    entityLabel: `Booking ${bookingNo} - ${bookerPatron.name}${bookerPatron.memberNo ? ` (${bookerPatron.memberNo})` : ''} ${date} ${picked[0].startTime} ${unit.code}`,
                    context: approval.contextFor({ type, dayType, date, startTime: picked[0].startTime, slots: picked.length, lines, types, codes, guests: guests.guestLines.length }),
                    transaction,
                });
                if (wf) {
                    booking.status = 'pending-approval';
                    booking.workflowInstanceId = wf.instanceId;
                    await booking.save({ transaction });
                    await shared.queueBookingEmail({
                        companyId, templateKey: 'facility.booking.pending',
                        recipients: await shared.recipientsOf(companyId, booking, facts),
                        data: shared.emailData(booking, facts, labels), transaction,
                    });
                    return { booking, facts };
                }
            }
            await shared.queueBookingEmail({
                companyId, templateKey: 'facility.booking.confirmed',
                recipients: await shared.recipientsOf(companyId, booking, facts),
                data: shared.emailData(booking, facts, labels), transaction,
            });
            return { booking, facts };
        });
        if (result.fail) return res.status(result.status || 400).json({ message: result.fail });
        const { booking, facts } = result;
        res.status(201).json({
            message: booking.status === 'pending-approval' ? `Booking ${booking.bookingNo} submitted for approval - the slots are held.` : `Booking ${booking.bookingNo} confirmed.`,
            booking: bookingDto(booking, facts),
        });
    } catch (error) {
        if (error && error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'One of the slots was just booked - pick the slots again.' });
        console.error('Error creating facility booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bookings?date&facilityTypeId -------------------------
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const date = String(req.query.date || '');
        if (!DATE_RE.test(date)) return res.status(400).json({ message: 'Pick a date.' });
        const where = { companyId, bookingDate: date };
        if (req.query.facilityTypeId) where.facilityTypeId = String(req.query.facilityTypeId);
        const slotRows = await BookingSlot.findAll({ where, attributes: ['bookingId'], group: ['bookingId'] });
        const ids = slotRows.map((s) => s.bookingId);
        const rows = ids.length ? await Booking.findAll({ where: { companyId, id: { [Op.in]: ids } } }) : [];
        await annotateCanModify(req, rows);
        const bills = await billing.summariesFor(companyId, rows.map((b) => b.id));
        const dtos = [];
        for (const b of rows) dtos.push(bookingDto(b, await shared.bookingFacts(b), { bill: bills.get(b.id) || null }));
        dtos.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')) || a.bookingNo.localeCompare(b.bookingNo));
        res.status(200).json({ bookings: dtos });
    } catch (error) {
        console.error('Error listing facility bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bookings/search?q ------------------------------------
// By booking number, or by the booker's name / member number.
exports.search = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.status(200).json({ bookings: [] });
        const like = `%${q}%`;
        const bookers = await Patron.findAll({ where: { companyId, [Op.or]: [{ name: { [Op.iLike]: like } }, { memberNo: { [Op.iLike]: like } }] }, attributes: ['id'], limit: 200 });
        const rows = await Booking.findAll({
            where: { companyId, [Op.or]: [{ bookingNo: { [Op.iLike]: like } }, ...(bookers.length ? [{ bookerPatronId: { [Op.in]: bookers.map((p) => p.id) } }] : [])] },
            order: [['createdAt', 'DESC']],
            limit: BOOKING_LIMITS.searchLimit,
        });
        await annotateCanModify(req, rows);
        const bills = await billing.summariesFor(companyId, rows.map((b) => b.id));
        const dtos = [];
        for (const b of rows) dtos.push(bookingDto(b, await shared.bookingFacts(b), { bill: bills.get(b.id) || null }));
        res.status(200).json({ bookings: dtos });
    } catch (error) {
        console.error('Error searching facility bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bookings/:id ------------------------------------------
exports.get = async (req, res) => {
    try {
        const found = await findOwnedBooking(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, booking } = found;
        await annotateCanModify(req, [booking]);
        const facts = await shared.bookingFacts(booking);
        const [{ setting }, timezone] = await Promise.all([availability.loadRules(companyId), companyTimezoneById(companyId)]);
        const verdict = facts.liveSlots.length
            ? rules.cancelVerdict({ setting, now: rules.clubNow(timezone), bookingDate: String(facts.liveSlots[0].bookingDate), startTime: facts.firstStart })
            : null;
        const bills = await billing.summariesFor(companyId, [booking.id]);
        res.status(200).json(bookingDto(booking, facts, { cancelVerdict: verdict, bill: bills.get(booking.id) || null }));
    } catch (error) {
        console.error('Error loading facility booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bookings/:id/cancel-preview -------------------------
// Show-expected-results: is a cancel made NOW late (no-show control ON and
// inside the notice window)? Re-evaluated at the cancel itself.
exports.cancelPreview = async (req, res) => {
    try {
        const found = await findOwnedBooking(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, booking } = found;
        if (booking.status === 'cancelled') return res.status(400).json({ message: 'This booking is already cancelled.' });
        const facts = await shared.bookingFacts(booking);
        const [{ setting }, timezone] = await Promise.all([availability.loadRules(companyId), companyTimezoneById(companyId)]);
        const verdict = facts.liveSlots.length
            ? rules.cancelVerdict({ setting, now: rules.clubNow(timezone), bookingDate: String(facts.liveSlots[0].bookingDate), startTime: facts.firstStart })
            : { controlled: false, late: false, noticeHours: 0, minutesLeft: 0 };
        res.status(200).json({ ...verdict, pending: booking.status === 'pending-approval', slots: facts.liveSlots.length, guestVisits: facts.participants.filter((p) => p.guestVisitId).length });
    } catch (error) {
        console.error('Error previewing facility booking cancel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- POST /api/facility/bookings/:id/cancel ---------------------------------
exports.cancel = async (req, res) => {
    try {
        const found = await findOwnedBooking(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, booking } = found;
        if (!(await canModifyRecord(req, booking))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        if (booking.status === 'cancelled') return res.status(400).json({ message: 'This booking is already cancelled.' });
        const callerId = getUserContext(req).userId;
        const reason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        const facts0 = await shared.bookingFacts(booking);
        const date = facts0.liveSlots.length ? String(facts0.liveSlots[0].bookingDate) : null;
        const [{ setting }, timezone, types] = await Promise.all([availability.loadRules(companyId), companyTimezoneById(companyId), participantTypes.catalog(companyId)]);
        const wasPending = booking.status === 'pending-approval';
        const verdict = date && !wasPending
            ? rules.cancelVerdict({ setting, now: rules.clubNow(timezone), bookingDate: date, startTime: facts0.firstStart })
            : { late: false };

        const out = await sequelize.transaction(async (transaction) => {
            if (date) await shared.advisoryLock(transaction, companyId, date);
            const row = await Booking.findOne({ where: { id: booking.id, companyId }, transaction, lock: transaction.LOCK.UPDATE });
            if (!row || row.status === 'cancelled') return { fail: 'This booking is already cancelled.' };
            row.status = 'cancelled';
            row.cancelledAt = new Date();
            row.cancelledBy = callerId;
            row.cancelReason = reason;
            row.isLateCancel = verdict.late === true;
            row.workflowInstanceId = null;
            row.updatedBy = callerId;
            await row.save({ transaction });
            await approval.releaseSlots(row, { transaction });
            if (wasPending) await workflowGateway.cancelForEntity(approval.ENTITY_TYPE, row.id, transaction);
            const facts = await shared.bookingFacts(row, { transaction });
            await shared.queueBookingEmail({
                companyId, templateKey: 'facility.booking.cancelled',
                recipients: await shared.recipientsOf(companyId, row, facts),
                data: shared.emailData(row, facts, approval.labelsOf(types), { cancelReason: reason || '' }), transaction,
            });
            return { row, facts };
        });
        if (out.fail) return res.status(400).json({ message: out.fail });
        res.status(200).json({
            message: verdict.late ? `Booking ${out.row.bookingNo} cancelled - inside the ${verdict.noticeHours}-hour notice, recorded as a late cancellation.` : `Booking ${out.row.bookingNo} cancelled.`,
            booking: bookingDto(out.row, out.facts),
        });
    } catch (error) {
        console.error('Error cancelling facility booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- PUT /api/facility/bookings/:id/participants ----------------------------
// Replace the roster on every live slot (the same rules as at create: count,
// guests, daily limits for members newly added); the guest visits are voided
// and re-recorded so the ledger follows the roster.
exports.saveParticipants = async (req, res) => {
    try {
        const found = await findOwnedBooking(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, booking } = found;
        if (!(await canModifyRecord(req, booking))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        if (booking.status === 'cancelled') return res.status(400).json({ message: 'This booking is cancelled.' });
        const facts0 = await shared.bookingFacts(booking);
        if (!facts0.liveSlots.length) return res.status(400).json({ message: 'This booking has no live slots.' });
        if (facts0.liveSlots.some((s) => s.status !== 'booked')) return res.status(400).json({ message: 'The roster is frozen once a slot is checked in.' });
        const type = await loadType(companyId, booking.facilityTypeId);
        const date = String(facts0.liveSlots[0].bookingDate);
        const dayType = facts0.liveSlots[0].dayType;
        const [{ setting, guestRules }, types] = await Promise.all([availability.loadRules(companyId), participantTypes.catalog(companyId)]);
        const roster = await resolveRoster(companyId, req.body.participants, types);
        if (roster.error) return res.status(roster.status || 400).json({ message: roster.error });
        const { lines } = roster;
        if (Number(type.minParticipants || 0) > 0 || type.maxParticipants != null) {
            const countError = rules.checkParticipantCount(lines.length, type);
            if (countError) return res.status(400).json({ message: countError });
        }
        let host = facts0.booker && facts0.booker.patronType === 'member' ? await getGolfMemberStanding(companyId, facts0.booker.memberNo) : null;
        if (req.body.hostMemberNo) {
            const r = await memberStanding(companyId, req.body.hostMemberNo, 'Host');
            if (r.error) return res.status(r.status || 400).json({ message: r.error });
            host = r.standing;
        }
        const stamps = await stampsFor(req);
        const callerId = getUserContext(req).userId;
        const slotsLite = facts0.liveSlots.map((s) => ({ startTime: shared.hhmm(s.startTime), endTime: shared.hhmm(s.endTime) }));

        const out = await runTx(sequelize, async (transaction) => {
            await shared.advisoryLock(transaction, companyId, date);
            // Void the current guest visits before the allowance is re-read.
            const oldIds = facts0.participants.map((p) => p.id);
            for (const p of facts0.participants) if (p.guestVisitId) await voidGuestVisit(companyId, 'facility', p.id, { transaction });
            if (oldIds.length) await BookingParticipant.destroy({ where: { id: { [Op.in]: oldIds } }, transaction });

            const guests = await checkGuests({ companyId, setting, type, guestRules, dayType, date, slots: slotsLite, lines, host, types, transaction });
            if (guests.error) txFail(guests.error);
            for (const l of guests.guestLines) l.isGuestLine = true;
            const patronError = await attachPatrons(companyId, lines, stamps, transaction);
            if (patronError) txFail(patronError);
            const people = [];
            for (const l of lines) if (l.standing && l.patronId !== booking.bookerPatronId && !people.some((p) => p.patronId === l.patronId)) people.push({ patronId: l.patronId, name: `${l.name} (${l.memberNo})` });
            const limitError = await checkDailyLimits({ companyId, type, date, dayType, slotCount: facts0.liveSlots.length, people, transaction, excludeBookingId: booking.id });
            if (limitError) txFail(limitError);
            await writeRoster({ companyId, slotRows: facts0.liveSlots, lines, host, date, stamps, transaction });
            booking.updatedBy = callerId;
            await booking.save({ transaction });
            return { facts: await shared.bookingFacts(booking, { transaction }) };
        });
        if (out.error) return res.status(out.status || 400).json({ message: out.error });
        res.status(200).json({ message: 'Participants saved.', booking: bookingDto(booking, out.facts) });
    } catch (error) {
        console.error('Error saving facility booking participants:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.ACTIVE_SLOT_STATUS_KEYS = ACTIVE_SLOT_STATUS_KEYS;
