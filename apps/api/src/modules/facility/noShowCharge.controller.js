// No-show Charges (/facility/no-show-charges; slice 4): the listing of the
// penalties with Post (retry the AR posting of a pending row), Waive (with a
// reason; a waived no-show keeps its strike unless cleared) and Re-price.

const { Op } = require('sequelize');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const noShow = require('./noShow.service');
const { companyIdOf, DATE_RE } = require('./facilityShared');

const { NoShowCharge } = noShow;

async function findOwned(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const row = await NoShowCharge.findOne({ where: { companyId, id: req.params.id } });
    if (!row) return { status: 404, message: 'Charge not found.' };
    return { companyId, row };
}

// GET /api/facility/no-show-charges?status&from&to&q
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const where = { companyId };
        const status = String(req.query.status || '');
        if (['pending', 'posted', 'waived'].includes(status)) where.status = status;
        const from = String(req.query.from || '');
        const to = String(req.query.to || '');
        if (DATE_RE.test(from) && DATE_RE.test(to)) where.bookingDate = { [Op.between]: [from, to] };
        else if (DATE_RE.test(from)) where.bookingDate = { [Op.gte]: from };
        else if (DATE_RE.test(to)) where.bookingDate = { [Op.lte]: to };
        const q = String(req.query.q || '').trim();
        if (q) where[Op.or] = [{ bookingNo: { [Op.iLike]: `%${q}%` } }, { bookerName: { [Op.iLike]: `%${q}%` } }, { bookerMemberNo: { [Op.iLike]: `%${q}%` } }];
        const rows = await NoShowCharge.findAll({ where, order: [['bookingDate', 'DESC'], ['createdAt', 'DESC']], limit: 500 });
        await annotateCanModify(req, rows);
        const cfg = await noShow.config(companyId);
        res.status(200).json({ charges: rows.map(noShow.chargeDto), controlled: !!cfg, basis: cfg ? cfg.basis : null });
    } catch (error) {
        console.error('Error listing facility no-show charges:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/no-show-charges/:id/post
exports.post = async (req, res) => {
    try {
        const found = await findOwned(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { row } = found;
        if (row.status !== 'pending') return res.status(400).json({ message: `This charge is ${row.status}.` });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: 'You are not allowed to amend this charge.' });
        const posted = await noShow.postPending(req, row);
        if (posted.status !== 'posted') return res.status(400).json({ message: posted.remarks || 'The charge could not be posted.', charge: noShow.chargeDto(posted) });
        res.status(200).json({ message: `Charge on booking ${posted.bookingNo} posted - ${posted.arDocNo}.`, charge: noShow.chargeDto(posted) });
    } catch (error) {
        console.error('Error posting facility no-show charge:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/no-show-charges/:id/waive { reason, clearStrike }
exports.waive = async (req, res) => {
    try {
        const found = await findOwned(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { row } = found;
        if (row.status !== 'pending') return res.status(400).json({ message: row.status === 'posted' ? 'This charge is already on the ledger - reverse it with an AR credit note.' : 'This charge is already waived.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: 'You are not allowed to amend this charge.' });
        const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 255) : '';
        if (!reason) return res.status(400).json({ message: 'Give a reason for waiving the charge.' });
        const callerId = getUserContext(req).userId;
        row.status = 'waived';
        row.waivedAt = new Date();
        row.waivedBy = callerId;
        row.waiveReason = reason;
        row.remarks = null;
        if (req.body.clearStrike === true) row.strikeCounted = false;
        row.updatedBy = callerId;
        await row.save();
        res.status(200).json({ message: `Charge on booking ${row.bookingNo} waived${req.body.clearStrike === true ? ' and the strike cleared' : ''}.`, charge: noShow.chargeDto(row) });
    } catch (error) {
        console.error('Error waiving facility no-show charge:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/no-show-charges/:id/reprice
exports.reprice = async (req, res) => {
    try {
        const found = await findOwned(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, row } = found;
        if (row.status !== 'pending') return res.status(400).json({ message: `This charge is ${row.status}.` });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: 'You are not allowed to amend this charge.' });
        const cfg = await noShow.config(companyId);
        if (!cfg) return res.status(400).json({ message: 'No-show control is off on Facility Specification.' });
        const out = await noShow.reprice(req, cfg, row);
        if (out.error) return res.status(400).json({ message: out.error });
        res.status(200).json({ message: `Charge on booking ${row.bookingNo} re-priced at ${Number(row.totalAmount).toFixed(2)}.`, charge: noShow.chargeDto(row) });
    } catch (error) {
        console.error('Error re-pricing facility no-show charge:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
