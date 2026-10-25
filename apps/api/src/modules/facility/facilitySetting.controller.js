// Facility Specification (/facility/settings). The per-company settings
// singleton + the Facility Session bands. GET returns the effective document
// (defaults when never saved); PUT upserts the singleton and replaces the
// sessions atomically. Pattern of golf/golfSetting.controller.js.

const FacilitySetting = require('./facilitySetting.model');
const FacilitySession = require('./facilitySession.model');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, parseRequiredInt } = require('./facilityShared');

const DEFAULTS = {
    advanceBookingDays: 7,
    advanceBookingHours: 0,
    allowSameDayBooking: false,
    bookingLockMinutes: 5,
    guestControlEnabled: false,
    allowGuestWeekday: true,
    allowMemberGuestWeekday: true,
    allowGuestWeekend: true,
    allowMemberGuestWeekend: true,
    noShowControlEnabled: false,
    cancellationNoticeHours: 24,
};

function settingDto(row) {
    if (!row) return { ...DEFAULTS, saved: false };
    return {
        advanceBookingDays: row.advanceBookingDays,
        advanceBookingHours: row.advanceBookingHours,
        allowSameDayBooking: row.allowSameDayBooking === true,
        bookingLockMinutes: row.bookingLockMinutes,
        guestControlEnabled: row.guestControlEnabled === true,
        allowGuestWeekday: row.allowGuestWeekday === true,
        allowMemberGuestWeekday: row.allowMemberGuestWeekday === true,
        allowGuestWeekend: row.allowGuestWeekend === true,
        allowMemberGuestWeekend: row.allowMemberGuestWeekend === true,
        noShowControlEnabled: row.noShowControlEnabled === true,
        cancellationNoticeHours: row.cancellationNoticeHours,
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
        const [row, sessions] = await Promise.all([
            FacilitySetting.findOne({ where: { companyId } }),
            FacilitySession.findAll({ where: { companyId }, order: [['sequence', 'ASC'], ['startTime', 'ASC']] }),
        ]);
        res.status(200).json({ ...settingDto(row), sessions: sessions.map(sessionDto) });
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
        if (sessions[i].startTime < sessions[i - 1].endTime) {
            return { error: `Sessions '${sessions[i - 1].name}' and '${sessions[i].name}' overlap.` };
        }
    }
    sessions.forEach((s, i) => { s.sequence = i + 1; });
    return { sessions };
}

// PUT /api/facility/settings - the whole document (scalars + sessions).
exports.save = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ints = [
            ['advanceBookingDays', 0, 365, 'Advance booking days must be a whole number between 0 and 365.'],
            ['advanceBookingHours', 0, 23, 'Advance booking hours must be a whole number between 0 and 23.'],
            ['bookingLockMinutes', 1, 60, 'Booking lock minutes must be a whole number between 1 and 60.'],
            ['cancellationNoticeHours', 0, 720, 'Cancellation notice must be a whole number of hours between 0 and 720.'],
        ];
        const values = {};
        for (const [field, min, max, message] of ints) {
            const n = parseRequiredInt(req.body[field], min, max);
            if (!n.ok) return res.status(400).json({ message });
            values[field] = n.value;
        }
        for (const flag of ['allowSameDayBooking', 'guestControlEnabled', 'allowGuestWeekday', 'allowMemberGuestWeekday',
            'allowGuestWeekend', 'allowMemberGuestWeekend', 'noShowControlEnabled']) {
            values[flag] = req.body[flag] === true;
        }

        const parsed = parseSessions(req.body.sessions);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

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
            if (parsed.sessions.length) {
                await FacilitySession.bulkCreate(parsed.sessions.map((s) => ({ ...s, companyId, ...stamps })), { transaction });
            }
        });

        res.status(200).json({ message: 'Facility specification saved.' });
    } catch (error) {
        console.error('Error saving facility settings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.DEFAULTS = DEFAULTS;
