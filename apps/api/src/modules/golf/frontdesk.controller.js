// Golf Front Desk (Golf Management → /golf/front-desk) - registration,
// billing and settlement (user decisions 2026-09-26):
//   - REGISTRATION is per player (one RegistrationPlayer row, own
//     Registration No.), from a booking line or as a WALK-IN (no booking;
//     occupancy counts walk-ins; the desk checks SEATS only).
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
const { REGISTRATION_STATUSES, BILL_STATUSES } = require('./registration.constants');
const { PACKAGE_CHARGE_TYPE_KEY, MATRIX_CHARGE_TYPE_KEYS } = require('./transactionType.constants');
const Booking = require('./booking.model');
const BookingPlayer = require('./bookingPlayer.model');
const RegistrationPlayer = require('./registrationPlayer.model');
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
// Pricing + tax helpers

// The active rate card in force on the play date (latest effectiveDate <=).
async function rateFor(transactionTypeId, playDate, transaction) {
    return GolfTransactionTypeRate.findOne({
        where: { transactionTypeId, isActive: true, effectiveDate: { [Op.lte]: playDate } },
        order: [['effectiveDate', 'DESC']],
        transaction,
    });
}

// The unit price of a type for a registration (matrix cell by holes + day
// type, or flatAmount). null = no price configured.
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

// Add ONE ordinary (non-package) item. Returns the created BillItem.
async function addOrdinaryItem({ req, bill, registration, type, quantity, dayType, stamps, transaction, allowMissingPrice = false }) {
    const rate = await rateFor(type.id, registration.playDate, transaction);
    const unit = unitPriceOf(type, rate, dayType, registration.holes);
    if (unit === null && !type.allowPriceOverride && !allowMissingPrice) {
        return { error: `'${type.transactionType}' has no price in force for ${registration.playDate} - set up its pricing first.` };
    }
    const unitAmount = unit === null ? 0 : unit;
    const amount = round2(unitAmount * quantity);
    const tax = await quoteItemTax(req, type.taxSchemeCode, amount, registration.playDate);
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
async function addPackageItems({ req, bill, registration, type, stamps, transaction }) {
    const rate = await rateFor(type.id, registration.playDate, transaction);
    const packagePrice = rate && rate.flatAmount !== null ? Number(rate.flatAmount) : null;
    if (packagePrice === null) {
        return { error: `Package '${type.transactionType}' has no price in force for ${registration.playDate}.` };
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
    for (const line of lines) taxes.push(await quoteItemTax(req, type.taxSchemeCode, line.amount, registration.playDate));
    const target = await quoteItemTax(req, type.taxSchemeCode, packagePrice, registration.playDate);
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

function registrationDto(r) {
    return {
        id: r.id,
        registrationNo: r.registrationNo,
        bookingId: r.bookingId,
        bookingPlayerId: r.bookingPlayerId,
        courseId: r.courseId,
        playDate: r.playDate,
        teeTime: availability.hhmm(r.teeTime),
        crossTime: availability.hhmm(r.crossTime),
        holes: r.holes,
        golferId: r.golferId,
        playerType: r.playerType,
        playerName: r.playerName,
        memberNo: r.memberNo,
        status: r.status,
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
        registrationPlayerId: bill.registrationPlayerId,
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
// GET /front-desk/day?playDate= - the day's flights: booked players overlaid
// with their registration/bill state, plus walk-in registrations.
exports.getDay = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.query.playDate || '');
        if (!DATE_RE.test(playDate)) return res.status(400).json({ message: 'Pick a play date.' });

        const [bookings, registrations, courses] = await Promise.all([
            Booking.findAll({ where: { companyId, playDate, status: 'booked' }, order: [['startTime', 'ASC']] }),
            RegistrationPlayer.findAll({ where: { companyId, playDate }, order: [['registeredAt', 'ASC']] }),
            Course.findAll({ where: { companyId }, attributes: ['id', 'courseCode', 'description'] }),
        ]);
        const players = bookings.length
            ? await BookingPlayer.findAll({ where: { bookingId: { [Op.in]: bookings.map((b) => b.id) } }, order: [['sortOrder', 'ASC']] })
            : [];
        const bills = registrations.length
            ? await Bill.findAll({ where: { companyId, registrationPlayerId: { [Op.in]: registrations.map((r) => r.id) }, status: { [Op.ne]: 'voided' } } })
            : [];
        const courseById = new Map(courses.map((c) => [c.id, c]));
        const regByBookingPlayer = new Map(registrations.filter((r) => r.bookingPlayerId && r.status === 'registered').map((r) => [r.bookingPlayerId, r]));
        const billByRegistration = new Map(bills.map((b) => [b.registrationPlayerId, b]));

        const flights = new Map();
        const flightOf = (courseId, teeTime, holes) => {
            const key = `${courseId}|${availability.hhmm(teeTime)}`;
            if (!flights.has(key)) {
                const course = courseById.get(courseId);
                flights.set(key, {
                    courseId,
                    courseCode: course ? course.courseCode : null,
                    courseDescription: course ? course.description : null,
                    teeTime: availability.hhmm(teeTime),
                    holes,
                    entries: [],
                });
            }
            return flights.get(key);
        };

        const bookingById = new Map(bookings.map((b) => [b.id, b]));
        for (const p of players) {
            const booking = bookingById.get(p.bookingId);
            if (!booking) continue;
            const reg = regByBookingPlayer.get(p.id) || null;
            const bill = reg ? billByRegistration.get(reg.id) || null : null;
            flightOf(booking.courseId, booking.startTime, booking.holes).entries.push({
                kind: 'booked',
                bookingId: booking.id,
                bookingNo: booking.bookingNo,
                bookingPlayerId: p.id,
                playerType: p.playerType,
                playerName: p.playerName,
                memberNo: p.memberNo,
                holes: booking.holes,
                registration: reg ? registrationDto(reg) : null,
                bill: bill ? { id: bill.id, billNo: bill.billNo, status: bill.status, totalAmount: Number(bill.totalAmount) } : null,
            });
        }
        for (const r of registrations) {
            if (r.bookingId || r.status !== 'registered') continue; // walk-ins only
            const bill = billByRegistration.get(r.id) || null;
            flightOf(r.courseId, r.teeTime, r.holes).entries.push({
                kind: 'walkin',
                playerType: r.playerType,
                playerName: r.playerName,
                memberNo: r.memberNo,
                holes: r.holes,
                registration: registrationDto(r),
                bill: bill ? { id: bill.id, billNo: bill.billNo, status: bill.status, totalAmount: Number(bill.totalAmount) } : null,
            });
        }

        const list = [...flights.values()].sort((a, b) => (a.teeTime === b.teeTime
            ? String(a.courseCode).localeCompare(String(b.courseCode))
            : a.teeTime.localeCompare(b.teeTime)));
        res.status(200).json({ playDate, flights: list });
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
        const [types, tenders, courses] = await Promise.all([
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
        ]);
        res.status(200).json({
            tiles: types,
            paymentTypes: tenders,
            courses,
            playerTypes: PLAYER_TYPES,
            holesOptions: HOLES_OPTIONS,
            registrationStatuses: REGISTRATION_STATUSES,
            billStatuses: BILL_STATUSES,
        });
    } catch (error) {
        console.error('Error loading golf front-desk meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Registration

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

// POST /front-desk/registrations - register a BOOKED player
// ({ bookingPlayerId, guest? }) or a WALK-IN ({ walkIn: { playDate, courseId,
// teeTime, holes, playerType, memberNo?, guest? } }).
exports.register = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const stamps = await callerStamps(req);

        // ---- booked-player path ----
        if (req.body.bookingPlayerId) {
            const bp = await BookingPlayer.findByPk(String(req.body.bookingPlayerId));
            const booking = bp ? await Booking.findOne({ where: { companyId, id: bp.bookingId } }) : null;
            if (!bp || !booking) return res.status(404).json({ message: 'Booking player not found.' });
            if (booking.status !== 'booked') return res.status(400).json({ message: 'This booking is cancelled.' });
            const existing = await RegistrationPlayer.findOne({ where: { bookingPlayerId: bp.id, status: 'registered' } });
            if (existing) return res.status(409).json({ message: `${bp.playerName} is already registered (${existing.registrationNo}).` });

            const result = await sequelize.transaction(async (transaction) => {
                const identity = await resolvePlayerIdentity({
                    req, companyId, playerType: bp.playerType, memberNo: bp.memberNo,
                    guest: req.body.guest, fallbackName: bp.playerName, stamps, transaction,
                });
                if (identity.error) return { fail: identity.error, status: 400 };
                if (bp.playerType === 'guest' && !bp.golferId) {
                    bp.golferId = identity.golfer.id;
                    await bp.save({ transaction });
                }
                const issued = await numberingGateway.issueNumber(req, 'golf-registration', { transaction });
                let registrationNo = issued && issued.number ? issued.number : null;
                if (!registrationNo) {
                    if (issued && issued.manual) registrationNo = String(req.body.registrationNo || '').trim();
                    if (!registrationNo) return { fail: 'Configure the Registration No. numbering scheme first (Golf Management → Numbering Control).', status: 400 };
                }
                const row = await RegistrationPlayer.create({
                    companyId,
                    registrationNo,
                    bookingId: booking.id,
                    bookingPlayerId: bp.id,
                    courseId: booking.courseId,
                    playDate: booking.playDate,
                    nine: booking.startNine,
                    teeTime: booking.startTime,
                    crossNine: booking.crossNine,
                    crossTime: booking.crossTime,
                    holes: booking.holes,
                    golferId: identity.golfer.id,
                    playerType: bp.playerType,
                    playerName: identity.playerName,
                    memberNo: identity.memberNo,
                    ...stamps,
                }, { transaction });
                return { row };
            });
            if (result.fail) return res.status(result.status).json({ message: result.fail });
            return res.status(201).json({ message: `Registered ${result.row.playerName} (${result.row.registrationNo}).`, registration: registrationDto(result.row) });
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
                replacements: { key: `golf-booking:${companyId}:${course.id}:${playDate}` },
                transaction,
            });

            // Seat check ONLY (desk is authoritative; merge/min/guest rules
            // are booking-channel controls). The flight must exist on the
            // grid with a free seat - the crossover leg too for 18 holes.
            const set = await availability.resolveTeeTimeSet(course.id, dayType, playDate);
            if (!set) return { fail: 'No tee sheet is configured for this course on that date.', status: 400 };
            const CourseTeeTimeSlot = require('./courseTeeTimeSlot.model');
            const slots = await CourseTeeTimeSlot.findAll({ where: { teeTimeSetId: set.id }, order: [['teeTime', 'ASC']], transaction });
            const slot = slots.find((s) => availability.hhmm(s.teeTime) === teeTime);
            if (!slot) return { fail: 'That flight time is not on the tee sheet.', status: 400 };
            const occ = await availability.occupancy(companyId, [course.id], playDate, { transaction });
            const startOcc = occ.get(availability.cellKey(course.id, 'first', teeTime));
            if ((startOcc ? startOcc.players : 0) >= slot.maxPlayers) return { fail: 'That flight is full.', status: 409 };
            let crossNine = null;
            let crossTime = null;
            if (holes === 18) {
                const t = availability.toMinutes(teeTime);
                const crossSlot = slots.find((s) => availability.toMinutes(s.teeTime) >= t + (course.crossOverMinutes || 0));
                if (!crossSlot) return { fail: 'No crossover flight remains for 18 holes at that time.', status: 400 };
                crossNine = 'second';
                crossTime = availability.hhmm(crossSlot.teeTime);
                const crossOcc = occ.get(availability.cellKey(course.id, 'second', crossTime));
                if ((crossOcc ? crossOcc.players : 0) >= crossSlot.maxPlayers) return { fail: 'The crossover flight is full.', status: 409 };
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
            const row = await RegistrationPlayer.create({
                companyId,
                registrationNo,
                bookingId: null,
                bookingPlayerId: null,
                courseId: course.id,
                playDate,
                nine: 'first',
                teeTime,
                crossNine,
                crossTime,
                holes,
                golferId: identity.golfer.id,
                playerType,
                playerName: identity.playerName,
                memberNo: identity.memberNo,
                ...stamps,
            }, { transaction });
            return { row };
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(201).json({ message: `Registered ${result.row.playerName} (${result.row.registrationNo}).`, registration: registrationDto(result.row) });
    } catch (error) {
        console.error('Error registering golf player:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/registrations/:id/cancel
exports.cancelRegistration = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await RegistrationPlayer.findOne({ where: { companyId, id: req.params.id } });
        if (!row) return res.status(404).json({ message: 'Registration not found.' });
        if (row.status !== 'registered') return res.status(400).json({ message: 'This registration is already cancelled.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const bill = await Bill.findOne({ where: { companyId, registrationPlayerId: row.id, status: { [Op.ne]: 'voided' } } });
        if (bill) return res.status(409).json({ message: `Bill ${bill.billNo} exists for this registration - void it first.` });

        row.status = 'cancelled';
        row.cancelledAt = new Date();
        row.cancelledBy = getUserContext(req).userId;
        row.cancelReason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Registration ${row.registrationNo} cancelled.` });
    } catch (error) {
        console.error('Error cancelling golf registration:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Billing

// POST /front-desk/registrations/:id/bills - get-or-create the player's bill.
// On CREATE the green fee auto-charges by the golfer category on the active
// green-fee transaction type (members WITH golfing right pay none).
exports.openBill = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const registration = await RegistrationPlayer.findOne({ where: { companyId, id: req.params.id } });
        if (!registration) return res.status(404).json({ message: 'Registration not found.' });
        if (registration.status !== 'registered') return res.status(400).json({ message: 'This registration is cancelled.' });

        const existing = await Bill.findOne({ where: { companyId, registrationPlayerId: registration.id, status: { [Op.ne]: 'voided' } } });
        if (existing) return res.status(200).json({ bill: await billDto(existing), warnings: [] });

        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, String(registration.playDate));
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
                registrationPlayerId: registration.id,
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
                        req, bill, registration, type: gfType, quantity: 1, dayType, stamps, transaction, allowMissingPrice: true,
                    });
                    if (added.error) warnings.push(added.error);
                    else if (Number(added.item.unitAmount) === 0 && !gfType.allowPriceOverride) {
                        warnings.push(`'${gfType.transactionType}' has no price in force for ${registration.playDate}.`);
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

// The bill + its registration, guarded to the caller's company and, when
// `openOnly`, to amendable status.
async function findBill(req, { openOnly = false } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const bill = await Bill.findOne({ where: { companyId, id: req.params.billId } });
    if (!bill) return { status: 404, message: 'Bill not found.' };
    if (openOnly && bill.status !== 'open') return { status: 409, message: `This bill is ${bill.status} and cannot be amended.` };
    const registration = await RegistrationPlayer.findOne({ where: { companyId, id: bill.registrationPlayerId } });
    return { bill, registration, companyId };
}

// GET /front-desk/bills/:billId
exports.getBill = async (req, res) => {
    try {
        const found = await findBill(req);
        if (!found.bill) return res.status(found.status).json({ message: found.message });
        res.status(200).json({ bill: await billDto(found.bill), registration: found.registration ? registrationDto(found.registration) : null });
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
        const type = await GolfTransactionType.findOne({ where: { companyId, id: String(req.body.transactionTypeId || ''), isActive: true } });
        if (!type) return res.status(400).json({ message: 'Pick a billing item.' });
        const quantity = Number.isInteger(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
        if (quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Quantity must be between 1 and 99.' });

        const stamps = await callerStamps(req);
        const dayType = await dayTypeOf(req, String(registration.playDate));
        const result = await sequelize.transaction(async (transaction) => {
            if (type.chargeType === PACKAGE_CHARGE_TYPE_KEY) {
                if (quantity !== 1) return { fail: 'Packages are billed one at a time.', status: 400 };
                const out = await addPackageItems({ req, bill, registration, type, stamps, transaction });
                if (out.error) return { fail: out.error, status: 400 };
            } else {
                const out = await addOrdinaryItem({ req, bill, registration, type, quantity, dayType, stamps, transaction });
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
        if (!registration) return res.status(409).json({ message: 'The bill\'s registration no longer exists.' });

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
