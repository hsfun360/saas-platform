// src/platform/notificationGateway.js
//
// SEAM: product modules -> Notification service (in-app notifications + user
// emails from BACKGROUND jobs). Background work (the outbox worker's statement
// runs; fee runs and imports later) has no HTTP request, only a userId - this
// gateway resolves the recipient and hands off to the notification module, so
// product code never requires notification/identity models directly (golden
// rule #4). In-process today; when Notification splits out these become calls
// to its service API.

const { getCompanyProfile } = require('./serviceContext');

// Create an in-app notification (the header bell). Fire-and-forget semantics
// are the caller's choice; this just writes the row. Pass `transaction` when
// the bell must appear only if the caller's business tx commits (e.g. the
// workflow engine ringing approvers inside the submit/approve transaction).
async function notifyUser({ userId, companyId = null, type, title, body, linkRoute = null, transaction = null }) {
    if (!userId) return null;
    const Notification = require('../modules/notification/notification.model');
    return Notification.create({ userId, companyId, type, title, body, linkRoute }, { transaction });
}

// Queue a templated email to a user by id (render-at-store via the outbox).
// Resolves the user's address/name and the company's account (for the
// template cascade + branding + per-company SMTP). Returns false when the
// user has no address or the template is disabled. `userName` and
// `companyName` are filled in as defaults; caller `data` overrides them.
// Pass `transaction` so the queued row commits/rolls back with the caller's
// business transaction (the enqueue itself renders off-transaction).
async function emailUser({ userId, companyId = null, templateKey, data = {}, transaction = null }) {
    if (!userId) return false;
    const User = require('../modules/identity/user.model');
    const user = await User.findByPk(userId, { attributes: ['id', 'email', 'full_name'] });
    if (!user || !user.email) return false;
    const company = companyId ? await getCompanyProfile(companyId) : null;
    const { enqueueEmail } = require('../modules/notification/emailOutbox');
    return enqueueEmail({
        templateKey,
        accountId: company ? company.accountId : null,
        companyId,
        to: user.email,
        data: {
            userName: user.full_name || '',
            companyName: company ? company.name : '',
            ...data,
        },
    }, transaction);
}

// Queue a templated email to an ADDRESS the caller already holds (an
// organiser's contact email on a group booking, a member's welcome mail, a
// workflow approver). Same cascade + branding as emailUser.
//
// Two ways to name the account the template cascade runs under:
//   - omit `accountId`  -> resolved from `companyId` (the company lookup also
//                          fills the `companyName` default, which `data`
//                          overrides as in emailUser);
//   - pass `accountId`  -> the caller already knows the account (it holds the
//                          company profile or a workflow instance), so no
//                          lookup runs and `data` goes through exactly as
//                          given - the caller owns every key.
// `transaction` joins the caller's business transaction; `forcePlatformSender`
// keeps the branding but delivers via the platform mailer (see emailOutbox).
async function emailAddress({ accountId, companyId = null, templateKey, to, data = {}, transaction = null, forcePlatformSender = false }) {
    if (!to) return false;
    const explicitAccount = accountId !== undefined;
    const company = !explicitAccount && companyId ? await getCompanyProfile(companyId) : null;
    const { enqueueEmail } = require('../modules/notification/emailOutbox');
    return enqueueEmail({
        templateKey,
        accountId: explicitAccount ? (accountId || null) : (company ? company.accountId : null),
        companyId,
        to,
        data: explicitAccount ? data : { companyName: company ? company.name : '', ...data },
        forcePlatformSender,
    }, transaction);
}

module.exports = { notifyUser, emailUser, emailAddress };
