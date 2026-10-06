// Billing-item ELIGIBILITY (Tropicana gap 6b, approved 2026-10-06): does the
// billed golfer qualify for an item that carries TransactionTypeEligibility
// rows? Rows are OR-ed; a row matches when every condition it sets holds.
//
// Facts come from the PLAY (play date -> ISO day of week + public holiday via
// the calendar seam, tee-off time, holes) and the GOLFER (date of birth,
// gender, nationality): members through membershipGateway.getGolfMemberStanding,
// visitors from their OtherGolfer profile. Missing golfer data FAILS the
// condition with a message naming what is missing.
//
// The result for a non-qualifying item is ONE readable reason - the first
// failing condition of the row that came closest (fewest failures) - shown
// under the disabled tile and returned by the add-item refusal.

const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { classifyDateRange, isoDayOfWeek } = require('../../platform/calendarGateway');
const { getCompanyBasics } = require('../../platform/serviceContext');
const Golfer = require('./golfer.model');
const OtherGolfer = require('./otherGolfer.model');

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

// Whole years between a 'YYYY-MM-DD' birth date and a 'YYYY-MM-DD' play date.
function ageOn(birthDate, playDate) {
    const b = String(birthDate);
    const p = String(playDate);
    let age = Number(p.slice(0, 4)) - Number(b.slice(0, 4));
    if (p.slice(5) < b.slice(5)) age -= 1;
    return age;
}

// 'Monday-Thursday', 'Saturday, Sunday', 'Monday-Friday, Sunday' from a day set.
function daysLabel(days) {
    const idx = DAY_KEYS.map((k, i) => (days.includes(k) ? i : -1)).filter((i) => i >= 0);
    const parts = [];
    let start = null;
    let prev = null;
    for (const i of idx) {
        if (start === null) { start = i; prev = i; continue; }
        if (i === prev + 1) { prev = i; continue; }
        parts.push(start === prev ? DAY_LABELS[start] : `${DAY_LABELS[start]}-${DAY_LABELS[prev]}`);
        start = i;
        prev = i;
    }
    if (start !== null) parts.push(start === prev ? DAY_LABELS[start] : `${DAY_LABELS[start]}-${DAY_LABELS[prev]}`);
    return parts.join(', ');
}

// The facts of one bill: the play + the golfer profile + the club country.
async function buildFacts(req, { companyId, registration, holes }) {
    const playDate = String(registration.playDate);
    const [classified] = await classifyDateRange(req, playDate, playDate);
    const company = await getCompanyBasics(companyId);
    const facts = {
        playDate,
        dayKey: DAY_KEYS[isoDayOfWeek(playDate) - 1],
        isHoliday: !!(classified && classified.isHoliday),
        teeTime: hhmm(registration.teeTime),
        holes,
        birthDate: null,
        gender: null,
        nationalityCode: null,
        companyCountry: company && company.countryCode ? String(company.countryCode).toLowerCase() : null,
    };
    const golfer = registration.golferId ? await Golfer.findOne({ where: { companyId, id: registration.golferId } }) : null;
    if (golfer && golfer.golferType === 'member' && golfer.memberNo) {
        const standing = await getGolfMemberStanding(companyId, golfer.memberNo);
        if (standing) {
            facts.birthDate = standing.birthDate || null;
            facts.gender = standing.gender || null;
            facts.nationalityCode = standing.nationalityCode || null;
        }
    } else if (golfer && golfer.golferType === 'other') {
        const profile = await OtherGolfer.findOne({ where: { companyId, id: golfer.sourceId } });
        if (profile) {
            facts.birthDate = profile.birthDate || null;
            facts.gender = profile.gender || null;
            facts.nationalityCode = profile.nationalityCode || null;
        }
    }
    return facts;
}

// The failing conditions of ONE row against the facts (empty = the row
// matches). Each failure is the reason text shown to the clerk.
function rowFailures(rule, facts) {
    const failures = [];
    const days = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : null;
    if (days && days.length && !days.includes(facts.dayKey)) failures.push(`${daysLabel(days)} only`);
    if (rule.excludePublicHolidays && facts.isHoliday) failures.push('Not on public holidays');
    const start = hhmm(rule.startTime);
    const end = hhmm(rule.endTime);
    if (start && end && (!facts.teeTime || facts.teeTime < start || facts.teeTime > end)) failures.push(`Tee-off ${start}-${end} only`);
    if (rule.holes && Number(rule.holes) !== Number(facts.holes)) failures.push(`${rule.holes} holes only`);
    if (rule.minAge !== null && rule.minAge !== undefined || rule.maxAge !== null && rule.maxAge !== undefined) {
        if (!facts.birthDate) failures.push('Needs the golfer\'s date of birth on record');
        else {
            const age = ageOn(facts.birthDate, facts.playDate);
            if (rule.minAge !== null && rule.minAge !== undefined && age < rule.minAge) failures.push(`Age ${rule.minAge} and over`);
            if (rule.maxAge !== null && rule.maxAge !== undefined && age > rule.maxAge) failures.push(`Age ${rule.maxAge} and under`);
        }
    }
    if (rule.gender) {
        if (!facts.gender) failures.push('Needs the golfer\'s gender on record');
        else if (String(facts.gender).toLowerCase() !== String(rule.gender).toLowerCase()) failures.push(rule.gender === 'female' ? 'Ladies only' : 'Men only');
    }
    if (rule.localOnly) {
        if (!facts.nationalityCode) failures.push('Needs the golfer\'s nationality on record');
        else if (!facts.companyCountry || String(facts.nationalityCode).toLowerCase() !== facts.companyCountry) failures.push('Local golfers only');
    }
    return failures;
}

// { eligible: true } or { eligible: false, reason } for an item's rows.
function evaluate(rules, facts) {
    if (!rules || !rules.length) return { eligible: true };
    let best = null;
    for (const rule of rules) {
        const failures = rowFailures(rule, facts);
        if (!failures.length) return { eligible: true };
        if (!best || failures.length < best.length) best = failures;
    }
    return { eligible: false, reason: best[0] };
}

// { [transactionTypeId]: reason } for every item with rows the golfer does
// not qualify for. `types` carry their `Eligibility` rows (eager-loaded).
async function ineligibleMap(req, { companyId, registration, holes, types }) {
    const withRules = types.filter((t) => Array.isArray(t.Eligibility) && t.Eligibility.length);
    if (!withRules.length) return {};
    const facts = await buildFacts(req, { companyId, registration, holes });
    const out = {};
    for (const t of withRules) {
        const r = evaluate(t.Eligibility, facts);
        if (!r.eligible) out[t.id] = r.reason;
    }
    return out;
}

module.exports = { buildFacts, evaluate, rowFailures, ineligibleMap, daysLabel, DAY_KEYS };
