// Handicap control (Tropicana procedure 2.1-2.3; user decisions 2026-09-29).
// Evaluates a FLIGHT's players against the HandicapLimitRule and
// HandicapAccompanimentRule rows, under the GolfSetting.handicapControlEnabled
// master switch. ONE evaluation path for both channels: the booking save
// REFUSES on violations, the front desk registers with a WARNING (user
// decision - the desk stays seats-authoritative).
//
// Player descriptors: { name, gender: 'male'|'female'|null,
// handicapIndex: number|null, handicapStatus: key|null }. Unrated golfers
// (no index) are exempt from limit caps; golfers with no status are never
// accompaniment targets; unknown gender takes the stricter matching cap.

const { Op } = require('sequelize');
const HandicapLimitRule = require('./handicapLimitRule.model');
const HandicapAccompanimentRule = require('./handicapAccompanimentRule.model');
const Golfer = require('./golfer.model');
const OtherGolfer = require('./otherGolfer.model');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');

function toMinutes(t) {
    if (!t) return null;
    const [h, m] = String(t).slice(0, 5).split(':').map(Number);
    return h * 60 + m;
}

function num(v) {
    return v === null || v === undefined ? null : Number(v);
}

// Both active rule sets of a company (loaded once per save/registration).
async function loadHandicapRules(companyId) {
    const [limitRules, accompanimentRules] = await Promise.all([
        HandicapLimitRule.findAll({ where: { companyId, isActive: true } }),
        HandicapAccompanimentRule.findAll({ where: { companyId, isActive: true } }),
    ]);
    return { limitRules, accompanimentRules };
}

// Day-scope ladder score shared with bookingAvailability.pickRule: specific
// day-of-week (2) > exact weekday/weekend (1) > 'all' (0); -1 = no match.
function scopeScore(ruleScope, dayType, dayOfWeek) {
    if (ruleScope === 'all') return 0;
    if (ruleScope === dayType) return 1;
    if (dayOfWeek && ruleScope === dayOfWeek) return 2;
    return -1;
}

// The most specific LIMIT rule for one gender key ('men'|'women'), also
// accepting 'any' rules. Score: course 16 > holes 8 > gender 4 > day ladder.
function pickLimitRule(rules, { courseId, dayType, dayOfWeek, holes, genderKey }) {
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
        if (r.courseId && r.courseId !== courseId) continue;
        if (r.holes !== null && r.holes !== undefined && Number(r.holes) !== holes) continue;
        if (r.gender !== 'any' && r.gender !== genderKey) continue;
        const s = scopeScore(r.dayScope, dayType, dayOfWeek);
        if (s < 0) continue;
        const score = (r.courseId ? 16 : 0) + (r.holes !== null && r.holes !== undefined ? 8 : 0) + (r.gender !== 'any' ? 4 : 0) + s;
        if (score > bestScore) {
            best = r;
            bestScore = score;
        }
    }
    return best;
}

// The most specific ACCOMPANIMENT rule for the flight. Score: course 16 >
// holes 8 > time band 4 > day ladder.
function pickAccompanimentRule(rules, { courseId, dayType, dayOfWeek, holes, teeMinutes }) {
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
        if (r.courseId && r.courseId !== courseId) continue;
        if (r.holes !== null && r.holes !== undefined && Number(r.holes) !== holes) continue;
        if (r.startTime) {
            const s = toMinutes(r.startTime);
            const e = toMinutes(r.endTime);
            if (teeMinutes < s || teeMinutes >= e) continue;
        }
        const s = scopeScore(r.dayScope, dayType, dayOfWeek);
        if (s < 0) continue;
        const score = (r.courseId ? 16 : 0) + (r.holes !== null && r.holes !== undefined ? 8 : 0) + (r.startTime ? 4 : 0) + s;
        if (score > bestScore) {
            best = r;
            bestScore = score;
        }
    }
    return best;
}

const GENDER_LABELS = { men: 'men', women: 'ladies' };

function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

// Evaluate one flight. `players` = the players being ADDED (checked against
// the rules); `companions` = every player of the flight (added + already
// seated) - the accompaniment pool. Returns a list of violation MESSAGES
// (the caller decides refuse vs warn).
function evaluateFlight({ limitRules, accompanimentRules, courseId, dayType, dayOfWeek, holes, teeTime, players, companions }) {
    const messages = [];
    const teeMinutes = toMinutes(teeTime);

    // ---- limit rules (procedure 2.1), per player ----
    for (const p of players) {
        // Which gender keys to check: known gender = that key + 'any' rules;
        // unknown = both keys (the stricter matching cap wins by refusing).
        const keys = p.gender === 'male' ? ['men'] : p.gender === 'female' ? ['women'] : ['men', 'women'];
        for (const key of keys) {
            const rule = pickLimitRule(limitRules, { courseId, dayType, dayOfWeek, holes, genderKey: key });
            if (!rule) continue;
            const cap = num(rule.maxHandicap);
            const index = num(p.handicapIndex);
            if (index !== null && index > cap) {
                messages.push(`${p.name}: handicap ${index.toFixed(1)} is over the ${GENDER_LABELS[rule.gender] || ''} limit of ${cap.toFixed(1)}${rule.dayScope !== 'all' ? ` (${rule.dayScope})` : ''} - handicap control.`);
                break;
            }
            if (rule.latestTeeOff && teeMinutes > toMinutes(rule.latestTeeOff)) {
                messages.push(`${p.name}: last tee-off under the ${GENDER_LABELS[rule.gender] || ''} handicap rule${rule.dayScope !== 'all' ? ` (${rule.dayScope})` : ''} is ${hhmm(rule.latestTeeOff)} - handicap control.`);
                break;
            }
        }
    }

    // ---- accompaniment rule (procedure 2.2/2.3), per flight ----
    const rule = pickAccompanimentRule(accompanimentRules, { courseId, dayType, dayOfWeek, holes, teeMinutes });
    if (rule) {
        const targeted = players.filter((p) => (rule.appliesToBeginner && p.handicapStatus === 'beginner')
            || (rule.appliesToProvisional && p.handicapStatus === 'provisional'));
        if (targeted.length) {
            const names = targeted.map((p) => p.name).join(', ');
            if (rule.latestTeeOff && teeMinutes > toMinutes(rule.latestTeeOff)) {
                messages.push(`${names}: beginners/provisional golfers may not tee off after ${hhmm(rule.latestTeeOff)}${rule.dayScope !== 'all' ? ` (${rule.dayScope})` : ''} - handicap control.`);
            }
            const menCap = num(rule.companionMaxHandicapMen);
            const womenCap = num(rule.companionMaxHandicapWomen);
            const qualifies = (c) => {
                if (c.handicapStatus !== 'established') return false;
                const index = num(c.handicapIndex);
                if (index === null) return false;
                // Unknown gender must clear the stricter cap.
                const cap = c.gender === 'male' ? menCap : c.gender === 'female' ? womenCap : Math.min(menCap, womenCap);
                return index <= cap;
            };
            const count = companions.filter(qualifies).length;
            if (count < rule.minCompanions) {
                messages.push(`${names}: this flight needs at least ${rule.minCompanions} established golfer(s) with handicap ${menCap.toFixed(1)} and below (men) / ${womenCap.toFixed(1)} and below (ladies) to accompany a beginner/provisional golfer - handicap control.`);
            }
        }
    }
    return messages;
}

// Descriptor for a golf.Golfer row: golf-owned handicap fields + the
// person's gender from its profile source (member -> membership standing,
// other -> OtherGolfer). `standingByMemberNo` lets callers reuse standings
// they already fetched.
async function describeGolfer(companyId, golfer, { standingByMemberNo = new Map(), transaction } = {}) {
    let gender = null;
    if (golfer.golferType === 'member' && golfer.memberNo) {
        let standing = standingByMemberNo.get(golfer.memberNo);
        if (standing === undefined) {
            standing = await getGolfMemberStanding(companyId, golfer.memberNo);
            standingByMemberNo.set(golfer.memberNo, standing);
        }
        gender = standing ? standing.gender : null;
    } else if (golfer.golferType === 'other') {
        const profile = await OtherGolfer.findOne({ where: { companyId, id: golfer.sourceId }, attributes: ['gender'], transaction });
        gender = profile ? profile.gender || null : null;
    }
    return {
        name: golfer.name,
        gender,
        handicapIndex: num(golfer.handicapIndex),
        handicapStatus: golfer.handicapStatus || null,
    };
}

// Descriptors for the players ALREADY SEATED in a nine-cell (active Player
// records at unitCourseId+teeTime, excluding `excludeProfileId`'s own).
async function describeSeatedPlayers(companyId, { unitCourseId, playDate, teeTime, excludeProfileId = null, excludePlayerIds = [], transaction } = {}) {
    const Player = require('./player.model');
    const where = {
        companyId,
        unitCourseId,
        playDate,
        teeTime,
        secondNineFlag: 0,
        status: { [Op.in]: ['booked', 'registered'] },
    };
    const rows = (await Player.findAll({ where, transaction }))
        .filter((r) => (!excludeProfileId || r.bookingProfileId !== excludeProfileId) && !excludePlayerIds.includes(r.id));
    const out = [];
    const standings = new Map();
    for (const r of rows) {
        if (!r.golferId) {
            out.push({ playerId: r.id, name: r.playerName, gender: null, handicapIndex: null, handicapStatus: null });
            continue;
        }
        const golfer = await Golfer.findOne({ where: { companyId, id: r.golferId }, transaction });
        if (golfer) out.push({ playerId: r.id, ...(await describeGolfer(companyId, golfer, { standingByMemberNo: standings, transaction })) });
    }
    return out;
}

module.exports = {
    loadHandicapRules,
    pickLimitRule,
    pickAccompanimentRule,
    evaluateFlight,
    describeGolfer,
    describeSeatedPlayers,
};
