// Flat member search (the read-only Members screen) - every person the company
// knows across all memberships: individual members, nominees and dependents.
// Creation/editing happens on the Memberships screen (membership.controller.js).

const { Op } = require('sequelize');
const Member = require('./member.model');
const Membership = require('./membership.model');
const MembershipStatus = require('./membershipStatus.model');
const { getUserContext } = require('../../platform/serviceContext');
const { MEMBER_KINDS, MEMBER_KIND_KEYS, DEPENDENT_TYPES } = require('./member.constants');

const SEARCH_LIMIT = 200;

// GET /api/membership/members/meta - vocabularies + the company's statuses for
// the filter chips / status display.
exports.getMeta = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const statuses = await MembershipStatus.findAll({
            where: { companyId },
            attributes: ['id', 'membershipStatus', 'statusClass', 'statusColor'],
            order: [['membershipStatus', 'ASC']],
        });
        res.status(200).json({
            memberKinds: MEMBER_KINDS,
            dependentTypes: DEPENDENT_TYPES,
            statuses,
        });
    } catch (error) {
        console.error('Error loading members meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/members?q=&kind=&status=&offset= - server-side search by
// member no / name / IC / email, newest first, one page at a time ("Load more"
// pages through offset; type to narrow).
exports.listMembers = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId };
        const kind = typeof req.query.kind === 'string' ? req.query.kind.trim() : '';
        if (kind && MEMBER_KIND_KEYS.includes(kind)) where.memberKind = kind;
        const statusId = typeof req.query.status === 'string' ? req.query.status.trim() : '';
        if (statusId) where.memberStatusId = statusId;

        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (q) {
            const like = { [Op.iLike]: `%${q}%` };
            where[Op.or] = [
                { memberNo: like },
                { firstName: like },
                { lastName: like },
                { localName: like },
                { identityNo: like },
                { email: like },
            ];
        }

        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const { rows, count } = await Member.findAndCountAll({
            where,
            include: [{ model: Membership, as: 'Membership', attributes: ['id', 'membershipNo', 'membershipClass', 'corporateName'] }],
            order: [['createdAt', 'DESC']],
            limit: SEARCH_LIMIT,
            offset,
        });

        res.status(200).json({
            total: count,
            limit: SEARCH_LIMIT,
            offset,
            members: rows.map((m) => ({
                id: m.id,
                memberNo: m.memberNo,
                memberKind: m.memberKind,
                dependentType: m.dependentType,
                memberStatusId: m.memberStatusId,
                salutationCode: m.salutationCode,
                firstName: m.firstName,
                lastName: m.lastName,
                photoUrl: m.photoUrl,
                localName: m.localName,
                gender: m.gender,
                birthDate: m.birthDate,
                identityNo: m.identityNo,
                email: m.email,
                mobile: m.mobile,
                joinDate: m.joinDate,
                expiryDate: m.expiryDate,
                membershipId: m.membershipId,
                membershipNo: m.Membership ? m.Membership.membershipNo : null,
                membershipClass: m.Membership ? m.Membership.membershipClass : null,
                corporateName: m.Membership ? m.Membership.corporateName : null,
            })),
        });
    } catch (error) {
        console.error('Error searching members:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
