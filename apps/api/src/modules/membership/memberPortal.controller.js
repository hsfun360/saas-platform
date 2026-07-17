// src/modules/membership/memberPortal.controller.js
//
// Member Portal self-registration + the member's own view.
//
// The welcome email carries a REGISTRATION LINK: a signed, stateless RS256 token
// (same pattern as subscriber workspace activation) naming the member. The
// public register endpoints verify that token; completing registration creates
// (or links) the platform User via the Identity gateway seam and stamps
// `Member.userId` - the portal identity link the Member model reserved.
//
// Portal endpoints authenticate with the standard JWT but deliberately have NO
// requireModule/requireMenuAction: a member is not staff, holds no workspace,
// and sees only records linked to their own userId.

const jwt = require('jsonwebtoken');
const { getPrivateKey, getPublicKey } = require('../../platform/jwt.keys');
const Member = require('./member.model');
const Membership = require('./membership.model');
const MembershipType = require('./membershipType.model');
const MembershipStatus = require('./membershipStatus.model');
const { getUserContext, getCompanyProfile } = require('../../platform/serviceContext');
const { provisionPortalUser, issueLoginToken } = require('../../platform/identityGateway');

const TOKEN_PURPOSE = 'member-portal-register';
// Welcome emails sit unread; keep the link generous. A used link is inert
// anyway (the member's userId is set), and re-invites can be issued later.
const TOKEN_TTL = '30d';

// Sign the registration token for a member. Used by the membership-creation
// producer (and a future per-member "Invite to portal" action).
function signRegistrationToken(member) {
    return jwt.sign(
        { purpose: TOKEN_PURPOSE, memberId: member.id, companyId: member.companyId },
        getPrivateKey(),
        { algorithm: 'RS256', expiresIn: TOKEN_TTL },
    );
}

// Verify + load the member behind a registration token. Returns { member } or
// { error } with a user-facing message.
async function resolveRegistrationToken(token) {
    if (!token) return { error: 'Registration token is required.' };
    let decoded;
    try {
        decoded = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
    } catch (err) {
        return { error: 'This registration link is invalid or has expired. Please ask the club for a new invitation.' };
    }
    if (decoded.purpose !== TOKEN_PURPOSE) return { error: 'This link is not a portal registration link.' };
    const member = await Member.findOne({ where: { id: decoded.memberId, companyId: decoded.companyId } });
    if (!member) return { error: 'The member behind this link no longer exists.' };
    return { member };
}

function memberDisplayName(m) {
    return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.memberNo;
}

// GET /api/membership/portal/register/context?token=... (public)
// The greeting data for the registration page - who is registering, for which
// club - so the user sees the expected result before typing a password.
exports.getRegistrationContext = async (req, res) => {
    try {
        const { member, error } = await resolveRegistrationToken(String(req.query.token || ''));
        if (error) return res.status(400).json({ message: error });

        const company = await getCompanyProfile(member.companyId);
        res.status(200).json({
            memberName: memberDisplayName(member),
            memberNo: member.memberNo,
            email: member.email,
            companyName: company ? company.name : null,
            alreadyRegistered: !!member.userId,
        });
    } catch (error) {
        console.error('Error resolving portal registration context:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/portal/register (public) - body { token, password }.
// Creates the platform User (Identity gateway) and links Member.userId.
// If a user with the member's email already exists, the member is linked to it
// WITHOUT changing that account's password (the existing credentials stay the
// only way in - same trust basis as password reset: control of the mailbox).
exports.register = async (req, res) => {
    try {
        const { member, error } = await resolveRegistrationToken(String(req.body.token || ''));
        if (error) return res.status(400).json({ message: error });
        if (member.userId) {
            return res.status(400).json({ message: 'This member is already registered for the portal. Please log in.' });
        }
        if (!member.email) {
            return res.status(400).json({ message: 'This member has no email address on file. Please ask the club to update it first.' });
        }
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters.' });
        }

        const { userId, created } = await provisionPortalUser({
            email: member.email,
            fullName: memberDisplayName(member),
            password,
        });
        member.userId = userId;
        await member.save();

        if (!created) {
            // Linked to an existing account - they log in with the password they
            // already have (or recover it via Forgot password).
            return res.status(200).json({
                linked: true,
                message: 'An account with this email already exists, so your membership was linked to it. Log in with your existing password.',
            });
        }
        res.status(201).json({
            linked: false,
            message: 'Registration complete.',
            token: issueLoginToken(userId, member.email),
            email: member.email,
            fullName: memberDisplayName(member),
        });
    } catch (error) {
        console.error('Error registering portal member:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/portal/me (authenticated) - every member record linked to
// the caller's user account (one person can hold memberships at several clubs),
// shaped as portal membership cards.
exports.getMe = async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized.' });

        const members = await Member.findAll({ where: { userId }, order: [['memberNo', 'ASC']] });
        const cards = [];
        for (const m of members) {
            const [membership, status, company] = await Promise.all([
                Membership.findByPk(m.membershipId, { attributes: ['membershipNo', 'membershipTypeId', 'joinDate'] }),
                m.memberStatusId
                    ? MembershipStatus.findByPk(m.memberStatusId, { attributes: ['membershipStatus', 'statusColor'] })
                    : null,
                getCompanyProfile(m.companyId),
            ]);
            const type = membership
                ? await MembershipType.findByPk(membership.membershipTypeId, { attributes: ['category'] })
                : null;
            cards.push({
                memberId: m.id,
                memberNo: m.memberNo,
                memberName: memberDisplayName(m),
                memberKind: m.memberKind,
                companyName: company ? company.name : null,
                membershipNo: membership ? membership.membershipNo : null,
                membershipTypeName: type ? type.category : null,
                statusName: status ? status.membershipStatus : null,
                statusColor: status ? status.statusColor : null,
                joinDate: m.joinDate || (membership ? membership.joinDate : null),
            });
        }
        res.status(200).json({ memberships: cards });
    } catch (error) {
        console.error('Error loading portal profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.signRegistrationToken = signRegistrationToken;
