// Facility classes - the LIFECYCLE engine (slice 5c, structures approved
// 2026-10-26): the patron's cancellation under the class notice (in time: an
// open bill is voided, a settled one goes to Finance; late: the fee stands;
// a term withdrawal keeps its fee), the club's session cancellation cascading
// to every seat and the queue, and the WAITLIST: join when full, the first in
// the queue offered a freed seat for the Specification's offer hours, the
// desk confirming it into an enrolment, a withdrawal, and the worker lapsing
// expired offers and offering the next. The pure pieces live in
// classWaitlistRules.service.js; enrolments are created by
// classEnrolment.service.js (an offered seat counts as taken there).

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const FacilityClass = require('./class.model');
const FacilityClassSchedule = require('./classSchedule.model');
const FacilityClassSession = require('./classSession.model');
const FacilityClassEnrolment = require('./classEnrolment.model');
const FacilityClassAttendance = require('./classAttendance.model');
const FacilityClassWaitlist = require('./classWaitlist.model');
const FacilityVenue = require('./venue.model');
const FacilityInstructor = require('./instructor.model');
const Patron = require('./patron.model');
const patrons = require('./patron.service');
const billing = require('./billing.service');
const availability = require('./bookingAvailability.service');
const bookingRules = require('./bookingRules.service');
const enrolmentRules = require('./classEnrolmentRules.service');
const rules = require('./classWaitlistRules.service');
const emails = require('./classEmails.service');
const enrolment = require('./classEnrolment.service');
const { bookingDateText } = require('./bookingShared');
const { stampsFor, timeDto, txFail, runTx } = require('./facilityShared');

async function clubNowFor(companyId) {
    return bookingRules.clubNow(await companyTimezoneById(companyId));
}

function billSummary(b) {
    return b ? { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) } : null;
}

function waitlistDto(w, extra = {}) {
    return {
        id: w.id, classId: w.classId, sessionId: w.sessionId, scheduleId: w.scheduleId, patronId: w.patronId, patronName: w.patronName, memberNo: w.memberNo,
        status: w.status, offeredAt: w.offeredAt, offerExpiresAt: w.offerExpiresAt, enrolmentId: w.enrolmentId, remarks: w.remarks, createdAt: w.createdAt, ...extra,
    };
}

// ---- rule 9: the patron's cancellation ------------------------------------------------

async function cancelPreview(companyId, enrolmentId) {
    const e = await FacilityClassEnrolment.findOne({ where: { companyId, id: enrolmentId } });
    if (!e) return { error: 'Enrolment not found.', status: 404 };
    if (e.status === 'cancelled') return { error: 'This seat is already cancelled.', status: 409 };
    const [cls, { setting }, now, bill] = await Promise.all([
        FacilityClass.findOne({ where: { id: e.classId } }),
        availability.loadRules(companyId),
        clubNowFor(companyId),
        e.billId ? billing.Bill.findOne({ where: { id: e.billId } }) : null,
    ]);
    const noticeHours = rules.noticeHoursFor(cls, setting);
    const base = { enrolment: { id: e.id, patronName: e.patronName, memberNo: e.memberNo, status: e.status, feeAmount: Number(e.feeAmount) }, classCode: cls ? cls.code : '', noticeHours, bill: billSummary(bill) };
    if (e.scheduleId) {
        const remaining = await FacilityClassAttendance.count({ where: { enrolmentId: e.id, status: 'enrolled', sessionDate: { [Op.gte]: now.date } } });
        return { ...base, mode: 'term', late: false, remainingSessions: remaining, outcome: bill ? 'stands' : 'none' };
    }
    const session = await FacilityClassSession.findOne({ where: { id: e.sessionId } });
    if (!session) return { error: 'The seat\'s session no longer exists.', status: 409 };
    if (session.status !== 'scheduled') return { error: `The session is ${session.status} - the seat is final.`, status: 409 };
    const verdict = rules.cancelVerdict({ now, sessionDate: session.sessionDate, startTime: session.startTime, noticeHours });
    return { ...base, mode: 'session', late: verdict.late, remainingSessions: 1, session: { id: session.id, sessionDate: String(session.sessionDate), startTime: timeDto(session.startTime) }, outcome: rules.billOutcome(bill, verdict) };
}

async function cancelEnrolment(req, enrolmentId, { reason = null } = {}) {
    const companyId = getUserContext(req).companyId;
    const p = await cancelPreview(companyId, enrolmentId);
    if (p.error) return p;
    const callerId = getUserContext(req).userId;
    const now = await clubNowFor(companyId);
    const freed = { sessionIds: [], scheduleId: null };
    const out = await runTx(sequelize, async (transaction) => {
        const e = await FacilityClassEnrolment.findOne({ where: { id: enrolmentId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!e || e.status === 'cancelled') txFail('This seat is already cancelled.', 409);
        const where = { enrolmentId: e.id, status: 'enrolled', ...(e.scheduleId ? { sessionDate: { [Op.gte]: now.date } } : {}) };
        const rows = await FacilityClassAttendance.findAll({ where, transaction });
        if (rows.length) {
            await FacilityClassAttendance.update({ status: 'cancelled', updatedBy: callerId }, { where: { id: { [Op.in]: rows.map((r) => r.id) } }, transaction });
            freed.sessionIds = rows.map((r) => r.sessionId);
        }
        if (e.scheduleId) freed.scheduleId = e.scheduleId;
        Object.assign(e, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: reason ? String(reason).slice(0, 255) : null, isLateCancel: p.mode === 'session' && p.late === true, updatedBy: callerId });
        await e.save({ transaction });
        if (p.outcome === 'void' && e.billId) {
            const bill = await billing.Bill.findOne({ where: { id: e.billId }, transaction });
            if (bill && bill.status === 'open') {
                Object.assign(bill, { status: 'voided', voidedAt: new Date(), voidedBy: callerId, voidReason: 'Seat cancelled in time', updatedBy: callerId });
                await bill.save({ transaction });
            }
        }
        return { e };
    });
    if (out.error) return out;
    // The freed seats go to the queue (after commit).
    if (freed.scheduleId) await offerNext(companyId, { scheduleId: freed.scheduleId }, { actorId: callerId });
    for (const sid of [...new Set(freed.sessionIds)]) await offerNext(companyId, { sessionId: sid }, { actorId: callerId });
    const note = p.mode === 'term' ? `${p.enrolment.patronName} withdrawn from the term - the fee stands.`
        : p.late ? `${p.enrolment.patronName}'s seat cancelled inside the ${p.noticeHours}-hour notice - the fee stands.`
            : p.outcome === 'void' ? `${p.enrolment.patronName}'s seat cancelled - bill ${p.bill.billNo} voided.`
                : p.outcome === 'finance' ? `${p.enrolment.patronName}'s seat cancelled - bill ${p.bill.billNo} was settled, Finance refunds it.`
                    : `${p.enrolment.patronName}'s seat cancelled.`;
    return { message: note, outcome: p.outcome, late: p.late, mode: p.mode };
}

// ---- rule 8: the club cancels a session - every seat and the queue --------------------

// Inside the caller's transaction: cancel the live attendance rows, the
// session-mode enrolments (an open bill voided, a settled one counted for
// Finance), withdraw the queue; term seats just lose the session. Returns
// what to email after commit.
async function cancelSessionCascade(session, { reason, callerId, transaction }) {
    const rows = await FacilityClassAttendance.findAll({ where: { sessionId: session.id, status: { [Op.in]: enrolmentRules.LIVE_ATTENDANCE } }, transaction });
    const recipients = [];
    let voided = 0;
    let finance = 0;
    if (rows.length) {
        await FacilityClassAttendance.update({ status: 'cancelled', updatedBy: callerId }, { where: { id: { [Op.in]: rows.map((r) => r.id) } }, transaction });
        const enrolments = await FacilityClassEnrolment.findAll({ where: { id: { [Op.in]: [...new Set(rows.map((r) => r.enrolmentId))] } }, transaction });
        const patronRows = await patrons.byIds(session.companyId, enrolments.map((e) => e.patronId), { transaction });
        for (const e of enrolments) {
            const patron = patronRows.get(e.patronId) || { id: e.patronId, name: e.patronName, memberNo: e.memberNo, patronType: e.memberNo ? 'member' : 'other' };
            let outcome = 'term';
            if (e.sessionId === session.id && e.status !== 'cancelled') {
                outcome = 'none';
                if (e.billId) {
                    const bill = await billing.Bill.findOne({ where: { id: e.billId }, transaction });
                    if (bill && bill.status === 'open') {
                        Object.assign(bill, { status: 'voided', voidedAt: new Date(), voidedBy: callerId, voidReason: `Session cancelled - ${reason}`, updatedBy: callerId });
                        await bill.save({ transaction });
                        outcome = 'void';
                        voided += 1;
                    } else if (bill && bill.status === 'settled') { outcome = 'finance'; finance += 1; }
                }
                Object.assign(e, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: `Session cancelled - ${reason}`, updatedBy: callerId });
                await e.save({ transaction });
            }
            recipients.push({ patron, outcome });
        }
    }
    const [withdrawn] = await FacilityClassWaitlist.update(
        { status: 'withdrawn', remarks: `Session cancelled - ${reason}`, updatedBy: callerId },
        { where: { sessionId: session.id, status: { [Op.in]: ['waiting', 'offered'] } }, transaction },
    );
    return { seats: rows.length, voided, finance, withdrawn, recipients };
}

// After the cascade committed: the emails to the seats and the instructor.
async function notifySessionCancelled(session, reason, recipients) {
    const [cls, venue, instructor] = await Promise.all([
        FacilityClass.findOne({ where: { id: session.classId } }),
        session.venueId ? FacilityVenue.findOne({ where: { id: session.venueId } }) : null,
        session.instructorId ? FacilityInstructor.findOne({ where: { id: session.instructorId } }) : null,
    ]);
    if (!cls) return;
    await emails.queueSessionCancelled({ companyId: session.companyId, cls, session, venue, instructor, reason, recipients });
}

// ---- rule 10: the waitlist --------------------------------------------------------------

// The seats a session has free: capacity minus live rows minus held offers.
async function seatsFree(session, { transaction, excludeWaitlistId = null } = {}) {
    const [rows, offers] = await Promise.all([
        FacilityClassAttendance.findAll({ where: { sessionId: session.id, status: { [Op.in]: enrolmentRules.LIVE_ATTENDANCE } }, attributes: ['status'], transaction }),
        FacilityClassWaitlist.findAll({ where: { status: 'offered', [Op.or]: [{ sessionId: session.id }, ...(session.scheduleId ? [{ scheduleId: session.scheduleId }] : [])] }, attributes: ['id', 'status'], transaction }),
    ]);
    return Number(session.capacity) - enrolmentRules.seatsTaken(rows) - rules.heldSeats(offers, { excludeId: excludeWaitlistId });
}

// The target of a queue row: the session, or the schedule's remaining sessions.
async function targetSessions(companyId, { sessionId, scheduleId }, { transaction } = {}) {
    if (sessionId) {
        const s = await FacilityClassSession.findOne({ where: { companyId, id: sessionId }, transaction });
        return s ? [s] : [];
    }
    const now = await clubNowFor(companyId);
    const all = await FacilityClassSession.findAll({ where: { companyId, scheduleId }, order: [['sessionDate', 'ASC']], transaction });
    return enrolmentRules.remainingSessions(all, now.date);
}

// Join the queue: the class, the target, the patron (as an enrolment), and
// only while no seat is free.
async function join(req, body) {
    const companyId = getUserContext(req).companyId;
    const cls = await FacilityClass.findOne({ where: { companyId, id: String(body.classId || '') } });
    if (!cls) return { error: 'Pick a class of the active company.' };
    if (cls.isActive === false) return { error: `${cls.code} is disabled.` };
    const target = cls.enrolmentMode === 'term' ? { scheduleId: String(body.scheduleId || '') } : { sessionId: String(body.sessionId || '') };
    if (target.scheduleId) {
        const schedule = await FacilityClassSchedule.findOne({ where: { classId: cls.id, id: target.scheduleId } });
        if (!schedule) return { error: `${cls.code} enrols per term - pick one of its schedules.` };
        if (schedule.status !== 'active') return { error: `${schedule.name} is ${schedule.status} to new enrolments.` };
    }
    const sessions = await targetSessions(companyId, target);
    if (!sessions.length) return { error: 'Nothing left to wait for on that session or term.' };
    if (sessions.some((s) => s.status !== 'scheduled')) return { error: 'That session is not scheduled.' };
    const patron = await enrolment.resolvePatron(companyId, cls, body);
    if (patron.error) return patron;
    const stamps = await stampsFor(req);
    const out = await runTx(sequelize, async (transaction) => {
        const row = patron.standing ? await patrons.ensureMemberPatron(companyId, patron.standing, stamps, { transaction }) : (await patrons.ensureOtherPatron(companyId, patron.visitor, stamps, { transaction })).patron;
        const dupEnrol = await FacilityClassEnrolment.findOne({ where: { companyId, patronId: row.id, status: { [Op.ne]: 'cancelled' }, ...target }, transaction });
        if (dupEnrol) txFail(`${row.name} already holds a seat here.`, 409);
        const dupWait = await FacilityClassWaitlist.findOne({ where: { companyId, patronId: row.id, status: { [Op.in]: ['waiting', 'offered'] }, ...target }, transaction });
        if (dupWait) txFail(`${row.name} is already on this waitlist.`, 409);
        for (const s of sessions) {
            if ((await seatsFree(s, { transaction })) > 0 && sessions.length === 1) txFail(`A seat is free on ${cls.code} ${bookingDateText(String(s.sessionDate))} ${timeDto(s.startTime)} - enrol instead of waiting.`, 409);
        }
        const position = await FacilityClassWaitlist.count({ where: { companyId, status: { [Op.in]: ['waiting', 'offered'] }, ...target }, transaction });
        const w = await FacilityClassWaitlist.create({ companyId, classId: cls.id, sessionId: target.sessionId || null, scheduleId: target.scheduleId || null, patronId: row.id, patronName: row.name, memberNo: row.memberNo || null, status: 'waiting', remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps }, { transaction });
        return { w, position: position + 1 };
    });
    if (out.error) return out;
    return { message: `${out.w.patronName} added to the waitlist - position ${out.position}.`, waitlist: waitlistDto(out.w), position: out.position };
}

// Offer a freed seat to the first waiting (or a named row): the seat is held
// for the offer hours and the patron is emailed. Returns the row or null.
async function offerNext(companyId, target, { actorId = null, rowId = null } = {}) {
    const { setting } = await availability.loadRules(companyId);
    const where = { companyId, status: 'waiting', ...(target.sessionId ? { sessionId: target.sessionId } : { scheduleId: target.scheduleId }), ...(rowId ? { id: rowId } : {}) };
    const waiting = await FacilityClassWaitlist.findAll({ where, order: [['createdAt', 'ASC']] });
    const next = rules.nextWaiting(waiting);
    if (!next) return null;
    const sessions = await targetSessions(companyId, target);
    if (!sessions.length || sessions.some((s) => s.status !== 'scheduled')) return null;
    for (const s of sessions) if ((await seatsFree(s)) <= 0) return null;
    const expiresAt = rules.offerExpiry(new Date(), setting.classWaitlistOfferHours);
    Object.assign(next, { status: 'offered', offeredAt: new Date(), offerExpiresAt: expiresAt, updatedBy: actorId });
    await next.save();
    const [cls, patron] = await Promise.all([FacilityClass.findOne({ where: { id: next.classId } }), Patron.findOne({ where: { id: next.patronId } })]);
    const session = target.sessionId ? sessions[0] : null;
    const schedule = target.scheduleId ? await FacilityClassSchedule.findOne({ where: { id: target.scheduleId } }) : null;
    const venue = await FacilityVenue.findOne({ where: { id: (session || sessions[0]).venueId } });
    if (cls && patron) await emails.queueOffer({ companyId, patron, cls, session, schedule, venue, expiresAt });
    return next;
}

async function offer(req, id) {
    const companyId = getUserContext(req).companyId;
    const row = await FacilityClassWaitlist.findOne({ where: { companyId, id } });
    if (!row) return { error: 'Waitlist entry not found.', status: 404 };
    if (row.status !== 'waiting') return { error: `This entry is ${row.status}.`, status: 409 };
    const offered = await offerNext(companyId, { sessionId: row.sessionId, scheduleId: row.scheduleId }, { actorId: getUserContext(req).userId, rowId: row.id });
    if (!offered) return { error: 'No seat is free to offer yet.', status: 409 };
    return { message: `Seat offered to ${offered.patronName} until ${new Date(offered.offerExpiresAt).toISOString()}.`, waitlist: waitlistDto(offered) };
}

// Confirm an offered (or waiting, when a seat is free) entry into an enrolment.
async function confirm(req, id) {
    const companyId = getUserContext(req).companyId;
    const row = await FacilityClassWaitlist.findOne({ where: { companyId, id } });
    if (!row) return { error: 'Waitlist entry not found.', status: 404 };
    if (!['waiting', 'offered'].includes(row.status)) return { error: `This entry is ${row.status}.`, status: 409 };
    const patron = await Patron.findOne({ where: { companyId, id: row.patronId } });
    if (!patron) return { error: 'The patron no longer exists.', status: 409 };
    const result = await enrolment.enrol(req, { classId: row.classId, sessionId: row.sessionId, scheduleId: row.scheduleId, remarks: row.remarks }, { channel: 'desk', patronId: patron.id, waitlistId: row.id });
    if (result.error) return result;
    Object.assign(row, { status: 'enrolled', enrolmentId: result.enrolmentId, updatedBy: getUserContext(req).userId });
    await row.save();
    return { ...result, waitlist: waitlistDto(row) };
}

async function withdraw(req, id, { reason = null } = {}) {
    const companyId = getUserContext(req).companyId;
    const row = await FacilityClassWaitlist.findOne({ where: { companyId, id } });
    if (!row) return { error: 'Waitlist entry not found.', status: 404 };
    if (!['waiting', 'offered'].includes(row.status)) return { error: `This entry is ${row.status}.`, status: 409 };
    const wasOffered = row.status === 'offered';
    Object.assign(row, { status: 'withdrawn', remarks: reason ? String(reason).slice(0, 255) : row.remarks, updatedBy: getUserContext(req).userId });
    await row.save();
    if (wasOffered) await offerNext(companyId, { sessionId: row.sessionId, scheduleId: row.scheduleId }, { actorId: getUserContext(req).userId });
    return { message: `${row.patronName} withdrawn from the waitlist.`, waitlist: waitlistDto(row) };
}

// The worker tick: lapse every expired offer and offer the next in each queue.
async function lapseOffers(now = new Date()) {
    const offered = await FacilityClassWaitlist.findAll({ where: { status: 'offered', offerExpiresAt: { [Op.lte]: now } } });
    const lapsed = rules.lapsedOffers(offered, now);
    if (!lapsed.length) return 0;
    await FacilityClassWaitlist.update({ status: 'lapsed' }, { where: { id: { [Op.in]: lapsed.map((w) => w.id) } } });
    const targets = new Map();
    for (const w of lapsed) targets.set(`${w.companyId}|${w.sessionId || ''}|${w.scheduleId || ''}`, { companyId: w.companyId, sessionId: w.sessionId, scheduleId: w.scheduleId });
    for (const t of targets.values()) await offerNext(t.companyId, { sessionId: t.sessionId, scheduleId: t.scheduleId });
    return lapsed.length;
}

// The queue of a session (its own rows, plus its schedule's term rows).
async function queueFor(companyId, session) {
    const rows = await FacilityClassWaitlist.findAll({
        where: { companyId, status: { [Op.in]: ['waiting', 'offered'] }, [Op.or]: [{ sessionId: session.id }, ...(session.scheduleId ? [{ scheduleId: session.scheduleId }] : [])] },
        order: [['createdAt', 'ASC']],
    });
    return rows.map((w, i) => waitlistDto(w, { position: i + 1, mode: w.scheduleId ? 'term' : 'session' }));
}

module.exports = { cancelPreview, cancelEnrolment, cancelSessionCascade, notifySessionCancelled, seatsFree, join, offerNext, offer, confirm, withdraw, lapseOffers, queueFor, waitlistDto };
