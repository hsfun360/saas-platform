// Golfers master (Golf Management → /golf/golfers; user decisions
// 2026-09-29). The maintenance surface for the golf-owned handicap fields on
// golf.Golfer - handicap index + handicap status - which the handicap
// control rules read. Golfer identity rows are created LAZILY by the booking
// and front-desk flows; this screen only edits what golf owns (index,
// status, remarks, active flag) - the person's profile stays at its source.

const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const Golfer = require('./golfer.model');
const { GOLFER_TYPES, HANDICAP_STATUSES, HANDICAP_STATUS_KEYS } = require('./golfer.constants');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function golferDto(g) {
    return {
        id: g.id,
        golferType: g.golferType,
        name: g.name,
        memberNo: g.memberNo,
        handicapIndex: g.handicapIndex === null || g.handicapIndex === undefined ? null : Number(g.handicapIndex),
        handicapStatus: g.handicapStatus || null,
        remarks: g.remarks,
        isActive: g.isActive === true,
        canModify: g.get ? g.get('canModify') : undefined,
    };
}

// GET /api/golf/golfers - every golfer identity of the company (client-side
// search; club volumes are small).
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await Golfer.findAll({
            where: { companyId },
            order: [['name', 'ASC']],
        });
        await annotateCanModify(req, rows);
        res.status(200).json({
            golfers: rows.map(golferDto),
            golferTypes: GOLFER_TYPES,
            handicapStatuses: HANDICAP_STATUSES,
        });
    } catch (error) {
        console.error('Error listing golfers:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/golfers/:id { handicapIndex?, handicapStatus?, remarks?,
// isActive? } - only the golf-owned fields; name/memberNo stay snapshots of
// the profile source.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Golfer.findOne({ where: { companyId, id: req.params.id } });
        if (!row) return res.status(404).json({ message: 'Golfer not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });

        if (req.body.handicapIndex !== undefined) {
            if (req.body.handicapIndex === null || req.body.handicapIndex === '') {
                row.handicapIndex = null;
            } else {
                const n = Number(req.body.handicapIndex);
                if (!Number.isFinite(n) || n < 0 || n > 54) return res.status(400).json({ message: 'Handicap index must be between 0.0 and 54.0.' });
                row.handicapIndex = Math.round(n * 10) / 10;
            }
        }
        if (req.body.handicapStatus !== undefined) {
            if (req.body.handicapStatus === null || req.body.handicapStatus === '') {
                row.handicapStatus = null;
            } else {
                const status = String(req.body.handicapStatus);
                if (!HANDICAP_STATUS_KEYS.includes(status)) return res.status(400).json({ message: 'Pick a handicap status.' });
                row.handicapStatus = status;
            }
        }
        if (req.body.remarks !== undefined) {
            row.remarks = req.body.remarks ? String(req.body.remarks).slice(0, 2000) : null;
        }
        if (req.body.isActive !== undefined) {
            row.isActive = req.body.isActive === true;
        }
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Golfer ${row.name} updated.`, golfer: golferDto(row) });
    } catch (error) {
        console.error('Error updating golfer:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
