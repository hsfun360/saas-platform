// src/modules/membership/agentPortal.controller.js
//
// Sales Agent portal self-registration + the agent's own view. Mirrors the
// member portal (memberPortal.controller.js): the invite email carries a
// stateless signed RS256 token naming the agent; completing registration
// creates (or links) the platform User via the Identity gateway seam and
// stamps SalesAgent.userId.
//
// Cross-club by design: ONE login can be linked to agent rows in MANY clubs -
// across companies and subscriber accounts - so /me returns every engagement
// of the caller's userId, not one company's.

const jwt = require('jsonwebtoken');
const { getPrivateKey, getPublicKey } = require('../../platform/jwt.keys');
const SalesAgent = require('./salesAgent.model');
const SalesAgency = require('./salesAgency.model');
const { getUserContext, getCompanyProfile } = require('../../platform/serviceContext');
const { provisionPortalUser, issueLoginToken } = require('../../platform/identityGateway');
const { AGENT_KINDS } = require('./salesAgent.constants');

const TOKEN_PURPOSE = 'sales-agent-register';
const TOKEN_TTL = '30d';

function signAgentRegistrationToken(agent) {
    return jwt.sign(
        { purpose: TOKEN_PURPOSE, agentId: agent.id, companyId: agent.companyId },
        getPrivateKey(),
        { algorithm: 'RS256', expiresIn: TOKEN_TTL },
    );
}

async function resolveRegistrationToken(token) {
    if (!token) return { error: 'Registration token is required.' };
    let decoded;
    try {
        decoded = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
    } catch (err) {
        return { error: 'This registration link is invalid or has expired. Please ask the club for a new invitation.' };
    }
    if (decoded.purpose !== TOKEN_PURPOSE) return { error: 'This link is not an agent registration link.' };
    const agent = await SalesAgent.findOne({ where: { id: decoded.agentId, companyId: decoded.companyId } });
    if (!agent) return { error: 'The agent behind this link no longer exists.' };
    return { agent };
}

function kindLabel(key) {
    return AGENT_KINDS.find((k) => k.key === key)?.label || key;
}

// GET /api/membership/agent-portal/register/context?token=... (public)
exports.getRegistrationContext = async (req, res) => {
    try {
        const { agent, error } = await resolveRegistrationToken(String(req.query.token || ''));
        if (error) return res.status(400).json({ message: error });

        const [company, agency] = await Promise.all([
            getCompanyProfile(agent.companyId),
            agent.salesAgencyId ? SalesAgency.findByPk(agent.salesAgencyId, { attributes: ['agencyName'] }) : null,
        ]);
        res.status(200).json({
            agentName: agent.name,
            agentCode: agent.agentCode,
            email: agent.email,
            companyName: company ? company.name : null,
            agencyName: agency ? agency.agencyName : null,
            alreadyRegistered: !!agent.userId,
        });
    } catch (error) {
        console.error('Error resolving agent registration context:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/agent-portal/register (public) - body { token, password }.
// Same trust basis as the member portal: control of the invited mailbox. An
// existing account with that email is linked WITHOUT touching its password.
exports.register = async (req, res) => {
    try {
        const { agent, error } = await resolveRegistrationToken(String(req.body.token || ''));
        if (error) return res.status(400).json({ message: error });
        if (agent.userId) {
            return res.status(400).json({ message: 'This agent is already registered. Please log in.' });
        }
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters.' });
        }

        const { userId, created } = await provisionPortalUser({
            email: agent.email,
            fullName: agent.name,
            password,
        });
        agent.userId = userId;
        await agent.save();

        if (!created) {
            return res.status(200).json({
                linked: true,
                message: 'An account with this email already exists, so this engagement was linked to it. Log in with your existing password.',
            });
        }
        res.status(201).json({
            linked: false,
            message: 'Registration complete.',
            token: issueLoginToken(userId, agent.email),
            email: agent.email,
            fullName: agent.name,
        });
    } catch (error) {
        console.error('Error registering sales agent:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/agent-portal/me (authenticated) - every agent engagement
// linked to the caller's user account, across clubs and subscriber accounts.
exports.getMe = async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized.' });

        const agents = await SalesAgent.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
        const cards = [];
        for (const a of agents) {
            const [company, agency] = await Promise.all([
                getCompanyProfile(a.companyId),
                a.salesAgencyId ? SalesAgency.findByPk(a.salesAgencyId, { attributes: ['agencyName'] }) : null,
            ]);
            cards.push({
                agentId: a.id,
                agentCode: a.agentCode,
                name: a.name,
                agentKind: a.agentKind,
                agentKindLabel: kindLabel(a.agentKind),
                companyName: company ? company.name : null,
                agencyName: agency ? agency.agencyName : null,
                joinedDate: a.joinedDate,
                isActive: a.isActive,
            });
        }
        res.status(200).json({ engagements: cards });
    } catch (error) {
        console.error('Error loading agent portal profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.signAgentRegistrationToken = signAgentRegistrationToken;
