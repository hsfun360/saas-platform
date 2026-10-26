// Facility classes - the ENROLMENT engine (slice 5b, structures approved
// 2026-10-26). A patron takes a seat in one session (`session` mode) or in
// every remaining session of a schedule (`term` mode): the member's standing
// is checked as a booking's (barred refuses, warning warns; a booking
// suspension does not apply), a visitor needs the class to allow visitors,
// the capacity counts the live attendance rows under the session's row lock,
// and the fee opens a facility bill of its own with ONE line (the member or
// the visitor item at the flat price in force today) - no price in force
// refuses the enrolment. The roster lists the seats with their bills, the
// desk marks attendance, and Hold marks the unmarked rows no-show and sets
// the session held. The pure pieces live in classEnrolmentRules.service.js.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const FacilityClass = require('./class.model');
const FacilityClassSchedule = require('./classSchedule.model');
const FacilityClassSession = require('./classSession.model');
const FacilityClassEnrolment = require('./classEnrolment.model');
const FacilityClassAttendance = require('./classAttendance.model');
const FacilityVenue = require('./venue.model');
const FacilityInstructor = require('./instructor.model');
const TransactionType = require('./transactionType.model');
const Patron = require('./patron.model');
const patrons = require('./patron.service');
const billing = require('./billing.service');
const availability = require('./bookingAvailability.service');
const bookingRules = require('./bookingRules.service');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const shared = require('./bookingShared');
const rules = require('./classEnrolmentRules.service');
const { stampsFor, timeDto, txFail, runTx } = require('./facilityShared');

const { bookingDateText } = shared;

// ---- helpers ----------------------------------------------------------------------

async function memberStanding(companyId, memberNo) {
    const no = String(memberNo || '').trim();
    if (!no) return { error: 'Key in the member number.' };
    const s = await getGolfMemberStanding(companyId, no);
    if (!s) return { error: `No member found with number '${no}'.`, status: 404 };
    if (s.actionControl === 'barred') return { error: `Member ${s.memberNo} (${s.statusLabel || 'status'}) is barred from enrolling.` };
    return { standing: s };
}

function sessionLabel(cls, s) {
    return `${cls.code} ${bookingDateText(String(s.sessionDate))} ${timeDto(s.startTime)}`;
}

// Bill summaries for a set of enrolments: Map(enrolmentId -> summary).
async function billsFor(companyId, enrolmentIds, { transaction } = {}) {
    const ids = [...new Set(enrolmentIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await billing.Bill.findAll({ where: { companyId, classEnrolmentId: { [Op.in]: ids }, status: { [Op.ne]: 'voided' } }, attributes: ['id', 'classEnrolmentId', 'billNo', 'status', 'totalAmount'], transaction });
    return new Map(rows.map((b) => [b.classEnrolmentId, { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) }]));
}

// ---- rules 5 + 6: enrol -----------------------------------------------------------------

// `body` = { classId, sessionId | scheduleId, memberNo | visitor { name,
// identityNo, mobile, email }, remarks }; `channel` desk | station.
async function enrol(req, body, { channel = 'desk' } = {}) {
    const companyId = getUserContext(req).companyId;
    const { setting } = await availability.loadRules(companyId);
    if (setting.classesEnabled !== true) return { error: 'Classes are switched off in Facility Specification.' };
    const cls = await FacilityClass.findOne({ where: { companyId, id: String(body.classId || '') } });
    if (!cls) return { error: 'Pick a class of the active company.' };
    if (cls.isActive === false) return { error: `${cls.code} is disabled.` };
    if (channel === 'station' && cls.walkInAllowed === false) return { error: `${cls.code} takes no walk-ins - enrol from the Class Schedule.` };
    const now = bookingRules.clubNow(await companyTimezoneById(companyId));
    const today = now.date;

    // The thing enrolled in: one session, or a schedule's remaining sessions.
    let session = null;
    let schedule = null;
    let targetSessions = [];
    if (cls.enrolmentMode === 'term') {
        schedule = await FacilityClassSchedule.findOne({ where: { classId: cls.id, id: String(body.scheduleId || '') } });
        if (!schedule) return { error: `${cls.code} enrols per term - pick one of its schedules.` };
        if (schedule.status !== 'active') return { error: `${schedule.name} is ${schedule.status} to new enrolments.` };
        const all = await FacilityClassSession.findAll({ where: { scheduleId: schedule.id }, order: [['sessionDate', 'ASC']] });
        targetSessions = rules.remainingSessions(all, today);
        if (!targetSessions.length) return { error: `${schedule.name} has no session left to attend.` };
    } else {
        session = await FacilityClassSession.findOne({ where: { companyId, classId: cls.id, id: String(body.sessionId || '') } });
        if (!session) return { error: `${cls.code} enrols per session - pick one of its sessions.` };
        if (session.status !== 'scheduled') return { error: `The ${bookingDateText(String(session.sessionDate))} session is ${session.status}.` };
        if (String(session.sessionDate) < today) return { error: 'That session is in the past.' };
        if (session.scheduleId) {
            const sch = await FacilityClassSchedule.findOne({ where: { id: session.scheduleId }, attributes: ['status', 'name'] });
            if (sch && sch.status !== 'active') return { error: `${sch.name} is ${sch.status} to new enrolments.` };
        }
        targetSessions = [session];
    }

    // The patron: a member by number, or a visitor profile.
    let standing = null;
    let visitor = null;
    if (body.visitor && typeof body.visitor === 'object' && !body.memberNo) {
        if (cls.visitorsAllowed !== true) return { error: `${cls.code} takes members only.` };
        const name = String(body.visitor.name || '').trim();
        if (!name) return { error: 'Key in the visitor\'s name.' };
        visitor = { name, identityNo: body.visitor.identityNo || null, mobile: body.visitor.mobile || null, email: body.visitor.email || null };
    } else {
        const m = await memberStanding(companyId, body.memberNo);
        if (m.error) return m;
        standing = m.standing;
    }

    const feeItemId = rules.feeItemIdFor(cls, standing ? 'member' : 'other');
    const feeType = feeItemId ? await TransactionType.findOne({ where: { companyId, id: feeItemId } }) : null;
    if (feeItemId && (!feeType || feeType.isActive === false)) return { error: 'The class fee item is missing or disabled - fix the class first.' };
    const dayType = await shared.dayTypeOf(companyId, today);
    const stamps = await stampsFor(req);
    const warnings = [];
    const venues = await FacilityVenue.findAll({ where: { id: { [Op.in]: [...new Set(targetSessions.map((s) => s.venueId))] } }, attributes: ['id', 'code'] });
    const venueById = new Map(venues.map((v) => [v.id, v]));

    const result = await runTx(sequelize, async (transaction) => {
        // The patron row first (needed by the duplicate check).
        let patron;
        if (standing) patron = await patrons.ensureMemberPatron(companyId, standing, stamps, { transaction });
        else {
            const r = await patrons.ensureOtherPatron(companyId, visitor, stamps, { transaction });
            if (r.error) txFail(r.error);
            patron = r.patron;
        }
        const dupWhere = { companyId, patronId: patron.id, status: { [Op.ne]: 'cancelled' }, ...(schedule ? { scheduleId: schedule.id } : { sessionId: session.id }) };
        const dup = await FacilityClassEnrolment.findOne({ where: dupWhere, transaction });
        if (dup) txFail(`${patron.name} is already enrolled in ${schedule ? schedule.name : sessionLabel(cls, session)}.`, 409);

        // Capacity under the session rows' lock: every target session needs a seat.
        const locked = await FacilityClassSession.findAll({ where: { id: { [Op.in]: targetSessions.map((s) => s.id) } }, transaction, lock: transaction.LOCK.UPDATE });
        const liveRows = await FacilityClassAttendance.findAll({ where: { sessionId: { [Op.in]: locked.map((s) => s.id) }, status: { [Op.in]: rules.LIVE_ATTENDANCE } }, attributes: ['sessionId', 'status'], transaction });
        for (const s of locked) {
            const taken = rules.seatsTaken(liveRows.filter((r) => r.sessionId === s.id));
            const verdict = rules.capacityVerdict({ taken, arriving: 1, capacity: s.capacity, label: sessionLabel(cls, s) });
            if (verdict) txFail(verdict, 409);
        }

        // The enrolment, its attendance rows, then the bill (keyed by the enrolment).
        const enrolment = await FacilityClassEnrolment.create({
            companyId, classId: cls.id, sessionId: session ? session.id : null, scheduleId: schedule ? schedule.id : null,
            patronId: patron.id, patronName: patron.name, memberNo: patron.memberNo || null, channel, billId: null, feeAmount: 0,
            status: 'enrolled', enrolledAt: new Date(), remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps,
        }, { transaction });
        await FacilityClassAttendance.bulkCreate(locked.map((s) => ({
            companyId, enrolmentId: enrolment.id, sessionId: s.id, sessionDate: s.sessionDate, patronId: patron.id, status: 'enrolled', ...stamps,
        })), { transaction });

        let bill = null;
        if (feeType) {
            const issued = await billing.issueBillNo(req, { transaction });
            if (issued.error) txFail(issued.error);
            bill = await billing.Bill.create({ companyId, billNo: issued.billNo, classEnrolmentId: enrolment.id, patronId: patron.id, billDate: today, status: 'open', ...stamps }, { transaction });
            const added = await billing.addItem({ req, bill, type: feeType, quantity: 1, stamps, transaction, context: { date: today, dayType, sessionId: null, sessionName: null, participantType: standing ? 'member' : 'guest' } });
            if (added.error) txFail(`${feeType.transactionType}: ${added.error}`);
            await billing.recomputeTotals(bill, transaction);
            enrolment.billId = bill.id;
            enrolment.feeAmount = Number(bill.totalAmount);
            await enrolment.save({ transaction });
        }
        return { enrolment, bill, patron };
    });
    if (result.error) return result;
    const { enrolment, bill, patron } = result;
    const what = schedule ? `${schedule.name} (${targetSessions.length} session${targetSessions.length === 1 ? '' : 's'})` : `${bookingDateText(String(session.sessionDate))} ${timeDto(session.startTime)} at ${venueById.get(session.venueId)?.code || 'the venue'}`;
    return {
        message: `${patron.name} enrolled in ${cls.code} - ${what}${bill ? ` - bill ${bill.billNo} ${Number(bill.totalAmount).toFixed(2)} open` : ' - free'}.`,
        enrolmentId: enrolment.id,
        billId: bill ? bill.id : null,
        warnings,
        standingWarning: standing && standing.actionControl === 'warning' ? `Member ${standing.memberNo} is ${standing.statusLabel || 'under warning'}.` : null,
    };
}

// ---- the roster of one session -------------------------------------------------------

async function roster(companyId, sessionId) {
    const session = await FacilityClassSession.findOne({
        where: { companyId, id: sessionId },
        include: [
            { model: FacilityClass, as: 'Class', attributes: ['id', 'code', 'description', 'enrolmentMode', 'walkInAllowed', 'visitorsAllowed'] },
            { model: FacilityVenue, as: 'Venue', attributes: ['id', 'code', 'name'] },
            { model: FacilityInstructor, as: 'Instructor', attributes: ['id', 'code', 'name'] },
            { model: FacilityClassSchedule, as: 'Schedule', attributes: ['id', 'name', 'status'], required: false },
        ],
    });
    if (!session) return { error: 'Session not found.', status: 404 };
    const rows = await FacilityClassAttendance.findAll({ where: { sessionId: session.id }, order: [['createdAt', 'ASC']] });
    const enrolments = rows.length ? await FacilityClassEnrolment.findAll({ where: { id: { [Op.in]: rows.map((r) => r.enrolmentId) } } }) : [];
    const enrolmentById = new Map(enrolments.map((e) => [e.id, e]));
    const bills = await billsFor(companyId, enrolments.map((e) => e.id));
    const patronRows = await patrons.byIds(companyId, [...new Set(rows.map((r) => r.patronId))]);
    const live = rows.filter((r) => rules.LIVE_ATTENDANCE.includes(r.status));
    return {
        session: {
            id: session.id, classId: session.classId, class: session.Class ? session.Class.get({ plain: true }) : null,
            scheduleId: session.scheduleId, schedule: session.Schedule ? session.Schedule.get({ plain: true }) : null,
            sessionDate: String(session.sessionDate), startTime: timeDto(session.startTime), endTime: timeDto(session.endTime),
            venue: session.Venue ? session.Venue.get({ plain: true }) : null, instructor: session.Instructor ? session.Instructor.get({ plain: true }) : null,
            capacity: session.capacity, status: session.status, heldAt: session.heldAt, cancelReason: session.cancelReason, remarks: session.remarks,
        },
        seats: { taken: rules.seatsTaken(rows), capacity: session.capacity, left: Math.max(0, Number(session.capacity) - rules.seatsTaken(rows)) },
        rows: rows.map((r) => {
            const e = enrolmentById.get(r.enrolmentId);
            const p = patronRows.get(r.patronId);
            const bill = e ? bills.get(e.id) || null : null;
            return {
                attendanceId: r.id, enrolmentId: r.enrolmentId, status: r.status, markedAt: r.markedAt, remarks: r.remarks,
                patron: p ? { id: p.id, name: p.name, memberNo: p.memberNo, patronType: p.patronType } : { id: r.patronId, name: e ? e.patronName : 'Patron', memberNo: e ? e.memberNo : null, patronType: e && e.memberNo ? 'member' : 'other' },
                enrolment: e ? { id: e.id, status: e.status, channel: e.channel, mode: e.scheduleId ? 'term' : 'session', feeAmount: Number(e.feeAmount), enrolledAt: e.enrolledAt } : null,
                bill,
                unpaid: !!(bill && bill.status === 'open'),
            };
        }),
        unmarked: rules.holdTargets(live).length,
    };
}

// ---- rule 7: attendance marks and Hold -------------------------------------------------

// `marks` = [{ attendanceId, status }] with status enrolled | attended | no-show | excused.
async function markAttendance(req, sessionId, marks) {
    const companyId = getUserContext(req).companyId;
    const session = await FacilityClassSession.findOne({ where: { companyId, id: sessionId } });
    if (!session) return { error: 'Session not found.', status: 404 };
    if (session.status !== 'scheduled') return { error: `A ${session.status} session's attendance is final.` };
    const list = Array.isArray(marks) ? marks : [];
    if (!list.length) return { error: 'Nothing to mark.' };
    for (const m of list) if (!m || !rules.validMark(String(m.status))) return { error: 'Each mark is attended, no-show, excused or enrolled.' };
    const callerId = getUserContext(req).userId;
    let n = 0;
    await sequelize.transaction(async (transaction) => {
        const rows = await FacilityClassAttendance.findAll({ where: { sessionId: session.id, id: { [Op.in]: list.map((m) => String(m.attendanceId)) } }, transaction });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const touched = new Set();
        for (const m of list) {
            const r = byId.get(String(m.attendanceId));
            if (!r || r.status === 'cancelled') continue;
            if (r.status === m.status) continue;
            Object.assign(r, { status: m.status, markedAt: m.status === 'enrolled' ? null : new Date(), markedBy: m.status === 'enrolled' ? null : callerId, updatedBy: callerId });
            await r.save({ transaction });
            touched.add(r.enrolmentId);
            n += 1;
        }
        await refreshEnrolmentStatuses([...touched], callerId, transaction);
    });
    return { message: `${n} mark${n === 1 ? '' : 's'} saved.`, marked: n };
}

// Hold the session: list (preview) or mark (confirm) the unmarked rows as
// no-show and set the session held.
async function hold(req, sessionId, { confirm = false } = {}) {
    const companyId = getUserContext(req).companyId;
    const session = await FacilityClassSession.findOne({ where: { companyId, id: sessionId }, include: [{ model: FacilityClass, as: 'Class', attributes: ['code'] }] });
    if (!session) return { error: 'Session not found.', status: 404 };
    if (session.status !== 'scheduled') return { error: `The session is already ${session.status}.` };
    const now = bookingRules.clubNow(await companyTimezoneById(companyId));
    if (String(session.sessionDate) > now.date) return { error: 'A session is held on its day, not before.' };
    const rows = await FacilityClassAttendance.findAll({ where: { sessionId: session.id, status: { [Op.in]: rules.LIVE_ATTENDANCE } } });
    const targets = rules.holdTargets(rows);
    const patronRows = await patrons.byIds(companyId, targets.map((r) => r.patronId));
    const preview = { unmarked: targets.map((r) => ({ attendanceId: r.id, name: patronRows.get(r.patronId)?.name || 'Patron', memberNo: patronRows.get(r.patronId)?.memberNo || null })), attended: rows.filter((r) => r.status === 'attended').length, excused: rows.filter((r) => r.status === 'excused').length, noShow: rows.filter((r) => r.status === 'no-show').length };
    if (!confirm) return { preview };
    const callerId = getUserContext(req).userId;
    await sequelize.transaction(async (transaction) => {
        if (targets.length) {
            await FacilityClassAttendance.update({ status: 'no-show', markedAt: new Date(), markedBy: callerId, updatedBy: callerId }, { where: { id: { [Op.in]: targets.map((r) => r.id) } }, transaction });
        }
        Object.assign(session, { status: 'held', heldAt: new Date(), heldBy: callerId, updatedBy: callerId });
        await session.save({ transaction });
        await refreshEnrolmentStatuses([...new Set(rows.map((r) => r.enrolmentId))], callerId, transaction);
    });
    return { message: `${session.Class ? session.Class.code : 'Session'} ${timeDto(session.startTime)} held - ${preview.attended} attended, ${targets.length} marked no-show${preview.excused ? `, ${preview.excused} excused` : ''}.`, preview };
}

// An enrolment completes once every attendance row is final.
async function refreshEnrolmentStatuses(enrolmentIds, callerId, transaction) {
    if (!enrolmentIds.length) return;
    const enrolments = await FacilityClassEnrolment.findAll({ where: { id: { [Op.in]: enrolmentIds } }, transaction });
    const rows = await FacilityClassAttendance.findAll({ where: { enrolmentId: { [Op.in]: enrolmentIds } }, attributes: ['enrolmentId', 'status'], transaction });
    for (const e of enrolments) {
        const next = rules.enrolmentStatusAfter(rows.filter((r) => r.enrolmentId === e.id), e.status);
        if (next !== e.status) {
            e.status = next;
            e.updatedBy = callerId;
            await e.save({ transaction });
        }
    }
}

// Seats taken per session: Map(sessionId -> taken), for the listings.
async function seatsBySession(sessionIds, { transaction } = {}) {
    const ids = [...new Set(sessionIds)];
    if (!ids.length) return new Map();
    const rows = await FacilityClassAttendance.findAll({ where: { sessionId: { [Op.in]: ids }, status: { [Op.in]: rules.LIVE_ATTENDANCE } }, attributes: ['sessionId'], transaction });
    const map = new Map(ids.map((id) => [id, 0]));
    for (const r of rows) map.set(r.sessionId, (map.get(r.sessionId) || 0) + 1);
    return map;
}

module.exports = { enrol, roster, markAttendance, hold, seatsBySession, billsFor, Patron };
