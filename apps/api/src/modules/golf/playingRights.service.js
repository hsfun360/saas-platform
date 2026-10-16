// Playing rights + round quotas (spec 2.3.4 / 2.3.5; user decisions
// 2026-10-15) - the engine behind GolfSetting.playingRightsEnabled.
//
//   RIGHTS  - a whitelist per TARGET (a player type, optionally refined to a
//             membership type, or an affiliated club): a target with no rows
//             is unrestricted; with rows, a line of that target may only play
//             when the flight's course, day type, tee time and date fall
//             inside at least one row. Club rules outrank type rules.
//   QUOTAS  - the maximum rounds per calendar period per target, by day type;
//             the most specific row wins; rounds are the golfer's booked or
//             registered starting-nine records in the period on days the row
//             covers. `maxGuestRounds` caps the guest lines on the golfer's
//             own bookings over the same period.
// The booking channel REFUSES (create, change, visit confirmation); the desk
// WARNS (registration) - the seats-authoritative split every control keeps.
// The pure pieces (rightAllows, pickQuota, periodWindow) are unit-tested.

const { Op } = require('sequelize');
const GolfSetting = require('./golfSetting.model');
const PlayingRightRule = require('./playingRightRule.model');
const RoundQuotaRule = require('./roundQuotaRule.model');
const Player = require('./player.model');
const BookingProfile = require('./bookingProfile.model');
const Course = require('./course.model');
const availability = require('./bookingAvailability.service');
const playerTypes = require('./playerType.service');
const { classifyDateRangeForCompany } = require('../../platform/calendarGateway');
const { getAffiliatedClub } = require('../../platform/membershipGateway');

function toMinutes(t) {
    return availability.toMinutes(String(t).slice(0, 5));
}

// ---- pure rules ------------------------------------------------------------

// The calendar period that holds `date`: { from, to } inclusive.
function periodWindow(period, date) {
    const d = new Date(`${date}T00:00:00Z`);
    if (period === 'week') {
        const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
        const from = new Date(d.getTime() - (dow - 1) * 86400000);
        return { from: from.toISOString().slice(0, 10), to: new Date(from.getTime() + 6 * 86400000).toISOString().slice(0, 10) };
    }
    if (period === 'month') {
        return {
            from: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10),
            to: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10),
        };
    }
    return { from: `${d.getUTCFullYear()}-01-01`, to: `${d.getUTCFullYear()}-12-31` };
}

// Does a day scope cover a date of `dayType` / `dayOfWeek`?
function scopeCovers(dayScope, dayType, dayOfWeek) {
    return dayScope === 'all' || dayScope === dayType || dayScope === dayOfWeek;
}

// The rules of a target: club rules when the line has a club, else the type
// rules (a membershipTypeId refinement must match the line's or be NULL).
function rulesFor(rules, target) {
    if (target.affiliatedClubId) return rules.filter((r) => r.affiliatedClubId && r.affiliatedClubId === target.affiliatedClubId);
    if (!target.playerTypeId) return [];
    return rules.filter((r) => !r.affiliatedClubId && r.playerTypeId === target.playerTypeId
        && (!r.membershipTypeId || r.membershipTypeId === (target.membershipTypeId || null)));
}

// Whitelist test: null = allowed (no rows for the target, or a row fits),
// else the reason.
function rightAllows(rules, target, { courseId, dayType, dayOfWeek, teeMinutes, playDate }) {
    const mine = rulesFor(rules, target);
    if (!mine.length) return null;
    const fits = mine.some((r) => {
        if (r.courseId && r.courseId !== courseId) return false;
        if (!scopeCovers(r.dayScope, dayType, dayOfWeek)) return false;
        if (r.startTime) {
            const s = toMinutes(r.startTime);
            const e = toMinutes(r.endTime);
            if (teeMinutes < s || teeMinutes >= e) return false;
        }
        if (r.effectiveFrom && playDate < String(r.effectiveFrom)) return false;
        if (r.effectiveTo && playDate > String(r.effectiveTo)) return false;
        return true;
    });
    return fits ? null : 'outside the playing rights of';
}

// The most specific quota row for a target on a date, or null.
function pickQuota(rules, target, { dayType, dayOfWeek }) {
    let best = null;
    let bestScore = -1;
    for (const r of rulesFor(rules, target)) {
        if (!scopeCovers(r.dayScope, dayType, dayOfWeek)) continue;
        const scopeScore = r.dayScope === 'all' ? 0 : (r.dayScope === dayType ? 1 : 2);
        const score = (r.affiliatedClubId ? 8 : 0) + (r.membershipTypeId ? 4 : 0) + scopeScore;
        if (score > bestScore) { best = r; bestScore = score; }
    }
    return best;
}

// ---- loading -----------------------------------------------------------------

async function loadRules(companyId, { transaction } = {}) {
    const [setting, rightRules, quotaRules] = await Promise.all([
        GolfSetting.findOne({ where: { companyId }, attributes: ['playingRightsEnabled'], transaction }),
        PlayingRightRule.findAll({ where: { companyId }, transaction }),
        RoundQuotaRule.findAll({ where: { companyId }, transaction }),
    ]);
    return { enabled: !!(setting && setting.playingRightsEnabled === true), rightRules, quotaRules };
}

// The target of a line: its player type (id from the code) + membership
// type (from the member's standing) or the affiliated club of its golfer.
function targetOf(types, { playerType, membershipTypeId = null, affiliatedClubId = null }) {
    const t = playerTypes.findType(types, playerType);
    return { playerTypeId: t ? t.id : null, membershipTypeId: membershipTypeId || null, affiliatedClubId: affiliatedClubId || null };
}

// Rounds the golfer already holds in the quota's period on the days the row
// covers (booked or registered starting-nine records; a booking being
// amended is excluded). Returns { rounds, guestRounds }.
async function countRounds(companyId, golferId, rule, playDate, { transaction, excludeProfileId = null } = {}) {
    const w = periodWindow(rule.period, playDate);
    const where = { companyId, golferId, secondNineFlag: 0, status: { [Op.in]: ['booked', 'registered'] }, playDate: { [Op.gte]: w.from, [Op.lte]: w.to } };
    if (excludeProfileId) where.bookingProfileId = { [Op.or]: [{ [Op.ne]: excludeProfileId }, { [Op.is]: null }] };
    const rows = await Player.findAll({ where, attributes: ['playDate', 'bookingProfileId'], transaction });
    const profileWhere = { companyId, bookerGolferId: golferId, status: 'booked', playDate: { [Op.gte]: w.from, [Op.lte]: w.to } };
    if (excludeProfileId) profileWhere.id = { [Op.ne]: excludeProfileId };
    const own = await BookingProfile.findAll({ where: profileWhere, attributes: ['id', 'playDate'], transaction });
    const guestRows = own.length
        ? await Player.findAll({ where: { bookingProfileId: { [Op.in]: own.map((p) => p.id) }, secondNineFlag: 0, status: { [Op.in]: ['booked', 'registered'] }, playerType: { [Op.ne]: 'member' } }, attributes: ['playDate', 'playerType'], transaction })
        : [];
    if (rule.dayScope === 'all') return { rounds: rows.length, guestRounds: guestRows.length, window: w };
    const days = await classifyDateRangeForCompany(companyId, w.from, w.to);
    const typeByDate = new Map(days.map((d) => [d.date, d.dayType]));
    const covers = (date) => scopeCovers(rule.dayScope, typeByDate.get(date) || 'weekday', availability.dayOfWeekOf(date));
    return {
        rounds: rows.filter((r) => covers(String(r.playDate))).length,
        guestRounds: guestRows.filter((r) => covers(String(r.playDate))).length,
        window: w,
    };
}

// ---- the booking-channel check ----------------------------------------------

// Judge every line of a booking. `lines` = [{ label, playerType, golferId,
// membershipTypeId, affiliatedClubId, isGuestLine }]; `bookingGuestCount`
// = the guest-like lines on this booking (for maxGuestRounds of the booker).
// Returns the first failure message or null.
async function checkBooking(companyId, { course, playDate, teeTime, dayType, lines, bookerGolferId = null, bookingGuestCount = 0, excludeProfileId = null, transaction } = {}) {
    const rules = await loadRules(companyId, { transaction });
    if (!rules.enabled || (!rules.rightRules.length && !rules.quotaRules.length)) return null;
    const types = await playerTypes.catalog(companyId, { transaction });
    const dayOfWeek = availability.dayOfWeekOf(playDate);
    const teeMinutes = toMinutes(teeTime);
    const courseLabel = course.courseCode || 'the course';
    for (const line of lines) {
        const target = targetOf(types, line);
        const typeLabel = line.affiliatedClubId ? (line.clubName || 'the affiliated club') : playerTypes.labelOf(types, line.playerType);
        const reason = rightAllows(rules.rightRules, target, { courseId: course.id, dayType, dayOfWeek, teeMinutes, playDate });
        if (reason) return `${line.label}: ${courseLabel} at ${teeTime} on ${playDate} is ${reason} ${typeLabel}.`;
        if (!line.golferId) continue;
        const quota = pickQuota(rules.quotaRules, target, { dayType, dayOfWeek });
        if (!quota) continue;
        const counted = await countRounds(companyId, line.golferId, quota, playDate, { transaction, excludeProfileId });
        const scopeText = quota.dayScope === 'all' ? '' : ` ${quota.dayScope}`;
        if (counted.rounds + 1 > quota.maxRounds) {
            return `${line.label}: already has ${counted.rounds}${scopeText} round(s) this ${quota.period} (${counted.window.from} to ${counted.window.to}) - ${typeLabel} allows ${quota.maxRounds}.`;
        }
        if (quota.maxGuestRounds !== null && quota.maxGuestRounds !== undefined && bookerGolferId && line.golferId === bookerGolferId) {
            if (counted.guestRounds + bookingGuestCount > quota.maxGuestRounds) {
                return `${line.label}: has brought ${counted.guestRounds}${scopeText} guest round(s) this ${quota.period} - ${typeLabel} allows ${quota.maxGuestRounds}; this booking adds ${bookingGuestCount}.`;
            }
        }
    }
    return null;
}

// ---- the desk warning --------------------------------------------------------

// Playing rights of the players seated in a cell, as warnings (the desk stays
// seats-authoritative). Quotas are not re-counted at the desk.
async function deskWarnings({ companyId, courseId, playDate, teeTime, playerIds, transaction }) {
    try {
        const rules = await loadRules(companyId, { transaction });
        if (!rules.enabled || !rules.rightRules.length) return [];
        const rows = await Player.findAll({ where: { companyId, id: { [Op.in]: playerIds } }, transaction });
        if (!rows.length) return [];
        const [types, course, days] = await Promise.all([
            playerTypes.catalog(companyId, { transaction }),
            Course.findOne({ where: { companyId, id: courseId }, attributes: ['id', 'courseCode'], transaction }),
            classifyDateRangeForCompany(companyId, playDate, playDate),
        ]);
        const dayType = days.length ? days[0].dayType : 'weekday';
        const dayOfWeek = availability.dayOfWeekOf(playDate);
        const teeMinutes = toMinutes(teeTime);
        const { getGolfMemberStanding } = require('../../platform/membershipGateway');
        const OtherGolfer = require('./otherGolfer.model');
        const Golfer = require('./golfer.model');
        const out = [];
        for (const r of rows) {
            let membershipTypeId = null;
            let affiliatedClubId = null;
            let clubName = null;
            if (r.golferId) {
                const g = await Golfer.findOne({ where: { companyId, id: r.golferId }, attributes: ['golferType', 'memberNo', 'sourceId'], transaction });
                if (g && g.golferType === 'member' && g.memberNo) {
                    const st = await getGolfMemberStanding(companyId, g.memberNo);
                    membershipTypeId = st ? st.membershipTypeId : null;
                } else if (g && g.golferType === 'other') {
                    const og = await OtherGolfer.findOne({ where: { companyId, id: g.sourceId }, attributes: ['affiliatedClubId'], transaction });
                    if (og && og.affiliatedClubId) {
                        affiliatedClubId = og.affiliatedClubId;
                        const club = await getAffiliatedClub(companyId, og.affiliatedClubId);
                        clubName = club ? club.name : null;
                    }
                }
            }
            const target = targetOf(types, { playerType: r.playerType, membershipTypeId, affiliatedClubId });
            const reason = rightAllows(rules.rightRules, target, { courseId, dayType, dayOfWeek, teeMinutes, playDate });
            if (reason) out.push(`${r.playerName}: ${course ? course.courseCode : 'this course'} at ${String(teeTime).slice(0, 5)} is ${reason} ${affiliatedClubId ? (clubName || 'the affiliated club') : playerTypes.labelOf(types, r.playerType)}.`);
        }
        return out;
    } catch (err) {
        console.warn('[GOLF RIGHTS] desk warning check failed:', err.message);
        return [];
    }
}

module.exports = { periodWindow, scopeCovers, rulesFor, rightAllows, pickQuota, loadRules, targetOf, countRounds, checkBooking, deskWarnings };
