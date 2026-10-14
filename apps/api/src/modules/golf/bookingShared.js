// Golf booking SHARED helpers - the pieces the make-booking flow
// (booking.controller.js), the change-booking flow (bookingChange.service.js)
// and the cancel path all compose: the day-wide advisory lock, lock sweeping,
// day typing, golfer provisioning, the booking email + its player table, the
// per-day and per-session limit checks, the junior rule and the booking DTO.
// Moved out of the controller on 2026-10-14 so the change flow can require
// them without a circular require.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCompanyProfile } = require('../../platform/serviceContext');
const { emailAddress } = require('../../platform/notificationGateway');
const { classifyDateRange } = require('../../platform/calendarGateway');
const availability = require('./bookingAvailability.service');
const { PLAYER_TYPES } = require('./booking.constants');
const Player = require('./player.model');
const FlightLock = require('./flightLock.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// One advisory lock key per (company, playDate) - every lock/save
// transaction for the same day serializes here. Day-wide (not per course)
// because rotation courses share physical nines.
async function advisoryLock(transaction, companyId, playDate) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `golf-booking:${companyId}:${playDate}` },
        transaction,
    });
}

// Remove expired locks for a day (inside the advisory lock, so the unique
// cell index never falsely blocks a new claim).
async function sweepExpiredLocks(companyId, playDate, transaction) {
    await FlightLock.destroy({
        where: { companyId, playDate, expiresAt: { [Op.lte]: new Date() } },
        transaction,
    });
}

async function dayTypeOf(req, playDate) {
    const rows = await classifyDateRange(req, playDate, playDate);
    return rows.length ? rows[0].dayType : 'weekday';
}

// Find-or-create the member's golf.Golfer identity (lazy provisioning, like
// AR Debtor), refreshing the name/memberNo snapshots on contact.
async function ensureMemberGolfer(companyId, standing, stamps, transaction) {
    const [row] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        defaults: {
            companyId, golferType: 'member', sourceId: standing.memberId,
            name: standing.name, memberNo: standing.memberNo, ...stamps,
        },
        transaction,
    });
    if (row.name !== standing.name || row.memberNo !== standing.memberNo) {
        row.name = standing.name;
        row.memberNo = standing.memberNo;
        await row.save({ transaction });
    }
    return row;
}

// '27 Sept 2026' from 'YYYY-MM-DD' - a fixed readable style for emails (UTC
// so the server timezone never shifts the date).
function playDateText(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Queue ONE booking email addressed to every recipient with an email address
// TOGETHER (user decision 2026-09-22: the addresses are concatenated in To:,
// so every player sees the rest were informed). Members and members-as-guests
// resolve their address through the membership seam; name-only guests have no
// address until registration. Deduped by address. NON-CRITICAL: an email
// problem must never abort the booking - the enqueue is caught and logged;
// the queued row still commits/rolls back with the caller's transaction.
async function queueBookingEmail({ companyId, templateKey, recipients, data, transaction }) {
    const company = await getCompanyProfile(companyId);
    const seen = new Set();
    const to = [];
    for (const r of recipients) {
        if (!r || !r.email) continue;
        const key = r.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        to.push(r.email);
    }
    if (!to.length) return;
    try {
        await emailAddress({
            templateKey,
            accountId: company ? company.accountId : null,
            companyId,
            to: to.join(', '),
            data: { companyName: company ? company.name : '', ...data },
            transaction,
        });
    } catch (error) {
        console.error(`Error queueing ${templateKey} email:`, error);
    }
}

const PLAYER_TYPE_LABELS = new Map(PLAYER_TYPES.map((t) => [t.key, t.label]));

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&quot;');
}

// The flight's player list as an email-safe HTML table (inline styles - email
// clients ignore stylesheets). Injected into the templates via {{{playersTable}}}.
function playersTableHtml(players) {
    const td = 'border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 14px;';
    const th = `${td} background-color: #f8fafc; text-align: left;`;
    const rows = players.map((p, i) => `<tr>`
        + `<td style='${td}'>${p.sortOrder || i + 1}</td>`
        + `<td style='${td}'>${escapeHtml(p.playerName)}</td>`
        + `<td style='${td}'>${p.memberNo ? escapeHtml(p.memberNo) : '-'}</td>`
        + `<td style='${td}'>${PLAYER_TYPE_LABELS.get(p.playerType) || p.playerType}</td>`
        + `</tr>`).join('');
    return `<table style='border-collapse: collapse; width: 100%; margin-top: 8px;'>`
        + `<tr><th style='${th}'>#</th><th style='${th}'>Player</th><th style='${th}'>Member No</th><th style='${th}'>Type</th></tr>`
        + `${rows}</table>`;
}

// The starting-nine Player records of a set of booking profiles, ordered by
// creation (creation order IS the keyed player order - see create()).
async function firstNineRecords(profileIds, { transaction } = {}) {
    if (!profileIds.length) return [];
    return Player.findAll({
        where: { bookingProfileId: { [Op.in]: profileIds }, secondNineFlag: 0 },
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
        transaction,
    });
}

// '08:05 (WEST, B260900001), 14:30 (EAST, ...)' - the flight list for a
// one-booking-per-day conflict message. Start times come from the profiles'
// starting-nine Player records.
async function describeDayBookings(companyId, profiles, { transaction } = {}) {
    const courses = await Course.findAll({
        where: { companyId, id: { [Op.in]: [...new Set(profiles.map((r) => r.courseId))] } },
        attributes: ['id', 'courseCode'],
        transaction,
    });
    const codeById = new Map(courses.map((c) => [c.id, c.courseCode]));
    const firsts = await firstNineRecords(profiles.map((p) => p.id), { transaction });
    const timeByProfile = new Map();
    for (const f of firsts) {
        if (!timeByProfile.has(f.bookingProfileId)) timeByProfile.set(f.bookingProfileId, availability.hhmm(f.teeTime));
    }
    return profiles
        .map((r) => `${timeByProfile.get(r.id) || '-'} (${codeById.get(r.courseId) || 'course'}, ${r.bookingNo})`)
        .join(', ');
}

// One-booking-per-day check for a member standing (null = no conflict). The
// member's golfer identity may not exist yet (never booked) - no conflict.
async function dayBookingConflict(companyId, standing, playDate, { transaction, excludeProfileId = null } = {}) {
    const golfer = await Golfer.findOne({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        transaction,
    });
    if (!golfer) return null;
    const rows = await availability.memberDayBookings(companyId, golfer.id, playDate, { transaction, excludeProfileId });
    if (!rows.length) return null;
    return `${standing.memberNo} already has a booking on ${playDate} - ${await describeDayBookings(companyId, rows, { transaction })}.`;
}

// ---- junior-booking control (Tropicana 4.3; user decision 2026-10-05) -------
// A JUNIOR (dependent son/daughter/ward, via membership standing isJunior) may
// not be in a booking unless their PRINCIPAL (parent, principalMemberId) is
// also a member player; a junior with no principal on record needs at least
// one adult (non-junior) member in the flight. `parties` = every player that
// has a membership identity (member or member-as-guest), each
// { memberId, isJunior, principalMemberId, label, prefix }. Returns the first
// violation message, or null. Booking refuses on it; the desk warns.
function juniorViolation(parties) {
    const presentMemberIds = new Set(parties.map((p) => p.memberId).filter(Boolean));
    const hasAdultMember = parties.some((p) => !p.isJunior);
    for (const p of parties) {
        if (!p.isJunior) continue;
        if (p.principalMemberId) {
            if (!presentMemberIds.has(p.principalMemberId)) {
                return `${p.prefix}${p.label} is a junior member and must play with their principal (parent), who is not in this booking.`;
            }
        } else if (!hasAdultMember) {
            return `${p.prefix}${p.label} is a junior member and must be accompanied by an adult member.`;
        }
    }
    return null;
}

// ---- booking limit per day type (user decisions 2026-10-01) ----------------
// 'none' | 'day' | 'session' from the setting, by the date's day type
// (holidays = weekend, via the calendar seam). Missing/legacy values fall
// back to 'day' - the pre-2026-10-01 behavior.
function bookingLimitFor(setting, dayType) {
    if (!setting) return 'day';
    const v = dayType === 'weekend' ? setting.bookingLimitWeekend : setting.bookingLimitWeekday;
    return v === 'none' || v === 'session' ? v : 'day';
}

// The GolfSession band containing a 'HH:MM' tee time (end exclusive), or
// null when no band covers it (then the session limit does not constrain).
function sessionOf(sessions, teeTime) {
    const t = String(teeTime).slice(0, 5);
    return sessions.find((s) => {
        const from = String(s.startTime).slice(0, 5);
        const until = String(s.endTime).slice(0, 5);
        return from <= t && t < until;
    }) || null;
}

// The session ids a member golfer already occupies on the date, from the
// START times of their active bookings. Returns Map(sessionId -> { session,
// profile, startTime }) for conflict messages.
async function memberDaySessions(companyId, golferId, playDate, sessions, { transaction, excludeProfileId = null } = {}) {
    const taken = new Map();
    if (!golferId || !sessions.length) return taken;
    const profiles = await availability.memberDayBookings(companyId, golferId, playDate, { transaction, excludeProfileId });
    if (!profiles.length) return taken;
    const firsts = await firstNineRecords(profiles.map((p) => p.id), { transaction });
    const timeByProfile = new Map();
    for (const f of firsts) {
        if (!timeByProfile.has(f.bookingProfileId)) timeByProfile.set(f.bookingProfileId, availability.hhmm(f.teeTime));
    }
    for (const profile of profiles) {
        const startTime = timeByProfile.get(profile.id);
        if (!startTime) continue;
        const session = sessionOf(sessions, startTime);
        if (session && !taken.has(session.id)) taken.set(session.id, { session, profile, startTime });
    }
    return taken;
}

// Per-session conflict for a member standing booking a flight at `teeTime`
// (null = no conflict). Mirrors dayBookingConflict's scope: the member's
// golfer identity may not exist yet - no conflict.
async function sessionBookingConflict(companyId, standing, playDate, teeTime, sessions, { transaction, excludeProfileId = null } = {}) {
    const session = sessionOf(sessions, teeTime);
    if (!session) return null;
    const golfer = await Golfer.findOne({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        transaction,
    });
    if (!golfer) return null;
    const taken = await memberDaySessions(companyId, golfer.id, playDate, sessions, { transaction, excludeProfileId });
    const clash = taken.get(session.id);
    if (!clash) return null;
    return `${standing.memberNo} already has a ${session.name} session booking on ${playDate} - `
        + `${clash.startTime} (${clash.profile.bookingNo}).`;
}

// DTO from a profile + its Player records (both nines). The flight fields
// are DERIVED from the records: start = the first-nine records' tee time,
// crossover = the paired second-nine records' tee time, holes = 18 when a
// pair exists. The dto shape matches the pre-revamp one so the web wizard
// and listing keep working unchanged.
// `extras` (change booking, 2026-10-14): { bookerMemberNo, bookerName,
// changeCount } resolved by the listing in one pass.
function bookingDto(profile, records, courseByIdMap, extras = {}) {
    const course = courseByIdMap ? courseByIdMap.get(profile.courseId) : null;
    // Players DROPPED by a change (status cancelled while the booking stays
    // booked) leave the listing; a whole-booking cancel keeps its lines so
    // the cancelled card still names who was on it.
    const rows = (records || []).filter((r) => profile.status !== 'booked' || r.status !== 'cancelled');
    const firsts = rows.filter((r) => Number(r.secondNineFlag) === 0)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : (a.id < b.id ? -1 : 1)));
    const seconds = rows.filter((r) => Number(r.secondNineFlag) === 1);
    const startTime = firsts.length ? availability.hhmm(firsts[0].teeTime) : null;
    const crossTime = seconds.length ? availability.hhmm(seconds[0].teeTime) : null;
    // Derived display status: a booked booking whose every player was
    // recorded as a no-show reads 'no-show' (the profile row itself stays
    // 'booked' - the player statuses tell the story).
    const noShowAll = profile.status === 'booked' && firsts.length > 0 && firsts.every((p) => p.status === 'no-show');
    return {
        id: profile.id,
        bookingNo: profile.bookingNo,
        bookingType: profile.bookingType,
        courseId: profile.courseId,
        courseCode: course ? course.courseCode : null,
        courseDescription: course ? course.description : null,
        playDate: profile.playDate,
        holes: seconds.length ? 18 : 9,
        startTime,
        crossTime,
        contactMobile: profile.contactMobile,
        remarks: profile.remarks,
        status: noShowAll ? 'no-show' : profile.status,
        cancelReason: profile.cancelReason,
        canModify: profile.get ? profile.get('canModify') : undefined,
        bookerMemberNo: extras.bookerMemberNo || null,
        bookerName: extras.bookerName || null,
        changeCount: extras.changeCount || 0,
        players: firsts.map((p, i) => ({
            playerId: p.id,
            sortOrder: i + 1,
            playerType: p.playerType,
            memberNo: p.memberNo,
            playerName: p.playerName,
            status: p.status,
            registrationNo: p.registrationNo,
        })),
    };
}

module.exports = {
    companyIdOf, DATE_RE, TIME_RE, advisoryLock, sweepExpiredLocks, dayTypeOf, ensureMemberGolfer,
    playDateText, queueBookingEmail, PLAYER_TYPE_LABELS, escapeHtml, playersTableHtml, firstNineRecords,
    describeDayBookings, dayBookingConflict, juniorViolation, bookingLimitFor, sessionOf, memberDaySessions,
    sessionBookingConflict, bookingDto,
};
