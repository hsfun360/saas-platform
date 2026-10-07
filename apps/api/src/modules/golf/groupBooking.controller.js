// Group / Tournament Booking (Golf Management → /golf/group-bookings; user
// decisions 2026-10-07, slice 1 of the group-booking build):
//   HEADER   - a BookingProfile of type 'group' | 'tournament': group name,
//              organiser (Other Debtor / member / none), contact, size.
//   PLAY DAYS - golf.GroupPlayDay: one per date, each its own course, holes
//              and START FORMAT (traditional / two-tee / shotgun / modified
//              shotgun).
//   FLIGHTS  - golf.GroupFlight: generated per day; sequential formats hold
//              tee-time CELLS at full capacity, shotgun formats HOLD the
//              course for a window (both via bookingAvailability).
//   ROSTER   - golf.GroupPlayer: one row per person for the whole booking.
//   DRAW     - places roster players into a day's flights, writing ordinary
//              golf.Player rows (so registration / billing / no-shows run
//              unchanged downstream).
// Every write that touches tee-sheet space runs under the same per-day
// advisory lock the ordinary booking uses.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext, getCallerPlacement, annotateCanModify, canModifyRecord,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding, getChargeTarget } = require('../../platform/membershipGateway');
const { classifyDateRange } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { PLAYER_TYPES, PLAYER_TYPE_KEYS, HOLES_OPTIONS, BOOKING_STATUSES } = require('./booking.constants');
const { ACTIVE_PLAYER_STATUS_KEYS } = require('./registration.constants');
const {
    GROUP_BOOKING_TYPES, GROUP_BOOKING_TYPE_KEYS, START_FORMATS, START_FORMAT_KEYS, COURSE_HOLD_FORMATS,
    PLAY_DAY_STATUSES, GROUP_PLAYER_STATUSES, GROUP_PLAYER_STATUS_KEYS,
    DEFAULT_FLIGHT_CAPACITY, MAX_FLIGHTS_PER_DAY, MAX_ROSTER,
} = require('./groupBooking.constants');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const GroupPlayDay = require('./groupPlayDay.model');
const GroupFlight = require('./groupFlight.model');
const GroupPlayer = require('./groupPlayer.model');
const Course = require('./course.model');
const UnitCourse = require('./unitCourse.model');
const Golfer = require('./golfer.model');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

async function callerStamps(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

async function dayTypeOf(req, playDate) {
    const rows = await classifyDateRange(req, playDate, playDate);
    return rows.length ? rows[0].dayType : 'weekday';
}

// Same serialization point as the ordinary booking: one advisory lock per
// (company, playDate) - rotation courses share physical nines.
async function advisoryLock(transaction, companyId, playDate) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `golf-booking:${companyId}:${playDate}` },
        transaction,
    });
}

function str(v, max) {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Lookups

async function findBooking(req, id, { transaction } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const profile = await BookingProfile.findOne({
        where: { companyId, id, bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS } },
        transaction,
    });
    if (!profile) return { status: 404, message: 'Group booking not found.' };
    return { companyId, profile };
}

async function courseMap(companyId, { transaction } = {}) {
    const courses = await Course.findAll({ where: { companyId }, transaction });
    const nineIds = [...new Set(courses.flatMap((c) => [c.firstNineId, c.secondNineId]).filter(Boolean))];
    const nines = nineIds.length
        ? await UnitCourse.findAll({ where: { id: { [Op.in]: nineIds } }, attributes: ['id', 'unitCourseCode', 'description'], transaction })
        : [];
    return { courseById: new Map(courses.map((c) => [c.id, c])), nineById: new Map(nines.map((n) => [n.id, n])) };
}

// ---------------------------------------------------------------------------
// DTOs

function courseLabel(course, nineById) {
    if (!course) return null;
    const a = nineById.get(course.firstNineId);
    const b = nineById.get(course.secondNineId);
    const rotation = a && b ? ` (${a.unitCourseCode} → ${b.unitCourseCode})` : '';
    return `${course.courseCode}${course.description ? ' - ' + course.description : ''}${rotation}`;
}

function flightDto(f, drawn) {
    const rows = drawn || [];
    return {
        id: f.id,
        groupPlayDayId: f.groupPlayDayId,
        unitCourseId: f.unitCourseId,
        teeTime: availability.hhmm(f.teeTime),
        startHole: f.startHole,
        startSequence: f.startSequence,
        flightLabel: f.flightLabel,
        capacity: f.capacity,
        sortOrder: f.sortOrder,
        players: rows.map((p) => ({
            playerId: p.id,
            groupPlayerId: p.groupPlayerId,
            playerName: p.playerName,
            memberNo: p.memberNo,
            playerType: p.playerType,
            status: p.status,
            registrationNo: p.registrationNo,
            crossTime: p.crossTime || null,
        })),
    };
}

function dayDto(d, flights, nineById, course) {
    return {
        id: d.id,
        playDate: d.playDate,
        courseId: d.courseId,
        courseLabel: courseLabel(course, nineById),
        firstNineCode: course && nineById.get(course.firstNineId) ? nineById.get(course.firstNineId).unitCourseCode : null,
        secondNineCode: course && nineById.get(course.secondNineId) ? nineById.get(course.secondNineId).unitCourseCode : null,
        holes: d.holes,
        startFormat: d.startFormat,
        startTime: availability.hhmm(d.startTime),
        blockUntil: availability.hhmm(d.blockUntil),
        startHoles: Array.isArray(d.startHoles) ? d.startHoles : null,
        waves: d.waves,
        remarks: d.remarks,
        status: d.status,
        flights: flights || [],
        drawnCount: (flights || []).reduce((s, f) => s + f.players.length, 0),
        seatCount: (flights || []).reduce((s, f) => s + f.capacity, 0),
    };
}

function rosterDto(p, drawnDays) {
    return {
        id: p.id,
        golferId: p.golferId,
        playerName: p.playerName,
        memberNo: p.memberNo,
        playerType: p.playerType,
        handicap: p.handicap === null || p.handicap === undefined ? null : Number(p.handicap),
        teamName: p.teamName,
        contactMobile: p.contactMobile,
        remarks: p.remarks,
        sortOrder: p.sortOrder,
        status: p.status,
        // playDate -> flightLabel for the days this player is drawn into.
        drawn: drawnDays || {},
    };
}

function headerDto(profile, extra) {
    return {
        id: profile.id,
        bookingNo: profile.bookingNo,
        bookingType: profile.bookingType,
        groupName: profile.groupName,
        organiserName: profile.organiserName,
        debtorType: profile.debtorType,
        debtorSourceId: profile.debtorSourceId,
        bookerMemberNo: extra && extra.bookerMemberNo ? extra.bookerMemberNo : null,
        contactPerson: profile.contactPerson,
        contactMobile: profile.contactMobile,
        expectedPlayers: profile.expectedPlayers,
        playDate: profile.playDate,
        playDateTo: profile.playDateTo,
        remarks: profile.remarks,
        status: profile.status,
        cancelReason: profile.cancelReason,
        canModify: profile.get ? profile.get('canModify') : undefined,
        ...(extra || {}),
    };
}

// The full booking: header + days (with flights + drawn players) + roster.
async function fullDto(req, companyId, profile, { transaction } = {}) {
    const [days, flights, roster, records, maps] = await Promise.all([
        GroupPlayDay.findAll({ where: { bookingProfileId: profile.id }, order: [['playDate', 'ASC']], transaction }),
        GroupFlight.findAll({ where: { bookingProfileId: profile.id }, order: [['sortOrder', 'ASC'], ['teeTime', 'ASC']], transaction }),
        GroupPlayer.findAll({ where: { bookingProfileId: profile.id }, order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']], transaction }),
        Player.findAll({ where: { bookingProfileId: profile.id }, order: [['createdAt', 'ASC']], transaction }),
        courseMap(companyId, { transaction }),
    ]);
    const firsts = records.filter((r) => Number(r.secondNineFlag) === 0);
    const crossByFirst = new Map(records.filter((r) => Number(r.secondNineFlag) === 1).map((r) => [r.firstNinePlayerId, r]));
    const drawnByFlight = new Map();
    const drawnByPlayer = new Map();
    const labelByFlight = new Map(flights.map((f) => [f.id, f]));
    for (const r of firsts) {
        if (!r.groupFlightId || !ACTIVE_PLAYER_STATUS_KEYS.includes(r.status)) continue;
        if (!drawnByFlight.has(r.groupFlightId)) drawnByFlight.set(r.groupFlightId, []);
        const cross = crossByFirst.get(r.id);
        drawnByFlight.get(r.groupFlightId).push(Object.assign(r, { crossTime: cross ? availability.hhmm(cross.teeTime) : null }));
        const f = labelByFlight.get(r.groupFlightId);
        if (r.groupPlayerId && f) {
            if (!drawnByPlayer.has(r.groupPlayerId)) drawnByPlayer.set(r.groupPlayerId, {});
            drawnByPlayer.get(r.groupPlayerId)[String(r.playDate)] = f.flightLabel;
        }
    }
    const flightsByDay = new Map();
    for (const f of flights) {
        if (!flightsByDay.has(f.groupPlayDayId)) flightsByDay.set(f.groupPlayDayId, []);
        flightsByDay.get(f.groupPlayDayId).push(flightDto(f, drawnByFlight.get(f.id)));
    }
    let bookerMemberNo = null;
    if (profile.bookerGolferId) {
        const g = await Golfer.findOne({ where: { id: profile.bookerGolferId }, attributes: ['memberNo'], transaction });
        bookerMemberNo = g ? g.memberNo : null;
    }
    const listed = roster.filter((p) => p.status === 'listed').length;
    return headerDto(profile, {
        bookerMemberNo,
        days: days.map((d) => dayDto(d, flightsByDay.get(d.id), maps.nineById, maps.courseById.get(d.courseId))),
        roster: roster.map((p) => rosterDto(p, drawnByPlayer.get(p.id))),
        rosterCount: listed,
    });
}

// ---------------------------------------------------------------------------
// Meta

// GET /api/golf/group-bookings/meta - vocabularies, courses (with nines) and
// the organiser accounts the header picks from.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [courses, maps] = await Promise.all([
            Course.findAll({ where: { companyId, isActive: true }, order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']] }),
            courseMap(companyId),
        ]);
        // Other Debtors = the city-ledger organisers (travel agents, societies,
        // corporates). Read through the AR model directly for now - the seam
        // split moves this behind arGateway with the rest of the AR reads.
        const OtherDebtor = require('../ar/otherDebtor.model');
        const others = await OtherDebtor.findAll({
            where: { companyId, isActive: true },
            attributes: ['id', 'code', 'name'],
            order: [['name', 'ASC']],
        });
        res.status(200).json({
            bookingTypes: GROUP_BOOKING_TYPES,
            startFormats: START_FORMATS,
            holdFormats: COURSE_HOLD_FORMATS,
            playerTypes: PLAYER_TYPES,
            holesOptions: HOLES_OPTIONS,
            statuses: BOOKING_STATUSES,
            playDayStatuses: PLAY_DAY_STATUSES,
            rosterStatuses: GROUP_PLAYER_STATUSES,
            defaultCapacity: DEFAULT_FLIGHT_CAPACITY,
            maxFlightsPerDay: MAX_FLIGHTS_PER_DAY,
            courses: courses.map((c) => ({
                id: c.id,
                courseCode: c.courseCode,
                description: c.description,
                label: courseLabel(c, maps.nineById),
                firstNineCode: maps.nineById.get(c.firstNineId) ? maps.nineById.get(c.firstNineId).unitCourseCode : null,
                secondNineCode: maps.nineById.get(c.secondNineId) ? maps.nineById.get(c.secondNineId).unitCourseCode : null,
            })),
            otherDebtors: others.map((o) => ({ id: o.id, code: o.code, name: o.name })),
        });
    } catch (error) {
        console.error('Error loading group booking meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Listing

// GET /api/golf/group-bookings?dateFrom&dateTo&status - group/tournament
// bookings whose play-day range touches the window (default: 31 days back
// to 180 days ahead), newest first.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const dateFrom = String(req.query.dateFrom || '');
        const dateTo = String(req.query.dateTo || '');
        if (dateFrom && !DATE_RE.test(dateFrom)) return res.status(400).json({ message: 'Invalid from date.' });
        if (dateTo && !DATE_RE.test(dateTo)) return res.status(400).json({ message: 'Invalid to date.' });
        const where = { companyId, bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS } };
        // Touches the window: first day <= to AND last day (or first) >= from.
        if (dateTo) where.playDate = { [Op.lte]: dateTo };
        if (dateFrom) {
            where[Op.or] = [
                { playDateTo: { [Op.gte]: dateFrom } },
                { playDateTo: null, playDate: { [Op.gte]: dateFrom } },
            ];
        }
        const status = String(req.query.status || '');
        if (status) where.status = status;
        const rows = await BookingProfile.findAll({ where, order: [['playDate', 'DESC'], ['bookingNo', 'DESC']], limit: 500 });
        await annotateCanModify(req, rows);
        const ids = rows.map((r) => r.id);
        const [days, roster, maps] = ids.length ? await Promise.all([
            GroupPlayDay.findAll({ where: { bookingProfileId: { [Op.in]: ids } }, order: [['playDate', 'ASC']] }),
            GroupPlayer.findAll({ where: { bookingProfileId: { [Op.in]: ids }, status: 'listed' }, attributes: ['bookingProfileId'] }),
            courseMap(companyId),
        ]) : [[], [], { courseById: new Map(), nineById: new Map() }];
        const daysByBooking = new Map();
        for (const d of days) {
            if (!daysByBooking.has(d.bookingProfileId)) daysByBooking.set(d.bookingProfileId, []);
            daysByBooking.get(d.bookingProfileId).push(d);
        }
        const rosterCount = new Map();
        for (const p of roster) rosterCount.set(p.bookingProfileId, (rosterCount.get(p.bookingProfileId) || 0) + 1);
        res.status(200).json({
            bookings: rows.map((b) => headerDto(b, {
                dayCount: (daysByBooking.get(b.id) || []).length,
                courses: [...new Set((daysByBooking.get(b.id) || []).map((d) => {
                    const c = maps.courseById.get(d.courseId);
                    return c ? c.courseCode : '?';
                }))],
                rosterCount: rosterCount.get(b.id) || 0,
            })),
            bookingTypes: GROUP_BOOKING_TYPES,
            statuses: BOOKING_STATUSES,
        });
    } catch (error) {
        console.error('Error listing group bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/group-bookings/:id - the full booking.
exports.get = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        await annotateCanModify(req, [found.profile]);
        res.status(200).json({ booking: await fullDto(req, found.companyId, found.profile) });
    } catch (error) {
        console.error('Error loading group booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Header

// Resolve the organiser block of a create/update payload into header
// columns: { organiserName, debtorType, debtorSourceId, bookerGolferId }.
async function resolveOrganiser(companyId, body, stamps, transaction) {
    const kind = String(body.organiserKind || 'none');
    if (kind === 'other') {
        const OtherDebtor = require('../ar/otherDebtor.model');
        const od = await OtherDebtor.findOne({ where: { companyId, id: String(body.otherDebtorId || ''), isActive: true }, transaction });
        if (!od) return { error: 'Pick the organiser\'s Other Debtor account.' };
        return { organiserName: od.name, debtorType: 'other', debtorSourceId: od.id, bookerGolferId: null };
    }
    if (kind === 'member') {
        const memberNo = str(body.memberNo, 50);
        if (!memberNo) return { error: 'Key in the organising member\'s number.' };
        const standing = await getGolfMemberStanding(companyId, memberNo);
        if (!standing) return { error: `No member found with number '${memberNo}'.` };
        if (standing.actionControl === 'barred') return { error: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from booking.` };
        const target = await getChargeTarget(companyId, standing.memberId);
        const [golfer] = await Golfer.findOrCreate({
            where: { companyId, golferType: 'member', sourceId: standing.memberId },
            defaults: { companyId, golferType: 'member', sourceId: standing.memberId, name: standing.name, memberNo: standing.memberNo, ...stamps },
            transaction,
        });
        return {
            organiserName: standing.name,
            debtorType: target ? target.debtorType : null,
            debtorSourceId: target ? target.sourceId : null,
            bookerGolferId: golfer.id,
        };
    }
    const organiserName = str(body.organiserName, 150);
    if (!organiserName) return { error: 'Key in the organiser\'s name.' };
    return { organiserName, debtorType: null, debtorSourceId: null, bookerGolferId: null };
}

// Validate one play-day line of a payload. Returns { error } or the
// normalised columns.
function parseDay(line, courseById) {
    const playDate = String(line.playDate || '');
    if (!DATE_RE.test(playDate)) return { error: 'Pick the play date.' };
    const course = courseById.get(String(line.courseId || ''));
    if (!course || course.isActive === false) return { error: `${playDate}: pick an active course.` };
    const holes = Number(line.holes);
    if (!HOLES_OPTIONS.includes(holes)) return { error: `${playDate}: pick 9 or 18 holes.` };
    const startFormat = String(line.startFormat || 'traditional');
    if (!START_FORMAT_KEYS.includes(startFormat)) return { error: `${playDate}: pick a start format.` };
    const startTime = String(line.startTime || '');
    if (!TIME_RE.test(startTime)) return { error: `${playDate}: key in the start time.` };
    const hold = COURSE_HOLD_FORMATS.includes(startFormat);
    let blockUntil = null;
    let startHoles = null;
    let waves = 1;
    if (hold) {
        blockUntil = String(line.blockUntil || '');
        if (!TIME_RE.test(blockUntil)) return { error: `${playDate}: a shotgun start needs the time the course is held until.` };
        if (blockUntil <= startTime) return { error: `${playDate}: the held-until time must be after the start time.` };
        waves = Number(line.waves || 1);
        if (!Number.isInteger(waves) || waves < 1 || waves > 4) return { error: `${playDate}: waves must be 1 to 4.` };
        if (startFormat === 'modified-shotgun') {
            const raw = Array.isArray(line.startHoles) ? line.startHoles.map(Number) : [];
            const max = holes === 9 ? 9 : 18;
            const uniq = [...new Set(raw)].filter((h) => Number.isInteger(h) && h >= 1 && h <= max).sort((a, b) => a - b);
            if (!uniq.length) return { error: `${playDate}: pick the start holes for the modified shotgun.` };
            startHoles = uniq;
        }
    }
    return {
        playDate, courseId: course.id, holes, startFormat, startTime, blockUntil, startHoles, waves,
        remarks: str(line.remarks, 255),
    };
}

// POST /api/golf/group-bookings - header + its play days (no flights yet).
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const bookingType = String(req.body.bookingType || 'group');
        if (!GROUP_BOOKING_TYPE_KEYS.includes(bookingType)) return res.status(400).json({ message: 'Pick Group or Tournament.' });
        const groupName = str(req.body.groupName, 150);
        if (!groupName) return res.status(400).json({ message: 'Key in the group / tournament name.' });
        const rawDays = Array.isArray(req.body.days) ? req.body.days : [];
        if (!rawDays.length) return res.status(400).json({ message: 'Add at least one play day.' });
        if (rawDays.length > 14) return res.status(400).json({ message: 'A booking can hold at most 14 play days.' });
        const { courseById } = await courseMap(companyId);
        const days = [];
        const seen = new Set();
        for (const line of rawDays) {
            const parsed = parseDay(line, courseById);
            if (parsed.error) return res.status(400).json({ message: parsed.error });
            if (seen.has(parsed.playDate)) return res.status(400).json({ message: `${parsed.playDate} is listed twice.` });
            seen.add(parsed.playDate);
            days.push(parsed);
        }
        days.sort((a, b) => a.playDate.localeCompare(b.playDate));
        const expectedPlayers = req.body.expectedPlayers === null || req.body.expectedPlayers === undefined || req.body.expectedPlayers === ''
            ? null : Number(req.body.expectedPlayers);
        if (expectedPlayers !== null && (!Number.isInteger(expectedPlayers) || expectedPlayers < 1 || expectedPlayers > 999)) {
            return res.status(400).json({ message: 'Expected players must be 1 to 999.' });
        }
        const stamps = await callerStamps(req);

        const result = await sequelize.transaction(async (transaction) => {
            const organiser = await resolveOrganiser(companyId, req.body, stamps, transaction);
            if (organiser.error) return { fail: organiser.error, status: 400 };
            let bookingNo = null;
            const issued = await numberingGateway.issueNumber(req, 'golf-booking', { transaction });
            if (issued && issued.number) bookingNo = issued.number;
            else if (issued && issued.manual) {
                bookingNo = str(req.body.bookingNo, 50);
                if (!bookingNo) return { fail: 'The Booking No. scheme is manual - key in a booking number.', status: 400 };
            } else {
                return { fail: 'Configure the Booking No. numbering scheme first (Golf Management → Numbering Control).', status: 400 };
            }
            const profile = await BookingProfile.create({
                companyId,
                bookingNo,
                bookingType,
                courseId: null,
                playDate: days[0].playDate,
                playDateTo: days[days.length - 1].playDate,
                bookerGolferId: organiser.bookerGolferId,
                groupName,
                organiserName: organiser.organiserName,
                debtorType: organiser.debtorType,
                debtorSourceId: organiser.debtorSourceId,
                contactPerson: str(req.body.contactPerson, 100),
                contactMobile: str(req.body.contactMobile, 30),
                expectedPlayers,
                remarks: str(req.body.remarks, 255),
                status: 'booked',
                ...stamps,
            }, { transaction });
            for (const d of days) {
                await GroupPlayDay.create({ companyId, bookingProfileId: profile.id, ...d, status: 'planned', ...stamps }, { transaction });
            }
            return { profile };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(201).json({
            message: `Group booking ${result.profile.bookingNo} created.`,
            booking: await fullDto(req, companyId, result.profile),
        });
    } catch (error) {
        console.error('Error creating group booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/group-bookings/:id - header fields only (days have their
// own endpoints).
exports.update = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const bookingType = String(req.body.bookingType || profile.bookingType);
        if (!GROUP_BOOKING_TYPE_KEYS.includes(bookingType)) return res.status(400).json({ message: 'Pick Group or Tournament.' });
        const groupName = str(req.body.groupName, 150);
        if (!groupName) return res.status(400).json({ message: 'Key in the group / tournament name.' });
        const expectedPlayers = req.body.expectedPlayers === null || req.body.expectedPlayers === undefined || req.body.expectedPlayers === ''
            ? null : Number(req.body.expectedPlayers);
        if (expectedPlayers !== null && (!Number.isInteger(expectedPlayers) || expectedPlayers < 1 || expectedPlayers > 999)) {
            return res.status(400).json({ message: 'Expected players must be 1 to 999.' });
        }
        const stamps = await callerStamps(req);
        const result = await sequelize.transaction(async (transaction) => {
            const organiser = await resolveOrganiser(companyId, req.body, stamps, transaction);
            if (organiser.error) return { fail: organiser.error, status: 400 };
            profile.bookingType = bookingType;
            profile.groupName = groupName;
            profile.organiserName = organiser.organiserName;
            profile.debtorType = organiser.debtorType;
            profile.debtorSourceId = organiser.debtorSourceId;
            profile.bookerGolferId = organiser.bookerGolferId;
            profile.contactPerson = str(req.body.contactPerson, 100);
            profile.contactMobile = str(req.body.contactMobile, 30);
            profile.expectedPlayers = expectedPlayers;
            profile.remarks = str(req.body.remarks, 255);
            profile.updatedBy = stamps.updatedBy;
            await profile.save({ transaction });
            return {};
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(200).json({ message: `Group booking ${profile.bookingNo} updated.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error updating group booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/group-bookings/:id/cancel { reason } - cancel the whole
// booking: header, every planned day, every still-BOOKED drawn player (the
// holds vanish with the header status). Registered players stay, as for an
// ordinary booking.
exports.cancel = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'Only a booked booking can be cancelled.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const callerId = getUserContext(req).userId;
        const reason = str(req.body.reason, 255);
        await sequelize.transaction(async (transaction) => {
            profile.status = 'cancelled';
            profile.cancelledAt = new Date();
            profile.cancelledBy = callerId;
            profile.cancelReason = reason;
            profile.updatedBy = callerId;
            await profile.save({ transaction });
            await GroupPlayDay.update({ status: 'cancelled', updatedBy: callerId }, { where: { bookingProfileId: profile.id, status: 'planned' }, transaction });
            await Player.update({
                status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: reason, updatedBy: callerId,
            }, { where: { bookingProfileId: profile.id, status: 'booked' }, transaction });
        });
        res.status(200).json({ message: `Group booking ${profile.bookingNo} cancelled.` });
    } catch (error) {
        console.error('Error cancelling group booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Play days

async function refreshDateRange(profile, transaction) {
    const days = await GroupPlayDay.findAll({
        where: { bookingProfileId: profile.id, status: { [Op.ne]: 'cancelled' } },
        order: [['playDate', 'ASC']],
        transaction,
    });
    if (!days.length) return;
    profile.playDate = days[0].playDate;
    profile.playDateTo = days[days.length - 1].playDate;
    await profile.save({ transaction });
}

async function drawnCountOfDay(dayId, { transaction } = {}) {
    const flights = await GroupFlight.findAll({ where: { groupPlayDayId: dayId }, attributes: ['id'], transaction });
    if (!flights.length) return 0;
    return Player.count({
        where: { groupFlightId: { [Op.in]: flights.map((f) => f.id) }, secondNineFlag: 0, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS } },
        transaction,
    });
}

// POST /api/golf/group-bookings/:id/days - add a play day.
exports.addDay = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const { courseById } = await courseMap(companyId);
        const parsed = parseDay(req.body, courseById);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const clash = await GroupPlayDay.findOne({ where: { bookingProfileId: profile.id, playDate: parsed.playDate } });
        if (clash) return res.status(400).json({ message: `${parsed.playDate} is already a play day of this booking.` });
        const stamps = await callerStamps(req);
        await sequelize.transaction(async (transaction) => {
            await GroupPlayDay.create({ companyId, bookingProfileId: profile.id, ...parsed, status: 'planned', ...stamps }, { transaction });
            await refreshDateRange(profile, transaction);
        });
        res.status(201).json({ message: `Play day ${parsed.playDate} added.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error adding group play day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/group-bookings/:id/days/:dayId - change a play day. The
// date / course / holes / format can only change while nothing is DRAWN;
// changing them drops the day's reserved flights (regenerate afterwards).
exports.updateDay = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const day = await GroupPlayDay.findOne({ where: { bookingProfileId: profile.id, id: req.params.dayId } });
        if (!day) return res.status(404).json({ message: 'Play day not found.' });
        if (day.status !== 'planned') return res.status(400).json({ message: 'Only a planned play day can be changed.' });
        const { courseById } = await courseMap(companyId);
        const parsed = parseDay({ ...req.body, playDate: req.body.playDate || day.playDate }, courseById);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const structural = parsed.playDate !== String(day.playDate) || parsed.courseId !== day.courseId
            || parsed.holes !== Number(day.holes) || parsed.startFormat !== day.startFormat
            || parsed.startTime !== availability.hhmm(day.startTime) || parsed.blockUntil !== availability.hhmm(day.blockUntil)
            || JSON.stringify(parsed.startHoles) !== JSON.stringify(Array.isArray(day.startHoles) ? day.startHoles : null)
            || parsed.waves !== Number(day.waves);
        if (structural) {
            const drawn = await drawnCountOfDay(day.id);
            if (drawn > 0) return res.status(400).json({ message: `${drawn} player(s) are already drawn into this day's flights - clear the draw before changing the day.` });
            if (parsed.playDate !== String(day.playDate)) {
                const clash = await GroupPlayDay.findOne({ where: { bookingProfileId: profile.id, playDate: parsed.playDate, id: { [Op.ne]: day.id } } });
                if (clash) return res.status(400).json({ message: `${parsed.playDate} is already a play day of this booking.` });
            }
        }
        const callerId = getUserContext(req).userId;
        await sequelize.transaction(async (transaction) => {
            Object.assign(day, parsed, { updatedBy: callerId });
            await day.save({ transaction });
            if (structural) await GroupFlight.destroy({ where: { groupPlayDayId: day.id }, transaction });
            await refreshDateRange(profile, transaction);
        });
        res.status(200).json({
            message: structural ? `Play day ${parsed.playDate} updated - reserve its flights again.` : `Play day ${parsed.playDate} updated.`,
            booking: await fullDto(req, companyId, profile),
        });
    } catch (error) {
        console.error('Error updating group play day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/group-bookings/:id/days/:dayId - remove a play day that
// has no drawn players (its flights go with it).
exports.removeDay = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const day = await GroupPlayDay.findOne({ where: { bookingProfileId: profile.id, id: req.params.dayId } });
        if (!day) return res.status(404).json({ message: 'Play day not found.' });
        const count = await GroupPlayDay.count({ where: { bookingProfileId: profile.id } });
        if (count <= 1) return res.status(400).json({ message: 'A booking needs at least one play day - cancel the booking instead.' });
        const drawn = await drawnCountOfDay(day.id);
        if (drawn > 0) return res.status(400).json({ message: `${drawn} player(s) are drawn into this day - clear the draw first.` });
        await sequelize.transaction(async (transaction) => {
            await GroupFlight.destroy({ where: { groupPlayDayId: day.id }, transaction });
            await day.destroy({ transaction });
            await refreshDateRange(profile, transaction);
        });
        res.status(200).json({ message: `Play day ${day.playDate} removed.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error removing group play day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Flights

// The holes of the course grouped by nine for shotgun generation: 1-9 on the
// first nine, 10-18 on the second (9-hole days use the first nine only).
function nineOfHole(course, hole) {
    return hole <= 9 ? course.firstNineId : course.secondNineId;
}

// Minutes -> 'HH:MM', clamped to the day.
function hhmmOf(minutes) {
    return availability.toHHMM(Math.max(0, Math.min(24 * 60 - 1, minutes)));
}

// Build the flight rows for a SEQUENTIAL day: `count` consecutive grid slots
// from the day's start time on the first nine (traditional), or alternating
// first/second nine at the same times (two-tee). Each cell must have the
// full capacity free (another group's hold, a booking or a lock refuses).
// Returns { rows } or { error }.
function sequentialFlights({ day, course, ctx, occ, locks, count, capacity }) {
    const ownGrid = ctx.byCourse.get(course.id);
    if (!ownGrid || !ownGrid.set || !ownGrid.slots.length) return { error: `No tee sheet is configured for ${course.courseCode} on ${day.playDate}.` };
    const start = availability.toMinutes(day.startTime);
    const nines = day.startFormat === 'two-tee' ? [course.firstNineId, course.secondNineId] : [course.firstNineId];
    // Each nine's timeline is its owner's grid (the playing course's own
    // grid when nobody starts on it).
    const slotsOf = (nineId) => {
        const owner = ctx.nineOwner.get(nineId);
        return (owner ? owner.slots : ownGrid.slots).filter((s) => s.isCrossoverOnly !== true && availability.toMinutes(s.teeTime) >= start);
    };
    const rows = [];
    const problems = [];
    const perNine = Math.ceil(count / nines.length);
    let order = 0;
    for (let i = 0; i < perNine; i += 1) {
        for (let n = 0; n < nines.length; n += 1) {
            if (rows.length >= count) break;
            const nineId = nines[n];
            const slots = slotsOf(nineId);
            const slot = slots[i];
            if (!slot) {
                problems.push(`${n === 0 ? 'first nine' : 'second nine'}: only ${slots.length} tee time(s) from ${availability.hhmm(day.startTime)} - fewer than needed.`);
                continue;
            }
            const t = availability.toMinutes(slot.teeTime);
            const teeTime = availability.hhmm(slot.teeTime);
            if (availability.nineBlocked(ctx.nineBlocks.get(nineId), t)) { problems.push(`${teeTime}: the nine is closed or held.`); continue; }
            const key = availability.nineKey(nineId, slot.teeTime);
            if (locks.has(key)) { problems.push(`${teeTime}: a booking is being made on this flight right now.`); continue; }
            const cell = occ.get(key);
            if (cell && cell.players > 0) { problems.push(`${teeTime}: ${cell.players} player(s) already occupy this flight.`); continue; }
            if (capacity > slot.maxPlayers) { problems.push(`${teeTime}: the flight takes at most ${slot.maxPlayers} players.`); continue; }
            let crossNote = null;
            if (Number(day.holes) === 18) {
                const target = availability.crossTargetFrom(ctx, course, nineId, t);
                if (!target) { problems.push(`${teeTime}: the crossover would land after the last flight.`); continue; }
                const ct = availability.toMinutes(target.slot.teeTime);
                if (availability.nineBlocked(ctx.nineBlocks.get(target.unitCourseId), ct)) { problems.push(`${teeTime}: the crossover nine is closed or held at ${availability.hhmm(target.slot.teeTime)}.`); continue; }
                const ckey = availability.nineKey(target.unitCourseId, target.slot.teeTime);
                if (locks.has(ckey)) { problems.push(`${teeTime}: the crossover flight is being booked right now.`); continue; }
                const ccell = occ.get(ckey);
                if (ccell && ccell.players > 0) { problems.push(`${teeTime}: ${ccell.players} player(s) already occupy the crossover flight at ${availability.hhmm(target.slot.teeTime)}.`); continue; }
                crossNote = availability.hhmm(target.slot.teeTime);
            }
            order += 1;
            rows.push({
                unitCourseId: nineId,
                teeTime,
                startHole: null,
                startSequence: 1,
                flightLabel: nines.length > 1 ? `${teeTime} ${n === 0 ? 'T1' : 'T10'}` : `F${order}`,
                capacity,
                sortOrder: order,
                crossTime: crossNote,
            });
        }
    }
    if (rows.length < count) {
        return { error: `Only ${rows.length} of ${count} flight(s) can be reserved: ${problems.slice(0, 4).join(' ')}` };
    }
    return { rows };
}

// Build the flight rows for a SHOTGUN day: one flight per start hole (two
// on the `doubleHoles`) per wave. The course hold already blocks the nines,
// so the only refusal is ordinary players already seated inside the window.
function shotgunFlights({ day, course, holesInUse, doubleHoles, capacity, waveGap }) {
    const rows = [];
    const start = availability.toMinutes(day.startTime);
    let order = 0;
    for (let w = 0; w < Number(day.waves || 1); w += 1) {
        const teeTime = hhmmOf(start + w * waveGap);
        for (const hole of holesInUse) {
            const seqs = doubleHoles.includes(hole) ? [1, 2] : [1];
            for (const seq of seqs) {
                order += 1;
                rows.push({
                    unitCourseId: nineOfHole(course, hole),
                    teeTime,
                    startHole: hole,
                    startSequence: seq,
                    flightLabel: `${Number(day.waves) > 1 ? `W${w + 1} ` : ''}${hole}${seqs.length > 1 ? (seq === 1 ? 'A' : 'B') : ''}`,
                    capacity,
                    sortOrder: order,
                });
            }
        }
    }
    return { rows };
}

// Ordinary (non-group) players seated on the course's nines inside the hold
// window - a shotgun hold cannot be placed over them.
async function seatedInWindow(companyId, day, course, { excludeBookingId, transaction }) {
    const nines = [course.firstNineId, course.secondNineId].filter(Boolean);
    const rows = await Player.findAll({
        where: {
            companyId, playDate: day.playDate, unitCourseId: { [Op.in]: nines },
            status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS },
            teeTime: { [Op.gte]: `${availability.hhmm(day.startTime)}:00`, [Op.lt]: `${availability.hhmm(day.blockUntil)}:00` },
            ...(excludeBookingId ? { bookingProfileId: { [Op.or]: [{ [Op.ne]: excludeBookingId }, { [Op.is]: null }] } } : {}),
        },
        attributes: ['teeTime', 'playerName'],
        transaction,
    });
    return rows;
}

// POST /api/golf/group-bookings/:id/days/:dayId/flights/generate
//   sequential: { count, capacity? }
//   shotgun:    { doubleHoles?: [..], capacity?, waveGapMinutes? }
// REPLACES the day's reserved flights (refused while any player is drawn).
exports.generateFlights = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const day = await GroupPlayDay.findOne({ where: { bookingProfileId: profile.id, id: req.params.dayId } });
        if (!day) return res.status(404).json({ message: 'Play day not found.' });
        if (day.status !== 'planned') return res.status(400).json({ message: 'Only a planned play day takes flights.' });
        const course = await Course.findOne({ where: { companyId, id: day.courseId } });
        if (!course) return res.status(400).json({ message: 'The play day\'s course no longer exists.' });
        const capacity = Number(req.body.capacity || DEFAULT_FLIGHT_CAPACITY);
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 6) return res.status(400).json({ message: 'Flight capacity must be 1 to 6.' });
        const hold = COURSE_HOLD_FORMATS.includes(day.startFormat);
        let count = 0;
        let doubleHoles = [];
        let holesInUse = [];
        if (!hold) {
            count = Number(req.body.count);
            if (!Number.isInteger(count) || count < 1 || count > MAX_FLIGHTS_PER_DAY) return res.status(400).json({ message: `Number of flights must be 1 to ${MAX_FLIGHTS_PER_DAY}.` });
        } else {
            const max = Number(day.holes) === 9 ? 9 : 18;
            holesInUse = day.startFormat === 'modified-shotgun' && Array.isArray(day.startHoles) && day.startHoles.length
                ? day.startHoles.map(Number)
                : Array.from({ length: max }, (_, i) => i + 1);
            doubleHoles = (Array.isArray(req.body.doubleHoles) ? req.body.doubleHoles.map(Number) : []).filter((h) => holesInUse.includes(h));
            const total = (holesInUse.length + doubleHoles.length) * Number(day.waves || 1);
            if (total > MAX_FLIGHTS_PER_DAY) return res.status(400).json({ message: `That is ${total} flights - at most ${MAX_FLIGHTS_PER_DAY} per day.` });
        }
        const waveGap = Number(req.body.waveGapMinutes || 0);
        if (hold && Number(day.waves) > 1 && (!Number.isInteger(waveGap) || waveGap < 30 || waveGap > 600)) {
            return res.status(400).json({ message: 'Key in the gap between waves (30 to 600 minutes).' });
        }
        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, String(day.playDate));

        const result = await sequelize.transaction(async (transaction) => {
            await advisoryLock(transaction, companyId, String(day.playDate));
            const drawn = await drawnCountOfDay(day.id, { transaction });
            if (drawn > 0) return { fail: `${drawn} player(s) are already drawn into this day's flights - clear the draw before reserving flights again.`, status: 400 };
            // The day's OWN flights must not count against it: drop them
            // before computing the context (their holds vanish with them).
            await GroupFlight.destroy({ where: { groupPlayDayId: day.id }, transaction });
            const ctx = await availability.dayContext(companyId, String(day.playDate), dayType, { transaction });
            let built;
            if (!hold) {
                const [occ, locks] = await Promise.all([
                    availability.occupancy(companyId, String(day.playDate), { transaction, ctx }),
                    availability.activeLockCells(companyId, String(day.playDate), { transaction }),
                ]);
                built = sequentialFlights({ day, course, ctx, occ, locks, count, capacity });
            } else {
                // Other holds / closures on the window refuse; ordinary
                // players already inside it refuse with their times.
                const blocked = [course.firstNineId, course.secondNineId].filter(Boolean).some((nineId) => (ctx.nineBlocks.get(nineId) || [])
                    .filter((b) => b.bookingProfileId !== profile.id)
                    .some((b) => b.start === null || (b.start < availability.toMinutes(day.blockUntil) && b.end > availability.toMinutes(day.startTime))));
                if (blocked) return { fail: `${course.courseCode} is closed or held by another booking inside ${availability.hhmm(day.startTime)}-${availability.hhmm(day.blockUntil)} on ${day.playDate}.`, status: 409 };
                const seated = await seatedInWindow(companyId, day, course, { excludeBookingId: profile.id, transaction });
                if (seated.length) {
                    const times = [...new Set(seated.map((r) => availability.hhmm(r.teeTime)))].sort().slice(0, 6).join(', ');
                    return { fail: `${seated.length} player(s) are already booked on ${course.courseCode} inside the hold window (${times}) - move them or change the window.`, status: 409 };
                }
                built = shotgunFlights({ day, course, holesInUse, doubleHoles, capacity, waveGap });
            }
            if (built.error) return { fail: built.error, status: 409 };
            for (const row of built.rows) {
                await GroupFlight.create({
                    companyId, groupPlayDayId: day.id, bookingProfileId: profile.id,
                    courseId: course.id, playDate: day.playDate,
                    unitCourseId: row.unitCourseId, teeTime: row.teeTime, startHole: row.startHole,
                    startSequence: row.startSequence, flightLabel: row.flightLabel, capacity: row.capacity, sortOrder: row.sortOrder,
                    ...stamps,
                }, { transaction });
            }
            return { count: built.rows.length };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(200).json({
            message: `${result.count} flight(s) reserved for ${day.playDate}.`,
            booking: await fullDto(req, companyId, profile),
        });
    } catch (error) {
        console.error('Error generating group flights:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/group-bookings/:id/days/:dayId/flights/:flightId - drop
// one reserved flight (no drawn players on it).
exports.removeFlight = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const flight = await GroupFlight.findOne({ where: { bookingProfileId: profile.id, groupPlayDayId: req.params.dayId, id: req.params.flightId } });
        if (!flight) return res.status(404).json({ message: 'Flight not found.' });
        const drawn = await Player.count({ where: { groupFlightId: flight.id, secondNineFlag: 0, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS } } });
        if (drawn > 0) return res.status(400).json({ message: `${drawn} player(s) are drawn into flight ${flight.flightLabel} - move them first.` });
        await flight.destroy();
        res.status(200).json({ message: `Flight ${flight.flightLabel} released.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error removing group flight:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Roster

// Resolve one roster line: member lines through the membership seam (name
// snapshot + golfer identity), guests by name.
async function parseRosterLine(companyId, line, i, stamps, transaction) {
    const playerType = String(line.playerType || 'guest');
    if (!PLAYER_TYPE_KEYS.includes(playerType)) return { error: `Player ${i + 1}: pick a player type.` };
    const handicapRaw = line.handicap === null || line.handicap === undefined || line.handicap === '' ? null : Number(line.handicap);
    if (handicapRaw !== null && (!Number.isFinite(handicapRaw) || handicapRaw < -10 || handicapRaw > 54)) return { error: `Player ${i + 1}: handicap must be -10 to 54.` };
    const common = {
        playerType,
        handicap: handicapRaw,
        teamName: str(line.teamName, 100),
        contactMobile: str(line.contactMobile, 30),
        remarks: str(line.remarks, 255),
    };
    if (playerType === 'guest') {
        const playerName = str(line.playerName, 255);
        if (!playerName) return { error: `Player ${i + 1}: key in the guest name.` };
        return { ...common, playerName, memberNo: null, golferId: null };
    }
    const memberNo = str(line.memberNo, 50);
    if (!memberNo) return { error: `Player ${i + 1}: key in the member number.` };
    const standing = await getGolfMemberStanding(companyId, memberNo);
    if (!standing) return { error: `Player ${i + 1}: no member found with number '${memberNo}'.` };
    if (standing.actionControl === 'barred') return { error: `Player ${i + 1}: member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred.` };
    const [golfer] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        defaults: { companyId, golferType: 'member', sourceId: standing.memberId, name: standing.name, memberNo: standing.memberNo, ...stamps },
        transaction,
    });
    return { ...common, playerName: standing.name, memberNo: standing.memberNo, golferId: golfer.id };
}

// POST /api/golf/group-bookings/:id/players { players: [line, ...] } - add
// roster rows (one or many - the organiser's list is usually pasted in).
exports.addPlayers = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const raw = Array.isArray(req.body.players) ? req.body.players : [];
        if (!raw.length) return res.status(400).json({ message: 'Key in at least one player.' });
        const existing = await GroupPlayer.count({ where: { bookingProfileId: profile.id } });
        if (existing + raw.length > MAX_ROSTER) return res.status(400).json({ message: `A roster holds at most ${MAX_ROSTER} players.` });
        const stamps = await callerStamps(req);
        const result = await sequelize.transaction(async (transaction) => {
            const lines = [];
            for (let i = 0; i < raw.length; i += 1) {
                const parsed = await parseRosterLine(companyId, raw[i] || {}, i, stamps, transaction);
                if (parsed.error) return { fail: parsed.error, status: 400 };
                lines.push(parsed);
            }
            const last = await GroupPlayer.max('sortOrder', { where: { bookingProfileId: profile.id }, transaction });
            let order = Number(last) || 0;
            for (const l of lines) {
                order += 1;
                await GroupPlayer.create({ companyId, bookingProfileId: profile.id, ...l, sortOrder: order, status: 'listed', ...stamps }, { transaction });
            }
            return { count: lines.length };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(201).json({ message: `${result.count} player(s) added to the roster.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error adding group players:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/group-bookings/:id/players/:playerId - edit one roster row.
// Identity changes (type / member / name) propagate to the player's still-
// BOOKED drawn records; registered records keep what the desk recorded.
exports.updatePlayer = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const row = await GroupPlayer.findOne({ where: { bookingProfileId: profile.id, id: req.params.playerId } });
        if (!row) return res.status(404).json({ message: 'Roster player not found.' });
        const stamps = await callerStamps(req);
        const status = String(req.body.status || row.status);
        if (!GROUP_PLAYER_STATUS_KEYS.includes(status)) return res.status(400).json({ message: 'Pick a roster status.' });
        const result = await sequelize.transaction(async (transaction) => {
            const parsed = await parseRosterLine(companyId, req.body, 0, stamps, transaction);
            if (parsed.error) return { fail: parsed.error.replace(/^Player 1: /, ''), status: 400 };
            Object.assign(row, parsed, { status, updatedBy: stamps.updatedBy });
            await row.save({ transaction });
            await Player.update({
                playerType: parsed.playerType, playerName: parsed.playerName, memberNo: parsed.memberNo, golferId: parsed.golferId, updatedBy: stamps.updatedBy,
            }, { where: { groupPlayerId: row.id, status: 'booked' }, transaction });
            if (status === 'withdrawn') {
                // A withdrawn player leaves every flight they were only booked into.
                await removeDrawnRecords(row.id, { onlyBooked: true, transaction });
            }
            return {};
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(200).json({ message: `${row.playerName} updated.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error updating group player:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/group-bookings/:id/players/:playerId - remove a roster
// row that was never registered (its booked draw records go with it).
exports.removePlayer = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const row = await GroupPlayer.findOne({ where: { bookingProfileId: profile.id, id: req.params.playerId } });
        if (!row) return res.status(404).json({ message: 'Roster player not found.' });
        const registered = await Player.count({ where: { groupPlayerId: row.id, status: { [Op.ne]: 'booked' } } });
        if (registered > 0) return res.status(400).json({ message: `${row.playerName} has registered / recorded play - withdraw the player instead of removing.` });
        await sequelize.transaction(async (transaction) => {
            await removeDrawnRecords(row.id, { onlyBooked: true, transaction });
            await row.destroy({ transaction });
        });
        res.status(200).json({ message: `${row.playerName} removed from the roster.`, booking: await fullDto(req, companyId, profile) });
    } catch (error) {
        console.error('Error removing group player:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Delete a roster player's drawn Player rows (both nine records), optionally
// only those still booked, optionally on one date.
async function removeDrawnRecords(groupPlayerId, { onlyBooked, playDate, transaction }) {
    const where = { groupPlayerId };
    if (onlyBooked) where.status = 'booked';
    if (playDate) where.playDate = playDate;
    const firsts = await Player.findAll({ where: { ...where, secondNineFlag: 0 }, transaction });
    if (!firsts.length) return 0;
    const ids = firsts.map((r) => r.id);
    await Player.destroy({ where: { firstNinePlayerId: { [Op.in]: ids } }, transaction });
    await Player.destroy({ where: { id: { [Op.in]: ids } }, transaction });
    return firsts.length;
}

// ---------------------------------------------------------------------------
// Draw

// PUT /api/golf/group-bookings/:id/days/:dayId/draw
//   { assignments: [{ groupPlayerId, groupFlightId | null }], auto?: true }
// `auto` fills the day's flights in order with every listed, undrawn roster
// player (roster order) before applying the explicit assignments. Writes /
// moves / removes the ordinary golf.Player rows under the day's advisory
// lock; registered players never move.
exports.draw = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        if (profile.status !== 'booked') return res.status(400).json({ message: 'A cancelled booking cannot be edited.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });
        const day = await GroupPlayDay.findOne({ where: { bookingProfileId: profile.id, id: req.params.dayId } });
        if (!day) return res.status(404).json({ message: 'Play day not found.' });
        if (day.status !== 'planned') return res.status(400).json({ message: 'Only a planned play day can be drawn.' });
        const course = await Course.findOne({ where: { companyId, id: day.courseId } });
        if (!course) return res.status(400).json({ message: 'The play day\'s course no longer exists.' });
        const playDate = String(day.playDate);
        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, playDate);
        const explicit = Array.isArray(req.body.assignments) ? req.body.assignments : [];
        const auto = req.body.auto === true;

        const result = await sequelize.transaction(async (transaction) => {
            await advisoryLock(transaction, companyId, playDate);
            const flights = await GroupFlight.findAll({ where: { groupPlayDayId: day.id }, order: [['sortOrder', 'ASC']], transaction });
            if (!flights.length) return { fail: 'Reserve the day\'s flights before drawing players into them.', status: 400 };
            const flightById = new Map(flights.map((f) => [f.id, f]));
            const roster = await GroupPlayer.findAll({ where: { bookingProfileId: profile.id }, order: [['sortOrder', 'ASC']], transaction });
            const rosterById = new Map(roster.map((p) => [p.id, p]));
            // Current draw on this date: starting-nine records per roster player.
            const current = await Player.findAll({
                where: { bookingProfileId: profile.id, playDate, secondNineFlag: 0, groupPlayerId: { [Op.ne]: null } },
                transaction,
            });
            const currentByPlayer = new Map(current.filter((r) => ACTIVE_PLAYER_STATUS_KEYS.includes(r.status)).map((r) => [r.groupPlayerId, r]));

            // Target flight per roster player: start from the current draw,
            // apply auto-fill, then the explicit assignments.
            const target = new Map();
            for (const [gpId, r] of currentByPlayer) target.set(gpId, r.groupFlightId);
            if (auto) {
                const seatsLeft = new Map(flights.map((f) => [f.id, f.capacity]));
                for (const [, fid] of target) if (fid && seatsLeft.has(fid)) seatsLeft.set(fid, seatsLeft.get(fid) - 1);
                let fi = 0;
                for (const p of roster) {
                    if (p.status !== 'listed' || target.get(p.id)) continue;
                    while (fi < flights.length && seatsLeft.get(flights[fi].id) <= 0) fi += 1;
                    if (fi >= flights.length) break;
                    target.set(p.id, flights[fi].id);
                    seatsLeft.set(flights[fi].id, seatsLeft.get(flights[fi].id) - 1);
                }
            }
            for (const a of explicit) {
                const gpId = String(a.groupPlayerId || '');
                if (!rosterById.has(gpId)) return { fail: 'An assignment names a player who is not on the roster.', status: 400 };
                const fid = a.groupFlightId ? String(a.groupFlightId) : null;
                if (fid && !flightById.has(fid)) return { fail: 'An assignment names a flight that is not on this day.', status: 400 };
                if (fid && rosterById.get(gpId).status !== 'listed') return { fail: `${rosterById.get(gpId).playerName} is withdrawn and cannot be drawn.`, status: 400 };
                target.set(gpId, fid);
            }
            // Capacity per flight.
            const load = new Map();
            for (const [, fid] of target) if (fid) load.set(fid, (load.get(fid) || 0) + 1);
            for (const [fid, n] of load) {
                const f = flightById.get(fid);
                if (n > f.capacity) return { fail: `Flight ${f.flightLabel} takes ${f.capacity} players - ${n} assigned.`, status: 400 };
            }

            const ctx = await availability.dayContext(companyId, playDate, dayType, { transaction });
            const crossOf = (flight) => {
                if (Number(day.holes) !== 18) return null;
                const t = availability.toMinutes(flight.teeTime);
                if (COURSE_HOLD_FORMATS.includes(day.startFormat)) {
                    // Shotgun: the other nine, one crossover offset later; the
                    // hold covers it, no grid snap needed.
                    const landing = flight.unitCourseId === course.secondNineId ? course.firstNineId : course.secondNineId;
                    return { unitCourseId: landing, teeTime: hhmmOf(t + (course.crossOverMinutes || 0)) };
                }
                const tg = availability.crossTargetFrom(ctx, course, flight.unitCourseId, t);
                return tg ? { unitCourseId: tg.unitCourseId, teeTime: availability.hhmm(tg.slot.teeTime) } : null;
            };

            let placed = 0;
            let moved = 0;
            let removed = 0;
            const base = Date.now();
            let seq = 0;
            for (const [gpId, fid] of target) {
                const cur = currentByPlayer.get(gpId) || null;
                const p = rosterById.get(gpId);
                if (!fid) {
                    if (cur) {
                        if (cur.status !== 'booked') return { fail: `${p.playerName} is already registered on ${playDate} and cannot be taken out of the draw.`, status: 400 };
                        await removeDrawnRecords(gpId, { onlyBooked: true, playDate, transaction });
                        removed += 1;
                    }
                    continue;
                }
                const flight = flightById.get(fid);
                const cross = crossOf(flight);
                if (Number(day.holes) === 18 && !cross) return { fail: `Flight ${flight.flightLabel}: the crossover would land after the last flight.`, status: 409 };
                if (cur && cur.groupFlightId === fid) continue;
                if (cur) {
                    if (cur.status !== 'booked') return { fail: `${p.playerName} is already registered on ${playDate} and cannot be moved.`, status: 400 };
                    cur.groupFlightId = fid;
                    cur.unitCourseId = flight.unitCourseId;
                    cur.teeTime = flight.teeTime;
                    cur.startHole = flight.startHole;
                    cur.courseId = course.id;
                    cur.updatedBy = stamps.updatedBy;
                    await cur.save({ transaction });
                    const second = await Player.findOne({ where: { firstNinePlayerId: cur.id }, transaction });
                    if (second && cross) {
                        second.groupFlightId = fid;
                        second.unitCourseId = cross.unitCourseId;
                        second.teeTime = cross.teeTime;
                        second.startHole = flight.startHole;
                        second.courseId = course.id;
                        second.updatedBy = stamps.updatedBy;
                        await second.save({ transaction });
                    } else if (second && !cross) {
                        await second.destroy({ transaction });
                    } else if (!second && cross) {
                        await Player.create({
                            companyId, bookingProfileId: profile.id, secondNineFlag: 1, firstNinePlayerId: cur.id,
                            unitCourseId: cross.unitCourseId, courseId: course.id, playDate, teeTime: cross.teeTime,
                            playerType: cur.playerType, golferId: cur.golferId, playerName: cur.playerName, memberNo: cur.memberNo,
                            status: 'booked', groupFlightId: fid, groupPlayerId: gpId, startHole: flight.startHole, ...stamps,
                        }, { transaction });
                    }
                    moved += 1;
                    continue;
                }
                seq += 1;
                const shared = {
                    companyId, bookingProfileId: profile.id, courseId: course.id, playDate,
                    playerType: p.playerType, golferId: p.golferId, playerName: p.playerName, memberNo: p.memberNo,
                    status: 'booked', groupFlightId: fid, groupPlayerId: gpId, startHole: flight.startHole, ...stamps,
                };
                const first = await Player.create({
                    ...shared, secondNineFlag: 0, unitCourseId: flight.unitCourseId, teeTime: flight.teeTime,
                    createdAt: new Date(base + seq * 2),
                }, { transaction });
                if (cross) {
                    await Player.create({
                        ...shared, secondNineFlag: 1, firstNinePlayerId: first.id, unitCourseId: cross.unitCourseId, teeTime: cross.teeTime,
                        createdAt: new Date(base + seq * 2 + 1),
                    }, { transaction });
                }
                placed += 1;
            }
            return { placed, moved, removed };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        const parts = [];
        if (result.placed) parts.push(`${result.placed} placed`);
        if (result.moved) parts.push(`${result.moved} moved`);
        if (result.removed) parts.push(`${result.removed} taken out`);
        res.status(200).json({
            message: parts.length ? `Draw for ${playDate} saved - ${parts.join(', ')}.` : `Draw for ${playDate} unchanged.`,
            booking: await fullDto(req, companyId, profile),
        });
    } catch (error) {
        console.error('Error saving group draw:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
