// src/modules/notification/emailOutbox.js
//
// The "compile + store" seam of the outbox architecture. Producers call
// enqueueEmail(...) inside their business transaction; it renders the effective
// template NOW and writes the finished email into the transactional outbox, so
// the worker only has to dispatch it (type 'EmailQueued'). This keeps template
// logic out of the worker and freezes the content at enqueue time.

const { v4: uuidv4 } = require('uuid');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { renderEmail } = require('./emailTemplate.service');
const { fromHeader } = require('./mailer');

// Enqueue a templated email as part of `transaction`. Returns false when the
// template is disabled (no email sent); true when a message was queued.
// Never let a template lookup/render abort the caller's business transaction is
// the caller's decision — this throws on a missing template so producers can
// choose to swallow it if email is non-critical.
async function enqueueEmail({ templateKey, accountId = null, companyId = null, to, data = {} }, transaction) {
    // companyId drives BOTH the branding (header/colour, resolved now) and the
    // worker's SMTP selection (stored in the payload below).
    const rendered = await renderEmail(templateKey, accountId, data, companyId);
    if (!rendered) return false; // email type disabled

    await OutboxMessage.create(
        {
            id: uuidv4(),
            type: 'EmailQueued',
            payload: {
                templateKey,
                accountId: accountId || null,
                // When set (and the company has active SMTP), the worker sends via
                // that company's own server instead of the platform mailer.
                companyId: companyId || null,
                to,
                from: fromHeader(rendered.fromName),
                subject: rendered.subject,
                html: rendered.html,
            },
        },
        { transaction },
    );
    return true;
}

module.exports = { enqueueEmail };
