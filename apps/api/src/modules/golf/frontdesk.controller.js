// Golf Front Desk (Golf Management → /golf/front-desk) - registration,
// billing and settlement (user decisions 2026-09-26, revamped 2026-09-29 to
// the per-nine golf.Player model):
//   - REGISTRATION is per player: a BOOKED player's Player record flips
//     booked -> registered (own Registration No. on the starting-nine
//     record); a WALK-IN creates its Player record(s) directly as
//     'registered'. Occupancy is one count over Player per nine-cell, so
//     the desk and the booking channel can never oversell a nine.
//   - BILLING is per player: green fee AUTO-charges by the golfer category
//     living on the green-fee transaction type (members WITH golfing right
//     pay none), tiles add further items, packages EXPLODE per the approved
//     spec, tax snapshots per item via the tax seam.
//   - SETTLEMENT takes multiple tenders; 'member' class posts to the billed
//     member's own AR account via arGateway.postCharge({ enforceCredit }).

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext, getCallerPlacement, canModifyRecord,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding, getChargeTarget } = require('../../platform/membershipGateway');
const { classifyDateRange } = require('../../platform/calendarGateway');
const arGateway = require('../../platform/arGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { PLAYER_TYPES, PLAYER_TYPE_KEYS, HOLES_OPTIONS } = require('./booking.constants');
const { PLAYER_STATUSES, BILL_STATUSES, ACTIVE_PLAYER_STATUS_KEYS } = require('./registration.constants');
const { PACKAGE_CHARGE_TYPE_KEY, GOLFER_TYPES } = require('./transactionType.constants');
const { GROUP_BOOKING_TYPE_KEYS, COURSE_HOLD_FORMATS } = require('./groupBooking.constants');
// Charge types the per-player desk bill never offers: the group folio's
// 'deposit' item and the system-raised 'no-show' penalty.
const DESK_HIDDEN_CHARGE_TYPES = ['deposit', 'no-show'];
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const GolfSetting = require('./golfSetting.model');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');
const BillPayment = require('./billPayment.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');
const OtherGolfer = require('./otherGolfer.model');
const GolfTransactionType = require('./transactionType.model');
const GolfTransactionTypeEligibility = require('./transactionTypeEligibility.model');
const eligibility = require('./eligibility.service');
// The shared billing engine (extracted 2026-10-07 for the group folio): pricing,
// tax quotes, package explosion, totals, DTOs.
const {
    quoteItemTax, recomputeTotals, addOrdinaryItem, addPackageItems, itemDto, paymentDto, billDto,
} = require('./billing.service');
const PaymentType = require('./paymentType.model');
const UnitCourse = require('./unitCourse.model');
const noShow = require('./noShowCharge.service');
const { companyTimezone } = require('../../platform/calendarGateway');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function cents(n) {
    return Math.round((Number(n) || 0) * 100);
}

async function dayTypeOf(req, playDate) {
    const rows = await classifyDateRange(req, playDate, playDate);
    return rows.length ? rows[0].dayType : 'weekday';
}

async function callerStamps(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

// ---------------------------------------------------------------------------
// Golfer identity helpers

// Find-or-create a member's golf.Golfer identity (snapshot refresh on contact).
async function memberGolfer(companyId, standing, stamps, transaction) {
    const [row] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        defaults: {
            companyId, golferType: 'member', sourceId: standing.memberId,
            name: standing.name, memberNo: standing.memberNo, ...stamps,
        },
        transaction,
    });
    if (row.name !== standing.name || row.memberNo !== standing.memberNo) {
        row.name = standing.name;
        row.memberNo = standing.memberNo;
        await row.save({ transaction });
    }
    return row;
}

// Create-or-match the durable OtherGolfer profile for a guest (dedupe by
// identity no first, then mobile - the recorded rule), then its Golfer row.
async function guestGolfer({ companyId, name, identityNo, mobile, email, stamps, transaction }) {
    let profile = null;
    if (identityNo) profile = await OtherGolfer.findOne({ where: { companyId, identityNo }, transaction });
    if (!profile && mobile) profile = await OtherGolfer.findOne({ where: { companyId, mobile }, transaction });
    if (profile) {
        // Fill blanks on contact - never overwrite keyed data.
        let dirty = false;
        if (!profile.identityNo && identityNo) { profile.identityNo = identityNo; dirty = true; }
        if (!profile.mobile && mobile) { profile.mobile = mobile; dirty = true; }
        if (!profile.email && email) { profile.email = email; dirty = true; }
        if (dirty) await profile.save({ transaction });
    } else {
        profile = await OtherGolfer.create({
            companyId, name, identityNo: identityNo || null, mobile: mobile || null, email: email || null, ...stamps,
        }, { transaction });
    }
    const [golfer] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'other', sourceId: profile.id },
        defaults: { companyId, golferType: 'other', sourceId: profile.id, name: profile.name, ...stamps },
        transaction,
    });
    return { golfer, profile };
}

// ---------------------------------------------------------------------------
// Player-pair helpers (starting-nine record + optional crossover record)

// The crossover record of a starting-nine record (null for 9 holes).
async function secondNineOf(playerId, { transaction } = {}) {
    return Player.findOne({ where: { firstNinePlayerId: playerId }, transaction });
}

// { holes, crossTime } derived from the pair.
async function playShapeOf(row, { transaction } = {}) {
    const second = await secondNineOf(row.id, { transaction });
    return { holes: second ? 18 : 9, crossTime: second ? availability.hhmm(second.teeTime) : null, second };
}

// ---------------------------------------------------------------------------
// DTOs

// A registered player's registration view - the Player record itself plus
// the pair-derived crossTime/holes.
function registrationDto(row, shape) {
    return {
        id: row.id,
        registrationNo: row.registrationNo,
        bookingProfileId: row.bookingProfileId,
        courseId: row.courseId,
        playDate: row.playDate,
        teeTime: availability.hhmm(row.teeTime),
        crossTime: shape ? shape.crossTime : null,
        holes: shape ? shape.holes : 9,
        golferId: row.golferId,
        playerType: row.playerType,
        playerName: row.playerName,
        memberNo: row.memberNo,
        status: row.status,
    };
}

// Which tiles the billed golfer does NOT qualify for (package eligibility,
// 2026-10-06): { [transactionTypeId]: reason } - the screen disables those
// tiles with the reason; addItem refuses them with the same text.
async function ineligibleTiles(req, companyId, registration) {
    const types = await GolfTransactionType.findAll({
        where: { companyId, isActive: true },
        include: [{ model: GolfTransactionTypeEligibility, as: 'Eligibility' }],
    });
    const shape = await playShapeOf(registration);
    return eligibility.ineligibleMap(req, { companyId, registration, holes: shape.holes, types });
}

// ---------------------------------------------------------------------------
// GET /front-desk/day?playDate= - the TEE SHEET (user request 2026-09-27):
// per course, EVERY flight time of the day's tee-time set with capacity,
// occupancy and closure state. A course's column is the timeline of its
// FIRST nine, so crossover arrivals from ANOTHER course landing on that nine
// appear (and consume seats) in this course's cells - the user's 2026-09-29
// requirement. Availability shown here is display-level; the register
// endpoints re-check the authoritative rules.
exports.getDay = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.query.playDate || '');
        if (!DATE_RE.test(playDate)) return res.status(400).json({ message: 'Pick a play date.' });
        const dayType = await dayTypeOf(req, playDate);

        const [records, courses] = await Promise.all([
            Player.findAll({
                where: { companyId, playDate, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS } },
                order: [['createdAt', 'ASC'], ['id', 'ASC']],
            }),
            Course.findAll({
                where: { companyId },
                attributes: ['id', 'courseCode', 'description', 'isActive', 'firstNineId', 'secondNineId', 'crossOverMinutes', 'displaySequence'],
                order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
            }),
        ]);
        // Profiles by the records' booking ids, not by play date: a group
        // booking's header carries only its FIRST play day (2026-10-07).
        const profileIds = [...new Set(records.map((r) => r.bookingProfileId).filter(Boolean))];
        const profiles = profileIds.length ? await BookingProfile.findAll({ where: { companyId, id: { [Op.in]: profileIds } } }) : [];
        const profileById = new Map(profiles.map((b) => [b.id, b]));
        const firsts = records.filter((r) => Number(r.secondNineFlag) === 0);
        const seconds = records.filter((r) => Number(r.secondNineFlag) === 1);
        const secondByFirst = new Map(seconds.map((r) => [r.firstNinePlayerId, r]));
        const bills = firsts.length
            ? await Bill.findAll({ where: { companyId, playerId: { [Op.in]: firsts.map((r) => r.id) }, status: { [Op.ne]: 'voided' } } })
            : [];
        const billByPlayer = new Map(bills.map((b) => [b.playerId, b]));

        // The day's grids, closures and GROUP HOLDS (ctx.holds: the planned
        // group play days + their reserved flights; shotgun-format days are
        // merged into nineBlocks as kind 'group').
        const ctx = await availability.dayContext(companyId, playDate, dayType, {
            courses: courses.filter((c) => c.isActive),
        });
        const holdDays = ctx.holds ? ctx.holds.days : [];
        const groupFlights = ctx.holds ? ctx.holds.flights : [];
        const flightById = new Map(groupFlights.map((f) => [f.id, f]));
        const dayByFlight = new Map(groupFlights.map((f) => [f.id, ctx.holds.dayById.get(f.groupPlayDayId)]));
        const isHoldFormat = (day) => day && COURSE_HOLD_FORMATS.includes(day.startFormat);

        // Entries per NINE-cell (unitCourseId|HH:MM) from starting-nine
        // records + crossover arrival counts per landing cell. Players of a
        // SHOTGUN-format group day live in the group block, not the grid
        // (every flight shares the wave time, so a cell would swallow them all).
        const entriesByCell = new Map();
        const entriesByGroupFlight = new Map();
        const entryOf = (r) => {
            const profile = r.bookingProfileId ? profileById.get(r.bookingProfileId) : null;
            const second = secondByFirst.get(r.id) || null;
            const bill = billByPlayer.get(r.id) || null;
            const shape = { holes: second ? 18 : 9, crossTime: second ? availability.hhmm(second.teeTime) : null };
            const gf = r.groupFlightId ? flightById.get(r.groupFlightId) : null;
            return {
                kind: r.bookingProfileId ? 'booked' : 'walkin',
                bookingProfileId: r.bookingProfileId,
                bookingNo: profile ? profile.bookingNo : null,
                bookingType: profile ? profile.bookingType : null,
                groupName: profile && GROUP_BOOKING_TYPE_KEYS.includes(profile.bookingType) ? (profile.groupName || profile.bookingNo) : null,
                flightLabel: gf ? gf.flightLabel : null,
                startHole: r.startHole || null,
                playerId: r.id,
                playerType: r.playerType,
                playerName: r.playerName,
                memberNo: r.memberNo,
                holes: shape.holes,
                registration: r.status === 'registered' ? registrationDto(r, shape) : null,
                bill: bill ? { id: bill.id, billNo: bill.billNo, status: bill.status, totalAmount: Number(bill.totalAmount) } : null,
            };
        };
        for (const r of firsts) {
            const entry = entryOf(r);
            if (r.groupFlightId) {
                if (!entriesByGroupFlight.has(r.groupFlightId)) entriesByGroupFlight.set(r.groupFlightId, []);
                entriesByGroupFlight.get(r.groupFlightId).push(entry);
                if (isHoldFormat(dayByFlight.get(r.groupFlightId) && dayByFlight.get(r.groupFlightId).day)) continue;
            }
            const key = availability.nineKey(r.unitCourseId, r.teeTime);
            if (!entriesByCell.has(key)) entriesByCell.set(key, []);
            entriesByCell.get(key).push(entry);
        }
        // RESERVED seats per cell: a sequential-format group flight holds its
        // cell at full capacity (availability already refuses them); the sheet
        // shows the undrawn seats as reserved for the group, not as free.
        const reservedByCell = new Map();
        for (const f of groupFlights) {
            const entry = dayByFlight.get(f.id);
            if (!entry || isHoldFormat(entry.day)) continue;
            const drawn = (entriesByGroupFlight.get(f.id) || []).length;
            const open = Math.max(0, f.capacity - drawn);
            if (!open) continue;
            const key = availability.nineKey(f.unitCourseId, f.teeTime);
            const cur = reservedByCell.get(key) || { seats: 0, label: entry.profile.groupName || entry.profile.bookingNo };
            cur.seats += open;
            reservedByCell.set(key, cur);
        }
        const crossByCell = new Map();
        for (const r of seconds) {
            if (r.groupFlightId && isHoldFormat(dayByFlight.get(r.groupFlightId) && dayByFlight.get(r.groupFlightId).day)) continue;
            const key = availability.nineKey(r.unitCourseId, r.teeTime);
            crossByCell.set(key, (crossByCell.get(key) || 0) + 1);
        }

        // Nine codes for the DERIVED rotation suffix on each card header
        // ("E1 → E2") - so every club shows its pairing without keying it
        // into the course description (user request 2026-09-30).
        const nineIds = [...new Set(courses.flatMap((c) => [c.firstNineId, c.secondNineId]).filter(Boolean))];
        const nineCodeById = new Map(
            (await UnitCourse.findAll({ where: { id: { [Op.in]: nineIds } }, attributes: ['id', 'unitCourseCode'] }))
                .map((u) => [u.id, u.unitCourseCode]),
        );

        // The label of the group holding a nine at a time (shotgun formats),
        // so the sheet reads "HELD · IFCA Invitational" rather than CLOSED.
        const heldBy = (blocks, t) => {
            const b = (blocks || []).find((x) => x.kind === 'group' && x.start !== null && t >= x.start && t < x.end);
            return b ? b.label : null;
        };

        const consumed = new Set();
        const sheets = [];
        for (const course of courses) {
            const day = ctx.byCourse.get(course.id) || null;
            const set = day ? day.set : null;
            const slots = day ? day.slots : [];
            const firstNineBlocks = ctx.nineBlocks.get(course.firstNineId);

            const flights = [];
            const onGrid = new Set();
            // A course's second nine that NO course starts on (classic
            // OUT/IN pairing) has no column of its own - show its crossover
            // arrivals in THIS course's column (the pre-revamp view). Those
            // arrivals occupy the OTHER physical nine, so they never reduce
            // this column's seats; rotation clubs (landing nine owned by
            // another course's column) skip this and show arrivals there.
            const borrowSecondNine = !ctx.nineOwner.has(course.secondNineId);
            for (const slot of slots) {
                const teeTime = availability.hhmm(slot.teeTime);
                onGrid.add(teeTime);
                const t = availability.toMinutes(slot.teeTime);
                const closed = availability.nineBlocked(firstNineBlocks, t);
                const key = availability.nineKey(course.firstNineId, teeTime);
                consumed.add(key);
                const entries = entriesByCell.get(key) || [];
                const sameNineCross = crossByCell.get(key) || 0;
                const borrowedCross = borrowSecondNine
                    ? crossByCell.get(availability.nineKey(course.secondNineId, teeTime)) || 0
                    : 0;
                const crossoverOnly = slot.isCrossoverOnly === true;
                const reserved = reservedByCell.get(key) || null;
                // 18 holes impossible from here (user request 2026-09-30 -
                // show it, don't let the desk find out at save): the
                // crossover landing is closure-blocked, or no landing slot
                // remains (late tee-offs). Only meaningful on rows that can
                // still take a tee-off.
                let nineHolesOnly = false;
                if (!closed && !crossoverOnly) {
                    const target = availability.crossTarget(ctx, course, t);
                    nineHolesOnly = !target
                        || availability.crossBlocked(ctx, course, availability.toMinutes(target.slot.teeTime));
                }
                flights.push({
                    teeTime,
                    maxPlayers: slot.maxPlayers,
                    isFrontDesk: slot.isFrontDesk === true,
                    crossoverOnly,
                    closed,
                    heldBy: closed ? heldBy(firstNineBlocks, t) : null,
                    reserved: reserved ? reserved.seats : 0,
                    reservedBy: reserved ? reserved.label : null,
                    nineHolesOnly,
                    seatsTaken: entries.length,
                    seatsLeft: closed || crossoverOnly ? 0 : Math.max(0, slot.maxPlayers - entries.length - sameNineCross - (reserved ? reserved.seats : 0)),
                    crossCount: sameNineCross + borrowedCross,
                    entries,
                });
            }
            // Defensive: entries on this course's first nine at times no
            // longer on the grid (set edited after booking) still show, as
            // unbookable off-grid rows.
            for (const [key, entries] of entriesByCell) {
                const [nineId, teeTime] = key.split('|');
                if (nineId !== course.firstNineId || onGrid.has(teeTime) || consumed.has(key)) continue;
                consumed.add(key);
                flights.push({
                    teeTime, maxPlayers: null, isFrontDesk: false, crossoverOnly: false, closed: false, heldBy: null,
                    seatsTaken: entries.length, seatsLeft: 0, offGrid: true,
                    crossCount: crossByCell.get(key) || 0, entries,
                });
            }
            flights.sort((a, b) => a.teeTime.localeCompare(b.teeTime));

            // GROUP BLOCKS (2026-10-07): one per planned group play day on
            // this course - the header the desk registers the whole group
            // from; shotgun-format days also list their flights here (hole,
            // wave time, nine, players), sequential days keep their players
            // in the grid rows above (tagged with the group name).
            const groups = holdDays.filter((h) => h.day.courseId === course.id).map(({ day: gday, profile }) => {
                const hold = isHoldFormat(gday);
                const dayFlights = groupFlights.filter((f) => f.groupPlayDayId === gday.id).sort((a, b) => a.sortOrder - b.sortOrder);
                const flightDtos = dayFlights.map((f) => ({
                    id: f.id,
                    flightLabel: f.flightLabel,
                    teeTime: availability.hhmm(f.teeTime),
                    startHole: f.startHole,
                    nineCode: nineCodeById.get(f.unitCourseId) || null,
                    capacity: f.capacity,
                    entries: entriesByGroupFlight.get(f.id) || [],
                }));
                const all = flightDtos.flatMap((f) => f.entries);
                return {
                    bookingProfileId: profile.id,
                    bookingNo: profile.bookingNo,
                    bookingType: profile.bookingType,
                    groupName: profile.groupName || profile.bookingNo,
                    groupPlayDayId: gday.id,
                    startFormat: gday.startFormat,
                    hold,
                    holes: Number(gday.holes),
                    startTime: availability.hhmm(gday.startTime),
                    blockUntil: availability.hhmm(gday.blockUntil),
                    flightCount: dayFlights.length,
                    seatCount: dayFlights.reduce((s, f) => s + f.capacity, 0),
                    drawn: all.length,
                    booked: all.filter((e) => !e.registration).length,
                    registered: all.filter((e) => e.registration).length,
                    billed: all.filter((e) => e.bill).length,
                    settled: all.filter((e) => e.bill && e.bill.status === 'settled').length,
                    flights: hold ? flightDtos : [],
                };
            });

            // A course appears when it operates that day (has a tee sheet) or
            // still has something to show; silent courses stay off the sheet.
            if (set || flights.length || groups.length) {
                const firstCode = nineCodeById.get(course.firstNineId);
                const secondCode = nineCodeById.get(course.secondNineId);
                sheets.push({
                    courseId: course.id,
                    courseCode: course.courseCode,
                    courseDescription: course.description,
                    rotation: firstCode && secondCode ? `${firstCode} → ${secondCode}` : null,
                    operating: !!set,
                    groups,
                    flights,
                });
            }
        }

        res.status(200).json({ playDate, dayType, courses: sheets });
    } catch (error) {
        console.error('Error loading golf front-desk day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/register-group { bookingProfileId, playDate } - register
// EVERY still-booked player of a group booking on the date, whichever nine or
// flight they are drawn into (per-player transactions like register-flight,
// so one barred member never blocks the rest; name-only guests get their
// durable identity here). Reports registered vs skipped.
exports.registerGroup = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.body.playDate || '');
        const profileId = String(req.body.bookingProfileId || '');
        if (!DATE_RE.test(playDate) || !profileId) return res.status(400).json({ message: 'Pick the group to register.' });
        const profile = await BookingProfile.findOne({ where: { companyId, id: profileId, bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS } } });
        if (!profile) return res.status(404).json({ message: 'Group booking not found.' });
        if (profile.status !== 'booked') return res.status(400).json({ message: 'This group booking is cancelled.' });
        const stamps = await callerStamps(req);
        const candidates = await Player.findAll({
            where: { companyId, playDate, bookingProfileId: profile.id, secondNineFlag: 0, status: 'booked' },
            order: [['teeTime', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
        });
        if (!candidates.length) {
            return res.status(200).json({ message: `Everyone in ${profile.groupName || profile.bookingNo} is already registered for ${playDate}.`, registered: [], skipped: [] });
        }
        const registered = [];
        const skipped = [];
        for (const candidate of candidates) {
            try {
                const result = await sequelize.transaction(async (transaction) => {
                    const row = await Player.findOne({ where: { id: candidate.id }, transaction });
                    if (!row || row.status !== 'booked') {
                        return { fail: row && row.status === 'registered' ? `already registered (${row.registrationNo})` : 'no longer booked' };
                    }
                    return registerBookedRecord({ req, companyId, row, guest: null, stamps, transaction });
                });
                if (result.fail) skipped.push({ playerName: candidate.playerName, reason: result.fail });
                else registered.push({ playerName: result.row.playerName, registrationNo: result.row.registrationNo });
            } catch (e) {
                console.error('Group registration line failed:', e);
                skipped.push({ playerName: candidate.playerName, reason: 'registration failed' });
            }
        }
        const message = skipped.length
            ? `Registered ${registered.length} of ${candidates.length} player(s) of ${profile.groupName || profile.bookingNo}; skipped ${skipped.length} - ${skipped.map((s) => `${s.playerName}: ${s.reason}`).join('; ')}`
            : `Registered ${registered.length} player(s) of ${profile.groupName || profile.bookingNo}.`;
        res.status(200).json({ message, registered, skipped });
    } catch (error) {
        console.error('Error registering golf group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /front-desk/meta - billing tiles + tenders for the screen.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [types, tenders, courses, setting] = await Promise.all([
            GolfTransactionType.findAll({
                where: { companyId, isActive: true },
                attributes: ['id', 'transactionType', 'chargeType', 'golferType', 'description', 'iconUrl', 'allowPriceOverride'],
                order: [['transactionType', 'ASC']],
            }),
            PaymentType.findAll({
                where: { companyId, isActive: true },
                attributes: ['id', 'paymentType', 'paymentClass', 'description', 'iconUrl'],
                order: [['paymentType', 'ASC']],
            }),
            Course.findAll({
                where: { companyId, isActive: true },
                attributes: ['id', 'courseCode', 'description'],
                order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
            }),
            GolfSetting.findOne({ where: { companyId } }),
        ]);
        // Desk tiles: never the group-folio DEPOSIT item nor the system-raised
        // no-show penalty (2026-10-07) - both have their own doors.
        res.status(200).json({
            tiles: types.filter((t) => !DESK_HIDDEN_CHARGE_TYPES.includes(t.chargeType)),
            paymentTypes: tenders,
            courses,
            playerTypes: PLAYER_TYPES,
            holesOptions: HOLES_OPTIONS,
            playerStatuses: PLAYER_STATUSES,
            billStatuses: BILL_STATUSES,
            // Seat-dot colours for the tee sheet (Golf Specification; user
            // request 2026-09-29). Blank outline = free seat.
            teeSheetColors: {
                booked: (setting && setting.teeSheetColorBooked) || '#2563eb',
                registered: (setting && setting.teeSheetColorRegistered) || '#f59e0b',
                billed: (setting && setting.teeSheetColorBilled) || '#8b5cf6',
                settled: (setting && setting.teeSheetColorSettled) || '#16a34a',
            },
        });
    } catch (error) {
        console.error('Error loading golf front-desk meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Registration

// Non-blocking handicap-control check for the desk (user decision
// 2026-09-29: the BOOKING channel refuses violations, the desk WARNS - it
// stays seats-authoritative). Evaluates the flight the just-registered
// player(s) sit in; returns warning messages ('' -> none). Never throws.
async function handicapWarnings(req, { companyId, courseId, unitCourseId, playDate, teeTime, holes, playerIds }) {
    try {
        const setting = await GolfSetting.findOne({ where: { companyId } });
        if (!setting || setting.handicapControlEnabled !== true) return [];
        const handicap = require('./handicapControl.service');
        const rules = await handicap.loadHandicapRules(companyId);
        if (!rules.limitRules.length && !rules.accompanimentRules.length) return [];
        const dayType = await dayTypeOf(req, playDate);
        const seated = await handicap.describeSeatedPlayers(companyId, { unitCourseId, playDate, teeTime });
        const players = playerIds ? seated.filter((p) => playerIds.includes(p.playerId)) : seated;
        if (!players.length) return [];
        return handicap.evaluateFlight({
            ...rules,
            courseId,
            dayType,
            dayOfWeek: availability.dayOfWeekOf(playDate),
            holes,
            teeTime,
            players,
            companions: seated,
        });
    } catch (error) {
        console.error('Handicap warning check failed:', error);
        return [];
    }
}

function withWarnings(message, warnings) {
    return warnings.length ? `${message} WARNING: ${warnings.join(' ')}` : message;
}

// Non-blocking desk closure warning for registering an ALREADY-BOOKED player
// (the booking may predate the closure, so the desk decides - same
// "book blocks, desk warns" split as handicap control). NEW walk-ins are
// hard-refused in the walk-in path instead - a walk-in is a new tee-off.
// Never throws.
async function closureWarnings({ companyId, courseId, playDate, teeTime, crossTime }) {
    try {
        const course = await Course.findOne({ where: { companyId, id: courseId } });
        if (!course) return [];
        const blocks = await availability.closureBlocks(
            [course.firstNineId, course.secondNineId].filter(Boolean), playDate,
        );
        const warnings = [];
        if (availability.nineBlocked(blocks.get(course.firstNineId), availability.toMinutes(teeTime))) {
            warnings.push(`The starting nine is closed at ${teeTime} (course closure).`);
        }
        if (crossTime && availability.nineBlocked(blocks.get(course.secondNineId), availability.toMinutes(crossTime))) {
            warnings.push(`The crossover nine is closed at ${crossTime} (course closure).`);
        }
        return warnings;
    } catch (error) {
        console.error('Closure warning check failed (never blocks the desk):', error);
        return [];
    }
}

// Non-blocking desk warning for junior-booking control (Tropicana 4.3; user
// decision 2026-10-05 - booking REFUSES, desk WARNS). Looks at the whole
// flight's seated MEMBER players (booked + registered) at the start nine cell;
// warns when a junior's principal (parent) is absent, or - for a junior with
// no principal - when no adult member is present. Never throws.
async function juniorWarnings({ companyId, unitCourseId, playDate, teeTime, transaction }) {
    try {
        const setting = await GolfSetting.findOne({ where: { companyId }, transaction });
        if (!setting || setting.juniorBookingControlEnabled !== true) return [];
        const rows = await Player.findAll({
            where: { companyId, unitCourseId, playDate, teeTime, secondNineFlag: 0, status: { [Op.in]: ['booked', 'registered'] } },
            transaction,
        });
        if (!rows.length) return [];
        const parties = [];
        const standingCache = new Map();
        for (const r of rows) {
            if (!r.golferId) continue; // name-only guest - not a member
            const golfer = await Golfer.findOne({ where: { companyId, id: r.golferId }, attributes: ['golferType', 'memberNo'], transaction });
            if (!golfer || golfer.golferType !== 'member' || !golfer.memberNo) continue; // walk-in/other - not a member
            let st = standingCache.get(golfer.memberNo);
            if (st === undefined) { st = await getGolfMemberStanding(companyId, golfer.memberNo); standingCache.set(golfer.memberNo, st); }
            if (!st) continue;
            parties.push({ memberId: st.memberId, isJunior: st.isJunior === true, principalMemberId: st.principalMemberId || null, label: r.playerName });
        }
        const presentMemberIds = new Set(parties.map((p) => p.memberId).filter(Boolean));
        const hasAdultMember = parties.some((p) => !p.isJunior);
        const warnings = [];
        for (const p of parties) {
            if (!p.isJunior) continue;
            if (p.principalMemberId) {
                if (!presentMemberIds.has(p.principalMemberId)) {
                    warnings.push(`${p.label} is a junior member whose principal (parent) is not in this flight.`);
                }
            } else if (!hasAdultMember) {
                warnings.push(`${p.label} is a junior member not accompanied by an adult member.`);
            }
        }
        return warnings;
    } catch (error) {
        console.error('Junior warning check failed (never blocks the desk):', error);
        return [];
    }
}

// Resolve the golfer identity + snapshots for a player being registered.
// Returns { golfer, playerName, memberNo, standing } or { error }.
async function resolvePlayerIdentity({ req, companyId, playerType, memberNo, guest, fallbackName, stamps, transaction }) {
    if (playerType === 'guest') {
        const name = (guest && typeof guest.name === 'string' && guest.name.trim()) || fallbackName || 'Guest';
        const { golfer } = await guestGolfer({
            companyId,
            name,
            identityNo: guest && guest.identityNo ? String(guest.identityNo).trim() : null,
            mobile: guest && guest.mobile ? String(guest.mobile).trim() : null,
            email: guest && guest.email ? String(guest.email).trim() : null,
            stamps,
            transaction,
        });
        return { golfer, playerName: name, memberNo: null, standing: null };
    }
    const no = String(memberNo || '').trim();
    if (!no) return { error: 'Key in the member number.' };
    const standing = await getGolfMemberStanding(companyId, no);
    if (!standing) return { error: `No member found with number '${no}'.` };
    if (standing.actionControl === 'barred') {
        return { error: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from registration.` };
    }
    const golfer = await memberGolfer(companyId, standing, stamps, transaction);
    return { golfer, playerName: standing.name, memberNo: standing.memberNo, standing };
}

// Register ONE booked Player record inside `transaction` - shared by the
// single register endpoint and the bulk flight/booking registration. Flips
// booked -> registered on BOTH records of the pair; the Registration No.
// lives on the starting-nine record. Returns { row, shape } or
// { fail, status }.
async function registerBookedRecord({ req, companyId, row, guest, manualRegistrationNo, stamps, transaction }) {
    const identity = await resolvePlayerIdentity({
        req, companyId, playerType: row.playerType, memberNo: row.memberNo,
        guest, fallbackName: row.playerName, stamps, transaction,
    });
    if (identity.error) return { fail: identity.error, status: 400 };
    const issued = await numberingGateway.issueNumber(req, 'golf-registration', { transaction });
    let registrationNo = issued && issued.number ? issued.number : null;
    if (!registrationNo) {
        if (issued && issued.manual) registrationNo = String(manualRegistrationNo || '').trim();
        if (!registrationNo) return { fail: 'Configure the Registration No. numbering scheme first (Golf Management → Numbering Control).', status: 400 };
    }
    const now = new Date();
    row.golferId = identity.golfer.id;
    row.playerName = identity.playerName;
    row.memberNo = identity.memberNo;
    row.registrationNo = registrationNo;
    row.status = 'registered';
    row.registeredAt = now;
    row.updatedBy = stamps.updatedBy;
    await row.save({ transaction });
    const second = await secondNineOf(row.id, { transaction });
    if (second) {
        second.golferId = identity.golfer.id;
        second.playerName = identity.playerName;
        second.memberNo = identity.memberNo;
        second.status = 'registered';
        second.registeredAt = now;
        second.updatedBy = stamps.updatedBy;
        await second.save({ transaction });
    }
    return { row, shape: { holes: second ? 18 : 9, crossTime: second ? availability.hhmm(second.teeTime) : null } };
}

// POST /front-desk/registrations - register a BOOKED player
// ({ playerId, guest? }) or a WALK-IN ({ walkIn: { playDate, courseId,
// teeTime, holes, playerType, memberNo?, guest? } }).
exports.register = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const stamps = await callerStamps(req);

        // ---- booked-player path ----
        if (req.body.playerId) {
            const row = await Player.findOne({
                where: { companyId, id: String(req.body.playerId), secondNineFlag: 0 },
            });
            const profile = row && row.bookingProfileId ? await BookingProfile.findOne({ where: { companyId, id: row.bookingProfileId } }) : null;
            if (!row || !profile) return res.status(404).json({ message: 'Booked player not found.' });
            if (profile.status !== 'booked') return res.status(400).json({ message: 'This booking is cancelled.' });
            if (row.status === 'registered') return res.status(409).json({ message: `${row.playerName} is already registered (${row.registrationNo}).` });
            if (row.status !== 'booked') return res.status(400).json({ message: `This player is ${row.status}.` });

            const result = await sequelize.transaction(async (transaction) => registerBookedRecord({
                req, companyId, row, guest: req.body.guest,
                manualRegistrationNo: req.body.registrationNo, stamps, transaction,
            }));
            if (result.fail) return res.status(result.status).json({ message: result.fail });
            const warnings = await handicapWarnings(req, {
                companyId, courseId: result.row.courseId, unitCourseId: result.row.unitCourseId,
                playDate: String(result.row.playDate), teeTime: availability.hhmm(result.row.teeTime),
                holes: result.shape.holes, playerIds: [result.row.id],
            });
            warnings.push(...await closureWarnings({
                companyId, courseId: result.row.courseId, playDate: String(result.row.playDate),
                teeTime: availability.hhmm(result.row.teeTime), crossTime: result.shape.crossTime ? availability.hhmm(result.shape.crossTime) : null,
            }));
            warnings.push(...await juniorWarnings({
                companyId, unitCourseId: result.row.unitCourseId, playDate: String(result.row.playDate),
                teeTime: result.row.teeTime,
            }));
            return res.status(201).json({
                message: withWarnings(`Registered ${result.row.playerName} (${result.row.registrationNo}).`, warnings),
                registration: registrationDto(result.row, result.shape),
            });
        }

        // ---- walk-in path ----
        const w = req.body.walkIn || {};
        const playDate = String(w.playDate || '');
        const teeTime = String(w.teeTime || '');
        const holes = Number(w.holes);
        const playerType = String(w.playerType || '');
        if (!DATE_RE.test(playDate)) return res.status(400).json({ message: 'Pick a play date.' });
        if (!TIME_RE.test(teeTime)) return res.status(400).json({ message: 'Pick a flight time.' });
        if (!HOLES_OPTIONS.includes(holes)) return res.status(400).json({ message: 'Pick 9 or 18 holes.' });
        if (!PLAYER_TYPE_KEYS.includes(playerType)) return res.status(400).json({ message: 'Pick a player type.' });
        const course = await Course.findOne({ where: { companyId, id: String(w.courseId || ''), isActive: true } });
        if (!course) return res.status(400).json({ message: 'Pick a course.' });
        const dayType = await dayTypeOf(req, playDate);

        const result = await sequelize.transaction(async (transaction) => {
            await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
                replacements: { key: `golf-booking:${companyId}:${playDate}` },
                transaction,
            });

            // Seat check ONLY (desk is authoritative; merge/min/guest rules
            // are booking-channel controls). The flight must exist on the
            // grid with a free NINE seat - the crossover landing too for 18.
            const ctx = await availability.dayContext(companyId, playDate, dayType, { transaction });
            const day = ctx.byCourse.get(course.id);
            if (!day || !day.set || !day.slots.length) return { fail: 'No tee sheet is configured for this course on that date.', status: 400 };
            const slot = day.slots.find((s) => availability.hhmm(s.teeTime) === teeTime);
            if (!slot) return { fail: 'That flight time is not on the tee sheet.', status: 400 };
            // Crossover-only slots take NO new tee-offs from any channel -
            // they exist as second-nine landing times (2026-09-28). The
            // front-desk-only flag is fine here: this IS the front desk.
            if (slot.isCrossoverOnly === true) {
                return { fail: 'That flight time is closed for crossover - no new tee-offs.', status: 400 };
            }
            // Closures block NEW tee-offs from the desk too (bug fix
            // 2026-09-30: the nine is physically shut - only registering an
            // EXISTING booking stays a desk-discretion warning).
            if (availability.nineBlocked(ctx.nineBlocks.get(course.firstNineId), availability.toMinutes(teeTime))) {
                return { fail: 'That flight is blocked by a course closure.', status: 409 };
            }
            const occ = await availability.occupancy(companyId, playDate, { transaction, ctx });
            const startOcc = occ.get(availability.nineKey(course.firstNineId, teeTime));
            if ((startOcc ? startOcc.players : 0) >= slot.maxPlayers) return { fail: 'That flight is full.', status: 409 };
            let crossTime = null;
            if (holes === 18) {
                const t = availability.toMinutes(teeTime);
                const target = availability.crossTarget(ctx, course, t);
                if (!target) return { fail: 'No crossover flight remains for 18 holes at that time.', status: 400 };
                crossTime = availability.hhmm(target.slot.teeTime);
                if (availability.crossBlocked(ctx, course, availability.toMinutes(crossTime))) {
                    return { fail: `The crossover nine is closed at ${crossTime} (course closure) - no 18-hole tee-off at this time.`, status: 409 };
                }
                const crossOcc = occ.get(availability.nineKey(course.secondNineId, crossTime));
                if ((crossOcc ? crossOcc.players : 0) >= target.slot.maxPlayers) return { fail: 'The crossover flight is full.', status: 409 };
            }

            const identity = await resolvePlayerIdentity({
                req, companyId, playerType, memberNo: w.memberNo, guest: w.guest, fallbackName: null, stamps, transaction,
            });
            if (identity.error) return { fail: identity.error, status: 400 };

            const issued = await numberingGateway.issueNumber(req, 'golf-registration', { transaction });
            let registrationNo = issued && issued.number ? issued.number : null;
            if (!registrationNo) {
                if (issued && issued.manual) registrationNo = String(req.body.registrationNo || '').trim();
                if (!registrationNo) return { fail: 'Configure the Registration No. numbering scheme first (Golf Management → Numbering Control).', status: 400 };
            }
            const now = new Date();
            const shared = {
                companyId,
                bookingProfileId: null,
                courseId: course.id,
                playDate,
                golferId: identity.golfer.id,
                playerType,
                playerName: identity.playerName,
                memberNo: identity.memberNo,
                status: 'registered',
                registeredAt: now,
                ...stamps,
            };
            const row = await Player.create({
                ...shared,
                secondNineFlag: 0,
                unitCourseId: course.firstNineId,
                teeTime,
                registrationNo,
            }, { transaction });
            if (crossTime) {
                await Player.create({
                    ...shared,
                    secondNineFlag: 1,
                    firstNinePlayerId: row.id,
                    unitCourseId: course.secondNineId,
                    teeTime: crossTime,
                }, { transaction });
            }
            return { row, shape: { holes, crossTime } };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        const warnings = await handicapWarnings(req, {
            companyId, courseId: result.row.courseId, unitCourseId: result.row.unitCourseId,
            playDate: String(result.row.playDate), teeTime: availability.hhmm(result.row.teeTime),
            holes: result.shape.holes, playerIds: [result.row.id],
        });
        warnings.push(...await juniorWarnings({
            companyId, unitCourseId: result.row.unitCourseId, playDate: String(result.row.playDate),
            teeTime: result.row.teeTime,
        }));
        res.status(201).json({
            message: withWarnings(`Registered ${result.row.playerName} (${result.row.registrationNo}).`, warnings),
            registration: registrationDto(result.row, result.shape),
        });
    } catch (error) {
        console.error('Error registering golf player:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/register-flight { playDate, courseId, teeTime,
// bookingProfileId? } - bulk registration (user request 2026-09-27):
// register every still-BOOKED player of the flight - or of ONE booking in it
// when `bookingProfileId` narrows it. Guests register NAME-ONLY (user
// decision: no identity prompt at bulk speed; the profile can be completed
// later). Each player registers in its OWN transaction so one barred member
// or numbering hiccup never blocks the rest; the result reports registered
// vs skipped.
exports.registerFlight = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.body.playDate || '');
        const teeTime = String(req.body.teeTime || '');
        const courseId = String(req.body.courseId || '');
        if (!DATE_RE.test(playDate) || !TIME_RE.test(teeTime) || !courseId) {
            return res.status(400).json({ message: 'Pick the flight to register.' });
        }
        const stamps = await callerStamps(req);

        const where = {
            companyId,
            playDate,
            courseId,
            secondNineFlag: 0,
            status: 'booked',
            bookingProfileId: { [Op.ne]: null },
        };
        const profileId = req.body.bookingProfileId ? String(req.body.bookingProfileId) : null;
        if (profileId) where.bookingProfileId = profileId;
        const candidates = (await Player.findAll({ where, order: [['createdAt', 'ASC'], ['id', 'ASC']] }))
            .filter((r) => availability.hhmm(r.teeTime) === teeTime);
        if (!candidates.length) {
            return res.status(200).json({ message: 'Everyone here is already registered.', registered: [], skipped: [] });
        }
        const profiles = await BookingProfile.findAll({
            where: { companyId, id: { [Op.in]: [...new Set(candidates.map((r) => r.bookingProfileId))] } },
        });
        const profileById = new Map(profiles.map((p) => [p.id, p]));

        const registered = [];
        const registeredIds = [];
        const skipped = [];
        for (const candidate of candidates) {
            const profile = profileById.get(candidate.bookingProfileId);
            if (!profile || profile.status !== 'booked') {
                skipped.push({ playerName: candidate.playerName, reason: 'booking cancelled' });
                continue;
            }
            try {
                const result = await sequelize.transaction(async (transaction) => {
                    // Race re-check inside the tx - a colleague may have just
                    // registered this player from another terminal.
                    const row = await Player.findOne({ where: { id: candidate.id }, transaction });
                    if (!row || row.status !== 'booked') {
                        return { fail: row && row.status === 'registered' ? `already registered (${row.registrationNo})` : 'no longer booked' };
                    }
                    return registerBookedRecord({ req, companyId, row, guest: null, stamps, transaction });
                });
                if (result.fail) skipped.push({ playerName: candidate.playerName, reason: result.fail });
                else {
                    registered.push({ playerName: result.row.playerName, registrationNo: result.row.registrationNo });
                    registeredIds.push(result.row.id);
                }
            } catch (e) {
                console.error('Bulk registration line failed:', e);
                skipped.push({ playerName: candidate.playerName, reason: 'registration failed' });
            }
        }
        let warnings = [];
        if (registeredIds.length) {
            const anySecond = await Player.findOne({ where: { firstNinePlayerId: { [Op.in]: registeredIds } }, attributes: ['id', 'teeTime'] });
            warnings = await handicapWarnings(req, {
                companyId, courseId, unitCourseId: candidates[0].unitCourseId, playDate, teeTime,
                holes: anySecond ? 18 : 9, playerIds: registeredIds,
            });
            warnings.push(...await closureWarnings({
                companyId, courseId, playDate, teeTime,
                crossTime: anySecond ? availability.hhmm(anySecond.teeTime) : null,
            }));
            warnings.push(...await juniorWarnings({
                companyId, unitCourseId: candidates[0].unitCourseId, playDate, teeTime: candidates[0].teeTime,
            }));
        }
        const message = skipped.length
            ? `Registered ${registered.length} player(s); skipped ${skipped.length} - ${skipped.map((s) => `${s.playerName}: ${s.reason}`).join('; ')}`
            : `Registered ${registered.length} player(s).`;
        res.status(200).json({ message: withWarnings(message, warnings), registered, skipped });
    } catch (error) {
        console.error('Error bulk-registering golf flight:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/registrations/:id/cancel - :id is the starting-nine
// Player record. A BOOKED player's registration cancel reverts the pair to
// 'booked' (the seat stays held by the booking); a WALK-IN cancels outright
// (the seat frees). Both records of the pair move together.
exports.cancelRegistration = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Player.findOne({ where: { companyId, id: req.params.id, secondNineFlag: 0 } });
        if (!row) return res.status(404).json({ message: 'Registration not found.' });
        if (row.status !== 'registered') return res.status(400).json({ message: 'This player is not registered.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const bill = await Bill.findOne({ where: { companyId, playerId: row.id, status: { [Op.ne]: 'voided' } } });
        if (bill) return res.status(409).json({ message: `Bill ${bill.billNo} exists for this registration - void it first.` });

        const callerId = getUserContext(req).userId;
        const reason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        const registrationNo = row.registrationNo;
        const walkIn = !row.bookingProfileId;
        await sequelize.transaction(async (transaction) => {
            const second = await secondNineOf(row.id, { transaction });
            for (const r of [row, second].filter(Boolean)) {
                if (walkIn) {
                    r.status = 'cancelled';
                    r.cancelledAt = new Date();
                    r.cancelledBy = callerId;
                    r.cancelReason = reason;
                } else {
                    r.status = 'booked';
                    r.registrationNo = null;
                    r.registeredAt = null;
                }
                r.updatedBy = callerId;
                await r.save({ transaction });
            }
        });
        res.status(200).json({
            message: walkIn
                ? `Registration ${registrationNo} cancelled.`
                : `Registration ${registrationNo} cancelled - ${row.playerName} is back to booked.`,
        });
    } catch (error) {
        console.error('Error cancelling golf registration:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// No-shows (user decisions 2026-10-06: DESK-CONFIRMED, never an unattended
// sweep - a human decides before a member is debited)

// The day's no-show CANDIDATES: still-BOOKED (never registered) players of a
// booking whose tee time has PASSED (club-local; every flight of a past
// date), grouped by booking with the booker and the priced charge. Returns
// { controlled, basis, bookings: [...] }.
async function noShowCandidates(req, companyId, playDate) {
    const timezone = await companyTimezone(req);
    const now = availability.clubNow(timezone);
    if (playDate > now.date) return { controlled: false, bookings: [] };
    const cutoff = playDate < now.date ? '24:00' : now.time;
    const rows = await Player.findAll({
        where: { companyId, playDate, secondNineFlag: 0, status: 'booked', bookingProfileId: { [Op.ne]: null } },
        order: [['teeTime', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
    });
    const due = rows.filter((r) => availability.hhmm(r.teeTime) < cutoff);
    const cfg = await noShow.config(companyId);
    const byBooking = new Map();
    for (const r of due) {
        if (!byBooking.has(r.bookingProfileId)) byBooking.set(r.bookingProfileId, []);
        byBooking.get(r.bookingProfileId).push(r);
    }
    const ids = [...byBooking.keys()];
    const [profiles, courses] = await Promise.all([
        ids.length ? BookingProfile.findAll({ where: { companyId, id: { [Op.in]: ids } } }) : [],
        Course.findAll({ where: { companyId }, attributes: ['id', 'courseCode'] }),
    ]);
    const courseById = new Map(courses.map((c) => [c.id, c.courseCode]));
    const bookerIds = [...new Set(profiles.map((p) => p.bookerGolferId))];
    const bookers = bookerIds.length ? await Golfer.findAll({ where: { companyId, id: { [Op.in]: bookerIds } } }) : [];
    const bookerById = new Map(bookers.map((g) => [g.id, g]));

    const bookings = [];
    for (const profile of profiles) {
        if (profile.status !== 'booked') continue;
        const players = byBooking.get(profile.id) || [];
        const booker = bookerById.get(profile.bookerGolferId) || null;
        const entry = {
            bookingProfileId: profile.id,
            bookingNo: profile.bookingNo,
            courseCode: courseById.get(profile.courseId) || null,
            startTime: availability.hhmm(players[0].teeTime),
            booker: booker ? { name: booker.name, memberNo: booker.memberNo, isMember: booker.golferType === 'member' } : null,
            players: players.map((p) => ({
                playerId: p.id, playerName: p.playerName, memberNo: p.memberNo, playerType: p.playerType, teeTime: availability.hhmm(p.teeTime),
            })),
            charge: null,
            chargeError: null,
        };
        if (cfg) {
            const priced = await noShow.quote(req, cfg, playDate, players.length);
            if (priced.error) entry.chargeError = priced.error;
            else {
                entry.charge = {
                    description: priced.description, quantity: priced.quantity, unitAmount: priced.unitAmount,
                    amount: priced.amount, taxAmount: priced.taxAmount, totalAmount: priced.totalAmount,
                };
            }
        }
        // Raw rows ride along for the confirm (posting needs the Golfer row);
        // candidateDto strips them. Named apart from the display `booker`.
        bookings.push({ ...entry, profile, bookerRow: booker, playerRows: players });
    }
    bookings.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.bookingNo.localeCompare(b.bookingNo));
    return { controlled: !!cfg, basis: cfg ? cfg.basis : null, cfg, bookings };
}

function candidateDto(b) {
    const { profile, bookerRow, playerRows, ...dto } = b;
    return dto;
}

// GET /front-desk/no-shows?playDate= - the review list (show expected
// results before anything is marked or charged).
exports.getNoShows = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.query.playDate || '');
        if (!DATE_RE.test(playDate)) return res.status(400).json({ message: 'Pick a play date.' });
        const result = await noShowCandidates(req, companyId, playDate);
        res.status(200).json({
            playDate,
            controlled: result.controlled,
            basis: result.basis || null,
            bookings: result.bookings.map(candidateDto),
        });
    } catch (error) {
        console.error('Error listing golf no-show candidates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/no-shows { playDate, bookings: [{ bookingProfileId,
// charge, waiveReason? }] } - confirm the review: every candidate player of
// each listed booking flips to 'no-show' (both pair records), and - control
// ON - a NoShowCharge row is raised per booking (pending, then posted to the
// booker's AR account after commit; or waived with the clerk's reason).
// Candidates are RE-DERIVED server-side so a stale review never marks a
// player who registered meanwhile.
exports.confirmNoShows = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.body.playDate || '');
        if (!DATE_RE.test(playDate)) return res.status(400).json({ message: 'Pick a play date.' });
        const raw = Array.isArray(req.body.bookings) ? req.body.bookings : [];
        if (!raw.length) return res.status(400).json({ message: 'Pick at least one booking to record as no-show.' });
        const decisions = new Map();
        for (const line of raw) {
            if (!line || typeof line.bookingProfileId !== 'string') return res.status(400).json({ message: 'Invalid no-show line.' });
            const charge = line.charge !== false;
            const waiveReason = !charge && line.waiveReason ? String(line.waiveReason).trim().slice(0, 255) : '';
            decisions.set(line.bookingProfileId, { charge, waiveReason });
        }

        const result = await noShowCandidates(req, companyId, playDate);
        const picked = result.bookings.filter((b) => decisions.has(b.bookingProfileId));
        if (!picked.length) return res.status(409).json({ message: 'None of the selected bookings still has a no-show candidate - reload the review.' });
        if (result.controlled) {
            for (const b of picked) {
                const d = decisions.get(b.bookingProfileId);
                if (!d.charge && !d.waiveReason) return res.status(400).json({ message: `Give a reason for waiving the charge on booking ${b.bookingNo}.` });
                if (d.charge && b.chargeError) return res.status(400).json({ message: `Booking ${b.bookingNo} cannot be charged: ${b.chargeError}` });
                if (d.charge && !b.bookerRow) return res.status(409).json({ message: `Booking ${b.bookingNo}: the booker's golfer identity no longer exists.` });
            }
        }

        const callerId = getUserContext(req).userId;
        const stamps = await callerStamps(req);
        const raised = [];
        let marked = 0;
        await sequelize.transaction(async (transaction) => {
            for (const b of picked) {
                const d = decisions.get(b.bookingProfileId);
                const playerIds = b.playerRows.map((p) => p.id);
                const [n] = await Player.update(
                    { status: 'no-show', updatedBy: callerId },
                    { where: { id: { [Op.in]: playerIds }, status: 'booked' }, transaction },
                );
                await Player.update(
                    { status: 'no-show', updatedBy: callerId },
                    { where: { firstNinePlayerId: { [Op.in]: playerIds }, status: 'booked' }, transaction },
                );
                marked += n;
                if (result.controlled && b.bookerRow) {
                    const priced = await noShow.quote(req, result.cfg, playDate, b.playerRows.length, { transaction });
                    if (priced.error) continue; // validated above for charged lines; waived lines need no price
                    const row = await noShow.raise({
                        req, profile: b.profile, booker: b.bookerRow, players: b.playerRows,
                        chargeReason: 'no-show', priced, waive: d.charge ? null : { reason: d.waiveReason }, stamps, transaction,
                    });
                    raised.push(row);
                }
            }
        });

        // Post AFTER commit (the marks survive an AR hiccup).
        let posted = 0;
        let waived = 0;
        const pending = [];
        for (const row of raised) {
            if (row.status === 'waived') { waived += 1; continue; }
            const r = await noShow.postPending(req, row);
            if (r.status === 'posted') posted += 1;
            else pending.push(`${r.bookingNo}: ${r.remarks}`);
        }
        const parts = [`${marked} player(s) recorded as no-show on ${picked.length} booking(s).`];
        if (posted) parts.push(`${posted} charge(s) posted.`);
        if (waived) parts.push(`${waived} charge(s) waived.`);
        if (pending.length) parts.push(`${pending.length} charge(s) left pending - ${pending.join('; ')}`);
        res.status(200).json({ message: parts.join(' '), marked, posted, waived, pending: pending.length });
    } catch (error) {
        console.error('Error confirming golf no-shows:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Billing

// POST /front-desk/registrations/:id/bills - get-or-create the player's bill
// (:id = the starting-nine Player record). On CREATE the green fee
// auto-charges by the golfer category on the active green-fee transaction
// type (members WITH golfing right pay none).
exports.openBill = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const registration = await Player.findOne({ where: { companyId, id: req.params.id, secondNineFlag: 0 } });
        if (!registration) return res.status(404).json({ message: 'Registration not found.' });
        if (registration.status !== 'registered') return res.status(400).json({ message: 'This player is not registered.' });

        const existing = await Bill.findOne({ where: { companyId, playerId: registration.id, status: { [Op.ne]: 'voided' } } });
        if (existing) return res.status(200).json({ bill: await billDto(existing), warnings: [], ineligible: await ineligibleTiles(req, companyId, registration) });

        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, String(registration.playDate));
        const shape = await playShapeOf(registration);
        const play = { playDate: String(registration.playDate), holes: shape.holes };
        const warnings = [];

        const result = await sequelize.transaction(async (transaction) => {
            const issued = await numberingGateway.issueNumber(req, 'golf-bill', { transaction });
            let billNo = issued && issued.number ? issued.number : null;
            if (!billNo) {
                if (issued && issued.manual) billNo = String(req.body.billNo || '').trim();
                if (!billNo) return { fail: 'Configure the Bill No. numbering scheme first (Golf Management → Numbering Control).', status: 400 };
            }
            const bill = await Bill.create({
                companyId,
                billNo,
                playerId: registration.id,
                golferId: registration.golferId,
                billDate: registration.playDate,
                ...stamps,
            }, { transaction });

            // Green fee auto-charge: skip members WITH golfing right; the
            // category otherwise equals the player type. GROUP players
            // (2026-10-07) get NO auto-charge - their package is billed on
            // the group folio; this bill is for the player's own extras.
            let category = registration.groupPlayerId ? null : registration.playerType;
            if (registration.playerType === 'member') {
                const standing = registration.memberNo ? await getGolfMemberStanding(companyId, registration.memberNo) : null;
                if (standing && standing.isGolfAllow) category = null; // no green fee
            }
            if (category) {
                const gfType = await GolfTransactionType.findOne({
                    where: { companyId, chargeType: 'green-fee', golferType: category, isActive: true },
                    transaction,
                });
                if (!gfType) {
                    warnings.push(`No active green-fee transaction type for '${category}' - green fee not auto-charged.`);
                } else {
                    const added = await addOrdinaryItem({
                        req, bill, play, type: gfType, quantity: 1, dayType, stamps, transaction, allowMissingPrice: true,
                    });
                    if (added.error) warnings.push(added.error);
                    else if (Number(added.item.unitAmount) === 0 && !gfType.allowPriceOverride) {
                        warnings.push(`'${gfType.transactionType}' has no price in force for ${play.playDate}.`);
                    }
                }
            }
            await recomputeTotals(bill, transaction);
            return { bill };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(201).json({ bill: await billDto(result.bill), warnings, ineligible: await ineligibleTiles(req, companyId, registration) });
    } catch (error) {
        console.error('Error opening golf bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// The bill + its player record, guarded to the caller's company and, when
// `openOnly`, to amendable status.
async function findBill(req, { openOnly = false } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const bill = await Bill.findOne({ where: { companyId, id: req.params.billId } });
    if (!bill) return { status: 404, message: 'Bill not found.' };
    if (openOnly && bill.status !== 'open') return { status: 409, message: `This bill is ${bill.status} and cannot be amended.` };
    const registration = await Player.findOne({ where: { companyId, id: bill.playerId } });
    return { bill, registration, companyId };
}

// GET /front-desk/bills/:billId
exports.getBill = async (req, res) => {
    try {
        const found = await findBill(req);
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        const shape = found.registration ? await playShapeOf(found.registration) : null;
        res.status(200).json({
            bill: await billDto(found.bill),
            registration: found.registration ? registrationDto(found.registration, shape) : null,
            ineligible: found.registration ? await ineligibleTiles(req, found.companyId, found.registration) : {},
        });
    } catch (error) {
        console.error('Error loading golf bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/bills/:billId/items { transactionTypeId, quantity }
exports.addItem = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        const { bill, registration, companyId } = found;
        if (!registration) return res.status(409).json({ message: 'The bill\'s player record no longer exists.' });
        const type = await GolfTransactionType.findOne({
            where: { companyId, id: String(req.body.transactionTypeId || ''), isActive: true },
            include: [{ model: GolfTransactionTypeEligibility, as: 'Eligibility' }],
        });
        if (!type) return res.status(400).json({ message: 'Pick a billing item.' });
        if (DESK_HIDDEN_CHARGE_TYPES.includes(type.chargeType)) return res.status(400).json({ message: `'${type.transactionType}' is not a desk billing item.` });
        // A golfer-typed item (green fee / buggy / caddy default) is the item
        // of ONE category - the screen hides the others, the server refuses
        // them (2026-10-06): a visitor-priced buggy never lands on a member.
        if (type.golferType && type.golferType !== registration.playerType) {
            const itemCat = (GOLFER_TYPES.find((g) => g.key === type.golferType) || {}).label || type.golferType;
            const playerCat = (PLAYER_TYPES.find((p) => p.key === registration.playerType) || {}).label || registration.playerType;
            return res.status(400).json({ message: `'${type.transactionType}' is the ${itemCat} item - this player is billed as ${playerCat}.` });
        }
        const quantity = Number.isInteger(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
        if (quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Quantity must be between 1 and 99.' });

        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, String(registration.playDate));
        const shape = await playShapeOf(registration);
        const play = { playDate: String(registration.playDate), holes: shape.holes };
        // Package eligibility (2026-10-06): the golfer must qualify under at
        // least one of the item's conditions - refused with the reason.
        if (Array.isArray(type.Eligibility) && type.Eligibility.length) {
            const facts = await eligibility.buildFacts(req, { companyId, registration, holes: shape.holes });
            const verdict = eligibility.evaluate(type.Eligibility, facts);
            if (!verdict.eligible) return res.status(400).json({ message: `'${type.transactionType}' - ${verdict.reason}.` });
        }
        const result = await sequelize.transaction(async (transaction) => {
            if (type.chargeType === PACKAGE_CHARGE_TYPE_KEY) {
                if (quantity !== 1) return { fail: 'Packages are billed one at a time.', status: 400 };
                const out = await addPackageItems({ req, bill, play, type, stamps, transaction });
                if (out.error) return { fail: out.error, status: 400 };
            } else {
                const out = await addOrdinaryItem({ req, bill, play, type, quantity, dayType, stamps, transaction });
                if (out.error) return { fail: out.error, status: 400 };
            }
            await recomputeTotals(bill, transaction);
            return {};
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(200).json({ bill: await billDto(bill) });
    } catch (error) {
        console.error('Error adding golf bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /front-desk/bills/:billId/items/:itemId { quantity?, unitAmount? } -
// ordinary lines only; a manual price needs the type's allowPriceOverride.
exports.updateItem = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        const { bill, registration, companyId } = found;
        const item = await BillItem.findOne({ where: { billId: bill.id, id: req.params.itemId } });
        if (!item) return res.status(404).json({ message: 'Bill item not found.' });
        if (item.packageGroupId) return res.status(400).json({ message: 'Package lines are fixed - remove the package and bill it again instead.' });
        const type = await GolfTransactionType.findOne({ where: { companyId, id: item.transactionTypeId } });

        let quantity = item.quantity;
        if (req.body.quantity !== undefined) {
            quantity = Number(req.body.quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Quantity must be between 1 and 99.' });
        }
        let unitAmount = Number(item.unitAmount);
        let overridden = item.priceOverridden === true;
        if (req.body.unitAmount !== undefined) {
            const parsed = Number(req.body.unitAmount);
            if (!Number.isFinite(parsed) || parsed < 0) return res.status(400).json({ message: 'The price must be 0.00 or more.' });
            if (round2(parsed) !== round2(unitAmount)) {
                if (!type || type.allowPriceOverride !== true) return res.status(403).json({ message: 'This item\'s price cannot be amended at billing.' });
                unitAmount = round2(parsed);
                overridden = true;
            }
        }

        await sequelize.transaction(async (transaction) => {
            item.quantity = quantity;
            item.unitAmount = unitAmount;
            item.amount = round2(unitAmount * quantity);
            item.priceOverridden = overridden;
            const tax = await quoteItemTax(req, item.taxSchemeCode, item.amount, String(registration.playDate));
            item.taxAmount = tax.taxAmount;
            item.taxBreakdown = tax.breakdown;
            item.updatedBy = getUserContext(req).userId;
            await item.save({ transaction });
            await recomputeTotals(bill, transaction);
        });
        res.status(200).json({ bill: await billDto(bill) });
    } catch (error) {
        console.error('Error updating golf bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /front-desk/bills/:billId/items/:itemId - a package line removes its
// whole group.
exports.removeItem = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        const { bill } = found;
        const item = await BillItem.findOne({ where: { billId: bill.id, id: req.params.itemId } });
        if (!item) return res.status(404).json({ message: 'Bill item not found.' });

        await sequelize.transaction(async (transaction) => {
            if (item.packageGroupId) {
                await BillItem.destroy({ where: { billId: bill.id, packageGroupId: item.packageGroupId }, transaction });
            } else {
                await item.destroy({ transaction });
            }
            await recomputeTotals(bill, transaction);
        });
        res.status(200).json({ bill: await billDto(bill) });
    } catch (error) {
        console.error('Error removing golf bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/bills/:billId/settle { payments: [{ paymentTypeId,
// amount, reference? }] } - multiple tenders; Σ must equal the bill total.
// 'member' class posts to the billed member's AR account FIRST (enforceCredit
// - the authoritative gate), then the settlement commits.
exports.settleBill = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        const { bill, registration, companyId } = found;
        if (!registration) return res.status(409).json({ message: 'The bill\'s player record no longer exists.' });

        const raw = Array.isArray(req.body.payments) ? req.body.payments : [];
        if (!raw.length) return res.status(400).json({ message: 'Key in at least one payment.' });
        if (raw.length > 10) return res.status(400).json({ message: 'Too many payment lines.' });

        const tenders = await PaymentType.findAll({ where: { companyId, isActive: true } });
        const tenderById = new Map(tenders.map((t) => [t.id, t]));
        const lines = [];
        for (let i = 0; i < raw.length; i += 1) {
            const line = raw[i] || {};
            const tender = tenderById.get(String(line.paymentTypeId || ''));
            if (!tender) return res.status(400).json({ message: `Payment ${i + 1}: pick a payment type.` });
            const amount = round2(Number(line.amount));
            if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: `Payment ${i + 1}: the amount must be more than 0.00.` });
            if (tender.paymentClass === 'debtor') return res.status(400).json({ message: 'Charge to an AR debtor account is not supported yet - use the Member class or another tender.' });
            lines.push({
                sortOrder: i + 1,
                tender,
                amount,
                reference: line.reference ? String(line.reference).slice(0, 100) : null,
            });
        }
        const paySum = round2(lines.reduce((s, l) => s + l.amount, 0));
        const total = round2(Number(bill.totalAmount));
        if (cents(paySum) !== cents(total)) {
            return res.status(400).json({ message: `Payments (${paySum.toFixed(2)}) must equal the bill total (${total.toFixed(2)}).` });
        }

        // Member-class lines: resolve + post to AR BEFORE the settle commits
        // (enforceCredit true = the race-proof credit gate; a refusal aborts
        // the whole settlement).
        const memberLines = lines.filter((l) => l.tender.paymentClass === 'member');
        if (memberLines.length) {
            if (!['member', 'member-guest'].includes(registration.playerType) || !registration.memberNo) {
                return res.status(400).json({ message: 'Charge to member account needs a member bill.' });
            }
            const standing = await getGolfMemberStanding(companyId, registration.memberNo);
            if (!standing) return res.status(400).json({ message: `No member found with number '${registration.memberNo}'.` });
            if (standing.chargeControl === 'barred') {
                return res.status(400).json({ message: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from charging to account.` });
            }
            const target = await getChargeTarget(companyId, standing.memberId);
            if (!target) return res.status(400).json({ message: 'The member\'s charge-to-account target could not be resolved.' });
            const arTypes = await arGateway.listTransactionTypes(companyId, { module: 'golf', trxClass: 'invoice' });
            if (!arTypes.length) return res.status(400).json({ message: 'Open an AR invoice transaction type to the Golf module first (AR → Transaction Type).' });
            if (arTypes.length > 1) return res.status(400).json({ message: 'Several AR transaction types are opened to Golf - keep exactly one so charges post unambiguously.' });
            const arType = arTypes[0];
            const stamps0 = await callerStamps(req);

            for (const line of memberLines) {
                const amountC = cents(line.amount);
                const posted = await arGateway.postCharge(req, {
                    debtorType: target.debtorType,
                    sourceId: target.sourceId,
                    docDate: String(bill.billDate),
                    trxDate: String(bill.billDate),
                    transactionTypeId: arType.id,
                    isInterestChargeable: arType.isInterestChargeable === true,
                    description: `Golf bill ${bill.billNo} — ${registration.playerName}`,
                    incurredByMemberId: target.incurredByMemberId,
                    sourceModule: 'golf',
                    sourceRef: bill.id,
                    // The golf bill owns the tax accounting; the AR document
                    // is the receivable for the amount charged to account.
                    amounts: { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null },
                    stamps: stamps0,
                    enforceCredit: true,
                });
                if (posted.error) return res.status(400).json({ message: posted.error });
                line.arDocId = posted.id;
                line.arDocNo = posted.docNo;
                line.debtorType = target.debtorType;
                line.debtorSourceId = target.sourceId;
            }
        }

        const stamps = await callerStamps(req);
        await sequelize.transaction(async (transaction) => {
            for (const line of lines) {
                await BillPayment.create({
                    billId: bill.id,
                    sortOrder: line.sortOrder,
                    paymentTypeId: line.tender.id,
                    paymentClass: line.tender.paymentClass,
                    amount: line.amount,
                    reference: line.reference,
                    arDocId: line.arDocId || null,
                    arDocNo: line.arDocNo || null,
                    debtorType: line.debtorType || null,
                    debtorSourceId: line.debtorSourceId || null,
                    ...stamps,
                }, { transaction });
            }
            bill.status = 'settled';
            bill.settledAt = new Date();
            bill.updatedBy = stamps.updatedBy;
            await bill.save({ transaction });
        });
        res.status(200).json({ message: `Bill ${bill.billNo} settled.`, bill: await billDto(bill) });
    } catch (error) {
        console.error('Error settling golf bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/bills/:billId/void { reason } - open bills only.
exports.voidBill = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        const { bill } = found;
        if (!(await canModifyRecord(req, bill))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });

        bill.status = 'voided';
        bill.voidedAt = new Date();
        bill.voidedBy = getUserContext(req).userId;
        bill.voidReason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        bill.updatedBy = getUserContext(req).userId;
        await bill.save();
        res.status(200).json({ message: `Bill ${bill.billNo} voided.` });
    } catch (error) {
        console.error('Error voiding golf bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
