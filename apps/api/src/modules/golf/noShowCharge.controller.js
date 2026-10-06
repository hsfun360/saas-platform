// No-show Charges (Golf Management → /golf/no-show-charges; STANDALONE MENU,
// user decisions 2026-10-06). The listing of every cancellation-notice /
// no-show penalty raised against a booker, with Post (retry a pending row
// onto the booker's AR account) and Waive (reason required) - grantable on
// its own so finance can hold it without the tee-sheet or booking grants.
// Rows are RAISED elsewhere (the booking cancel and the front desk's
// no-show review); this screen never creates one.

const { Op } = require('sequelize');
const NoShowCharge = require('./noShowCharge.model');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const noShow = require('./noShowCharge.service');
const { NO_SHOW_CHARGE_STATUSES, NO_SHOW_CHARGE_STATUS_KEYS, CHARGE_REASONS } = require('./noShowCharge.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// GET /api/golf/no-show-charges?dateFrom=&dateTo=&status= - newest play
// date first; both dates optional (no filter = every row, 500 cap; the
// screen defaults to 31 days back and 31 days forward - late cancellations
// sit on FUTURE play dates).
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const where = { companyId };
        const dateFrom = String(req.query.dateFrom || '');
        const dateTo = String(req.query.dateTo || '');
        if (dateFrom && !DATE_RE.test(dateFrom)) return res.status(400).json({ message: 'Invalid from date.' });
        if (dateTo && !DATE_RE.test(dateTo)) return res.status(400).json({ message: 'Invalid to date.' });
        if (dateFrom || dateTo) {
            where.playDate = {};
            if (dateFrom) where.playDate[Op.gte] = dateFrom;
            if (dateTo) where.playDate[Op.lte] = dateTo;
        }
        const status = String(req.query.status || '');
        if (status) {
            if (!NO_SHOW_CHARGE_STATUS_KEYS.includes(status)) return res.status(400).json({ message: 'Invalid status filter.' });
            where.status = status;
        }
        const rows = await NoShowCharge.findAll({
            where,
            order: [['playDate', 'DESC'], ['createdAt', 'DESC']],
            limit: 500,
        });
        await annotateCanModify(req, rows);
        res.status(200).json({
            charges: rows.map(noShow.chargeDto),
            statuses: NO_SHOW_CHARGE_STATUSES,
            reasons: CHARGE_REASONS,
        });
    } catch (error) {
        console.error('Error listing golf no-show charges:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function findOwned(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const row = await NoShowCharge.findOne({ where: { companyId, id: req.params.id } });
    if (!row) return { status: 404, message: 'No-show charge not found.' };
    if (!(await canModifyRecord(req, row))) return { status: 403, message: "Your role's data scope does not allow amending this record." };
    return { row };
}

// POST /api/golf/no-show-charges/:id/post - retry posting a pending row.
exports.post = async (req, res) => {
    try {
        const found = await findOwned(req);
        if (!found.row) return res.status(found.status).json({ message: found.message });
        if (found.row.status !== 'pending') return res.status(400).json({ message: 'Only a pending charge can be posted.' });
        const row = await noShow.postPending(req, found.row);
        if (row.status !== 'posted') return res.status(400).json({ message: row.remarks || 'The charge could not be posted.', charge: noShow.chargeDto(row) });
        res.status(200).json({
            message: `Charge ${Number(row.totalAmount).toFixed(2)} posted to ${row.bookerName} (${row.arDocNo}).`,
            charge: noShow.chargeDto(row),
        });
    } catch (error) {
        console.error('Error posting golf no-show charge:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/no-show-charges/:id/waive { reason } - pending rows only
// (a posted charge is on the ledger; reverse it with an AR credit note).
exports.waive = async (req, res) => {
    try {
        const found = await findOwned(req);
        if (!found.row) return res.status(found.status).json({ message: found.message });
        const row = found.row;
        if (row.status !== 'pending') return res.status(400).json({ message: row.status === 'posted' ? 'This charge is already on the ledger - reverse it with an AR credit note.' : 'This charge is already waived.' });
        const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 255) : '';
        if (!reason) return res.status(400).json({ message: 'Give a reason for waiving the charge.' });
        const callerId = getUserContext(req).userId;
        row.status = 'waived';
        row.waivedAt = new Date();
        row.waivedBy = callerId;
        row.waiveReason = reason;
        row.remarks = null;
        row.updatedBy = callerId;
        await row.save();
        res.status(200).json({ message: `Charge on booking ${row.bookingNo} waived.`, charge: noShow.chargeDto(row) });
    } catch (error) {
        console.error('Error waiving golf no-show charge:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
