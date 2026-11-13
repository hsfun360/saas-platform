// Guest Registration (structure approved 2026-11-10; Membership Management ->
// Guest Registration) - the front desk registers a member's guest for a date
// and the guest receives a digital DAY PASS.
//
//   - One registration = one guest, one host member, one date. It writes the
//     membership.GuestVisit ledger row (source 'membership') that draws on the
//     host's monthly guest allowance; a KNOWN guest counts once per host per
//     day across every module (guestVisit.service countVisits).
//   - The host is checked like every other desk action: status Action control
//     Barred refuses, Warning warns; an exhausted monthly allowance refuses
//     (the same rule as the Facility desk).
//   - The pass is a public page behind a random token (no login): QR code,
//     club, guest, host, date and the LIVE state (valid today / not yet valid
//     / expired / cancelled), valid on the visit date only by the club clock.
//     It is emailed through the template engine (membership.guest.pass) or
//     shared from the desk user's own WhatsApp (a wa.me link - the platform
//     has no WhatsApp integration).
//   - Guest fees, Member Portal registration and passes for Facility / Golf
//     guest lines are later slices.
//
// The pure pieces (passStateOf, normalizeGuest, tokenFromCode, whatsappLink)
// are unit-tested.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement, canModifyRecord, annotateCanModify, getCompanyProfile, getCompanyLetterhead } = require('../../platform/serviceContext');
const { emailAddress } = require('../../platform/notificationGateway');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const numberingGateway = require('../../platform/numberingGateway');
const guestVisits = require('./guestVisit.service');
const { GUEST_REGISTRATION_STATUSES, GUEST_REGISTRATION_STATUS_KEYS, PASS_SEND_VIA_KEYS, PASS_STATES } = require('./guestRegistration.constants');
const Guest = require('./guest.model');
const GuestRegistration = require('./guestRegistration.model');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';
const NUMBERING_PURPOSE = 'membership-guest';
const SOURCE_MODULE = 'membership';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;

function fail(message, status = 400) {
    return { error: message, status };
}
function txFail(message, status = 400) {
    return Object.assign(new Error(message), { httpStatus: status });
}
function str(v, max = 255) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function dateText(dateOnly) {
    return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function monthText(dateOnly) {
    return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function clubNow(timezone) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
}
async function clubToday(companyId) {
    return clubNow(await companyTimezoneById(companyId));
}
function personName(m) {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
    return name || m.localName || m.memberNo;
}

// ---- pure rules ------------------------------------------------------------

// What the pass shows on `today` (club-local 'YYYY-MM-DD').
function passStateOf(status, visitDate, today) {
    if (status === 'cancelled') return 'cancelled';
    const d = String(visitDate);
    if (d < today) return 'expired';
    if (d > today) return 'upcoming';
    return 'valid';
}

// A mobile as the phone-input standard stores it: '+' and digits. A value
// that is only a dialling code (no national number yet) reads as empty.
function normalizeMobile(v) {
    if (typeof v !== 'string') return null;
    const compact = v.replace(/[\s\-()]/g, '');
    if (!compact || /^\+?\d{0,4}$/.test(compact)) return null;
    return compact.slice(0, 30);
}

// The guest's details from a request body. Name is mandatory; mobile OR
// email is mandatory (the pass must reach the guest somehow).
function normalizeGuest(body) {
    const b = body || {};
    const name = str(b.name);
    if (!name) return fail('Key in the guest\'s name.');
    const mobile = normalizeMobile(b.mobile);
    if (mobile && !/^\+?\d{6,20}$/.test(mobile)) return fail('The mobile number is not valid.');
    const email = str(b.email);
    if (email && !EMAIL_RE.test(email)) return fail('The email is not a valid address.');
    if (!mobile && !email) return fail('Key in the guest\'s mobile number or email - the pass is sent to one of them.');
    return { value: { name, mobile, email: email ? email.toLowerCase() : null, identityNo: str(b.identityNo, 50), remarks: str(b.guestRemarks) } };
}

// The pass token inside whatever the desk scanned or pasted: the pass link,
// or the bare token. Null when there is none.
function tokenFromCode(code) {
    const m = /([a-f0-9]{64})/.exec(String(code || '').trim().toLowerCase());
    return m ? m[1] : null;
}

function passUrlOf(token) {
    return `${FRONTEND_BASE_URL.replace(/\/+$/, '')}/guest-pass/${token}`;
}

// The click-to-chat link the desk opens to share the pass from its own
// WhatsApp: wa.me takes the number as digits only.
function whatsappLink(mobile, text) {
    const digits = String(mobile || '').replace(/\D/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function shareText({ guestName, clubName, hostName, visitDate, passUrl }) {
    return `Hello ${guestName}, here is your guest pass for ${clubName} on ${dateText(visitDate)}, as the guest of ${hostName}. Please show it at the front desk: ${passUrl}`;
}

// ---- host and guest lookups --------------------------------------------------

// The host facts the desk sees before saving (show the expected result):
// who the member is, their standing and the month's allowance on the date.
async function hostFacts(companyId, memberNo, visitDate, { transaction } = {}) {
    const standing = await getGolfMemberStanding(companyId, memberNo);
    if (!standing) return fail(`No member found with number '${memberNo}'.`, 404);
    const allowance = await guestVisits.getStanding(companyId, standing.memberId, visitDate, { transaction });
    return {
        host: {
            memberId: standing.memberId, memberNo: standing.memberNo, name: standing.name,
            statusLabel: standing.statusLabel, actionControl: standing.actionControl,
        },
        allowance,
    };
}

// GET /guest-registrations/host?memberNo&visitDate
async function host(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const memberNo = str(query.memberNo, 50);
    if (!memberNo) return fail('Key in the host member\'s number.');
    const today = await clubToday(companyId);
    const visitDate = DATE_RE.test(String(query.visitDate || '')) ? String(query.visitDate) : today;
    const f = await hostFacts(companyId, memberNo, visitDate);
    if (f.error) return f;
    return { ...f, visitDate };
}

// GET /guest-registrations/guests?q - returning guests by name, mobile,
// email or identity number, most recently seen first.
async function searchGuests(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const q = str(query.q, 100);
    if (!q || q.length < 2) return { guests: [] };
    const like = { [Op.iLike]: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
    const rows = await Guest.findAll({
        where: { companyId, [Op.or]: [{ name: like }, { mobile: like }, { email: like }, { identityNo: like }] },
        order: [['updatedAt', 'DESC']],
        limit: 10,
    });
    const ids = rows.map((r) => r.id);
    const regs = ids.length
        ? await GuestRegistration.findAll({
            where: { companyId, guestId: { [Op.in]: ids }, status: { [Op.ne]: 'cancelled' } },
            attributes: ['guestId', 'visitDate'],
        })
        : [];
    const stats = new Map();
    for (const r of regs) {
        const s = stats.get(r.guestId) || { visits: 0, lastVisit: null };
        s.visits += 1;
        if (!s.lastVisit || String(r.visitDate) > s.lastVisit) s.lastVisit = String(r.visitDate);
        stats.set(r.guestId, s);
    }
    return { guests: rows.map((g) => ({ ...guestDto(g), ...(stats.get(g.id) || { visits: 0, lastVisit: null }) })) };
}

// The Guest row for a registration body: the picked one (details corrected
// from the form), else an exact returning match (same name and the same
// mobile or email), else a new guest.
async function resolveGuest(companyId, body, value, stamps, { transaction }) {
    const pickedId = str(body.guestId, 64);
    if (pickedId) {
        const row = await Guest.findOne({ where: { companyId, id: pickedId }, transaction });
        if (!row) throw txFail('The guest record no longer exists - search again.', 409);
        Object.assign(row, { name: value.name, mobile: value.mobile, email: value.email, identityNo: value.identityNo, updatedBy: stamps.updatedBy });
        if (value.remarks !== null) row.remarks = value.remarks;
        await row.save({ transaction });
        return row;
    }
    const contact = [];
    if (value.mobile) contact.push({ mobile: value.mobile });
    if (value.email) contact.push({ email: { [Op.iLike]: value.email } });
    const match = await Guest.findOne({ where: { companyId, name: { [Op.iLike]: value.name }, [Op.or]: contact }, transaction });
    if (match) {
        Object.assign(match, { mobile: value.mobile || match.mobile, email: value.email || match.email, identityNo: value.identityNo || match.identityNo, updatedBy: stamps.updatedBy });
        await match.save({ transaction });
        return match;
    }
    return Guest.create({ companyId, ...value, ...stamps }, { transaction });
}

// ---- create ------------------------------------------------------------------

async function create(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const memberNo = str(body.memberNo, 50);
    if (!memberNo) return fail('Key in the host member\'s number.');
    const visitDate = str(body.visitDate, 10);
    if (!visitDate || !DATE_RE.test(visitDate)) return fail('Pick the visit date.');
    const today = await clubToday(companyId);
    if (visitDate < today) return fail(`${dateText(visitDate)} has passed - a guest is registered for today or a later date.`);
    const g = normalizeGuest(body.guest);
    if (g.error) return g;
    const standing = await getGolfMemberStanding(companyId, memberNo);
    if (!standing) return fail(`No member found with number '${memberNo}'.`, 404);
    if (standing.actionControl === 'barred') {
        return fail(`Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred - a guest cannot be registered.`);
    }
    const wantsEmail = body.sendEmail === true;

    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
    const company = await getCompanyProfile(companyId);

    const out = await sequelize.transaction(async (transaction) => {
        // Serialise registrations per host: the allowance is read and drawn
        // inside this lock, so two desks cannot both take the last visit.
        const Member = require('./member.model');
        await Member.findOne({ where: { companyId, id: standing.memberId }, attributes: ['id'], lock: transaction.LOCK.UPDATE, transaction });

        const guest = await resolveGuest(companyId, body, g.value, stamps, { transaction });
        const live = await GuestRegistration.findOne({
            where: { companyId, memberId: standing.memberId, guestId: guest.id, visitDate, status: { [Op.ne]: 'cancelled' } },
            attributes: ['registrationNo'], transaction,
        });
        if (live) throw txFail(`${guest.name} is already registered as ${standing.name}'s guest on ${dateText(visitDate)} (${live.registrationNo}).`, 409);

        // A guest this host already has on the ledger that day (a facility
        // booking, say) draws nothing more.
        const counted = await guestVisits.alreadyCounted(companyId, standing.memberId, guest.id, visitDate, { transaction });
        const allowance = await guestVisits.getStanding(companyId, standing.memberId, visitDate, { transaction });
        if (!counted && allowance && allowance.allowance !== null && allowance.remaining < 1) {
            throw txFail(allowance.allowance === 0
                ? `${standing.name} (${standing.memberNo}) may not bring guests under their membership type.`
                : `${standing.name} (${standing.memberNo}) has used all ${allowance.allowance} guest visits for ${monthText(visitDate)}.`);
        }

        const issued = await numberingGateway.issueNumber(req, NUMBERING_PURPOSE, { transaction });
        let registrationNo = null;
        if (issued && issued.number) registrationNo = issued.number;
        else if (issued && issued.manual) {
            registrationNo = str(body.registrationNo, 50);
            if (!registrationNo) throw txFail('The Guest Registration No. scheme is manual - key in a registration number.');
            const clash = await GuestRegistration.count({ where: { companyId, registrationNo: { [Op.iLike]: registrationNo } }, transaction });
            if (clash) throw txFail(`Registration number ${registrationNo} is already used.`, 409);
        } else {
            throw txFail('Configure the Guest Registration No. numbering scheme first (Membership Management -> Numbering Control).');
        }

        const row = await GuestRegistration.create({
            companyId, registrationNo, guestId: guest.id, memberId: standing.memberId, visitDate,
            status: 'registered', channel: 'desk', passToken: crypto.randomBytes(32).toString('hex'),
            remarks: str(body.remarks), ...stamps,
        }, { transaction });
        await guestVisits.record(companyId, {
            memberId: standing.memberId, visitDate, sourceModule: SOURCE_MODULE, sourceRef: row.id,
            guestId: guest.id, guestName: guest.name, guestCount: 1, stamps,
        }, { transaction });

        let emailed = false;
        if (wantsEmail && guest.email) {
            await queuePassEmail(row, guest, standing.name, company, { transaction });
            Object.assign(row, { passSentAt: new Date(), passSentVia: 'email', passSentTo: guest.email });
            await row.save({ transaction });
            emailed = true;
        }
        return { row, guest, emailed, counted };
    }).catch((err) => {
        if (err && err.httpStatus) return { error: err.message, status: err.httpStatus };
        if (err && err.name === 'SequelizeUniqueConstraintError') return { error: 'This guest is already registered with this member for that date.', status: 409 };
        throw err;
    });
    if (out.error) return out;

    const hostDto = { memberId: standing.memberId, memberNo: standing.memberNo, name: standing.name };
    const parts = [`${out.guest.name} registered as ${standing.name}'s guest on ${dateText(visitDate)} (${out.row.registrationNo}).`];
    if (out.emailed) parts.push(`The pass was emailed to ${out.guest.email}.`);
    if (standing.actionControl === 'warning') parts.push(`Note: member ${standing.memberNo} is ${standing.statusLabel || 'on a warning status'}.`);
    return { message: parts.join(' '), registration: dto(out.row, out.guest, hostDto, today), pass: await passFacts(out.row, out.guest, hostDto, company) };
}

async function queuePassEmail(row, guest, hostName, company, { transaction } = {}) {
    return emailAddress({
        templateKey: 'membership.guest.pass', companyId: row.companyId, to: guest.email, transaction,
        data: {
            guestName: guest.name, hostName, visitDateText: dateText(row.visitDate), registrationNo: row.registrationNo,
            passLink: passUrlOf(row.passToken), companyName: company ? company.name : '',
        },
    });
}

// ---- load / update / cancel / arrive -----------------------------------------

async function load(req, id) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const row = await GuestRegistration.findOne({ where: { companyId, id } });
    if (!row) return fail('Guest registration not found.', 404);
    const guest = await Guest.findOne({ where: { companyId, id: row.guestId } });
    const hostDto = (await hostsById(companyId, [row.memberId])).get(row.memberId) || { memberId: row.memberId, memberNo: '', name: '' };
    return { row, guest, host: hostDto, companyId, today: await clubToday(companyId) };
}

async function hostsById(companyId, memberIds) {
    const Member = require('./member.model');
    const map = new Map();
    if (!memberIds.length) return map;
    const rows = await Member.findAll({ where: { companyId, id: { [Op.in]: memberIds } }, attributes: ['id', 'memberNo', 'firstName', 'lastName', 'localName'] });
    for (const m of rows) map.set(m.id, { memberId: m.id, memberNo: m.memberNo, name: personName(m) });
    return map;
}

// PUT /:id - correct the guest's details or the remarks. The host and the
// date are the registration itself: cancel and register again to change them.
async function update(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, guest, host: hostDto, today } = l;
    if (row.status === 'cancelled') return fail(`Registration ${row.registrationNo} is cancelled.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const g = normalizeGuest(body.guest);
    if (g.error) return g;
    const callerId = getUserContext(req).userId;
    await sequelize.transaction(async (transaction) => {
        Object.assign(guest, { name: g.value.name, mobile: g.value.mobile, email: g.value.email, identityNo: g.value.identityNo, updatedBy: callerId });
        await guest.save({ transaction });
        row.remarks = str(body.remarks);
        row.updatedBy = callerId;
        await row.save({ transaction });
        // The ledger line shows the corrected name.
        const GuestVisit = require('./guestVisit.model');
        await GuestVisit.update({ guestName: guest.name }, { where: { companyId: row.companyId, sourceModule: SOURCE_MODULE, sourceRef: row.id }, transaction });
    });
    return { message: `Registration ${row.registrationNo} updated.`, registration: dto(row, guest, hostDto, today) };
}

async function cancel(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, guest, host: hostDto, companyId, today } = l;
    if (row.status === 'cancelled') return fail(`Registration ${row.registrationNo} is already cancelled.`);
    if (row.status === 'arrived') return fail(`${guest.name} has already arrived - registration ${row.registrationNo} cannot be cancelled.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const reason = str(body.reason);
    if (!reason) return fail('Give the reason for cancelling the registration.');
    const callerId = getUserContext(req).userId;
    await sequelize.transaction(async (transaction) => {
        Object.assign(row, { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, updatedBy: callerId });
        await row.save({ transaction });
        await guestVisits.voidVisit(companyId, SOURCE_MODULE, row.id, { transaction, updatedBy: callerId });
    });
    return { message: `Registration ${row.registrationNo} cancelled - the visit no longer counts against ${hostDto.name}'s allowance and the pass stops working.`, registration: dto(row, guest, hostDto, today) };
}

// The desk marks the guest's arrival - on the visit date only.
async function arrive(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, guest, host: hostDto, today } = l;
    const state = passStateOf(row.status, row.visitDate, today);
    if (row.status === 'arrived') return fail(`${guest.name} was already marked arrived.`);
    if (state === 'cancelled') return fail(`Registration ${row.registrationNo} is cancelled.`);
    if (state === 'upcoming') return fail(`The pass is for ${dateText(row.visitDate)} - it is not valid today.`);
    if (state === 'expired') return fail(`The pass was for ${dateText(row.visitDate)} and has expired.`);
    const callerId = getUserContext(req).userId;
    Object.assign(row, { status: 'arrived', arrivedAt: new Date(), arrivedBy: callerId, updatedBy: callerId });
    await row.save();
    return { message: `${guest.name} arrived - guest of ${hostDto.name} (${hostDto.memberNo}).`, registration: dto(row, guest, hostDto, today) };
}

// ---- the pass: send, share, scan, the public page -----------------------------

async function qrDataUrl(token) {
    const QRCode = require('qrcode');
    return QRCode.toDataURL(passUrlOf(token), { margin: 1, width: 260, errorCorrectionLevel: 'M' });
}

// What the desk needs to hand the pass over: the link, its QR code and the
// WhatsApp click-to-chat link (when the guest has a mobile).
async function passFacts(row, guest, hostDto, company) {
    const passUrl = passUrlOf(row.passToken);
    const text = shareText({ guestName: guest.name, clubName: company ? company.name : 'the club', hostName: hostDto.name, visitDate: row.visitDate, passUrl });
    return { passUrl, qrDataUrl: await qrDataUrl(row.passToken), whatsappUrl: whatsappLink(guest.mobile, text), shareText: text };
}

// GET /:id/pass
async function pass(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, guest, host: hostDto, companyId, today } = l;
    if (row.status === 'cancelled') return fail(`Registration ${row.registrationNo} is cancelled - it has no pass.`);
    const company = await getCompanyProfile(companyId);
    return { registration: dto(row, guest, hostDto, today), pass: await passFacts(row, guest, hostDto, company) };
}

// POST /:id/send { via } - 'email' queues the pass email; 'whatsapp' records
// that the desk shared it (the message itself leaves from the desk's own
// WhatsApp through the wa.me link).
async function send(req, id, body) {
    const l = await load(req, id);
    if (l.error) return l;
    const { row, guest, host: hostDto, companyId, today } = l;
    if (row.status === 'cancelled') return fail(`Registration ${row.registrationNo} is cancelled - it has no pass.`);
    if (passStateOf(row.status, row.visitDate, today) === 'expired') return fail(`The pass was for ${dateText(row.visitDate)} and has expired.`);
    const via = PASS_SEND_VIA_KEYS.includes(body.via) ? body.via : null;
    if (!via) return fail('Pick how the pass is sent.');
    const callerId = getUserContext(req).userId;
    if (via === 'email') {
        if (!guest.email) return fail(`${guest.name} has no email address - add one, or share the pass over WhatsApp.`);
        const company = await getCompanyProfile(companyId);
        await sequelize.transaction(async (transaction) => {
            await queuePassEmail(row, guest, hostDto.name, company, { transaction });
            Object.assign(row, { passSentAt: new Date(), passSentVia: 'email', passSentTo: guest.email, updatedBy: callerId });
            await row.save({ transaction });
        });
        return { message: `The pass was emailed to ${guest.email}.`, registration: dto(row, guest, hostDto, today) };
    }
    if (!guest.mobile) return fail(`${guest.name} has no mobile number - add one, or email the pass.`);
    Object.assign(row, { passSentAt: new Date(), passSentVia: 'whatsapp', passSentTo: guest.mobile, updatedBy: callerId });
    await row.save();
    return { message: `Recorded: the pass was shared with ${guest.mobile} over WhatsApp.`, registration: dto(row, guest, hostDto, today) };
}

// POST /scan { code } - the desk scans (or pastes) a pass; answers the
// registration behind it so the desk can verify and mark the arrival.
async function scan(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const token = tokenFromCode(body.code);
    if (!token) return fail('That is not a guest pass.');
    const row = await GuestRegistration.findOne({ where: { companyId, passToken: token }, attributes: ['id'] });
    if (!row) return fail('No guest pass of this club matches that code.', 404);
    const l = await load(req, row.id);
    if (l.error) return l;
    return { registration: dto(l.row, l.guest, l.host, l.today) };
}

// GET /api/membership/guest-pass/:token (PUBLIC - the token is the
// credential). Only what the pass shows: no contact details, no member number.
async function publicPass(token) {
    if (!TOKEN_RE.test(String(token || ''))) return fail('This pass link is not valid.', 404);
    const row = await GuestRegistration.findOne({ where: { passToken: token } });
    if (!row) return fail('This pass link is not valid.', 404);
    const [guest, hosts, letterhead, today] = await Promise.all([
        Guest.findOne({ where: { id: row.guestId }, attributes: ['name'] }),
        hostsById(row.companyId, [row.memberId]),
        getCompanyLetterhead(row.companyId),
        clubToday(row.companyId),
    ]);
    const state = passStateOf(row.status, row.visitDate, today);
    const hostDto = hosts.get(row.memberId);
    return {
        clubName: letterhead ? letterhead.name : '',
        clubLogo: letterhead ? letterhead.logo : null,
        registrationNo: row.registrationNo,
        guestName: guest ? guest.name : '',
        hostName: hostDto ? hostDto.name : '',
        visitDate: String(row.visitDate),
        state,
        stateLabel: (PASS_STATES.find((s) => s.key === state) || {}).label || state,
        arrivedAt: row.arrivedAt,
        // The code is drawn only while the pass can still be used.
        qrDataUrl: state === 'valid' || state === 'upcoming' ? await qrDataUrl(row.passToken) : null,
    };
}

// ---- listing -----------------------------------------------------------------

async function list(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status && GUEST_REGISTRATION_STATUS_KEYS.includes(query.status)) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
        where.visitDate = {};
        if (query.dateFrom && DATE_RE.test(String(query.dateFrom))) where.visitDate[Op.gte] = String(query.dateFrom);
        if (query.dateTo && DATE_RE.test(String(query.dateTo))) where.visitDate[Op.lte] = String(query.dateTo);
    }
    const rows = await GuestRegistration.findAll({ where, order: [['visitDate', 'DESC'], ['createdAt', 'DESC']], limit: 500 });
    // One flag per row, same order (the role's data scope against the stamps).
    const flags = await annotateCanModify(req, rows);
    const [guests, hosts, today, mode] = await Promise.all([
        rows.length ? Guest.findAll({ where: { companyId, id: { [Op.in]: [...new Set(rows.map((r) => r.guestId))] } } }) : [],
        hostsById(companyId, [...new Set(rows.map((r) => r.memberId))]),
        clubToday(companyId),
        numberingGateway.getMode(req, NUMBERING_PURPOSE),
    ]);
    const guestById = new Map(guests.map((g) => [g.id, g]));
    return {
        registrations: rows.map((r, i) => dto(r, guestById.get(r.guestId), hosts.get(r.memberId), today, flags[i])),
        statuses: GUEST_REGISTRATION_STATUSES,
        today,
        // 'auto' | 'manual' | null (no scheme yet) - the drawer asks for a
        // number only when the series is manual.
        numberingMode: mode,
    };
}

async function get(req, id) {
    const l = await load(req, id);
    if (l.error) return l;
    return { registration: dto(l.row, l.guest, l.host, l.today) };
}

function guestDto(g) {
    return g ? { id: g.id, name: g.name, mobile: g.mobile, email: g.email, identityNo: g.identityNo, remarks: g.remarks } : null;
}

// canModify is set on listings only; absent = allowed (the write paths
// check the data scope themselves).
function dto(r, guest, hostDto, today, canModify = undefined) {
    return {
        id: r.id,
        registrationNo: r.registrationNo,
        visitDate: String(r.visitDate),
        status: r.status,
        passState: passStateOf(r.status, r.visitDate, today),
        channel: r.channel,
        guest: guestDto(guest),
        host: hostDto || null,
        passSentAt: r.passSentAt,
        passSentVia: r.passSentVia,
        passSentTo: r.passSentTo,
        arrivedAt: r.arrivedAt,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        remarks: r.remarks,
        createdAt: r.createdAt,
        canModify,
    };
}

// ---- the seam for the other modules (platform/membershipGateway) ------------------
// A producer that serves a guest on the pass (Facility's Control Station,
// 2026-11-12) reads the pass and marks the arrival through these; it never
// touches the tables.

// What a pass says to another module: who the guest is, whose guest, for
// which day, and where it stands today by the club clock.
async function passFactsOf(companyId, row, { transaction } = {}) {
    const [guest, hosts, today] = await Promise.all([
        Guest.findOne({ where: { companyId, id: row.guestId }, attributes: ['id', 'name'], transaction }),
        hostsById(companyId, [row.memberId]),
        clubToday(companyId),
    ]);
    return {
        id: row.id,
        registrationNo: row.registrationNo,
        visitDate: String(row.visitDate),
        visitDateText: dateText(String(row.visitDate)),
        status: row.status,
        passState: passStateOf(row.status, row.visitDate, today),
        arrivedAt: row.arrivedAt || null,
        // Who registered it: 'desk', or the producer module whose counter did.
        channel: row.channel,
        guest: guest ? { id: guest.id, name: guest.name } : { id: row.guestId, name: '' },
        host: hosts.get(row.memberId) || { memberId: row.memberId, memberNo: '', name: '' },
    };
}

// The pass behind a scanned link or a bare token; null when the code holds
// no token or no pass of THIS club matches it.
async function findPassByCode(companyId, code, opts = {}) {
    const token = tokenFromCode(code);
    if (!companyId || !token) return null;
    const row = await GuestRegistration.findOne({ where: { companyId, passToken: token }, transaction: opts.transaction });
    return row ? passFactsOf(companyId, row, opts) : null;
}

async function findPassById(companyId, id, opts = {}) {
    if (!companyId || !id) return null;
    const row = await GuestRegistration.findOne({ where: { companyId, id: String(id) }, transaction: opts.transaction });
    return row ? passFactsOf(companyId, row, opts) : null;
}

// Mark a pass arrived, once: a pass already arrived, cancelled or not for
// today is left as it is. Returns true when THIS call marked it.
async function markArrived(companyId, id, { actorId = null, transaction } = {}) {
    const row = await GuestRegistration.findOne({ where: { companyId, id: String(id) }, transaction });
    if (!row || row.status !== 'registered') return false;
    if (passStateOf(row.status, row.visitDate, await clubToday(companyId)) !== 'valid') return false;
    Object.assign(row, { status: 'arrived', arrivedAt: new Date(), arrivedBy: actorId, updatedBy: actorId });
    await row.save({ transaction });
    return true;
}

// ---- the door: a producer registers a guest standing at its counter ----------------
// (Facility's Control Station, slice 6c, 2026-11-12.) The guest is at the
// counter WITH the member, so the registration is born 'arrived'. The same
// rules as the front desk's own registration: the returning guest is the
// same name with the same mobile or email, a guest already registered with
// this host for the date keeps that pass (nothing is created, nothing more is
// drawn), and an exhausted monthly allowance refuses.
//   -> { pass, created, counted, share } | { error, status }
//   -> { nameOnly: true, warning } when the club has no automatic Guest
//      Registration No. series: the door is never refused for that, the
//      producer serves the guest by name.
// Inside the producer's own transaction when one is passed.
async function registerAtDoor(req, { memberId, visitDate = null, guest, channel = 'facility' } = {}, opts = {}) {
    const companyId = getUserContext(req).companyId;
    if (!companyId || !memberId) return fail('The host member is missing.');
    const g = normalizeGuest(guest);
    if (g.error) return g;
    const today = await clubToday(companyId);
    const date = visitDate && DATE_RE.test(String(visitDate)) ? String(visitDate) : today;
    if (date < today) return fail(`${dateText(date)} has passed - a guest is registered for today or a later date.`);
    const hostDto = (await hostsById(companyId, [memberId])).get(memberId);
    if (!hostDto) return fail('The host member was not found.', 404);
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
    const work = async (transaction) => {
        const Member = require('./member.model');
        await Member.findOne({ where: { companyId, id: memberId }, attributes: ['id'], lock: transaction.LOCK.UPDATE, transaction });
        const guestRow = await resolveGuest(companyId, {}, g.value, stamps, { transaction });
        const live = await GuestRegistration.findOne({ where: { companyId, memberId, guestId: guestRow.id, visitDate: date, status: { [Op.ne]: 'cancelled' } }, transaction });
        if (live) {
            if (live.status === 'registered' && date === today) {
                Object.assign(live, { status: 'arrived', arrivedAt: new Date(), arrivedBy: callerId, updatedBy: callerId });
                await live.save({ transaction });
            }
            return { row: live, guestRow, created: false, counted: true };
        }
        const counted = await guestVisits.alreadyCounted(companyId, memberId, guestRow.id, date, { transaction });
        const allowance = await guestVisits.getStanding(companyId, memberId, date, { transaction });
        if (!counted && allowance && allowance.allowance !== null && allowance.remaining < 1) {
            throw txFail(allowance.allowance === 0
                ? `${hostDto.name} (${hostDto.memberNo}) may not bring guests under their membership type.`
                : `${hostDto.name} (${hostDto.memberNo}) has used all ${allowance.allowance} guest visits for ${monthText(date)}.`);
        }
        const issued = await numberingGateway.issueNumber(req, NUMBERING_PURPOSE, { transaction });
        if (!issued || !issued.number) throw Object.assign(new Error('no automatic series'), { noSeries: true });
        const arrived = date === today;
        const row = await GuestRegistration.create({
            companyId, registrationNo: issued.number, guestId: guestRow.id, memberId, visitDate: date,
            status: arrived ? 'arrived' : 'registered', arrivedAt: arrived ? new Date() : null, arrivedBy: arrived ? callerId : null,
            channel, passToken: crypto.randomBytes(32).toString('hex'), ...stamps,
        }, { transaction });
        await guestVisits.record(companyId, {
            memberId, visitDate: date, sourceModule: SOURCE_MODULE, sourceRef: row.id,
            guestId: guestRow.id, guestName: guestRow.name, guestCount: 1, stamps,
        }, { transaction });
        return { row, guestRow, created: true, counted };
    };
    let out;
    try {
        out = opts.transaction ? await work(opts.transaction) : await sequelize.transaction(work);
    } catch (err) {
        if (err && err.noSeries) {
            return { nameOnly: true, warning: `No automatic Guest Registration No. series is set up (Membership Management - Numbering Control) - ${g.value.name} is served by name, without a pass.` };
        }
        if (err && err.httpStatus) return { error: err.message, status: err.httpStatus };
        if (!opts.transaction && err && err.name === 'SequelizeUniqueConstraintError') return { error: 'This guest is already registered with this member for that date.', status: 409 };
        throw err;
    }
    const company = await getCompanyProfile(companyId);
    return {
        pass: await passFactsOf(companyId, out.row, { transaction: opts.transaction }),
        created: out.created,
        counted: out.counted,
        share: await shareFactsOf(out.row, out.guestRow, hostDto, company),
    };
}

// What a counter needs to hand the pass over, without the guest's contact
// details themselves: the link, its QR code, the WhatsApp click-to-chat link
// (a guest with a mobile) and whether the pass can be emailed.
async function shareFactsOf(row, guest, hostDto, company) {
    const facts = await passFacts(row, guest, hostDto, company);
    return {
        guestRegistrationId: row.id, registrationNo: row.registrationNo, passUrl: facts.passUrl, qrDataUrl: facts.qrDataUrl, whatsappUrl: facts.whatsappUrl,
        canEmail: !!guest.email, sentVia: row.passSentVia || null,
    };
}

// The share facts of an existing pass (null when there is none to hand over).
async function passShare(req, id) {
    const l = await load(req, id);
    if (l.error || l.row.status === 'cancelled') return null;
    return shareFactsOf(l.row, l.guest, l.host, await getCompanyProfile(l.companyId));
}

// The live passes of one host for a date - the guests a counter may be
// serving under that member today, before any of them has taken anything.
async function passesOfHost(companyId, memberId, date, { transaction } = {}) {
    if (!companyId || !memberId) return [];
    const rows = await GuestRegistration.findAll({ where: { companyId, memberId, visitDate: String(date), status: { [Op.ne]: 'cancelled' } }, order: [['createdAt', 'ASC']], transaction });
    if (!rows.length) return [];
    const guests = await Guest.findAll({ where: { companyId, id: { [Op.in]: rows.map((r) => r.guestId) } }, attributes: ['id', 'name'], transaction });
    const nameOf = new Map(guests.map((g) => [g.id, g.name]));
    return rows.map((r) => ({ id: r.id, registrationNo: r.registrationNo, status: r.status, channel: r.channel, guest: { id: r.guestId, name: nameOf.get(r.guestId) || '' } }));
}

// Undo a registration a producer's counter created (never one of the front
// desk's or the portal's): it is cancelled with the reason and its visit no
// longer counts. Returns true when THIS call cancelled it.
async function cancelAtDoor(companyId, id, { channel = 'facility', actorId = null, reason = null, transaction } = {}) {
    const row = await GuestRegistration.findOne({ where: { companyId, id: String(id) }, transaction });
    if (!row || row.status === 'cancelled' || row.channel !== channel) return false;
    Object.assign(row, { status: 'cancelled', cancelledAt: new Date(), cancelReason: str(reason) || 'Removed at the counter', updatedBy: actorId });
    await row.save({ transaction });
    await guestVisits.voidVisit(companyId, SOURCE_MODULE, row.id, { transaction, updatedBy: actorId });
    return true;
}

module.exports = {
    passStateOf, normalizeMobile, normalizeGuest, tokenFromCode, whatsappLink, shareText, passUrlOf,
    host, searchGuests, create, update, cancel, arrive, pass, send, scan, publicPass, list, get,
    findPassByCode, findPassById, markArrived,
    registerAtDoor, cancelAtDoor, passShare, passesOfHost,
};
