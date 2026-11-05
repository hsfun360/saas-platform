// src/modules/identity/sessionLimit.service.js
//
// What happens AFTER the account's concurrent-session limit ended a session
// (approved 2026-11-05; the rule itself is securityPolicy.service, the ending
// is session.service.issueSession). The person is told on every channel the
// platform has: the new device sees what it ended (the login payload), the
// bell gets a row, and an email names both devices - which is where the
// security value of the limit sits, because a sign-in the person did NOT
// make shows up as "your session on Chrome on Windows was ended by a sign-in
// from Safari on iPhone". Every supersede also logs ONE '[AUTH] session
// superseded' line for Cloud Logging (the RefreshToken table is outside the
// audit hooks on purpose - it churns on every refresh).
//
// Nothing here may fail a sign-in: the notification path is best-effort and
// its errors are logged, never thrown.

const { describeUserAgent } = require('./trustedDevice.service');

const PROFILE_ROUTE = '/profile';

function frontendBase() {
    return process.env.FRONTEND_BASE_URL || 'http://localhost:4200';
}

// The shape the login payload and the bell/email use for an ended session.
function presentEnded(f) {
    return {
        device: describeUserAgent(f.userAgent),
        lastSeenAt: f.lastSeenAt ? new Date(f.lastSeenAt).toISOString() : null,
        ip: f.ip || null,
    };
}

// Tell the user, and the log, what this sign-in ended. Returns the list the
// login payload carries ([{ device, lastSeenAt, ip }]).
async function reportSuperseded({ user, accountId, superseded, req, limit }) {
    const ended = superseded.map(presentEnded);
    const newDevice = describeUserAgent(req ? req.headers['user-agent'] : null);
    const newIp = req ? String(req.ip || '') : '';
    console.warn('[AUTH] session superseded', JSON.stringify({
        userId: user.id,
        ended: ended.length,
        limit: limit ? limit.max : null,
        newDevice,
        ip: newIp,
    }));

    try {
        const gateway = require('../../platform/notificationGateway');
        const names = ended.map((e) => e.device);
        const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        await gateway.notifyUser({
            userId: user.id,
            type: 'session-superseded',
            title: ended.length === 1 ? `Your session on ${list} was ended` : `${ended.length} of your sessions were ended`,
            body: `A sign-in from ${newDevice}${newIp ? ` (${newIp})` : ''} ended your session on ${list}, under your organisation's limit on devices signed in at once. If this was not you, change your password now.`,
            linkRoute: PROFILE_ROUTE,
        });
        if (accountId && user.email) {
            await gateway.emailAddress({
                accountId,
                templateKey: 'security.session-ended',
                to: user.email,
                data: {
                    userName: user.full_name || '',
                    endedDevices: list,
                    newDevice,
                    ip: newIp,
                    at: new Date().toISOString(),
                    sessionsLink: `${frontendBase()}${PROFILE_ROUTE}`,
                },
            });
        }
    } catch (error) {
        console.error('[AUTH] session superseded - notification failed:', error.message || error);
    }
    return ended;
}

module.exports = { reportSuperseded, presentEnded };
