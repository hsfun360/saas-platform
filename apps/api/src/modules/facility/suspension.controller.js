// Booking Suspensions (/facility/suspensions; slice 4): the active and past
// suspensions, a manual one keyed by the office, and the early lift.

const { Op } = require('sequelize');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const noShow = require('./noShow.service');
const { bookingDateText } = require('./bookingShared');
const patrons = require('./patron.service');
const bookingRules = require('./bookingRules.service');
const FacilityType = require('./facilityType.model');
const { companyIdOf, stampsFor, DATE_RE } = require('./facilityShared');

const { PatronSuspension } = noShow;

async function today(companyId) {
    return bookingRules.clubNow(await companyTimezoneById(companyId)).date;
}

// GET /api/facility/suspensions?status
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        await noShow.expireSuspensions(companyId, await today(companyId));
        const where = { companyId };
        const status = String(req.query.status || '');
        if (['active', 'lifted', 'expired'].includes(status)) where.status = status;
        const rows = await PatronSuspension.findAll({ where, order: [['status', 'ASC'], ['toDate', 'DESC']], limit: 500 });
        await annotateCanModify(req, rows);
        const typeIds = [...new Set(rows.map((r) => r.facilityTypeId).filter(Boolean))];
        const types = typeIds.length ? await FacilityType.findAll({ where: { id: { [Op.in]: typeIds } }, attributes: ['id', 'code'] }) : [];
        const codeById = new Map(types.map((t) => [t.id, t.code]));
        res.status(200).json({
            suspensions: rows.map((r) => ({ ...noShow.suspensionDto(r), facilityTypeCode: r.facilityTypeId ? codeById.get(r.facilityTypeId) || null : null })),
            facilityTypes: (await FacilityType.findAll({ where: { companyId, isActive: true }, attributes: ['id', 'code', 'description'], order: [['code', 'ASC']] })).map((t) => ({ id: t.id, code: t.code, description: t.description })),
        });
    } catch (error) {
        console.error('Error listing facility suspensions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/suspensions { memberNo, fromDate, toDate, reason, facilityTypeId }
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const memberNo = String(req.body.memberNo || '').trim();
        const standing = memberNo ? await getGolfMemberStanding(companyId, memberNo) : null;
        if (!standing) return res.status(404).json({ message: `No member found with number '${memberNo}'.` });
        const fromDate = String(req.body.fromDate || '');
        const toDate = String(req.body.toDate || '');
        if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate) || toDate < fromDate) return res.status(400).json({ message: 'Give the first and the last day of the suspension.' });
        const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 255) : '';
        if (!reason) return res.status(400).json({ message: 'Give the reason for the suspension.' });
        let facilityTypeId = null;
        if (req.body.facilityTypeId) {
            const t = await FacilityType.findOne({ where: { companyId, id: String(req.body.facilityTypeId) } });
            if (!t) return res.status(400).json({ message: 'Pick a facility type of the active company.' });
            facilityTypeId = t.id;
        }
        const stamps = await stampsFor(req);
        const patron = await patrons.ensureMemberPatron(companyId, standing, stamps);
        const existing = await PatronSuspension.findOne({ where: { companyId, patronId: patron.id, status: 'active' } });
        if (existing) return res.status(409).json({ message: `${standing.name} is already suspended until ${bookingDateText(String(existing.toDate))} - lift it first.` });
        const row = await PatronSuspension.create({ companyId, patronId: patron.id, patronName: standing.name, memberNo: standing.memberNo, facilityTypeId, reason, fromDate, toDate, strikeChargeIds: [], status: 'active', ...stamps });
        await noShow.queueSuspensionEmail(row);
        res.status(201).json({ message: `${standing.name} suspended from booking until ${bookingDateText(toDate)}.`, suspension: noShow.suspensionDto(row) });
    } catch (error) {
        console.error('Error creating facility suspension:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/suspensions/:id/lift { reason }
exports.lift = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await PatronSuspension.findOne({ where: { companyId, id: req.params.id } });
        if (!row) return res.status(404).json({ message: 'Suspension not found.' });
        if (row.status !== 'active') return res.status(400).json({ message: `This suspension is ${row.status}.` });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: 'You are not allowed to amend this suspension.' });
        const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 255) : '';
        if (!reason) return res.status(400).json({ message: 'Give the reason for lifting the suspension.' });
        const callerId = getUserContext(req).userId;
        row.status = 'lifted';
        row.liftedAt = new Date();
        row.liftedBy = callerId;
        row.liftReason = reason;
        row.updatedBy = callerId;
        await row.save();
        res.status(200).json({ message: `${row.patronName}'s suspension lifted.`, suspension: noShow.suspensionDto(row) });
    } catch (error) {
        console.error('Error lifting facility suspension:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
