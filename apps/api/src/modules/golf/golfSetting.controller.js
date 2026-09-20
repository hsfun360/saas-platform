// Golf Specification (Golf Management → /golf/settings). The per-company
// settings singleton + the advance-booking override lines. GET returns the
// effective document (defaults when never saved); PUT upserts the singleton
// and replaces the override lines atomically.

const GolfSetting = require('./golfSetting.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const MinPlayerRule = require('./minPlayerRule.model');
const GuestControlRule = require('./guestControlRule.model');
const Course = require('./course.model');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { listMembershipTypes } = require('../../platform/membershipGateway');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

const DEFAULTS = {
    advanceBookingDays: 7, advanceBookingHours: 0, allowMembershipTypeOverride: false,
    allowBookingMerge: false, minPlayersWeekday: 1, minPlayersWeekend: 1, bookingLockMinutes: 5, oneBookingPerDay: true,
    guestControlEnabled: false, allowGuestWeekday: true, allowMemberGuestWeekday: true,
    allowGuestWeekend: true, allowMemberGuestWeekend: true,
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
        oneBookingPerDay: row.oneBookingPerDay === true,
        guestControlEnabled: row.guestControlEnabled === true,
        allowGuestWeekday: row.allowGuestWeekday === true,
        allowMemberGuestWeekday: row.allowMemberGuestWeekday === true,
        allowGuestWeekend: row.allowGuestWeekend === true,
        allowMemberGuestWeekend: row.allowMemberGuestWeekend === true,
        saved: true,
    };
}

const DAY_SCOPES = ['all', 'weekday', 'weekend'];

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

        const [row, overrides, minPlayerRules, guestControlRules] = await Promise.all([
            GolfSetting.findOne({ where: { companyId } }),
            AdvanceBookingOverride.findAll({ where: { companyId } }),
            MinPlayerRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
            GuestControlRule.findAll({ where: { companyId }, order: [['createdAt', 'ASC']] }),
        ]);
        res.status(200).json({
            setting: settingDto(row),
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
        if (!DAY_SCOPES.includes(dayScope)) return { error: `Each ${noun} rule needs a day scope (all, weekday or weekend).` };
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
        const oneBookingPerDay = req.body.oneBookingPerDay !== false;
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

        const callerId = getUserContext(req).userId;
        const placement = await getCallerPlacement(req);
        const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };

        await sequelize.transaction(async (transaction) => {
            const existing = await GolfSetting.findOne({ where: { companyId }, transaction });
            const values = {
                advanceBookingDays, advanceBookingHours, allowMembershipTypeOverride, allowBookingMerge,
                minPlayersWeekday, minPlayersWeekend, bookingLockMinutes, oneBookingPerDay,
                guestControlEnabled, allowGuestWeekday, allowMemberGuestWeekday, allowGuestWeekend, allowMemberGuestWeekend,
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
        });

        res.status(200).json({ message: 'Golf specification saved.' });
    } catch (error) {
        console.error('Error saving golf settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
