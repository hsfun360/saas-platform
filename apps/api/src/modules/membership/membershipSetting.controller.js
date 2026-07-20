// Club Specification (SRS 2.1.1 - membership system master).
// A per-company singleton the club sets once: what kind of club it is, so the
// entry screens show only the fields that apply. Modify-only like the legacy
// system master - the row is find-or-created with defaults, never listed.
//
// Membership numbering (auto/manual + format) is SURFACED here for the user's
// one-stop setup, but its single source of truth stays Numbering Control
// (Control-Plane), reached through platform/numberingGateway.js.

const {
    getUserContext,
    getCallerPlacement,
} = require('../../platform/serviceContext');
const numberingGateway = require('../../platform/numberingGateway');
const { getSettingsRow, toSettingsDto } = require('./membershipSetting.service');
const { CLUB_TYPES, CLUB_TYPE_KEYS } = require('./membershipSetting.constants');

const NUMBERING_PURPOSE = 'membership';

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// The numbering block the screen shows: the toggle + the format config.
// No scheme yet = manual (matches how membership creation treats it).
async function numberingBlock(req) {
    const scheme = await numberingGateway.getScheme(req, NUMBERING_PURPOSE);
    return {
        isMembershipAutoNumber: !!(scheme && scheme.isActive && scheme.mode === 'auto'),
        scheme,
    };
}

// GET /api/membership/settings - the singleton + numbering + vocabularies.
exports.getSettings = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await getSettingsRow(companyId);
        const numbering = await numberingBlock(req);
        res.status(200).json({
            settings: toSettingsDto(row),
            numbering,
            meta: {
                clubTypes: CLUB_TYPES,
                numbering: numberingGateway.numberingMeta(),
            },
        });
    } catch (error) {
        console.error('Error loading club specification:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/settings
// Body: { clubType, isCommittee, salesAgencyEnabled, salesExternalEnabled,
//         salesInternalEnabled, isMembershipAutoNumber }
exports.updateSettings = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const clubType = String(req.body.clubType || '').trim();
        if (!CLUB_TYPE_KEYS.includes(clubType)) return res.status(400).json({ message: 'Invalid club type.' });
        const isCommittee = req.body.isCommittee === true;

        const row = await getSettingsRow(companyId);
        row.clubType = clubType;
        row.isCommittee = isCommittee;
        // Committee clubs have no sales agents - the flags are forced false.
        row.salesAgencyEnabled = !isCommittee && req.body.salesAgencyEnabled === true;
        row.salesExternalEnabled = !isCommittee && req.body.salesExternalEnabled === true;
        row.salesInternalEnabled = !isCommittee && req.body.salesInternalEnabled === true;

        const callerId = getUserContext(req).userId;
        const placement = await getCallerPlacement(req);
        if (!row.createdBy) {
            row.createdBy = callerId;
            row.createdByDepartmentId = placement.departmentId;
        }
        row.updatedBy = callerId;
        await row.save();

        // The auto/manual toggle writes through to Numbering Control (its one
        // source of truth). Only touch the scheme when the toggle changes it.
        if (typeof req.body.isMembershipAutoNumber === 'boolean') {
            const wantMode = req.body.isMembershipAutoNumber ? 'auto' : 'manual';
            const current = await numberingGateway.getScheme(req, NUMBERING_PURPOSE);
            if (!current || current.mode !== wantMode || !current.isActive) {
                const saved = await numberingGateway.saveScheme(req, NUMBERING_PURPOSE, { mode: wantMode, isActive: true });
                if (saved.error) return res.status(400).json({ message: saved.error });
            }
        }

        const numbering = await numberingBlock(req);
        res.status(200).json({
            message: 'Club specification saved.',
            settings: toSettingsDto(row),
            numbering,
        });
    } catch (error) {
        console.error('Error saving club specification:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/settings/numbering - the Configure dialog (format only;
// the auto/manual toggle lives on the main form, the counter is untouchable).
exports.updateNumbering = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const saved = await numberingGateway.saveScheme(req, NUMBERING_PURPOSE, {
            prefix: req.body.prefix,
            format: req.body.format,
            seqPadLength: req.body.seqPadLength,
            startingNumber: req.body.startingNumber,
            resetRule: req.body.resetRule,
        });
        if (saved.error) return res.status(400).json({ message: saved.error });

        const numbering = await numberingBlock(req);
        res.status(200).json({ message: 'Membership numbering saved.', numbering });
    } catch (error) {
        console.error('Error saving membership numbering:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/settings/numbering/preview?prefix=&format=&seqPadLength=
//     &startingNumber=&resetRule= - live preview of an unsaved draft.
exports.previewNumbering = async (req, res) => {
    try {
        res.status(200).json(numberingGateway.previewScheme(req.query, { typeCode: req.query.typeCode }));
    } catch (error) {
        console.error('Error previewing membership numbering:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
