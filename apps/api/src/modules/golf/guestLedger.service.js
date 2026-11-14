// The member's guests in golf (user decisions 2026-11-13) - ONE place for the
// three things every channel does with a hosted guest line, so the booking
// save, change booking, the approval rejection and the front desk can never
// drift apart:
//
//   1. DERIVE Member as Guest: a member on ANOTHER member's booking (or a
//      walk-in member under a named host) who holds no playing right or round
//      quota of their own for the flight plays as that member's guest. Nobody
//      picks the class; the engine decides it from the rules the club set up.
//   2. JUDGE the host's rules strictly: the flight's allow-guests flag, the
//      host's per-booking guest quota and the monthly guest allowance of the
//      host's membership type (Membership's own ledger, counted club-wide).
//   3. RECORD / VOID the visits on membership.GuestVisit through
//      platform/membershipGateway.js - one visit per hosted guest line, keyed
//      on the STARTING-NINE golf.Player id (the crossover record of an 18-hole
//      pair writes nothing), kept on a no-show, voided when the line goes.
//
// A hosted guest is a guest-base or member-guest-base line. Visitors (no
// host), affiliated and reciprocal club members never touch any of this.

const {
    getGuestAllowanceStanding, recordGuestVisit, voidGuestVisit, guestAlreadyCounted,
    listGuestPassesOfHost, markGuestArrived,
} = require('../../platform/membershipGateway');
const playerTypes = require('./playerType.service');

const SOURCE_MODULE = 'golf';

// ---- pure pieces (unit-tested) ----------------------------------------------

// The refusal a guest-control verdict gives a roster of bases, or null.
// `bases` = the engine class of every line on the flight after the save.
function guestControlRefusal(gc, bases) {
    if (!gc.allowGuest && bases.some((b) => b === 'guest' || b === 'member-guest')) {
        return 'Guests are not allowed on this flight (guest control).';
    }
    if (!gc.allowVisitor && bases.includes('visitor')) {
        return 'Visitors are not allowed on this flight (guest control).';
    }
    return null;
}

// The per-booking quota refusal for a host's membership type, or null.
// quota NULL = no limit, 0 = no guests at all.
function quotaRefusal(quota, guestCount, category, { would = false } = {}) {
    if (!guestCount || quota === null || quota === undefined || guestCount <= quota) return null;
    const type = `Membership type ${category || ''}`.replace(/\s+$/, '');
    if (quota === 0) return `${type} cannot bring guests.`;
    return `${type} can bring up to ${quota} guest(s) per booking - this booking ${would ? 'would have' : 'has'} ${guestCount} (members playing as guests count).`;
}

// The monthly-allowance refusal, or null. `standing` = { allowance, used,
// remaining } (allowance NULL = no limit); `needed` = the NEW visits wanted.
function allowanceRefusal(standing, needed, host, noun = 'this booking') {
    if (!needed || !standing || standing.allowance === null || standing.allowance === undefined) return null;
    if (standing.remaining >= needed) return null;
    return `${host.name} (${host.memberNo}) has ${standing.remaining} of ${standing.allowance} monthly guest visits left - ${noun} needs ${needed}.`;
}

// The sentence the desk reads when the engine turned members into guests.
function derivedNote(derived) {
    if (!derived.length) return '';
    return ` ${derived.map((d) => `${d.playerName} (${d.memberNo}) plays as a guest - ${d.reason}.`).join(' ')}`;
}

// ---- 1. derive --------------------------------------------------------------

// Turn the member lines that hold no right of their own into Member as Guest.
// `lines` = [{ playerType, standing, golferId, playerName, memberNo }] - the
// lines are MUTATED (playerType, derivedReason). The host's own line is never
// derived (the host must hold the right; the rights check refuses otherwise).
// Returns the derived lines [{ playerName, memberNo, reason }].
async function deriveMemberGuests(companyId, { lines, types, course, playDate, teeTime, dayType, hostMemberId = null, excludeProfileId = null, transaction }) {
    const rights = require('./playingRights.service');
    const rules = await rights.loadRules(companyId, { transaction });
    const derived = [];
    if (!rules.enabled) return derived;
    for (const l of lines) {
        if (!l.standing || !playerTypes.isMemberBase(types, l.playerType)) continue;
        if (hostMemberId && l.standing.memberId === hostMemberId) continue;
        const reason = await rights.ownRightShortfall(companyId, {
            course, playDate, teeTime, dayType, playerType: l.playerType,
            golferId: l.golferId || null, membershipTypeId: l.standing.membershipTypeId,
            excludeProfileId, rules, types, transaction,
        });
        if (!reason) continue;
        l.playerType = playerTypes.MEMBER_GUEST_CODE;
        l.derivedReason = reason;
        derived.push({ playerName: l.playerName, memberNo: l.memberNo, reason });
    }
    return derived;
}

// ---- 2. judge ---------------------------------------------------------------

// A pass picked on a guest line: it must be a live pass of THIS host for the
// date. Returns { guest: { id, name }, passId } or { error }.
async function resolvePassPick(companyId, { hostMemberId, date, guestId, transaction }) {
    const passes = await listGuestPassesOfHost(companyId, hostMemberId, date, { transaction });
    const pass = passes.find((p) => p.guest && p.guest.id === String(guestId));
    if (!pass) return { error: 'That guest pass is no longer one of this member\'s passes for the date - pick again.' };
    return { guest: pass.guest, passId: pass.id };
}

// How many NEW visits a set of hosted-guest lines draws from the host's
// allowance on `date`: a line naming a KNOWN guest the host already has a
// visit for that day draws nothing (once per host per day, across modules).
// `ownRefs` = starting-nine Player ids whose existing visits are being
// re-recorded (a move to another day), left out of "already counted".
async function visitsNeeded(companyId, { hostMemberId, date, lines, transaction }) {
    let needed = 0;
    const seenGuests = new Set();
    for (const l of lines) {
        if (l.guestId) {
            if (seenGuests.has(l.guestId)) continue;
            seenGuests.add(l.guestId);
            const excludeSource = l.sourceRef ? { sourceModule: SOURCE_MODULE, sourceRef: l.sourceRef } : null;
            if (await guestAlreadyCounted(companyId, hostMemberId, l.guestId, date, { transaction, excludeSource })) continue;
        }
        needed += 1;
    }
    return needed;
}

// The host's monthly allowance against the visits a save needs. Returns
// { refusal } or { standing, needed }.
async function checkAllowance(companyId, { host, date, lines, noun, transaction }) {
    if (!lines.length) return { standing: null, needed: 0 };
    const needed = await visitsNeeded(companyId, { hostMemberId: host.memberId, date, lines, transaction });
    const standing = await getGuestAllowanceStanding(companyId, host.memberId, date, { transaction });
    const refusal = allowanceRefusal(standing, needed, host, noun);
    return refusal ? { refusal } : { standing, needed };
}

// ---- 3. record / void ---------------------------------------------------------

// Record the visit of ONE hosted-guest starting-nine record and stamp it.
async function recordFor(companyId, row, { host, date, guestId = null, stamps = {}, transaction }) {
    const visit = await recordGuestVisit(companyId, {
        memberId: host.memberId, visitDate: date, sourceModule: SOURCE_MODULE, sourceRef: row.id,
        guestId: guestId || row.guestId || null, guestName: row.playerName, guestCount: 1, stamps,
    }, { transaction });
    row.guestVisitId = visit && visit.id ? visit.id : null;
    if (guestId) row.guestId = guestId;
    await row.save({ transaction });
    return visit;
}

// Void the visits of starting-nine records that carry one (dropped players,
// a cancelled or rejected booking, a cancelled walk-in).
async function voidFor(companyId, rows, { updatedBy = null, transaction } = {}) {
    let n = 0;
    for (const r of rows) {
        if (!r.guestVisitId) continue;
        await voidGuestVisit(companyId, SOURCE_MODULE, r.id, { transaction, updatedBy });
        n += 1;
    }
    return n;
}

// Registration of a guest line that names a pass guest: the host's pass for
// the date is marked arrived (idempotent; a line without a pass does nothing).
async function markPassArrived(companyId, { hostMemberId, date, guestId, actorId = null, transaction }) {
    if (!hostMemberId || !guestId) return false;
    const passes = await listGuestPassesOfHost(companyId, hostMemberId, date, { transaction });
    const pass = passes.find((p) => p.guest && p.guest.id === String(guestId));
    if (!pass) return false;
    return markGuestArrived(companyId, pass.id, { actorId, transaction });
}

// The standing the screens show before players are keyed (null = no member).
async function allowanceOf(companyId, memberId, date, opts = {}) {
    return getGuestAllowanceStanding(companyId, memberId, date, opts);
}

async function passesOf(companyId, memberId, date, opts = {}) {
    return listGuestPassesOfHost(companyId, memberId, date, opts);
}

module.exports = {
    SOURCE_MODULE,
    guestControlRefusal, quotaRefusal, allowanceRefusal, derivedNote,
    deriveMemberGuests, resolvePassPick, visitsNeeded, checkAllowance,
    recordFor, voidFor, markPassArrived, allowanceOf, passesOf,
};
