// Facility classes - the three emails (slice 5c): the patron on an enrolment
// (what was booked and whether the fee is paid or awaits the desk), every
// seat and the instructor on a session cancelled by the club, and the patron
// offered a seat from the waitlist (until when it is held). Queued AFTER the
// business transaction commits, through the notification seam; a missing
// address or a failed enqueue never fails the business call.

const { getCompanyProfile } = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { emailAddress } = require('../../platform/notificationGateway');
const patrons = require('./patron.service');
const { bookingDateText } = require('./bookingShared');
const { timeDto } = require('./facilityShared');

// The address of a patron: the member's from the standing, the visitor's
// from the profile. Null when none.
async function patronEmail(companyId, patron) {
    if (!patron) return null;
    if (patron.patronType === 'member' && patron.memberNo) {
        const standing = await getGolfMemberStanding(companyId, patron.memberNo);
        return standing && standing.email ? standing.email : null;
    }
    const profiles = await patrons.profilesFor(companyId, [patron]);
    const profile = profiles.get(patron.id);
    return profile && profile.email ? profile.email : null;
}

function whenText(session, schedule) {
    if (session) return `${bookingDateText(String(session.sessionDate))} ${timeDto(session.startTime)} - ${timeDto(session.endTime)}`;
    if (schedule) return `${schedule.name} (${bookingDateText(String(schedule.dateFrom))} to ${bookingDateText(String(schedule.dateTo))})`;
    return '';
}

async function queue(templateKey, companyId, to, data) {
    if (!to) return false;
    try {
        const company = await getCompanyProfile(companyId);
        await emailAddress({ templateKey, accountId: company ? company.accountId : null, companyId, to, data: { companyName: company ? company.name : '', ...data } });
        return true;
    } catch (e) {
        console.error(`Error queueing ${templateKey} email:`, e);
        return false;
    }
}

// The patron: the class, the session or term, the venue, the fee and its bill.
async function queueEnrolled({ companyId, patron, cls, session = null, schedule = null, venue = null, bill = null }) {
    const to = await patronEmail(companyId, patron);
    return queue('facility.class.enrolled', companyId, to, {
        patronName: patron.name, classCode: cls.code, className: cls.description, whenText: whenText(session, schedule),
        venueName: venue ? `${venue.code} - ${venue.name}` : '', isTerm: !!schedule,
        feeAmount: bill ? Number(bill.totalAmount).toFixed(2) : '', billNo: bill ? bill.billNo : '', isPaid: !!(bill && bill.status === 'settled'), isFree: !bill,
    });
}

// Every seat and the instructor: the session, the reason, what happened to the fee.
async function queueSessionCancelled({ companyId, cls, session, venue = null, instructor = null, reason, recipients = [] }) {
    const base = { classCode: cls.code, className: cls.description, whenText: whenText(session, null), venueName: venue ? `${venue.code} - ${venue.name}` : '', reason };
    for (const r of recipients) {
        const to = await patronEmail(companyId, r.patron);
        await queue('facility.class.session.cancelled', companyId, to, {
            ...base, patronName: r.patron.name, isInstructor: false,
            feeNote: r.outcome === 'void' ? 'The open bill for this seat has been voided - nothing is owed.'
                : r.outcome === 'finance' ? 'The fee you paid for this seat will be refunded by the club\'s office.'
                    : r.outcome === 'term' ? 'Your term enrolment continues with the remaining sessions.' : '',
        });
    }
    if (instructor && instructor.email) {
        await queue('facility.class.session.cancelled', companyId, instructor.email, { ...base, patronName: instructor.name, isInstructor: true, feeNote: `${recipients.length} seat${recipients.length === 1 ? '' : 's'} notified.` });
    }
}

// The patron offered a seat: the class, the session or term, until when.
async function queueOffer({ companyId, patron, cls, session = null, schedule = null, venue = null, expiresAt }) {
    const to = await patronEmail(companyId, patron);
    return queue('facility.class.waitlist.offered', companyId, to, {
        patronName: patron.name, classCode: cls.code, className: cls.description, whenText: whenText(session, schedule),
        venueName: venue ? `${venue.code} - ${venue.name}` : '', isTerm: !!schedule,
        expiresText: new Date(expiresAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC',
    });
}

module.exports = { patronEmail, queueEnrolled, queueSessionCancelled, queueOffer };
