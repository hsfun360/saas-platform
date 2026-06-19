// src/modules/saas/invitation.controller.js
//
// Consent-based collaborator invitations — the bridge that lets one Global
// Identity work for multiple subscribers without an admin being able to attach
// an outsider unilaterally.
//
// Admin side  (Tenant Admin, scoped to req.user.companyId):
//   POST   /api/auth/company/invitations          create + email an invitation
//   GET    /api/auth/company/invitations          list this company's pending invites
//   POST   /api/auth/company/invitations/:id/revoke
//
// Invitee side (any logged-in user, matched by their own email):
//   GET    /api/auth/invitations                  my pending invitations
//   POST   /api/auth/invitations/:id/accept       -> becomes a collaborator
//   POST   /api/auth/invitations/:id/decline

const crypto = require('crypto');
const Invitation = require('./invitation.model');
const CompanyUser = require('./companyUser.model');
const Company = require('./company.model');
const Account = require('./account.model');
const Role = require('./role.model');
const User = require('../identity/user.model');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { sequelize } = require('../../platform/db');
const { hasTenantAdminRole } = require('./tenant');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';

async function resolveAccountId(companyId, transaction) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['id', 'accountId'], transaction });
    return company ? company.accountId : null;
}

// POST /api/auth/company/invitations  { email, roleId, companyId? }
exports.createInvitation = async (req, res) => {
    const companyId = req.body.companyId || req.user.companyId;
    if (!companyId || !(await hasTenantAdminRole(req.user.id, companyId))) {
        return res.status(403).json({ message: "You don't have admin rights for that company." });
    }

    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(companyId, transaction);
        if (!accountId) {
            await transaction.rollback();
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        const rawEmail = (req.body.email || '').trim().toLowerCase();
        const { roleId } = req.body;
        if (!rawEmail) {
            await transaction.rollback();
            return res.status(400).json({ message: "Email is required." });
        }

        // If a role was chosen, it must belong to THIS company.
        let roleName = null;
        if (roleId) {
            const role = await Role.findOne({ where: { id: roleId, companyId }, transaction });
            if (!role) {
                await transaction.rollback();
                return res.status(400).json({ message: "Selected role does not belong to your workspace." });
            }
            roleName = role.name;
        }

        // Safe-to-reveal checks (they concern only THIS company, which the admin
        // already sees) — never disclose anything about other accounts.
        const existingUser = await User.findOne({ where: { email: rawEmail }, attributes: ['id'], transaction });
        if (existingUser) {
            const already = await CompanyUser.findOne({ where: { userId: existingUser.id, companyId }, transaction });
            if (already) {
                await transaction.rollback();
                return res.status(409).json({ message: "That person is already a collaborator on this company." });
            }
        }
        const pending = await Invitation.findOne({ where: { email: rawEmail, companyId, status: 'pending' }, transaction });
        if (pending) {
            await transaction.rollback();
            return res.status(409).json({ message: "An invitation is already pending for that email." });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        await Invitation.create({
            email: rawEmail,
            accountId,
            companyId,
            roleId: roleId || null,
            invitedByUserId: req.user.id,
            token,
            status: 'pending',
            expiresAt,
        }, { transaction });

        const company = await Company.findByPk(companyId, { attributes: ['name'], transaction });
        const account = await Account.findByPk(accountId, { attributes: ['subscriberName'], transaction });

        // Email via the transactional outbox (delivered by the notification worker).
        // The deep link nudges brand-new users to sign up; existing users simply
        // accept in-app from their invitations list.
        await OutboxMessage.create({
            type: 'CollaboratorInvited',
            payload: {
                email: rawEmail,
                companyName: company ? company.name : null,
                subscriberName: account ? account.subscriberName : null,
                roleName,
                // Existing users accept from the in-app banner; new users are
                // routed through login/sign-up first, then see the same banner.
                acceptLink: `${FRONTEND_BASE_URL}/dashboard?invite=${token}`,
            },
        }, { transaction });

        await transaction.commit();

        // Generic response: does NOT reveal whether the email already exists on
        // the platform or which other account it might belong to.
        res.status(201).json({ message: `Invitation sent to ${rawEmail}.` });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Create invitation error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/auth/company/invitations[?companyId=]  -> a company's pending invitations
exports.listCompanyInvitations = async (req, res) => {
    try {
        const companyId = req.query.companyId || req.user.companyId;
        if (!companyId || !(await hasTenantAdminRole(req.user.id, companyId))) {
            return res.status(403).json({ message: "You don't have admin rights for that company." });
        }
        const invitations = await Invitation.findAll({
            where: { companyId, status: 'pending' },
            include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }],
            order: [['createdAt', 'DESC']],
        });

        res.status(200).json(invitations.map(i => ({
            id: i.id,
            email: i.email,
            roleId: i.roleId,
            roleName: i.Role ? i.Role.name : null,
            status: i.status,
            expiresAt: i.expiresAt,
            createdAt: i.createdAt,
        })));
    } catch (error) {
        console.error("List company invitations error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/company/invitations/:id/revoke
exports.revokeInvitation = async (req, res) => {
    try {
        const invitation = await Invitation.findByPk(req.params.id);
        if (!invitation) {
            return res.status(404).json({ message: "Invitation not found." });
        }
        if (!(await hasTenantAdminRole(req.user.id, invitation.companyId))) {
            return res.status(403).json({ message: "You don't have admin rights for that company." });
        }
        if (invitation.status !== 'pending') {
            return res.status(409).json({ message: `Invitation is already ${invitation.status}.` });
        }
        invitation.status = 'revoked';
        await invitation.save();
        res.status(200).json({ message: "Invitation revoked." });
    } catch (error) {
        console.error("Revoke invitation error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/auth/invitations  -> the caller's own pending invitations (by email)
exports.listMyInvitations = async (req, res) => {
    try {
        const email = (req.user.email || '').toLowerCase();
        const invitations = await Invitation.findAll({
            where: { email, status: 'pending' },
            include: [
                { model: Company, as: 'Company', attributes: ['id', 'name'] },
                { model: Account, as: 'Account', attributes: ['id', 'subscriberName'] },
                { model: Role, as: 'Role', attributes: ['id', 'name'] },
            ],
            order: [['createdAt', 'DESC']],
        });

        const now = Date.now();
        const active = invitations.filter(i => !i.expiresAt || new Date(i.expiresAt).getTime() > now);

        res.status(200).json(active.map(i => ({
            id: i.id,
            companyId: i.companyId,
            companyName: i.Company ? i.Company.name : null,
            subscriberName: i.Account ? i.Account.subscriberName : null,
            roleName: i.Role ? i.Role.name : null,
            expiresAt: i.expiresAt,
        })));
    } catch (error) {
        console.error("List my invitations error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/invitations/:id/accept  -> caller becomes a collaborator
exports.acceptInvitation = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const invitation = await Invitation.findByPk(req.params.id, { transaction });

        // The consent gate: a non-addressee is treated identically to a missing
        // invitation, so invitation IDs can't be probed by guessing.
        const addressedToCaller =
            invitation && invitation.email.toLowerCase() === (req.user.email || '').toLowerCase();
        if (!invitation || invitation.status !== 'pending' || !addressedToCaller) {
            await transaction.rollback();
            return res.status(404).json({ message: "Invitation not found or no longer available." });
        }

        if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) {
            invitation.status = 'expired';
            await invitation.save({ transaction });
            await transaction.commit();
            return res.status(410).json({ message: "This invitation has expired." });
        }

        // Idempotent: if they're already a collaborator, just close the invite.
        const existing = await CompanyUser.findOne({
            where: { userId: req.user.id, companyId: invitation.companyId },
            transaction,
        });
        if (!existing) {
            await CompanyUser.create({
                userId: req.user.id,
                companyId: invitation.companyId,
                roleId: invitation.roleId || null,
                isActive: true,
            }, { transaction });
        }

        invitation.status = 'accepted';
        await invitation.save({ transaction });

        await transaction.commit();

        const company = await Company.findByPk(invitation.companyId, { attributes: ['id', 'name'] });
        res.status(200).json({
            message: "Invitation accepted.",
            company: company ? { id: company.id, name: company.name } : null,
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Accept invitation error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/invitations/:id/decline
exports.declineInvitation = async (req, res) => {
    try {
        const invitation = await Invitation.findByPk(req.params.id);
        // Non-addressee is treated identically to a missing invitation (no ID probing).
        const addressedToCaller =
            invitation && invitation.email.toLowerCase() === (req.user.email || '').toLowerCase();
        if (!invitation || invitation.status !== 'pending' || !addressedToCaller) {
            return res.status(404).json({ message: "Invitation not found or no longer available." });
        }
        invitation.status = 'declined';
        await invitation.save();
        res.status(200).json({ message: "Invitation declined." });
    } catch (error) {
        console.error("Decline invitation error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
