// Facility Specification (/facility/settings). The per-company settings
// singleton + the Facility Session bands + (slice 2) the membership-type
// advance-booking overrides and the guest-control exception rules. GET
// returns the effective document (defaults when never saved); PUT upserts
// the singleton and replaces the row sets atomically. Pattern of
// golf/golfSetting.controller.js.

const FacilitySetting = require('./facilitySetting.model');
const FacilitySession = require('./facilitySession.model');
const FacilityType = require('./facilityType.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const GuestControlRule = require('./guestControlRule.model');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { listMembershipTypes } = require('../../platform/membershipGateway');
const { LIMITS, RULE_DAY_SCOPE_KEYS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, parseRequiredInt } = require('./facilityShared');

const DEFAULTS = {
    advanceBookingDays: 7,
    advanceBookingHours: 0,
    allowSameDayBooking: false,
    bookingLockMinutes: 5,
    allowMembershipTypeOverride: false,
    guestControlEnabled: false,
    allowGuestWeekday: true,
    allowMemberGuestWeekday: true,
    allowGuestWeekend: true,
    allowMemberGuestWeekend: true,
    noShowControlEnabled: false,
    cancellationNoticeHours: 24,
    checkInOpenMinutes: 30,
    autoSignOutAtClose: true,
    lateCancellationAction: 'charge',
    noShowTransactionTypeId: null,
    noShowChargeBasis: 'booking',
    noShowGraceMinutes: 15,
    strikeCount: 3,
    strikeWindowDays: 90,
    strikeSuspensionDays: 30,
};

function settingDto(row) {
    if (!row) return { ...DEFAULTS, saved: false };
    return {
        advanceBookingDays: row.advanceBookingDays,
        advanceBookingHours: row.advanceBookingHours,
        allowSameDayBooking: row.allowSameDayBooking === true,
        bookingLockMinutes: row.bookingLockMinutes,
        allowMembershipTypeOverride: row.allowMembershipTypeOverride === true,
        guestControlEnabled: row.guestControlEnabled === true,
        allowGuestWeekday: row.allowGuestWeekday === true,
        allowMemberGuestWeekday: row.allowMemberGuestWeekday === true,
        allowGuestWeekend: row.allowGuestWeekend === true,
        allowMemberGuestWeekend: row.allowMemberGuestWeekend === true,
        noShowControlEnabled: row.noShowControlEnabled === true,
        cancellationNoticeHours: row.cancellationNoticeHours,
        checkInOpenMinutes: row.checkInOpenMinutes ?? 30,
        autoSignOutAtClose: row.autoSignOutAtClose !== false,
        lateCancellationAction: row.lateCancellationAction === 'refuse' ? 'refuse' : 'charge',
        noShowTransactionTypeId: row.noShowTransactionTypeId || null,
        noShowChargeBasis: row.noShowChargeBasis || 'booking',
        noShowGraceMinutes: row.noShowGraceMinutes ?? 15,
        strikeCount: row.strikeCount ?? 3,
        strikeWindowDays: row.strikeWindowDays ?? 90,
        strikeSuspensionDays: row.strikeSuspensionDays ?? 30,
        saved: true,
    };
}

function sessionDto(s) {
    return { id: s.id, name: s.name, startTime: timeDto(s.startTime), endTime: timeDto(s.endTime), sequence: s.sequence };
}

// GET /api/facility/settings
exports.get = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [row, sessions, overrides, guestRules, membershipTypes, facilityTypes] = await Promise.all([
            FacilitySetting.findOne({ where: { companyId } }),
            FacilitySession.findAll({ where: { companyId }, order: [['sequence', 'ASC'], ['startTime', 'ASC']] }),
            AdvanceBookingOverride.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            GuestControlRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            listMembershipTypes(companyId, { activeOnly: false }),
            FacilityType.findAll({ where: { companyId }, attributes: ['id', 'code', 'description', 'usageMode', 'isActive'], order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
        ]);
        res.status(200).json({
            ...settingDto(row),
            sessions: sessions.map(sessionDto),
            overrides: overrides.map((o) => ({ membershipTypeId: o.membershipTypeId, advanceBookingDays: o.advanceBookingDays })),
            guestControlRules: guestRules.map((r) => ({
                facilityTypeId: r.facilityTypeId || null, dayScope: r.dayScope, startTime: timeDto(r.startTime), endTime: timeDto(r.endTime),
                allowGuest: r.allowGuest === true, allowMemberGuest: r.allowMemberGuest === true,
            })),
            // Pickers (served here so the screen needs no Membership grant).
            membershipTypes,
            facilityTypes,
            // Slice 4: the pickable no-show items.
            noShowTypes: (await require('./transactionType.model').findAll({ where: { companyId, chargeType: 'no-show', isActive: true }, attributes: ['id', 'transactionType', 'description', 'facilityTypeId'], order: [['transactionType', 'ASC']] }))
                .map((t) => ({ id: t.id, transactionType: t.transactionType, description: t.description, facilityTypeId: t.facilityTypeId || null })),
        });
    } catch (error) {
        console.error('Error loading facility settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Validate and normalise the session bands: named, non-overlapping, end
// exclusive, re-sequenced by start time.
function parseSessions(raw) {
    const rawSessions = Array.isArray(raw) ? raw : [];
    if (rawSessions.length > LIMITS.maxSessions) return { error: `At most ${LIMITS.maxSessions} sessions.` };
    const sessions = [];
    const names = new Set();
    for (const line of rawSessions) {
        if (!line || typeof line !== 'object') return { error: 'Invalid session line.' };
        const name = typeof line.name === 'string' ? line.name.trim() : '';
        if (!name || name.length > 50) return { error: 'Every session needs a name (up to 50 characters).' };
        if (names.has(name.toLowerCase())) return { error: `Session '${name}' appears more than once.` };
        names.add(name.toLowerCase());
        const start = normalizeTime(line.startTime);
        const end = normalizeTime(line.endTime);
        if (!start.ok || !end.ok || !start.value || !end.value) return { error: `Session '${name}' needs valid From and Until times.` };
        if (start.value >= end.value) return { error: `Session '${name}': the From time must be before the Until time.` };
        sessions.push({ name, startTime: start.value, endTime: end.value });
    }
    sessions.sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
    for (let i = 1; i < sessions.length; i += 1) {
        if (sessions[i].startTime < sessions[i - 1].endTime) return { error: `Sessions '${sessions[i - 1].name}' and '${sessions[i].name}' overlap.` };
    }
    sessions.forEach((s, i) => { s.sequence = i + 1; });
    return { sessions };
}

// Membership-type override lines: each type once, owned by the company.
async function parseOverrides(raw, companyId) {
    const lines = Array.isArray(raw) ? raw : [];
    if (lines.length > LIMITS.maxOverrides) return { error: 'Too many override lines.' };
    const ids = lines.map((o) => (o && typeof o.membershipTypeId === 'string' ? o.membershipTypeId : ''));
    if (ids.some((id) => !id)) return { error: 'Every override line needs a membership type.' };
    if (new Set(ids).size !== ids.length) return { error: 'A membership type can only have one override line.' };
    const known = new Map((await listMembershipTypes(companyId, { activeOnly: false })).map((t) => [t.id, t]));
    const overrides = [];
    for (const line of lines) {
        const type = known.get(line.membershipTypeId);
        if (!type) return { error: 'An override line is not one of this company\'s membership types.' };
        const days = parseRequiredInt(line.advanceBookingDays, 0, 365);
        if (!days.ok) return { error: `Override days for '${type.category}' must be a whole number between 0 and 365.` };
        overrides.push({ membershipTypeId: line.membershipTypeId, advanceBookingDays: days.value });
    }
    return { overrides };
}

// Guest-control exception rows: a known facility type (or every type), a
// day scope, an optional time band, the two allow flags; no two rows may
// cover the same type + scope for the whole day, bands must not overlap.
function parseGuestRules(raw, knownTypeIds) {
    const lines = Array.isArray(raw) ? raw : [];
    if (lines.length > LIMITS.maxGuestRules) return { error: 'Too many guest-control rules.' };
    const rules = [];
    for (const line of lines) {
        if (!line || typeof line !== 'object') return { error: 'Invalid guest-control rule line.' };
        const facilityTypeId = line.facilityTypeId ? String(line.facilityTypeId) : null;
        if (facilityTypeId && !knownTypeIds.has(facilityTypeId)) return { error: 'A guest-control rule names a facility type that is not this company\'s.' };
        const dayScope = String(line.dayScope || '');
        if (!RULE_DAY_SCOPE_KEYS.includes(dayScope)) return { error: 'Each guest-control rule needs a day scope (all, weekday, weekend or a specific day).' };
        const hasStart = line.startTime !== null && line.startTime !== undefined && line.startTime !== '';
        const hasEnd = line.endTime !== null && line.endTime !== undefined && line.endTime !== '';
        if (hasStart !== hasEnd) return { error: 'A guest-control rule time band needs both From and To times (or neither for the whole day).' };
        let startTime = null;
        let endTime = null;
        if (hasStart) {
            const s = normalizeTime(line.startTime);
            const e = normalizeTime(line.endTime);
            if (!s.ok || !e.ok || !s.value || !e.value) return { error: 'Guest-control rule times must be valid times of day.' };
            if (s.value >= e.value) return { error: 'A guest-control rule\'s From time must be before its To time.' };
            startTime = s.value;
            endTime = e.value;
        }
        rules.push({ facilityTypeId, dayScope, startTime, endTime, allowGuest: line.allowGuest === true, allowMemberGuest: line.allowMemberGuest === true });
    }
    const byKey = new Map();
    for (const r of rules) {
        const key = `${r.facilityTypeId || '*'}|${r.dayScope}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(r);
    }
    for (const group of byKey.values()) {
        if (group.filter((r) => !r.startTime).length > 1) return { error: 'Two guest-control rules cover the same facility type and day scope for the whole day.' };
        const bands = group.filter((r) => r.startTime).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
        for (let i = 1; i < bands.length; i += 1) {
            if (bands[i].startTime < bands[i - 1].endTime) return { error: 'Two guest-control rules for the same facility type and day scope have overlapping time bands.' };
        }
    }
    return { rules };
}

// PUT /api/facility/settings - the whole document (scalars + the row sets).
exports.save = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ints = [
            ['advanceBookingDays', 0, 365, 'Advance booking days must be a whole number between 0 and 365.'],
            ['advanceBookingHours', 0, 23, 'Advance booking hours must be a whole number between 0 and 23.'],
            ['bookingLockMinutes', 1, 60, 'Booking lock minutes must be a whole number between 1 and 60.'],
            ['cancellationNoticeHours', 0, 720, 'Cancellation notice must be a whole number of hours between 0 and 720.'],
            ['checkInOpenMinutes', 0, 240, 'Check-in opens must be a whole number of minutes between 0 and 240.'],
            ['noShowGraceMinutes', 0, 240, 'No-show grace must be a whole number of minutes between 0 and 240.'],
            ['strikeCount', 1, 20, 'Strike count must be a whole number between 1 and 20.'],
            ['strikeWindowDays', 1, 365, 'Strike window must be a whole number of days between 1 and 365.'],
            ['strikeSuspensionDays', 1, 365, 'Strike suspension must be a whole number of days between 1 and 365.'],
        ];
        const values = {};
        for (const [field, min, max, message] of ints) {
            const n = parseRequiredInt(req.body[field], min, max);
            if (!n.ok) return res.status(400).json({ message });
            values[field] = n.value;
        }
        for (const flag of ['allowSameDayBooking', 'allowMembershipTypeOverride', 'guestControlEnabled', 'allowGuestWeekday', 'allowMemberGuestWeekday',
            'allowGuestWeekend', 'allowMemberGuestWeekend', 'noShowControlEnabled', 'autoSignOutAtClose']) {
            values[flag] = req.body[flag] === true;
        }
        // Slice 4: the late-cancel action, the charge basis and the no-show item.
        values.lateCancellationAction = req.body.lateCancellationAction === 'refuse' ? 'refuse' : 'charge';
        values.noShowChargeBasis = ['booking', 'slot', 'participant'].includes(req.body.noShowChargeBasis) ? req.body.noShowChargeBasis : 'booking';
        if (req.body.noShowTransactionTypeId) {
            const tt = await require('./transactionType.model').findOne({ where: { companyId, id: String(req.body.noShowTransactionTypeId) } });
            if (!tt || tt.chargeType !== 'no-show') return res.status(400).json({ message: 'The no-show item must be a No Show Charges transaction type of the active company.' });
            values.noShowTransactionTypeId = tt.id;
        } else values.noShowTransactionTypeId = null;

        const parsedSessions = parseSessions(req.body.sessions);
        if (parsedSessions.error) return res.status(400).json({ message: parsedSessions.error });
        const parsedOverrides = await parseOverrides(req.body.overrides, companyId);
        if (parsedOverrides.error) return res.status(400).json({ message: parsedOverrides.error });
        const knownTypeIds = new Set((await FacilityType.findAll({ where: { companyId }, attributes: ['id'] })).map((t) => t.id));
        const parsedRules = parseGuestRules(req.body.guestControlRules, knownTypeIds);
        if (parsedRules.error) return res.status(400).json({ message: parsedRules.error });

        const stamps = await stampsFor(req);
        const callerId = getUserContext(req).userId;
        await sequelize.transaction(async (transaction) => {
            const existing = await FacilitySetting.findOne({ where: { companyId }, transaction });
            if (existing) {
                Object.assign(existing, { ...values, updatedBy: callerId });
                await existing.save({ transaction });
            } else {
                await FacilitySetting.create({ companyId, ...values, ...stamps }, { transaction });
            }
            await FacilitySession.destroy({ where: { companyId }, transaction });
            if (parsedSessions.sessions.length) {
                await FacilitySession.bulkCreate(parsedSessions.sessions.map((s) => ({ ...s, companyId, ...stamps })), { transaction });
            }
            await AdvanceBookingOverride.destroy({ where: { companyId }, transaction });
            if (parsedOverrides.overrides.length) {
                await AdvanceBookingOverride.bulkCreate(parsedOverrides.overrides.map((o) => ({ ...o, companyId, ...stamps })), { transaction });
            }
            await GuestControlRule.destroy({ where: { companyId }, transaction });
            if (parsedRules.rules.length) {
                await GuestControlRule.bulkCreate(parsedRules.rules.map((r) => ({ ...r, companyId, ...stamps })), { transaction });
            }
        });

        res.status(200).json({ message: 'Facility specification saved.' });
    } catch (error) {
        console.error('Error saving facility settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.DEFAULTS = DEFAULTS;
