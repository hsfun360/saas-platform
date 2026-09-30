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

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext, getCallerPlacement, canModifyRecord,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding, getChargeTarget } = require('../../platform/membershipGateway');
const { classifyDateRange } = require('../../platform/calendarGateway');
const { quoteTax } = require('../../platform/taxGateway');
const arGateway = require('../../platform/arGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { PLAYER_TYPES, PLAYER_TYPE_KEYS, HOLES_OPTIONS } = require('./booking.constants');
const { PLAYER_STATUSES, BILL_STATUSES, ACTIVE_PLAYER_STATUS_KEYS } = require('./registration.constants');
const { PACKAGE_CHARGE_TYPE_KEY, MATRIX_CHARGE_TYPE_KEYS } = require('./transactionType.constants');
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
const GolfTransactionTypeRate = require('./transactionTypeRate.model');
const GolfTransactionTypeElement = require('./transactionTypeElement.model');
const PaymentType = require('./paymentType.model');
const UnitCourse = require('./unitCourse.model');

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
// Pricing + tax helpers

// The active rate card in force on the play date (latest effectiveDate <=).
async function rateFor(transactionTypeId, playDate, transaction) {
    return GolfTransactionTypeRate.findOne({
        where: { transactionTypeId, isActive: true, effectiveDate: { [Op.lte]: playDate } },
        order: [['effectiveDate', 'DESC']],
        transaction,
    });
}

// The unit price of a type for a play (matrix cell by holes + day type, or
// flatAmount). null = no price configured.
function unitPriceOf(type, rate, dayType, holes) {
    if (!rate) return null;
    if (MATRIX_CHARGE_TYPE_KEYS.includes(type.chargeType)) {
        const cell = `price${holes === 9 ? 9 : 18}${dayType === 'weekend' ? 'Weekend' : 'Weekday'}`;
        return rate[cell] === null || rate[cell] === undefined ? null : Number(rate[cell]);
    }
    return rate.flatAmount === null || rate.flatAmount === undefined ? null : Number(rate.flatAmount);
}

// Quote the tax of one item amount. Returns { taxAmount, payable, breakdown }
// - payable is what the golfer owes for the line (gross: amount + tax when
// exclusive, the amount itself when inclusive); no scheme = no tax.
async function quoteItemTax(req, taxSchemeCode, amount, onDate) {
    if (!taxSchemeCode) return { taxAmount: 0, payable: round2(amount), breakdown: null };
    const quote = await quoteTax(req, { taxSchemeCode, amount, onDate });
    if (!quote) return { taxAmount: 0, payable: round2(amount), breakdown: null };
    return {
        taxAmount: round2(quote.taxTotal),
        payable: round2(quote.gross),
        breakdown: {
            schemeCode: taxSchemeCode,
            ieFlag: quote.ieFlag,
            net: quote.net,
            gross: quote.gross,
            asOf: quote.asOf,
            lines: quote.lines,
        },
    };
}

function itemPayable(item) {
    const exclusive = item.taxBreakdown && item.taxBreakdown.ieFlag === 'EXCLUSIVE';
    return round2(Number(item.amount) + (exclusive ? Number(item.taxAmount) : 0));
}

// Recompute + persist the bill's denormalized totals from its items.
async function recomputeTotals(bill, transaction) {
    const items = await BillItem.findAll({ where: { billId: bill.id }, transaction });
    bill.totalAmount = round2(items.reduce((s, i) => s + itemPayable(i), 0));
    bill.taxTotal = round2(items.reduce((s, i) => s + Number(i.taxAmount), 0));
    await bill.save({ transaction });
    return items;
}

async function nextSortOrder(billId, transaction) {
    const max = await BillItem.max('sortOrder', { where: { billId }, transaction });
    return (max || 0) + 1;
}

// Add ONE ordinary (non-package) item. `play` = { playDate, holes } of the
// billed player. Returns the created BillItem.
async function addOrdinaryItem({ req, bill, play, type, quantity, dayType, stamps, transaction, allowMissingPrice = false }) {
    const rate = await rateFor(type.id, play.playDate, transaction);
    const unit = unitPriceOf(type, rate, dayType, play.holes);
    if (unit === null && !type.allowPriceOverride && !allowMissingPrice) {
        return { error: `'${type.transactionType}' has no price in force for ${play.playDate} - set up its pricing first.` };
    }
    const unitAmount = unit === null ? 0 : unit;
    const amount = round2(unitAmount * quantity);
    const tax = await quoteItemTax(req, type.taxSchemeCode, amount, play.playDate);
    const sortOrder = await nextSortOrder(bill.id, transaction);
    const item = await BillItem.create({
        billId: bill.id,
        sortOrder,
        transactionTypeId: type.id,
        description: `${type.transactionType}${type.description ? ' — ' + type.description : ''}`,
        quantity,
        unitAmount,
        amount,
        taxSchemeCode: tax.breakdown ? type.taxSchemeCode : null,
        taxAmount: tax.taxAmount,
        taxBreakdown: tax.breakdown,
        ...stamps,
    }, { transaction });
    return { item };
}

// Explode a PACKAGE into its element lines + the automatic balance line
// (approved spec): package price from its flat rate; the PACKAGE's tax scheme
// on every generated line; the LAST line's tax adjusted so the group's tax
// equals the tax computed directly on the package amount.
async function addPackageItems({ req, bill, play, type, stamps, transaction }) {
    const rate = await rateFor(type.id, play.playDate, transaction);
    const packagePrice = rate && rate.flatAmount !== null ? Number(rate.flatAmount) : null;
    if (packagePrice === null) {
        return { error: `Package '${type.transactionType}' has no price in force for ${play.playDate}.` };
    }
    const elements = await GolfTransactionTypeElement.findAll({
        where: { transactionTypeId: type.id },
        order: [['sortOrder', 'ASC']],
        transaction,
    });
    if (!elements.length) return { error: `Package '${type.transactionType}' has no elements.` };
    if (!type.autoTransactionTypeId) return { error: `Package '${type.transactionType}' has no Auto Transaction Type.` };

    const companyId = bill.companyId;
    const typeIds = [...new Set([...elements.map((e) => e.elementTransactionTypeId), type.autoTransactionTypeId])];
    const types = await GolfTransactionType.findAll({ where: { companyId, id: { [Op.in]: typeIds } }, transaction });
    const typeById = new Map(types.map((t) => [t.id, t]));

    const lines = [];
    let elementSum = 0;
    for (const el of elements) {
        const elType = typeById.get(el.elementTransactionTypeId);
        if (!elType) return { error: 'A package element no longer exists.' };
        const amount = round2(Number(el.unitAmount) * el.quantity);
        elementSum = round2(elementSum + amount);
        lines.push({ type: elType, quantity: el.quantity, unitAmount: Number(el.unitAmount), amount, role: 'element' });
    }
    const autoType = typeById.get(type.autoTransactionTypeId);
    if (!autoType) return { error: 'The package\'s Auto Transaction Type no longer exists.' };
    lines.push({ type: autoType, quantity: 1, unitAmount: round2(packagePrice - elementSum), amount: round2(packagePrice - elementSum), role: 'auto' });

    // Package tax on each line + the direct tax on the package amount.
    const taxes = [];
    for (const line of lines) taxes.push(await quoteItemTax(req, type.taxSchemeCode, line.amount, play.playDate));
    const target = await quoteItemTax(req, type.taxSchemeCode, packagePrice, play.playDate);
    const lineTaxSum = round2(taxes.reduce((s, t) => s + t.taxAmount, 0));
    const adjust = round2(target.taxAmount - lineTaxSum);
    if (adjust !== 0 && taxes.length) {
        const last = taxes[taxes.length - 1];
        last.taxAmount = round2(last.taxAmount + adjust);
        if (last.breakdown) last.breakdown.roundingAdjustment = adjust;
    }

    const groupId = crypto.randomUUID();
    const created = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const tax = taxes[i];
        const sortOrder = await nextSortOrder(bill.id, transaction);
        created.push(await BillItem.create({
            billId: bill.id,
            sortOrder,
            transactionTypeId: line.type.id,
            description: `${line.type.transactionType}${line.type.description ? ' — ' + line.type.description : ''}`,
            quantity: line.quantity,
            unitAmount: line.unitAmount,
            amount: line.amount,
            packageGroupId: groupId,
            packageRole: line.role,
            packageTransactionTypeId: type.id,
            taxSchemeCode: type.taxSchemeCode || null,
            taxAmount: tax.taxAmount,
            taxBreakdown: tax.breakdown,
            ...stamps,
        }, { transaction }));
    }
    return { items: created };
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

function itemDto(i) {
    return {
        id: i.id,
        sortOrder: i.sortOrder,
        transactionTypeId: i.transactionTypeId,
        description: i.description,
        quantity: i.quantity,
        unitAmount: Number(i.unitAmount),
        amount: Number(i.amount),
        priceOverridden: i.priceOverridden === true,
        packageGroupId: i.packageGroupId,
        packageRole: i.packageRole,
        taxSchemeCode: i.taxSchemeCode,
        taxAmount: Number(i.taxAmount),
        ieFlag: i.taxBreakdown ? i.taxBreakdown.ieFlag : null,
        payable: itemPayable(i),
    };
}

function paymentDto(p) {
    return {
        id: p.id,
        sortOrder: p.sortOrder,
        paymentTypeId: p.paymentTypeId,
        paymentClass: p.paymentClass,
        amount: Number(p.amount),
        reference: p.reference,
        arDocNo: p.arDocNo,
    };
}

async function billDto(bill, { transaction } = {}) {
    const [items, payments] = await Promise.all([
        BillItem.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']], transaction }),
        BillPayment.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']], transaction }),
    ]);
    return {
        id: bill.id,
        billNo: bill.billNo,
        playerId: bill.playerId,
        billDate: bill.billDate,
        status: bill.status,
        totalAmount: Number(bill.totalAmount),
        taxTotal: Number(bill.taxTotal),
        remarks: bill.remarks,
        items: items.map(itemDto),
        payments: payments.map(paymentDto),
    };
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

        const [records, profiles, courses] = await Promise.all([
            Player.findAll({
                where: { companyId, playDate, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS } },
                order: [['createdAt', 'ASC'], ['id', 'ASC']],
            }),
            BookingProfile.findAll({ where: { companyId, playDate } }),
            Course.findAll({
                where: { companyId },
                attributes: ['id', 'courseCode', 'description', 'isActive', 'firstNineId', 'secondNineId', 'crossOverMinutes', 'displaySequence'],
                order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
            }),
        ]);
        const profileById = new Map(profiles.map((b) => [b.id, b]));
        const firsts = records.filter((r) => Number(r.secondNineFlag) === 0);
        const seconds = records.filter((r) => Number(r.secondNineFlag) === 1);
        const secondByFirst = new Map(seconds.map((r) => [r.firstNinePlayerId, r]));
        const bills = firsts.length
            ? await Bill.findAll({ where: { companyId, playerId: { [Op.in]: firsts.map((r) => r.id) }, status: { [Op.ne]: 'voided' } } })
            : [];
        const billByPlayer = new Map(bills.map((b) => [b.playerId, b]));

        // Entries per NINE-cell (unitCourseId|HH:MM) from starting-nine
        // records + crossover arrival counts per landing cell.
        const entriesByCell = new Map();
        for (const r of firsts) {
            const key = availability.nineKey(r.unitCourseId, r.teeTime);
            if (!entriesByCell.has(key)) entriesByCell.set(key, []);
            const profile = r.bookingProfileId ? profileById.get(r.bookingProfileId) : null;
            const second = secondByFirst.get(r.id) || null;
            const bill = billByPlayer.get(r.id) || null;
            const shape = { holes: second ? 18 : 9, crossTime: second ? availability.hhmm(second.teeTime) : null };
            entriesByCell.get(key).push({
                kind: r.bookingProfileId ? 'booked' : 'walkin',
                bookingProfileId: r.bookingProfileId,
                bookingNo: profile ? profile.bookingNo : null,
                playerId: r.id,
                playerType: r.playerType,
                playerName: r.playerName,
                memberNo: r.memberNo,
                holes: shape.holes,
                registration: r.status === 'registered' ? registrationDto(r, shape) : null,
                bill: bill ? { id: bill.id, billNo: bill.billNo, status: bill.status, totalAmount: Number(bill.totalAmount) } : null,
            });
        }
        const crossByCell = new Map();
        for (const r of seconds) {
            const key = availability.nineKey(r.unitCourseId, r.teeTime);
            crossByCell.set(key, (crossByCell.get(key) || 0) + 1);
        }

        const ctx = await availability.dayContext(companyId, playDate, dayType, {
            courses: courses.filter((c) => c.isActive),
        });

        // Nine codes for the DERIVED rotation suffix on each card header
        // ("E1 → E2") - so every club shows its pairing without keying it
        // into the course description (user request 2026-09-30).
        const nineIds = [...new Set(courses.flatMap((c) => [c.firstNineId, c.secondNineId]).filter(Boolean))];
        const nineCodeById = new Map(
            (await UnitCourse.findAll({ where: { id: { [Op.in]: nineIds } }, attributes: ['id', 'unitCourseCode'] }))
                .map((u) => [u.id, u.unitCourseCode]),
        );

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
                flights.push({
                    teeTime,
                    maxPlayers: slot.maxPlayers,
                    isFrontDesk: slot.isFrontDesk === true,
                    crossoverOnly,
                    closed,
                    seatsTaken: entries.length,
                    seatsLeft: closed || crossoverOnly ? 0 : Math.max(0, slot.maxPlayers - entries.length - sameNineCross),
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
                    teeTime, maxPlayers: null, isFrontDesk: false, crossoverOnly: false, closed: false,
                    seatsTaken: entries.length, seatsLeft: 0, offGrid: true,
                    crossCount: crossByCell.get(key) || 0, entries,
                });
            }
            flights.sort((a, b) => a.teeTime.localeCompare(b.teeTime));

            // A course appears when it operates that day (has a tee sheet) or
            // still has something to show; silent courses stay off the sheet.
            if (set || flights.length) {
                const firstCode = nineCodeById.get(course.firstNineId);
                const secondCode = nineCodeById.get(course.secondNineId);
                sheets.push({
                    courseId: course.id,
                    courseCode: course.courseCode,
                    courseDescription: course.description,
                    rotation: firstCode && secondCode ? `${firstCode} → ${secondCode}` : null,
                    operating: !!set,
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
        res.status(200).json({
            tiles: types,
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
            const occ = await availability.occupancy(companyId, playDate, { transaction });
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
        if (existing) return res.status(200).json({ bill: await billDto(existing), warnings: [] });

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
            // category otherwise equals the player type.
            let category = registration.playerType;
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
        res.status(201).json({ bill: await billDto(result.bill), warnings });
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
        res.status(200).json({ bill: await billDto(found.bill), registration: found.registration ? registrationDto(found.registration, shape) : null });
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
        const type = await GolfTransactionType.findOne({ where: { companyId, id: String(req.body.transactionTypeId || ''), isActive: true } });
        if (!type) return res.status(400).json({ message: 'Pick a billing item.' });
        const quantity = Number.isInteger(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
        if (quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Quantity must be between 1 and 99.' });

        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, String(registration.playDate));
        const shape = await playShapeOf(registration);
        const play = { playDate: String(registration.playDate), holes: shape.holes };
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
