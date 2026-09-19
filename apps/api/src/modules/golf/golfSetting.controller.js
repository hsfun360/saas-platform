// Golf Specification (Golf Management → /golf/settings). The per-company
// settings singleton + the advance-booking override lines. GET returns the
// effective document (defaults when never saved); PUT upserts the singleton
// and replaces the override lines atomically.

const GolfSetting = require('./golfSetting.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { listMembershipTypes } = require('../../platform/membershipGateway');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

const DEFAULTS = { advanceBookingDays: 7, advanceBookingHours: 0, allowMembershipTypeOverride: false, allowBookingMerge: false };

function settingDto(row) {
    if (!row) return { ...DEFAULTS, saved: false };
    return {
        advanceBookingDays: row.advanceBookingDays,
        advanceBookingHours: row.advanceBookingHours,
        allowMembershipTypeOverride: row.allowMembershipTypeOverride === true,
        allowBookingMerge: row.allowBookingMerge === true,
        saved: true,
    };
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

        const [row, overrides] = await Promise.all([
            GolfSetting.findOne({ where: { companyId } }),
            AdvanceBookingOverride.findAll({ where: { companyId } }),
        ]);
        res.status(200).json({
            setting: settingDto(row),
            overrides: overrides.map((o) => ({
                membershipTypeId: o.membershipTypeId,
                advanceBookingDays: o.advanceBookingDays,
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

        const callerId = getUserContext(req).userId;
        const placement = await getCallerPlacement(req);
        const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };

        await sequelize.transaction(async (transaction) => {
            const existing = await GolfSetting.findOne({ where: { companyId }, transaction });
            if (existing) {
                Object.assign(existing, { advanceBookingDays, advanceBookingHours, allowMembershipTypeOverride, allowBookingMerge, updatedBy: callerId });
                await existing.save({ transaction });
            } else {
                await GolfSetting.create({
                    companyId, advanceBookingDays, advanceBookingHours, allowMembershipTypeOverride, allowBookingMerge, ...stamps,
                }, { transaction });
            }
            await AdvanceBookingOverride.destroy({ where: { companyId }, transaction });
            if (overrides.length) {
                await AdvanceBookingOverride.bulkCreate(
                    overrides.map((o) => ({ ...o, companyId, ...stamps })),
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
