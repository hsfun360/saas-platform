// Golf Specification (Golf Management → /golf/settings). The per-company
// settings singleton + the advance-booking override lines. GET returns the
// effective document (defaults when never saved); PUT upserts the singleton
// and replaces the override lines atomically.

const GolfSetting = require('./golfSetting.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const MinPlayerRule = require('./minPlayerRule.model');
const GuestControlRule = require('./guestControlRule.model');
const HandicapLimitRule = require('./handicapLimitRule.model');
const HandicapAccompanimentRule = require('./handicapAccompanimentRule.model');
const GolfSession = require('./golfSession.model');
const Course = require('./course.model');
const GolfTransactionType = require('./transactionType.model');
const { LATE_CANCELLATION_ACTION_KEYS, NO_SHOW_CHARGE_BASIS_KEYS } = require('./noShowCharge.constants');
const { RAIN_CHECK_BASIS_KEYS } = require('./rainCheck.constants');
// Playing rights + round quotas (2026-10-15).
const PlayingRightRule = require('./playingRightRule.model');
const RoundQuotaRule = require('./roundQuotaRule.model');
const AffiliatedClub = require('./affiliatedClub.model');
const { QUOTA_PERIOD_KEYS, QUOTA_PERIODS } = require('./playingRights.constants');
const playerTypes = require('./playerType.service');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { listMembershipTypes } = require('../../platform/membershipGateway');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

const DEFAULTS = {
    advanceBookingDays: 7, advanceBookingHours: 0, allowMembershipTypeOverride: false,
    allowBookingMerge: false, minPlayersWeekday: 1, minPlayersWeekend: 1, bookingLockMinutes: 5,
    bookingLimitWeekday: 'day', bookingLimitWeekend: 'day', allowSameDayBooking: false,
    guestControlEnabled: false, allowGuestWeekday: true, allowMemberGuestWeekday: true,
    allowGuestWeekend: true, allowMemberGuestWeekend: true,
    handicapControlEnabled: false, juniorBookingControlEnabled: false,
    noShowControlEnabled: false, cancellationNoticeHours: 24, lateCancellationAction: 'charge',
    noShowTransactionTypeId: null, noShowChargeBasis: 'player',
    rainCheckEnabled: false, rainCheckValidityDays: 90, rainCheckBasis: 'green-fee', rainCheckProrate: true,
    playingRightsEnabled: false,
    teeSheetColorBooked: '#2563eb', teeSheetColorRegistered: '#f59e0b',
    teeSheetColorBilled: '#8b5cf6', teeSheetColorSettled: '#16a34a',
    groupBookingControlEnabled: false, groupTentativeHoldHours: 72, groupDepositDueDays: 7, groupDefaultDepositPct: 30,
    groupShareCapWeekday: 0, groupShareCapWeekend: 0, groupMaxTentativePerUser: 0, groupNextInLineHours: 24,
};

function settingDto(row) {
    if (!row) return { ...DEFAULTS, saved: false };
    return {
        advanceBookingDays: row.advanceBookingDays,
        advanceBookingHours: row.advanceBookingHours,
        allowMembershipTypeOverride: row.allowMembershipTypeOverride === true,
        allowBookingMerge: row.allowBookingMerge === true,
        minPlayersWeekday: row.minPlayersWeekday,
        minPlayersWeekend: row.minPlayersWeekend,
        bookingLockMinutes: row.bookingLockMinutes,
        bookingLimitWeekday: BOOKING_LIMITS.includes(row.bookingLimitWeekday) ? row.bookingLimitWeekday : 'day',
        bookingLimitWeekend: BOOKING_LIMITS.includes(row.bookingLimitWeekend) ? row.bookingLimitWeekend : 'day',
        allowSameDayBooking: row.allowSameDayBooking === true,
        guestControlEnabled: row.guestControlEnabled === true,
        allowGuestWeekday: row.allowGuestWeekday === true,
        allowMemberGuestWeekday: row.allowMemberGuestWeekday === true,
        allowGuestWeekend: row.allowGuestWeekend === true,
        allowMemberGuestWeekend: row.allowMemberGuestWeekend === true,
        handicapControlEnabled: row.handicapControlEnabled === true,
        juniorBookingControlEnabled: row.juniorBookingControlEnabled === true,
        noShowControlEnabled: row.noShowControlEnabled === true,
        cancellationNoticeHours: row.cancellationNoticeHours === null || row.cancellationNoticeHours === undefined ? 24 : row.cancellationNoticeHours,
        lateCancellationAction: LATE_CANCELLATION_ACTION_KEYS.includes(row.lateCancellationAction) ? row.lateCancellationAction : 'charge',
        noShowTransactionTypeId: row.noShowTransactionTypeId || null,
        noShowChargeBasis: NO_SHOW_CHARGE_BASIS_KEYS.includes(row.noShowChargeBasis) ? row.noShowChargeBasis : 'player',
        rainCheckEnabled: row.rainCheckEnabled === true,
        rainCheckValidityDays: row.rainCheckValidityDays === null || row.rainCheckValidityDays === undefined ? DEFAULTS.rainCheckValidityDays : row.rainCheckValidityDays,
        rainCheckBasis: RAIN_CHECK_BASIS_KEYS.includes(row.rainCheckBasis) ? row.rainCheckBasis : 'green-fee',
        rainCheckProrate: row.rainCheckProrate !== false,
        playingRightsEnabled: row.playingRightsEnabled === true,
        teeSheetColorBooked: row.teeSheetColorBooked || DEFAULTS.teeSheetColorBooked,
        teeSheetColorRegistered: row.teeSheetColorRegistered || DEFAULTS.teeSheetColorRegistered,
        teeSheetColorBilled: row.teeSheetColorBilled || DEFAULTS.teeSheetColorBilled,
        teeSheetColorSettled: row.teeSheetColorSettled || DEFAULTS.teeSheetColorSettled,
        groupBookingControlEnabled: row.groupBookingControlEnabled === true,
        groupTentativeHoldHours: row.groupTentativeHoldHours === null || row.groupTentativeHoldHours === undefined ? DEFAULTS.groupTentativeHoldHours : row.groupTentativeHoldHours,
        groupDepositDueDays: row.groupDepositDueDays === null || row.groupDepositDueDays === undefined ? DEFAULTS.groupDepositDueDays : row.groupDepositDueDays,
        groupDefaultDepositPct: row.groupDefaultDepositPct === null || row.groupDefaultDepositPct === undefined ? DEFAULTS.groupDefaultDepositPct : row.groupDefaultDepositPct,
        groupShareCapWeekday: row.groupShareCapWeekday || 0,
        groupShareCapWeekend: row.groupShareCapWeekend || 0,
        groupMaxTentativePerUser: row.groupMaxTentativePerUser || 0,
        groupNextInLineHours: row.groupNextInLineHours === null || row.groupNextInLineHours === undefined ? DEFAULTS.groupNextInLineHours : row.groupNextInLineHours,
        saved: true,
    };
}

// Booking-limit vocabulary per day type (user decision 2026-10-01):
// no limit / one booking per day / one booking per GolfSession band.
const BOOKING_LIMITS = ['none', 'day', 'session'];

// Day scopes for the exception editors: the weekday/weekend pair plus
// SPECIFIC days of the week (user request 2026-09-28, e.g. "no guests on
// Sunday"). Resolution ladders specific day > weekday/weekend > all.
const DAY_SCOPES = ['all', 'weekday', 'weekend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// TIME values arrive as 'HH:MM' from the web time inputs (Postgres returns
// 'HH:MM:SS'); normalize to 'HH:MM' both ways. Returns undefined when invalid.
function parseTime(v) {
    if (typeof v !== 'string') return undefined;
    const m = v.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!m) return undefined;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return undefined;
    return `${m[1]}:${m[2]}`;
}

function timeDto(v) {
    return v ? String(v).slice(0, 5) : null;
}

// Parse an integer within [min, max]. Returns undefined when invalid.
function parseIntIn(v, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return undefined;
    return n;
}

// GET /api/golf/settings - the setting (or defaults) + override lines.
exports.get = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const [row, overrides, minPlayerRules, guestControlRules, handicapLimitRules, handicapAccompanimentRules, sessions, playingRightRules, roundQuotaRules] = await Promise.all([
            GolfSetting.findOne({ where: { companyId } }),
            AdvanceBookingOverride.findAll({ where: { companyId } }),
            MinPlayerRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            GuestControlRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            HandicapLimitRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            HandicapAccompanimentRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            GolfSession.findAll({ where: { companyId }, order: [['sequence', 'ASC'], ['startTime', 'ASC']] }),
            PlayingRightRule.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] }),
            RoundQuotaRule.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] }),
        ]);
        res.status(200).json({
            setting: settingDto(row),
            // Playing rights + round quotas (2026-10-15): target = a player
            // type (+ optional membership type) OR an affiliated club.
            playingRightRules: playingRightRules.map((r) => ({
                playerTypeId: r.playerTypeId, affiliatedClubId: r.affiliatedClubId, membershipTypeId: r.membershipTypeId,
                courseId: r.courseId, dayScope: r.dayScope, startTime: timeDto(r.startTime), endTime: timeDto(r.endTime),
                effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
            })),
            roundQuotaRules: roundQuotaRules.map((r) => ({
                playerTypeId: r.playerTypeId, affiliatedClubId: r.affiliatedClubId, membershipTypeId: r.membershipTypeId,
                dayScope: r.dayScope, period: r.period, maxRounds: r.maxRounds, maxGuestRounds: r.maxGuestRounds,
            })),
            overrides: overrides.map((o) => ({
                membershipTypeId: o.membershipTypeId,
                advanceBookingDays: o.advanceBookingDays,
            })),
            minPlayerRules: minPlayerRules.map((r) => ({
                courseId: r.courseId,
                dayScope: r.dayScope,
                startTime: timeDto(r.startTime),
                endTime: timeDto(r.endTime),
                minPlayers: r.minPlayers,
            })),
            guestControlRules: guestControlRules.map((r) => ({
                courseId: r.courseId,
                dayScope: r.dayScope,
                startTime: timeDto(r.startTime),
                endTime: timeDto(r.endTime),
                allowGuest: r.allowGuest === true,
                allowMemberGuest: r.allowMemberGuest === true,
            })),
            handicapLimitRules: handicapLimitRules.map((r) => ({
                courseId: r.courseId,
                dayScope: r.dayScope,
                holes: r.holes === null || r.holes === undefined ? null : Number(r.holes),
                gender: r.gender,
                maxHandicap: Number(r.maxHandicap),
                latestTeeOff: timeDto(r.latestTeeOff),
            })),
            handicapAccompanimentRules: handicapAccompanimentRules.map((r) => ({
                courseId: r.courseId,
                dayScope: r.dayScope,
                holes: r.holes === null || r.holes === undefined ? null : Number(r.holes),
                startTime: timeDto(r.startTime),
                endTime: timeDto(r.endTime),
                appliesToBeginner: r.appliesToBeginner === true,
                appliesToProvisional: r.appliesToProvisional === true,
                minCompanions: r.minCompanions,
                companionMaxHandicapMen: Number(r.companionMaxHandicapMen),
                companionMaxHandicapWomen: Number(r.companionMaxHandicapWomen),
                latestTeeOff: timeDto(r.latestTeeOff),
            })),
            sessions: sessions.map((s) => ({
                name: s.name,
                startTime: timeDto(s.startTime),
                endTime: timeDto(s.endTime),
            })),
        });
    } catch (error) {
        console.error('Error loading golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/settings/membership-types - the membership-type picker for
// the override editor, served through the membership seam so a golf admin
// needs no Membership menu grants.
exports.getMembershipTypes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const types = await listMembershipTypes(companyId);
        res.status(200).json({ membershipTypes: types });
    } catch (error) {
        console.error('Error listing membership types for golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/settings/courses - the course picker for the minimum-players
// exception editor (same module, so a direct read; no /golf/courses menu
// grant needed - mirror of the membership-types picker).
exports.getCourses = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const courses = await Course.findAll({
            where: { companyId },
            attributes: ['id', 'courseCode', 'description', 'isActive'],
            order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
        });
        res.status(200).json({
            courses: courses.map((c) => ({
                id: c.id, courseCode: c.courseCode, description: c.description, isActive: c.isActive,
            })),
        });
    } catch (error) {
        console.error('Error listing courses for golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/settings/no-show-types - the no-show transaction types for
// the Cancellation & No-show picker (same module; no Transaction Type menu
// grant needed - mirror of the courses picker).
// GET /api/golf/settings/rule-targets - the pickers of the playing-right and
// round-quota editors: the club's active player types and affiliated clubs
// (served here so the screen needs neither master's grant).
exports.getRuleTargets = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [types, clubs] = await Promise.all([
            playerTypes.catalog(companyId, { activeOnly: true }),
            AffiliatedClub.findAll({ where: { companyId, isActive: true }, attributes: ['id', 'code', 'name', 'kind'], order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
        ]);
        res.status(200).json({
            playerTypes: types.map((t) => ({ id: t.id, code: t.code, description: t.description, baseIdentity: t.baseIdentity })),
            affiliatedClubs: clubs.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind })),
            periods: QUOTA_PERIODS,
        });
    } catch (error) {
        console.error('Error listing rule targets for golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getNoShowTypes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const types = await GolfTransactionType.findAll({
            where: { companyId, chargeType: 'no-show' },
            attributes: ['id', 'transactionType', 'description', 'isActive'],
            order: [['transactionType', 'ASC']],
        });
        res.status(200).json({
            types: types.map((t) => ({
                id: t.id, transactionType: t.transactionType, description: t.description, isActive: t.isActive,
            })),
        });
    } catch (error) {
        console.error('Error listing no-show types for golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Validate scoped exception rows (shared by the minimum-players and
// guest-control editors): course/day-scope/time-band parsing, plus the
// overlap rule - rows with IDENTICAL (course, dayScope) must not overlap in
// time (at most one whole-day row per key, bands within a key must not
// intersect). Cross-specificity overlaps are allowed - resolution picks the
// most specific. `parseLine(line)` returns { error } or { fields } with the
// editor-specific payload. Returns { error } or { rules }.
function normalizeScopedRules(raw, knownCourseIds, noun, parseLine) {
    if (raw.length > 200) return { error: `Too many ${noun} rules.` };
    const rules = [];
    for (const line of raw) {
        if (!line || typeof line !== 'object') return { error: `Invalid ${noun} rule line.` };
        const courseId = line.courseId ? String(line.courseId) : null;
        if (courseId && !knownCourseIds.has(courseId)) return { error: `A ${noun} rule is not one of this company's courses.` };
        const dayScope = String(line.dayScope || '');
        if (!DAY_SCOPES.includes(dayScope)) return { error: `Each ${noun} rule needs a day scope (all, weekday, weekend or a specific day).` };
        const hasStart = line.startTime !== null && line.startTime !== undefined && line.startTime !== '';
        const hasEnd = line.endTime !== null && line.endTime !== undefined && line.endTime !== '';
        if (hasStart !== hasEnd) return { error: `A ${noun} rule time band needs both From and To times (or neither for the whole day).` };
        let startTime = null;
        let endTime = null;
        if (hasStart) {
            startTime = parseTime(line.startTime);
            endTime = parseTime(line.endTime);
            if (!startTime || !endTime) return { error: `${noun[0].toUpperCase()}${noun.slice(1)} rule times must be valid times of day.` };
            if (startTime >= endTime) return { error: `A ${noun} rule's From time must be before its To time.` };
        }
        const parsed = parseLine(line);
        if (parsed.error) return { error: parsed.error };
        rules.push({ courseId, dayScope, startTime, endTime, ...parsed.fields });
    }
    const byKey = new Map();
    for (const r of rules) {
        const key = `${r.courseId || '*'}|${r.dayScope}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(r);
    }
    for (const group of byKey.values()) {
        const wholeDay = group.filter((r) => !r.startTime);
        if (wholeDay.length > 1) return { error: `Two ${noun} rules cover the same course and day scope for the whole day.` };
        const bands = group.filter((r) => r.startTime).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
        for (let i = 1; i < bands.length; i += 1) {
            if (bands[i].startTime < bands[i - 1].endTime) return { error: `Two ${noun} rules for the same course and day scope have overlapping time bands.` };
        }
    }
    return { rules };
}

function normalizeMinPlayerRules(raw, knownCourseIds) {
    return normalizeScopedRules(raw, knownCourseIds, 'minimum-player', (line) => {
        const minPlayers = parseIntIn(line.minPlayers, 1, 10);
        if (minPlayers === undefined) return { error: 'Minimum players must be a whole number between 1 and 10.' };
        return { fields: { minPlayers } };
    });
}

function normalizeGuestControlRules(raw, knownCourseIds) {
    return normalizeScopedRules(raw, knownCourseIds, 'guest-control', (line) => ({
        fields: { allowGuest: line.allowGuest === true, allowMemberGuest: line.allowMemberGuest === true },
    }));
}

// Parse a handicap index value (0.0 - 54.0, one decimal). Returns undefined
// when invalid.
function parseHandicap(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 54) return undefined;
    return Math.round(n * 10) / 10;
}

function parseHoles(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (n !== 9 && n !== 18) return undefined;
    return n;
}

// Handicap LIMIT rules (procedure 2.1): no time band; at most one rule per
// (course, dayScope, holes, gender) key.
function normalizeHandicapLimitRules(raw, knownCourseIds) {
    if (raw.length > 200) return { error: 'Too many handicap limit rules.' };
    const rules = [];
    const seen = new Set();
    for (const line of raw) {
        if (!line || typeof line !== 'object') return { error: 'Invalid handicap limit rule line.' };
        const courseId = line.courseId ? String(line.courseId) : null;
        if (courseId && !knownCourseIds.has(courseId)) return { error: 'A handicap limit rule is not one of this company\'s courses.' };
        const dayScope = String(line.dayScope || '');
        if (!DAY_SCOPES.includes(dayScope)) return { error: 'Each handicap limit rule needs a day scope.' };
        const holes = parseHoles(line.holes);
        if (holes === undefined) return { error: 'A handicap limit rule\'s holes must be 9, 18 or Any.' };
        const gender = String(line.gender || 'any');
        if (!['men', 'women', 'any'].includes(gender)) return { error: 'A handicap limit rule\'s gender must be Men, Women or Any.' };
        const maxHandicap = parseHandicap(line.maxHandicap);
        if (maxHandicap === undefined) return { error: 'A handicap limit rule\'s maximum must be between 0.0 and 54.0.' };
        let latestTeeOff = null;
        if (line.latestTeeOff !== null && line.latestTeeOff !== undefined && line.latestTeeOff !== '') {
            latestTeeOff = parseTime(line.latestTeeOff);
            if (!latestTeeOff) return { error: 'A handicap limit rule\'s latest tee-off must be a valid time of day.' };
        }
        const key = `${courseId || '*'}|${dayScope}|${holes === null ? '*' : holes}|${gender}`;
        if (seen.has(key)) return { error: 'Two handicap limit rules cover the same course, day scope, holes and gender.' };
        seen.add(key);
        rules.push({ courseId, dayScope, holes, gender, maxHandicap, latestTeeOff, isActive: true });
    }
    return { rules };
}

// Handicap ACCOMPANIMENT rules (procedure 2.2/2.3): optional time band; rows
// with identical (course, dayScope, holes) must not overlap in time.
function normalizeHandicapAccompanimentRules(raw, knownCourseIds) {
    if (raw.length > 200) return { error: 'Too many accompaniment rules.' };
    const rules = [];
    for (const line of raw) {
        if (!line || typeof line !== 'object') return { error: 'Invalid accompaniment rule line.' };
        const courseId = line.courseId ? String(line.courseId) : null;
        if (courseId && !knownCourseIds.has(courseId)) return { error: 'An accompaniment rule is not one of this company\'s courses.' };
        const dayScope = String(line.dayScope || '');
        if (!DAY_SCOPES.includes(dayScope)) return { error: 'Each accompaniment rule needs a day scope.' };
        const holes = parseHoles(line.holes);
        if (holes === undefined) return { error: 'An accompaniment rule\'s holes must be 9, 18 or Any.' };
        const hasStart = line.startTime !== null && line.startTime !== undefined && line.startTime !== '';
        const hasEnd = line.endTime !== null && line.endTime !== undefined && line.endTime !== '';
        if (hasStart !== hasEnd) return { error: 'An accompaniment rule time band needs both From and To times (or neither for the whole day).' };
        let startTime = null;
        let endTime = null;
        if (hasStart) {
            startTime = parseTime(line.startTime);
            endTime = parseTime(line.endTime);
            if (!startTime || !endTime) return { error: 'Accompaniment rule times must be valid times of day.' };
            if (startTime >= endTime) return { error: 'An accompaniment rule\'s From time must be before its To time.' };
        }
        const appliesToBeginner = line.appliesToBeginner === true;
        const appliesToProvisional = line.appliesToProvisional === true;
        if (!appliesToBeginner && !appliesToProvisional) return { error: 'An accompaniment rule must target beginners, provisional golfers, or both.' };
        const minCompanions = parseIntIn(line.minCompanions, 1, 3);
        if (minCompanions === undefined) return { error: 'An accompaniment rule\'s companions count must be between 1 and 3.' };
        const companionMaxHandicapMen = parseHandicap(line.companionMaxHandicapMen);
        if (companionMaxHandicapMen === undefined) return { error: 'The companion cap for men must be between 0.0 and 54.0.' };
        const companionMaxHandicapWomen = parseHandicap(line.companionMaxHandicapWomen);
        if (companionMaxHandicapWomen === undefined) return { error: 'The companion cap for ladies must be between 0.0 and 54.0.' };
        let latestTeeOff = null;
        if (line.latestTeeOff !== null && line.latestTeeOff !== undefined && line.latestTeeOff !== '') {
            latestTeeOff = parseTime(line.latestTeeOff);
            if (!latestTeeOff) return { error: 'An accompaniment rule\'s latest tee-off must be a valid time of day.' };
        }
        rules.push({
            courseId, dayScope, holes, startTime, endTime,
            appliesToBeginner, appliesToProvisional, minCompanions,
            companionMaxHandicapMen, companionMaxHandicapWomen, latestTeeOff, isActive: true,
        });
    }
    const byKey = new Map();
    for (const r of rules) {
        const key = `${r.courseId || '*'}|${r.dayScope}|${r.holes === null ? '*' : r.holes}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(r);
    }
    for (const group of byKey.values()) {
        const wholeDay = group.filter((r) => !r.startTime);
        if (wholeDay.length > 1) return { error: 'Two accompaniment rules cover the same course, day scope and holes for the whole day.' };
        const bands = group.filter((r) => r.startTime).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
        for (let i = 1; i < bands.length; i += 1) {
            if (bands[i].startTime < bands[i - 1].endTime) return { error: 'Two accompaniment rules for the same course, day scope and holes have overlapping time bands.' };
        }
    }
    return { rules };
}

// The target of a playing-right / round-quota row: exactly one of a player
// type (optionally refined to a membership type of a member-base type) or an
// affiliated club. Returns { fields } or { error }.
function parseRuleTarget(line, noun, { typesById, clubIds, membershipTypeIds }) {
    const playerTypeId = line.playerTypeId ? String(line.playerTypeId) : null;
    const affiliatedClubId = line.affiliatedClubId ? String(line.affiliatedClubId) : null;
    const membershipTypeId = line.membershipTypeId ? String(line.membershipTypeId) : null;
    if (!!playerTypeId === !!affiliatedClubId) return { error: `Each ${noun} rule targets either a player type or an affiliated club.` };
    if (affiliatedClubId && !clubIds.has(affiliatedClubId)) return { error: `A ${noun} rule names an affiliated club that is not one of this company's.` };
    if (playerTypeId && !typesById.has(playerTypeId)) return { error: `A ${noun} rule names a player type that is not one of this company's.` };
    if (membershipTypeId) {
        if (!playerTypeId) return { error: `A ${noun} rule for an affiliated club cannot name a membership type.` };
        const base = typesById.get(playerTypeId).baseIdentity;
        if (base !== 'member' && base !== 'member-guest') return { error: `A ${noun} rule can name a membership type only for a member-base player type.` };
        if (!membershipTypeIds.has(membershipTypeId)) return { error: `A ${noun} rule names a membership type that is not one of this company's.` };
    }
    return { fields: { playerTypeId, affiliatedClubId, membershipTypeId } };
}

// Playing-right rows (whitelist): the scoped shape + target + validity window.
function normalizePlayingRightRules(raw, knownCourseIds, targets) {
    if (raw.length > 400) return { error: 'Too many playing-right rules.' };
    const rules = [];
    for (const line of raw) {
        if (!line || typeof line !== 'object') return { error: 'Invalid playing-right rule line.' };
        const courseId = line.courseId ? String(line.courseId) : null;
        if (courseId && !knownCourseIds.has(courseId)) return { error: 'A playing-right rule is not one of this company\'s courses.' };
        const dayScope = String(line.dayScope || '');
        if (!DAY_SCOPES.includes(dayScope)) return { error: 'Each playing-right rule needs a day scope (all, weekday, weekend or a specific day).' };
        const hasStart = line.startTime !== null && line.startTime !== undefined && line.startTime !== '';
        const hasEnd = line.endTime !== null && line.endTime !== undefined && line.endTime !== '';
        if (hasStart !== hasEnd) return { error: 'A playing-right rule time band needs both From and To times (or neither for the whole day).' };
        let startTime = null;
        let endTime = null;
        if (hasStart) {
            startTime = parseTime(line.startTime);
            endTime = parseTime(line.endTime);
            if (!startTime || !endTime) return { error: 'Playing-right rule times must be valid times of day.' };
            if (startTime >= endTime) return { error: 'A playing-right rule\'s From time must be before its To time.' };
        }
        const effectiveFrom = line.effectiveFrom ? String(line.effectiveFrom) : null;
        const effectiveTo = line.effectiveTo ? String(line.effectiveTo) : null;
        const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
        if ((effectiveFrom && !DATE_RE.test(effectiveFrom)) || (effectiveTo && !DATE_RE.test(effectiveTo))) return { error: 'Playing-right rule dates must be valid dates.' };
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) return { error: 'A playing-right rule cannot end before it starts.' };
        const target = parseRuleTarget(line, 'playing-right', targets);
        if (target.error) return { error: target.error };
        rules.push({ ...target.fields, courseId, dayScope, startTime, endTime, effectiveFrom, effectiveTo, sortOrder: rules.length + 1 });
    }
    return { rules };
}

// Round-quota rows: target + day scope + period + caps; one row per
// (target, membership type, day scope, period) - the resolver picks by
// specificity, duplicates would be ambiguous.
function normalizeRoundQuotaRules(raw, targets) {
    if (raw.length > 400) return { error: 'Too many round-quota rules.' };
    const rules = [];
    const seen = new Set();
    for (const line of raw) {
        if (!line || typeof line !== 'object') return { error: 'Invalid round-quota rule line.' };
        const dayScope = String(line.dayScope || '');
        if (!DAY_SCOPES.includes(dayScope)) return { error: 'Each round-quota rule needs a day scope (all, weekday, weekend or a specific day).' };
        const period = String(line.period || '');
        if (!QUOTA_PERIOD_KEYS.includes(period)) return { error: 'Each round-quota rule needs a period (per week, month or year).' };
        const maxRounds = parseIntIn(line.maxRounds, 1, 999);
        if (maxRounds === undefined) return { error: 'Maximum rounds must be a whole number between 1 and 999.' };
        let maxGuestRounds = null;
        if (line.maxGuestRounds !== null && line.maxGuestRounds !== undefined && line.maxGuestRounds !== '') {
            maxGuestRounds = parseIntIn(line.maxGuestRounds, 0, 999);
            if (maxGuestRounds === undefined) return { error: 'Maximum guest rounds must be a whole number between 0 and 999, or blank.' };
        }
        const target = parseRuleTarget(line, 'round-quota', targets);
        if (target.error) return { error: target.error };
        const key = `${target.fields.playerTypeId || ''}|${target.fields.affiliatedClubId || ''}|${target.fields.membershipTypeId || ''}|${dayScope}|${period}`;
        if (seen.has(key)) return { error: 'Two round-quota rules name the same target, membership type, day scope and period.' };
        seen.add(key);
        rules.push({ ...target.fields, dayScope, period, maxRounds, maxGuestRounds, sortOrder: rules.length + 1 });
    }
    return { rules };
}

// PUT /api/golf/settings - upsert the singleton + replace the override lines
// atomically. Overrides are accepted (and stored) even while the flag is OFF,
// so a club can stage them; they only take EFFECT while the flag is ON.
exports.save = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const advanceBookingDays = parseIntIn(req.body.advanceBookingDays, 0, 365);
        if (advanceBookingDays === undefined) return res.status(400).json({ message: 'Advance booking days must be a whole number between 0 and 365.' });
        const advanceBookingHours = parseIntIn(req.body.advanceBookingHours, 0, 23);
        if (advanceBookingHours === undefined) return res.status(400).json({ message: 'Advance booking hours must be a whole number between 0 and 23.' });
        const allowMembershipTypeOverride = req.body.allowMembershipTypeOverride === true;
        const allowBookingMerge = req.body.allowBookingMerge === true;
        const minPlayersWeekday = parseIntIn(req.body.minPlayersWeekday, 1, 10);
        if (minPlayersWeekday === undefined) return res.status(400).json({ message: 'Weekday minimum players must be a whole number between 1 and 10.' });
        const minPlayersWeekend = parseIntIn(req.body.minPlayersWeekend, 1, 10);
        if (minPlayersWeekend === undefined) return res.status(400).json({ message: 'Weekend minimum players must be a whole number between 1 and 10.' });
        const bookingLockMinutes = parseIntIn(req.body.bookingLockMinutes, 1, 60);
        if (bookingLockMinutes === undefined) return res.status(400).json({ message: 'Booking lock minutes must be a whole number between 1 and 60.' });
        const bookingLimitWeekday = BOOKING_LIMITS.includes(req.body.bookingLimitWeekday) ? req.body.bookingLimitWeekday : undefined;
        if (!bookingLimitWeekday) return res.status(400).json({ message: 'Weekday booking limit must be No limit, One per day or One per session.' });
        const bookingLimitWeekend = BOOKING_LIMITS.includes(req.body.bookingLimitWeekend) ? req.body.bookingLimitWeekend : undefined;
        if (!bookingLimitWeekend) return res.status(400).json({ message: 'Weekend booking limit must be No limit, One per day or One per session.' });
        const allowSameDayBooking = req.body.allowSameDayBooking === true;

        // Golf Sessions: named, non-overlapping time bands (end exclusive).
        // Stored even while neither limit uses 'session' so a club can stage
        // them; a 'session' limit with NO bands simply constrains nothing.
        const rawSessions = Array.isArray(req.body.sessions) ? req.body.sessions : [];
        if (rawSessions.length > 20) return res.status(400).json({ message: 'Too many sessions.' });
        const sessions = [];
        const sessionNames = new Set();
        for (const line of rawSessions) {
            if (!line || typeof line !== 'object') return res.status(400).json({ message: 'Invalid session line.' });
            const name = typeof line.name === 'string' ? line.name.trim() : '';
            if (!name || name.length > 50) return res.status(400).json({ message: 'Every session needs a name (up to 50 characters).' });
            if (sessionNames.has(name.toLowerCase())) return res.status(400).json({ message: `Session '${name}' appears more than once.` });
            sessionNames.add(name.toLowerCase());
            const startTime = parseTime(line.startTime);
            const endTime = parseTime(line.endTime);
            if (!startTime || !endTime) return res.status(400).json({ message: `Session '${name}' needs valid From and Until times.` });
            if (startTime >= endTime) return res.status(400).json({ message: `Session '${name}': the From time must be before the Until time.` });
            sessions.push({ name, startTime, endTime });
        }
        const ordered = [...sessions].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
        for (let i = 1; i < ordered.length; i += 1) {
            if (ordered[i].startTime < ordered[i - 1].endTime) {
                return res.status(400).json({ message: `Sessions '${ordered[i - 1].name}' and '${ordered[i].name}' overlap.` });
            }
        }
        ordered.forEach((s, i) => { s.sequence = i + 1; });
        if ((bookingLimitWeekday === 'session' || bookingLimitWeekend === 'session') && !sessions.length) {
            return res.status(400).json({ message: 'Define at least one session before limiting bookings per session.' });
        }
        const guestControlEnabled = req.body.guestControlEnabled === true;
        const allowGuestWeekday = req.body.allowGuestWeekday !== false;
        const allowMemberGuestWeekday = req.body.allowMemberGuestWeekday !== false;
        const allowGuestWeekend = req.body.allowGuestWeekend !== false;
        const allowMemberGuestWeekend = req.body.allowMemberGuestWeekend !== false;

        const raw = Array.isArray(req.body.overrides) ? req.body.overrides : [];
        if (raw.length > 100) return res.status(400).json({ message: 'Too many override lines.' });
        const typeIds = raw.map((o) => (o && typeof o.membershipTypeId === 'string' ? o.membershipTypeId : ''));
        if (typeIds.some((id) => !id)) return res.status(400).json({ message: 'Every override line needs a membership type.' });
        if (new Set(typeIds).size !== typeIds.length) return res.status(400).json({ message: 'A membership type can only have one override line.' });

        const known = new Map((await listMembershipTypes(companyId, { activeOnly: false })).map((t) => [t.id, t]));
        const overrides = [];
        for (const line of raw) {
            const type = known.get(line.membershipTypeId);
            if (!type) return res.status(400).json({ message: 'An override line is not one of this company\'s membership types.' });
            const days = parseIntIn(line.advanceBookingDays, 0, 365);
            if (days === undefined) return res.status(400).json({ message: `Override days for '${type.category}' must be a whole number between 0 and 365.` });
            overrides.push({ membershipTypeId: line.membershipTypeId, advanceBookingDays: days });
        }

        const knownCourseIds = new Set((await Course.findAll({ where: { companyId }, attributes: ['id'] })).map((c) => c.id));
        const ruleResult = normalizeMinPlayerRules(Array.isArray(req.body.minPlayerRules) ? req.body.minPlayerRules : [], knownCourseIds);
        if (ruleResult.error) return res.status(400).json({ message: ruleResult.error });
        const minPlayerRules = ruleResult.rules;
        const guestResult = normalizeGuestControlRules(Array.isArray(req.body.guestControlRules) ? req.body.guestControlRules : [], knownCourseIds);
        if (guestResult.error) return res.status(400).json({ message: guestResult.error });
        const guestControlRules = guestResult.rules;
        const handicapControlEnabled = req.body.handicapControlEnabled === true;
        const juniorBookingControlEnabled = req.body.juniorBookingControlEnabled === true;

        // Cancellation notice + no-show penalty (user decisions 2026-10-06).
        // The type is stored even while the control is OFF (staging), but
        // switching ON requires a usable no-show type so the first late
        // cancel never fails with a configuration error.
        const noShowControlEnabled = req.body.noShowControlEnabled === true;
        const cancellationNoticeHours = parseIntIn(req.body.cancellationNoticeHours, 0, 720);
        if (cancellationNoticeHours === undefined) return res.status(400).json({ message: 'Cancellation notice must be a whole number of hours between 0 and 720.' });
        const lateCancellationAction = LATE_CANCELLATION_ACTION_KEYS.includes(req.body.lateCancellationAction) ? req.body.lateCancellationAction : undefined;
        if (!lateCancellationAction) return res.status(400).json({ message: 'Late cancellation must either charge the penalty or refuse the cancellation.' });
        const noShowChargeBasis = NO_SHOW_CHARGE_BASIS_KEYS.includes(req.body.noShowChargeBasis) ? req.body.noShowChargeBasis : undefined;
        if (!noShowChargeBasis) return res.status(400).json({ message: 'No-show charge basis must be per player or per booking.' });
        const noShowTransactionTypeId = typeof req.body.noShowTransactionTypeId === 'string' && req.body.noShowTransactionTypeId ? req.body.noShowTransactionTypeId : null;
        if (noShowTransactionTypeId) {
            const type = await GolfTransactionType.findOne({ where: { companyId, id: noShowTransactionTypeId }, attributes: ['id', 'chargeType', 'isActive'] });
            if (!type || type.chargeType !== 'no-show') return res.status(400).json({ message: 'The no-show charge must be one of this company\'s No Show Charges transaction types.' });
            if (noShowControlEnabled && type.isActive !== true) return res.status(400).json({ message: 'The no-show transaction type is inactive - pick an active one before switching the control on.' });
        } else if (noShowControlEnabled) {
            return res.status(400).json({ message: 'Pick the no-show transaction type before switching cancellation & no-show control on.' });
        }
        // Rain checks (user decisions 2026-10-15): the knobs are stored even
        // while the switch is OFF (staging); the desk door opens only ON.
        const rainCheckEnabled = req.body.rainCheckEnabled === true;
        const rainCheckValidityDays = parseIntIn(req.body.rainCheckValidityDays === undefined ? DEFAULTS.rainCheckValidityDays : req.body.rainCheckValidityDays, 1, 730);
        if (rainCheckValidityDays === undefined) return res.status(400).json({ message: 'Rain check validity must be a whole number of days between 1 and 730.' });
        const rainCheckBasis = RAIN_CHECK_BASIS_KEYS.includes(req.body.rainCheckBasis) ? req.body.rainCheckBasis : (req.body.rainCheckBasis === undefined ? 'green-fee' : undefined);
        if (!rainCheckBasis) return res.status(400).json({ message: 'The rain check value basis must be the green-fee lines or the whole bill.' });
        const rainCheckProrate = req.body.rainCheckProrate !== false;
        // Playing rights + round quotas (2026-10-15): the rows are stored even
        // while the switch is OFF (staging); effective only ON.
        const playingRightsEnabled = req.body.playingRightsEnabled === true;
        const ruleTypes = await playerTypes.catalog(companyId);
        const ruleTargets = {
            typesById: new Map(ruleTypes.map((t) => [t.id, t])),
            clubIds: new Set((await AffiliatedClub.findAll({ where: { companyId }, attributes: ['id'] })).map((c) => c.id)),
            membershipTypeIds: new Set((await listMembershipTypes(companyId)).map((t) => t.id)),
        };
        const rightsResult = normalizePlayingRightRules(Array.isArray(req.body.playingRightRules) ? req.body.playingRightRules : [], knownCourseIds, ruleTargets);
        if (rightsResult.error) return res.status(400).json({ message: rightsResult.error });
        const playingRightRules = rightsResult.rules;
        const quotaResult = normalizeRoundQuotaRules(Array.isArray(req.body.roundQuotaRules) ? req.body.roundQuotaRules : [], ruleTargets);
        if (quotaResult.error) return res.status(400).json({ message: quotaResult.error });
        const roundQuotaRules = quotaResult.rules;
        // Group booking control (user decisions 2026-10-11): the timers are
        // stored even while the control is OFF (staging), they only run ON.
        const groupBookingControlEnabled = req.body.groupBookingControlEnabled === true;
        const groupTentativeHoldHours = parseIntIn(req.body.groupTentativeHoldHours === undefined ? DEFAULTS.groupTentativeHoldHours : req.body.groupTentativeHoldHours, 0, 720);
        if (groupTentativeHoldHours === undefined) return res.status(400).json({ message: 'Tentative hold must be a whole number of hours between 0 and 720.' });
        const groupDepositDueDays = parseIntIn(req.body.groupDepositDueDays === undefined ? DEFAULTS.groupDepositDueDays : req.body.groupDepositDueDays, 0, 365);
        if (groupDepositDueDays === undefined) return res.status(400).json({ message: 'Deposit due must be a whole number of days between 0 and 365.' });
        const groupDefaultDepositPct = parseIntIn(req.body.groupDefaultDepositPct === undefined ? DEFAULTS.groupDefaultDepositPct : req.body.groupDefaultDepositPct, 0, 100);
        if (groupDefaultDepositPct === undefined) return res.status(400).json({ message: 'Default deposit must be a whole percentage between 0 and 100.' });
        const groupShareCapWeekday = parseIntIn(req.body.groupShareCapWeekday === undefined ? 0 : req.body.groupShareCapWeekday, 0, 100);
        if (groupShareCapWeekday === undefined) return res.status(400).json({ message: 'The weekday group share cap must be a whole percentage between 0 and 100.' });
        const groupShareCapWeekend = parseIntIn(req.body.groupShareCapWeekend === undefined ? 0 : req.body.groupShareCapWeekend, 0, 100);
        if (groupShareCapWeekend === undefined) return res.status(400).json({ message: 'The weekend group share cap must be a whole percentage between 0 and 100.' });
        const groupMaxTentativePerUser = parseIntIn(req.body.groupMaxTentativePerUser === undefined ? 0 : req.body.groupMaxTentativePerUser, 0, 50);
        if (groupMaxTentativePerUser === undefined) return res.status(400).json({ message: 'The tentative bookings per user cap must be a whole number between 0 and 50.' });
        const groupNextInLineHours = parseIntIn(req.body.groupNextInLineHours === undefined ? DEFAULTS.groupNextInLineHours : req.body.groupNextInLineHours, 1, 168);
        if (groupNextInLineHours === undefined) return res.status(400).json({ message: 'Next in line must be a whole number of hours between 1 and 168.' });
        const HEX_RE = /^#[0-9a-fA-F]{6}$/;
        const colors = {};
        for (const key of ['teeSheetColorBooked', 'teeSheetColorRegistered', 'teeSheetColorBilled', 'teeSheetColorSettled']) {
            const v = req.body[key] !== undefined && req.body[key] !== null && req.body[key] !== '' ? String(req.body[key]) : DEFAULTS[key];
            if (!HEX_RE.test(v)) return res.status(400).json({ message: 'Tee-sheet colours must be #rrggbb values.' });
            colors[key] = v.toLowerCase();
        }
        const limitResult = normalizeHandicapLimitRules(Array.isArray(req.body.handicapLimitRules) ? req.body.handicapLimitRules : [], knownCourseIds);
        if (limitResult.error) return res.status(400).json({ message: limitResult.error });
        const handicapLimitRules = limitResult.rules;
        const accResult = normalizeHandicapAccompanimentRules(Array.isArray(req.body.handicapAccompanimentRules) ? req.body.handicapAccompanimentRules : [], knownCourseIds);
        if (accResult.error) return res.status(400).json({ message: accResult.error });
        const handicapAccompanimentRules = accResult.rules;

        const callerId = getUserContext(req).userId;
        const placement = await getCallerPlacement(req);
        const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };

        await sequelize.transaction(async (transaction) => {
            const existing = await GolfSetting.findOne({ where: { companyId }, transaction });
            const values = {
                advanceBookingDays, advanceBookingHours, allowMembershipTypeOverride, allowBookingMerge,
                minPlayersWeekday, minPlayersWeekend, bookingLockMinutes, bookingLimitWeekday, bookingLimitWeekend, allowSameDayBooking,
                guestControlEnabled, allowGuestWeekday, allowMemberGuestWeekday, allowGuestWeekend, allowMemberGuestWeekend,
                handicapControlEnabled, juniorBookingControlEnabled,
                noShowControlEnabled, cancellationNoticeHours, lateCancellationAction, noShowTransactionTypeId, noShowChargeBasis,
                rainCheckEnabled, rainCheckValidityDays, rainCheckBasis, rainCheckProrate,
                playingRightsEnabled,
                groupBookingControlEnabled, groupTentativeHoldHours, groupDepositDueDays, groupDefaultDepositPct,
                groupShareCapWeekday, groupShareCapWeekend, groupMaxTentativePerUser, groupNextInLineHours,
                ...colors,
            };
            if (existing) {
                Object.assign(existing, { ...values, updatedBy: callerId });
                await existing.save({ transaction });
            } else {
                await GolfSetting.create({ companyId, ...values, ...stamps }, { transaction });
            }
            await AdvanceBookingOverride.destroy({ where: { companyId }, transaction });
            if (overrides.length) {
                await AdvanceBookingOverride.bulkCreate(
                    overrides.map((o) => ({ ...o, companyId, ...stamps })),
                    { transaction },
                );
            }
            await MinPlayerRule.destroy({ where: { companyId }, transaction });
            if (minPlayerRules.length) {
                await MinPlayerRule.bulkCreate(
                    minPlayerRules.map((r) => ({ ...r, companyId, ...stamps })),
                    { transaction },
                );
            }
            await GuestControlRule.destroy({ where: { companyId }, transaction });
            if (guestControlRules.length) {
                await GuestControlRule.bulkCreate(
                    guestControlRules.map((r) => ({ ...r, companyId, ...stamps })),
                    { transaction },
                );
            }
            await HandicapLimitRule.destroy({ where: { companyId }, transaction });
            if (handicapLimitRules.length) {
                await HandicapLimitRule.bulkCreate(
                    handicapLimitRules.map((r) => ({ ...r, companyId, ...stamps })),
                    { transaction },
                );
            }
            await HandicapAccompanimentRule.destroy({ where: { companyId }, transaction });
            if (handicapAccompanimentRules.length) {
                await HandicapAccompanimentRule.bulkCreate(
                    handicapAccompanimentRules.map((r) => ({ ...r, companyId, ...stamps })),
                    { transaction },
                );
            }
            await PlayingRightRule.destroy({ where: { companyId }, transaction });
            if (playingRightRules.length) {
                await PlayingRightRule.bulkCreate(playingRightRules.map((r) => ({ ...r, companyId, ...stamps })), { transaction });
            }
            await RoundQuotaRule.destroy({ where: { companyId }, transaction });
            if (roundQuotaRules.length) {
                await RoundQuotaRule.bulkCreate(roundQuotaRules.map((r) => ({ ...r, companyId, ...stamps })), { transaction });
            }
            await GolfSession.destroy({ where: { companyId }, transaction });
            if (ordered.length) {
                await GolfSession.bulkCreate(
                    ordered.map((s) => ({ ...s, companyId, ...stamps })),
                    { transaction },
                );
            }
        });

        res.status(200).json({ message: 'Golf specification saved.' });
    } catch (error) {
        console.error('Error saving golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
