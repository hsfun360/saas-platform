// Change booking (user decisions 2026-10-14) - amend an ordinary flight
// booking without cancelling it: MOVE the flight (another course, date, tee
// time or holes - the desk locks the new flight exactly as when booking),
// change the ROSTER (add players up to the free seats, drop players), or edit
// the HEADER (contact mobile, remarks). The booking number never changes.
//
// The preview (`plan`) states the outcome before anything is saved (show
// expected results), and `apply` re-evaluates every rule under the day-wide
// advisory lock(s) at commit time, exactly like the make-booking save.
//
// Cancellation-notice policy inside the window (noShowCharge.config ON):
//   - a move to another flight on the SAME DAY is free;
//   - a move to ANOTHER DAY is a late cancellation of the original flight:
//     'charge' raises the penalty for the booked players and moves the
//     flight, 'refuse' blocks the move (the preview says so, with the deadline);
//   - dropped players are charged per player when the basis is 'player';
//     a partial drop charges nothing when the basis is 'booking' (the booking
//     still stands); 'refuse' blocks drops (no-shows are recorded instead);
//   - outside the window every change is free.
// A booking with a REGISTERED player cannot be moved, and a registered player
// cannot be dropped - the desk already processed them.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement, canModifyRecord } = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { companyTimezone } = require('../../platform/calendarGateway');
const availability = require('./bookingAvailability.service');
const shared = require('./bookingShared');
// Player types come from the club's master (2026-10-15), judged by base identity.
const playerTypes = require('./playerType.service');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const FlightLock = require('./flightLock.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');
const GolfSession = require('./golfSession.model');
const BookingChange = require('./bookingChange.model');
const noShow = require('./noShowCharge.service');

const MAX_PLAYERS = 10;

function fail(message, status = 400) {
    return { error: message, status };
}

function courseLabel(course) {
    return course ? `${course.courseCode}${course.description ? ' - ' + course.description : ''}` : '';
}

// The flight a booking currently occupies, derived from its player records.
function flightOf(profile, records, course) {
    const firsts = records.filter((r) => Number(r.secondNineFlag) === 0);
    const seconds = records.filter((r) => Number(r.secondNineFlag) === 1);
    const teeTime = firsts.length ? availability.hhmm(firsts[0].teeTime) : null;
    const crossTime = seconds.length ? availability.hhmm(seconds[0].teeTime) : null;
    return {
        courseId: profile.courseId,
        courseCode: course ? course.courseCode : null,
        courseName: courseLabel(course),
        playDate: String(profile.playDate),
        teeTime,
        crossTime,
        holes: seconds.length ? 18 : 9,
    };
}

function flightText(f) {
    return `${shared.playDateText(f.playDate)} ${f.teeTime} (${f.courseCode || 'course'}, ${f.holes} holes)`;
}

function lineSnapshot(r) {
    return { playerName: r.playerName, memberNo: r.memberNo || null, playerType: r.playerType };
}

function sameFlight(a, b) {
    return a.courseId === b.courseId && a.playDate === b.playDate && a.teeTime === b.teeTime && a.holes === b.holes;
}

// ---- the cancellation-notice policy (pure, unit-tested) --------------------
// Decides what a change made INSIDE the notice window costs or whether it is
// refused. `late` = the ORIGINAL flight's notice deadline has passed.
function policy({ cfg, late, movedDay, keptBooked, dropped }) {
    if (!cfg || !late) return { refusal: null, chargedPlayers: [], quantity: 0, free: true };
    if (cfg.lateAction === 'refuse') {
        if (movedDay) {
            return {
                refusal: `Bookings need ${cfg.noticeHours} hours' notice to move to another day - the notice period has ended. The booking may still move to another flight on the same day.`,
                chargedPlayers: [], quantity: 0, free: false,
            };
        }
        if (dropped.length) {
            return {
                refusal: `Bookings need ${cfg.noticeHours} hours' notice to drop players - the notice period has ended. Players who do not turn up are recorded as no-shows.`,
                chargedPlayers: [], quantity: 0, free: false,
            };
        }
        return { refusal: null, chargedPlayers: [], quantity: 0, free: true };
    }
    // 'charge': another day = the original flight is cancelled late (every
    // booked player of it); the same day = only the dropped players.
    const chargedPlayers = movedDay ? [...keptBooked, ...dropped] : [...dropped];
    if (!chargedPlayers.length) return { refusal: null, chargedPlayers: [], quantity: 0, free: true };
    const quantity = cfg.basis === 'booking' ? (movedDay ? 1 : 0) : chargedPlayers.length;
    return { refusal: null, chargedPlayers: quantity ? chargedPlayers : [], quantity, free: quantity === 0 };
}

// The confirmed sentence: what the change does, in the desk's words.
function summarize({ before, after, moved, added, dropped, headerChanged, priced, policyResult }) {
    const parts = [];
    if (moved) parts.push(`Moved from ${flightText(before)} to ${flightText(after)}`);
    if (added.length) parts.push(`${added.length} player(s) added: ${added.map((l) => l.playerName).join(', ')}`);
    if (dropped.length) parts.push(`${dropped.length} player(s) dropped: ${dropped.map((r) => r.playerName).join(', ')}`);
    if (headerChanged && !moved && !added.length && !dropped.length) parts.push('Contact details / remarks updated');
    else if (headerChanged) parts.push('contact details / remarks updated');
    if (priced && policyResult.quantity) {
        parts.push(`late-change charge ${Number(priced.totalAmount).toFixed(2)} (${priced.quantity} x ${Number(priced.unitAmount).toFixed(2)} + ${Number(priced.taxAmount).toFixed(2)} tax)`);
    }
    return parts.join('; ') + '.';
}

function changeTypeOf({ moved, rosterChanged, headerChanged }) {
    const kinds = [moved, rosterChanged, headerChanged].filter(Boolean).length;
    if (kinds > 1) return 'mixed';
    if (moved) return 'move';
    if (rosterChanged) return 'roster';
    return 'header';
}

// ---- loading ---------------------------------------------------------------

async function loadBooking(req, id, { transaction } = {}) {
    const companyId = shared.companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const profile = await BookingProfile.findOne({ where: { companyId, id }, transaction });
    if (!profile) return fail('Booking not found.', 404);
    if (profile.bookingType !== 'flight') return fail('Only an ordinary flight booking can be changed here - group bookings are amended on their own page.');
    if (profile.status !== 'booked') return fail('Only a booked booking can be changed.');
    const records = await Player.findAll({
        where: { bookingProfileId: profile.id },
        order: [['secondNineFlag', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
        transaction,
    });
    const active = records.filter((r) => r.status === 'booked' || r.status === 'registered');
    const firsts = active.filter((r) => Number(r.secondNineFlag) === 0);
    if (!firsts.length) return fail('This booking has no active players left - cancel it instead.');
    const course = await Course.findOne({ where: { companyId, id: profile.courseId }, transaction });
    const crossById = new Map(active.filter((r) => Number(r.secondNineFlag) === 1).map((r) => [r.firstNinePlayerId, r]));
    return { companyId, profile, records: active, firsts, crossById, course, flight: flightOf(profile, active, course) };
}

// The booker's membership standing (the window and quotas key off it).
async function bookerStanding(companyId, profile, { transaction } = {}) {
    const golfer = await Golfer.findOne({ where: { companyId, id: profile.bookerGolferId }, transaction });
    if (!golfer || !golfer.memberNo) return { error: 'The booker is no longer a member golfer - the booking cannot be changed.' };
    const standing = await getGolfMemberStanding(companyId, golfer.memberNo);
    if (!standing) return { error: `No member found with number '${golfer.memberNo}'.` };
    return { golfer, standing };
}

// Split the keyed roster into kept / dropped / added against the booking's
// active starting-nine records. A line with `playerId` keeps that record;
// registered players are always kept; a line without an id is a new player
// (resolved like the make-booking save).
async function resolveRoster(companyId, firsts, rawPlayers) {
    const byId = new Map(firsts.map((r) => [r.id, r]));
    const keptIds = new Set();
    const added = [];
    const raw = Array.isArray(rawPlayers) ? rawPlayers : [];
    const types = playerTypes.pickable(await playerTypes.catalog(companyId));
    for (let i = 0; i < raw.length; i += 1) {
        const line = raw[i] || {};
        const playerId = line.playerId ? String(line.playerId) : '';
        if (playerId) {
            if (!byId.has(playerId)) return fail(`Player ${i + 1} is not on this booking any more - reload the booking.`, 409);
            keptIds.add(playerId);
            continue;
        }
        const playerType = String(line.playerType || '');
        if (!playerTypes.findType(types, playerType)) return fail(`Player ${i + 1}: pick a player type.`);
        if (playerTypes.needsGuestName(types, playerType)) {
            const guestName = String(line.guestName || '').trim();
            if (!guestName) return fail(`Player ${i + 1}: key in the guest name (or 'Guest').`);
            added.push({ sortOrder: i + 1, playerType, standing: null, playerName: guestName, memberNo: null });
        } else {
            const no = String(line.memberNo || '').trim();
            if (!no) return fail(`Player ${i + 1}: key in the member number.`);
            const ps = await getGolfMemberStanding(companyId, no);
            if (!ps) return fail(`Player ${i + 1}: no member found with number '${no}'.`, 404);
            if (ps.actionControl === 'barred') return fail(`Player ${i + 1}: member ${ps.memberNo} (${ps.statusLabel || 'status'}) is barred.`);
            if (firsts.some((r) => r.memberNo === ps.memberNo && r.playerType === playerType && keptIds.has(r.id))) {
                return fail(`Player ${i + 1}: ${ps.memberNo} is already on this booking.`);
            }
            added.push({ sortOrder: i + 1, playerType, standing: ps, playerName: ps.name, memberNo: ps.memberNo });
        }
    }
    const kept = [];
    const dropped = [];
    for (const r of firsts) {
        if (r.status === 'registered' || keptIds.has(r.id)) kept.push(r);
        else dropped.push(r);
    }
    if (!kept.length && !added.length) return fail('Dropping every player is a cancellation - use Cancel booking.');
    if (kept.length + added.length > MAX_PLAYERS) return fail('Too many players.');
    return { kept, dropped, added };
}

// The flight the booking will occupy after the change: the caller's LOCK
// (a move) or the current flight. Never trusts the client for the cells.
async function resolveTarget(companyId, callerId, current, lockGroupId, { transaction } = {}) {
    if (!lockGroupId) return { moved: false, flight: current, course: null, lockRows: [] };
    const lockRows = await FlightLock.findAll({ where: { companyId, groupId: lockGroupId }, transaction });
    if (!lockRows.length) return fail('The flight lock expired - pick a flight again.', 409);
    if (lockRows.some((r) => r.lockedBy !== callerId)) return fail('The flight lock is not yours - pick a flight again.', 409);
    if (lockRows.every((r) => r.expiresAt <= new Date())) return fail('The flight lock expired - pick a flight again.', 409);
    const course = await Course.findOne({ where: { companyId, id: lockRows[0].courseId }, transaction });
    if (!course) return fail('The locked course no longer exists.');
    const startRow = lockRows.find((r) => r.unitCourseId === course.firstNineId);
    const crossRow = lockRows.find((r) => r.unitCourseId === course.secondNineId) || null;
    if (!startRow) return fail('The flight lock is incomplete - pick a flight again.', 409);
    const flight = {
        courseId: course.id,
        courseCode: course.courseCode,
        courseName: courseLabel(course),
        playDate: String(startRow.playDate),
        teeTime: availability.hhmm(startRow.teeTime),
        crossTime: crossRow ? availability.hhmm(crossRow.teeTime) : null,
        holes: crossRow ? 18 : 9,
    };
    if (sameFlight(flight, current)) return { moved: false, flight: current, course, lockRows };
    return { moved: true, flight, course, lockRows };
}

// Every make-booking rule, re-run for the roster AFTER the change on the
// target flight, with the booking's own seats and own day-limit evidence
// excluded. `roster` = kept records + added lines. Returns { fail } or
// { golferByMemberId }.
async function validateTarget(req, { companyId, profile, booker, standing, target, course, moved, kept, added, transaction }) {
    const callerId = getUserContext(req).userId;
    const timezone = await companyTimezone(req);
    const playDate = target.playDate;
    const rosterSize = kept.length + added.length;

    if (moved) {
        const window = await availability.bookingWindow(companyId, standing.membershipTypeId, timezone);
        if (playDate < window.dateFrom || playDate > window.dateTo) {
            return { fail: `This member can book from ${window.dateFrom} to ${window.dateTo} (advance window).` };
        }
    }
    const dayType = await shared.dayTypeOf(req, playDate);
    const { setting, minRules, guestRules } = await availability.loadRules(companyId);
    const allowMerge = setting ? setting.allowBookingMerge === true : false;
    const placement = await getCallerPlacement(req);
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
    const t = availability.toMinutes(target.teeTime);

    const ctx = await availability.dayContext(companyId, playDate, dayType, { transaction });
    const day = ctx.byCourse.get(course.id);
    if (!day || !day.set || !day.slots.length) return { fail: 'The tee sheet for this date is no longer configured.', status: 409 };
    const startSlot = day.slots.find((s) => availability.hhmm(s.teeTime) === target.teeTime);
    if (!startSlot) return { fail: 'The flight time no longer exists on the tee sheet.', status: 409 };
    if (moved) {
        if (startSlot.isCrossoverOnly === true) return { fail: 'That flight time is closed for crossover - no new tee-offs.' };
        if (startSlot.isFrontDesk === true) return { fail: 'That flight time is reserved for front-desk registration - it cannot be booked in advance.' };
        if (availability.nineBlocked(ctx.nineBlocks.get(course.firstNineId), t)) return { fail: 'The flight is blocked by a course closure.', status: 409 };
    }
    // Capacity per NINE-cell under the merge rule, the booking's own seats
    // excluded (so adding to its own flight counts only the others).
    const occ = await availability.occupancy(companyId, playDate, { transaction, ctx, excludeBookingProfileId: profile.id });
    const startOcc = occ.get(availability.nineKey(course.firstNineId, target.teeTime));
    if (availability.seatsLeft(allowMerge, startOcc, startSlot.maxPlayers) < rosterSize) {
        return { fail: `The flight has no room for ${rosterSize} player(s).`, status: 409 };
    }
    let crossTime = null;
    if (target.holes === 18) {
        const cross = availability.crossTarget(ctx, course, t);
        if (!cross) return { fail: 'The crossover time no longer exists on the tee sheet.', status: 409 };
        const ct = availability.toMinutes(cross.slot.teeTime);
        if (moved && availability.crossBlocked(ctx, course, ct)) return { fail: 'The crossover flight is blocked by a course closure.', status: 409 };
        crossTime = availability.hhmm(cross.slot.teeTime);
        const crossOcc = occ.get(availability.nineKey(course.secondNineId, crossTime));
        if (availability.seatsLeft(allowMerge, crossOcc, cross.slot.maxPlayers) < rosterSize) {
            return { fail: `The crossover flight has no room for ${rosterSize} player(s).`, status: 409 };
        }
    }

    const existingPlayers = (startOcc && startOcc.players) || 0;
    const dayOfWeek = availability.dayOfWeekOf(playDate);
    const minPlayers = availability.resolveMinPlayers(setting, minRules, course.id, dayType, t, dayOfWeek);
    if (rosterSize < minPlayers && !(existingPlayers > 0 && existingPlayers + rosterSize >= minPlayers)) {
        return { fail: `This flight needs at least ${minPlayers} player(s) - the booking would have ${rosterSize}.` };
    }

    const gc = availability.resolveGuestControl(setting, guestRules, course.id, dayType, t, dayOfWeek);
    const types = await playerTypes.catalog(companyId, { transaction });
    const rosterBases = [...kept.map((r) => r.playerType), ...added.map((l) => l.playerType)].map((k) => playerTypes.baseOf(types, k));
    if (!gc.allowGuest && rosterBases.some((b) => b === 'guest' || b === 'affiliate')) return { fail: 'Guests are not allowed on this flight (guest control).' };
    if (!gc.allowMemberGuest && rosterBases.includes('member-guest')) return { fail: 'Members as guests are not allowed on this flight (guest control).' };
    const guestCount = rosterBases.filter((b) => b === 'guest' || b === 'member-guest' || b === 'affiliate').length;
    const quota = standing.guestQuota;
    if (guestCount > 0 && quota !== null && quota !== undefined && guestCount > quota) {
        return {
            fail: quota === 0
                ? `Membership type ${standing.membershipTypeCategory || ''} cannot bring guests.`.replace('  ', ' ')
                : `Membership type ${standing.membershipTypeCategory || ''} can bring up to ${quota} guest(s) per booking - this booking would have ${guestCount} (members as guests count).`.replace('  ', ' '),
        };
    }

    // Golfer identities for the added member lines.
    const golferByMemberId = new Map();
    for (const line of added) {
        if (line.standing && !golferByMemberId.has(line.standing.memberId)) {
            golferByMemberId.set(line.standing.memberId, await shared.ensureMemberGolfer(companyId, line.standing, stamps, transaction));
        }
    }

    // Handicap control over the whole flight (added players are the ones
    // judged; kept players and the cell's other players are companions).
    if (added.length && setting && setting.handicapControlEnabled === true) {
        const handicap = require('./handicapControl.service');
        const rules = await handicap.loadHandicapRules(companyId);
        const standings = new Map();
        const judged = [];
        for (const line of added) {
            if (!line.standing) continue;
            const g = golferByMemberId.get(line.standing.memberId);
            if (!g) continue;
            standings.set(line.standing.memberNo, line.standing);
            judged.push(await handicap.describeGolfer(companyId, g, { standingByMemberNo: standings, transaction }));
        }
        if (judged.length) {
            const seated = await handicap.describeSeatedPlayers(companyId, {
                unitCourseId: course.firstNineId, playDate, teeTime: target.teeTime, transaction,
            });
            const messages = handicap.evaluateFlight({
                ...rules, courseId: course.id, dayType, dayOfWeek, holes: target.holes, teeTime: target.teeTime,
                players: judged, companions: [...judged, ...seated],
            });
            if (messages.length) return { fail: messages.join(' ') };
        }
    }

    // Booking limit for the booker and every 'member' line, this booking
    // excluded from the evidence (a same-day move is never its own clash).
    const limitMode = shared.bookingLimitFor(setting, dayType);
    const memberChecks = [{ golferId: booker.id, label: standing.memberNo, prefix: '' }];
    for (const r of kept) {
        if (playerTypes.isMemberBase(types, r.playerType) && r.golferId && r.golferId !== booker.id) memberChecks.push({ golferId: r.golferId, label: r.memberNo, prefix: `${r.playerName}: ` });
    }
    for (const line of added) {
        if (!playerTypes.isMemberBase(types, line.playerType) || !line.standing) continue;
        const g = golferByMemberId.get(line.standing.memberId);
        if (g && g.id !== booker.id) memberChecks.push({ golferId: g.id, label: line.memberNo, prefix: `Player ${line.sortOrder}: ` });
    }
    if (limitMode === 'day') {
        for (const check of memberChecks) {
            const rows = await availability.memberDayBookings(companyId, check.golferId, playDate, { transaction, excludeProfileId: profile.id });
            if (rows.length) return { fail: `${check.prefix}${check.label} already has a booking on ${playDate} - ${await shared.describeDayBookings(companyId, rows, { transaction })}.` };
        }
    } else if (limitMode === 'session') {
        const sessions = await GolfSession.findAll({ where: { companyId }, order: [['startTime', 'ASC']], transaction });
        const session = shared.sessionOf(sessions, target.teeTime);
        if (session) {
            for (const check of memberChecks) {
                const taken = await shared.memberDaySessions(companyId, check.golferId, playDate, sessions, { transaction, excludeProfileId: profile.id });
                const clash = taken.get(session.id);
                if (clash) return { fail: `${check.prefix}${check.label} already has a ${session.name} session booking on ${playDate} - ${clash.startTime} (${clash.profile.bookingNo}).` };
            }
        }
    }

    // Junior-booking control over the roster after the change.
    if (setting && setting.juniorBookingControlEnabled === true) {
        const parties = [{ memberId: standing.memberId, isJunior: standing.isJunior === true, principalMemberId: standing.principalMemberId || null, label: standing.memberNo, prefix: '' }];
        for (const r of kept) {
            if (!r.memberNo) continue;
            const s = await getGolfMemberStanding(companyId, r.memberNo);
            if (s) parties.push({ memberId: s.memberId, isJunior: s.isJunior === true, principalMemberId: s.principalMemberId || null, label: r.memberNo, prefix: `${r.playerName}: ` });
        }
        for (const line of added) {
            if (!line.standing) continue;
            parties.push({ memberId: line.standing.memberId, isJunior: line.standing.isJunior === true, principalMemberId: line.standing.principalMemberId || null, label: line.memberNo, prefix: `Player ${line.sortOrder}: ` });
        }
        const violation = shared.juniorViolation(parties);
        if (violation) return { fail: violation };
    }

    return { golferByMemberId, stamps, crossTime, dayType, setting };
}

// ---- the plan (preview + the apply's first half) ---------------------------

async function plan(req, id, body, { transaction } = {}) {
    const loaded = await loadBooking(req, id, { transaction });
    if (loaded.error) return loaded;
    const { companyId, profile, firsts, crossById, course, flight } = loaded;
    if (!(await canModifyRecord(req, profile))) return fail('You are not allowed to amend this booking.', 403);
    const callerId = getUserContext(req).userId;

    const who = await bookerStanding(companyId, profile, { transaction });
    if (who.error) return fail(who.error);

    const roster = await resolveRoster(companyId, firsts, body.players);
    if (roster.error) return roster;
    const { kept, dropped, added } = roster;
    if (dropped.some((r) => r.status === 'registered')) return fail('A registered player cannot be dropped - the desk already processed them.');

    const target = await resolveTarget(companyId, callerId, flight, body.lockGroupId ? String(body.lockGroupId) : '', { transaction });
    if (target.error) return target;
    if (target.moved && firsts.some((r) => r.status === 'registered')) return fail('A booking with a registered player cannot be moved.');
    const targetCourse = target.course || course;

    const contactMobile = body.contactMobile !== undefined ? (body.contactMobile ? String(body.contactMobile).slice(0, 30) : null) : profile.contactMobile;
    const remarks = body.remarks !== undefined ? (body.remarks ? String(body.remarks).slice(0, 255) : null) : profile.remarks;
    const headerChanged = contactMobile !== (profile.contactMobile || null) || remarks !== (profile.remarks || null);
    const rosterChanged = added.length > 0 || dropped.length > 0;
    if (!target.moved && !rosterChanged && !headerChanged) return fail('Nothing changed.');

    const validated = await validateTarget(req, {
        companyId, profile, booker: who.golfer, standing: who.standing, target: target.flight, course: targetCourse,
        moved: target.moved, kept, added, transaction,
    });
    if (validated.fail) return fail(validated.fail, validated.status || 400);

    // The notice-window verdict is judged against the ORIGINAL flight.
    const cfg = await noShow.config(companyId, { transaction });
    const timezone = await companyTimezone(req);
    const { late, deadline } = noShow.lateness(cfg, flight.playDate, flight.teeTime, timezone);
    const keptBooked = kept.filter((r) => r.status === 'booked');
    const verdict = policy({ cfg, late, movedDay: target.moved && target.flight.playDate !== flight.playDate, keptBooked, dropped });
    if (verdict.refusal) return fail(`${verdict.refusal} The notice period for ${profile.bookingNo} ended ${deadline.date} ${deadline.time}.`);
    let priced = null;
    if (verdict.quantity) {
        priced = await noShow.quote(req, cfg, flight.playDate, verdict.quantity, { transaction });
        if (priced.error) return fail(`The late change cannot be charged: ${priced.error}`);
    }

    const after = { ...target.flight, crossTime: validated.crossTime, contactMobile, remarks };
    const summary = summarize({ before: flight, after, moved: target.moved, added, dropped, headerChanged, priced, policyResult: verdict });
    return {
        companyId, profile, course, targetCourse, flight, target, kept, keptBooked, dropped, added, contactMobile, remarks,
        headerChanged, rosterChanged, changeType: changeTypeOf({ moved: target.moved, rosterChanged, headerChanged }),
        booker: who.golfer, standing: who.standing, cfg, late, deadline, verdict, priced, summary, validated, after, crossById,
    };
}

function previewDto(p) {
    return {
        bookingNo: p.profile.bookingNo,
        changeType: p.changeType,
        summary: p.summary,
        moved: p.target.moved,
        before: { ...p.flight },
        after: { courseId: p.after.courseId, courseCode: p.after.courseCode, courseName: p.after.courseName, playDate: p.after.playDate, teeTime: p.after.teeTime, crossTime: p.after.crossTime, holes: p.after.holes },
        kept: p.kept.map((r) => ({ playerId: r.id, ...lineSnapshot(r), status: r.status })),
        dropped: p.dropped.map((r) => ({ playerId: r.id, ...lineSnapshot(r) })),
        added: p.added.map((l) => ({ playerName: l.playerName, memberNo: l.memberNo, playerType: l.playerType })),
        controlled: !!p.cfg,
        late: p.late,
        deadline: p.deadline,
        noticeHours: p.cfg ? p.cfg.noticeHours : null,
        charge: p.priced ? {
            description: p.priced.description, quantity: p.priced.quantity, unitAmount: p.priced.unitAmount,
            amount: p.priced.amount, taxAmount: p.priced.taxAmount, totalAmount: p.priced.totalAmount,
            players: p.verdict.chargedPlayers.map((r) => r.playerName), booker: { name: p.booker.name, memberNo: p.booker.memberNo },
        } : null,
    };
}

// ---- preview ---------------------------------------------------------------

async function preview(req, id, body) {
    const p = await plan(req, id, body);
    if (p.error) return p;
    return { preview: previewDto(p) };
}

// ---- apply -----------------------------------------------------------------

async function apply(req, id, body) {
    const first = await plan(req, id, body);
    if (first.error) return first;
    const callerId = getUserContext(req).userId;
    const dates = [...new Set([first.flight.playDate, first.target.flight.playDate])].sort();
    const reason = body.reason ? String(body.reason).slice(0, 255) : null;
    const waive = body.waiveCharge === true;
    const waiveReason = waive && body.waiveReason ? String(body.waiveReason).trim().slice(0, 255) : '';

    let chargeRow = null;
    const result = await sequelize.transaction(async (transaction) => {
        for (const d of dates) await shared.advisoryLock(transaction, first.companyId, d);
        // Everything is judged again under the serialization point.
        const p = await plan(req, id, body, { transaction });
        if (p.error) return p;
        if (p.priced && waive && !waiveReason) return fail('Give a reason for waiving the late-change charge.');
        const { profile, companyId, target, kept, dropped, added, validated, after } = p;
        const course = p.targetCourse;
        const now = new Date();
        const stamps = validated.stamps;
        // The header as it stood BEFORE step 4 rewrites it (the history row's
        // `before` snapshot).
        const originalHeader = { contactMobile: profile.contactMobile || null, remarks: profile.remarks || null };

        // 1. Dropped players: both nine records cancelled.
        for (const r of dropped) {
            const ids = [r.id];
            const cross = p.crossById.get(r.id);
            if (cross) ids.push(cross.id);
            await Player.update({ status: 'cancelled', cancelledAt: now, cancelledBy: callerId, cancelReason: reason || 'Dropped from the booking', updatedBy: callerId }, { where: { id: { [Op.in]: ids } }, transaction });
        }
        // 2. Kept players follow the flight when it moved.
        if (target.moved) {
            for (const r of kept) {
                await r.update({ courseId: course.id, unitCourseId: course.firstNineId, playDate: after.playDate, teeTime: after.teeTime, updatedBy: callerId }, { transaction });
                const cross = p.crossById.get(r.id);
                if (after.holes === 18) {
                    if (cross) await cross.update({ courseId: course.id, unitCourseId: course.secondNineId, playDate: after.playDate, teeTime: after.crossTime, updatedBy: callerId }, { transaction });
                    else {
                        await Player.create({
                            companyId, bookingProfileId: profile.id, courseId: course.id, playDate: after.playDate, playerType: r.playerType,
                            golferId: r.golferId, playerName: r.playerName, memberNo: r.memberNo, status: r.status,
                            secondNineFlag: 1, firstNinePlayerId: r.id, unitCourseId: course.secondNineId, teeTime: after.crossTime,
                            createdAt: new Date(r.createdAt.getTime() + 1), ...stamps,
                        }, { transaction });
                    }
                } else if (cross) {
                    await cross.destroy({ transaction });
                }
            }
        }
        // 3. Added players: new records (creation order = keyed order, after the kept).
        const base = Date.now();
        for (const l of added) {
            const sharedFields = {
                companyId, bookingProfileId: profile.id, courseId: course.id, playDate: after.playDate, playerType: l.playerType,
                golferId: l.standing ? validated.golferByMemberId.get(l.standing.memberId).id : null,
                playerName: l.playerName, memberNo: l.memberNo, status: 'booked', ...stamps,
            };
            const firstRec = await Player.create({
                ...sharedFields, secondNineFlag: 0, unitCourseId: course.firstNineId, teeTime: after.teeTime,
                createdAt: new Date(base + (l.sortOrder - 1) * 2),
            }, { transaction });
            if (after.holes === 18) {
                await Player.create({
                    ...sharedFields, secondNineFlag: 1, firstNinePlayerId: firstRec.id, unitCourseId: course.secondNineId, teeTime: after.crossTime,
                    createdAt: new Date(base + (l.sortOrder - 1) * 2 + 1),
                }, { transaction });
            }
        }
        // 4. Header.
        profile.courseId = course.id;
        profile.playDate = after.playDate;
        profile.contactMobile = p.contactMobile;
        profile.remarks = p.remarks;
        profile.updatedBy = callerId;
        await profile.save({ transaction });
        if (target.lockRows.length) await FlightLock.destroy({ where: { companyId, groupId: String(body.lockGroupId) }, transaction });

        // 5. The late-change penalty, inside the change (posted after commit).
        if (p.priced) {
            chargeRow = await noShow.raise({
                req, profile: { ...profile.get(), id: profile.id, companyId, playDate: p.flight.playDate, bookingNo: profile.bookingNo },
                booker: p.booker, players: p.verdict.chargedPlayers, chargeReason: 'late-cancel', priced: p.priced,
                waive: waive ? { reason: waiveReason } : null, stamps, transaction,
            });
        }

        // 6. The history row.
        const count = await BookingChange.count({ where: { bookingProfileId: profile.id }, transaction });
        const rosterAfter = [...kept.map(lineSnapshot), ...added.map((l) => ({ playerName: l.playerName, memberNo: l.memberNo, playerType: l.playerType }))];
        const change = await BookingChange.create({
            companyId, bookingProfileId: profile.id, bookingNo: profile.bookingNo, changeNo: count + 1, changeType: p.changeType,
            before: { ...p.flight, ...originalHeader, players: [...kept, ...dropped].map(lineSnapshot) },
            after: { courseId: after.courseId, courseCode: after.courseCode, courseName: after.courseName, playDate: after.playDate, teeTime: after.teeTime, crossTime: after.crossTime, holes: after.holes, contactMobile: p.contactMobile, remarks: p.remarks, players: rosterAfter },
            summary: p.summary, reason, noShowChargeId: chargeRow ? chargeRow.id : null, changedAt: now, changedBy: callerId, ...stamps,
        }, { transaction });

        // 7. ONE email to every affected player with an address (dropped included).
        const recipients = [];
        const memberNos = new Set([...kept, ...dropped].map((r) => r.memberNo).filter(Boolean));
        for (const no of memberNos) {
            const s = await getGolfMemberStanding(companyId, no);
            if (s && s.email) recipients.push(s);
        }
        for (const l of added) if (l.standing) recipients.push(l.standing);
        const chargeText = chargeRow
            ? (chargeRow.status === 'waived' ? '' : `A late-change charge of ${Number(chargeRow.totalAmount).toFixed(2)} applies to ${p.booker.name}'s account.`)
            : '';
        await shared.queueBookingEmail({
            companyId, templateKey: 'golf.booking.changed', recipients,
            data: {
                bookingNo: profile.bookingNo, changeSummary: p.summary.replace(/\.$/, ''),
                previousFlight: `${shared.playDateText(p.flight.playDate)} ${p.flight.teeTime} - ${p.flight.courseName}`,
                playDateText: shared.playDateText(after.playDate), teeTime: after.teeTime, crossTime: after.crossTime || '',
                courseName: after.courseName, holes: after.holes,
                playersTable: shared.playersTableHtml([...kept, ...added].map((x, i) => ({ sortOrder: i + 1, playerName: x.playerName, memberNo: x.memberNo, playerType: x.playerType })), playerTypes.labelsOf(await playerTypes.catalog(companyId))),
                chargeText,
            },
            transaction,
        });
        return { profile, change, summary: p.summary };
    });
    if (result.error) return result;

    let suffix = '';
    if (chargeRow) {
        if (chargeRow.status === 'waived') suffix = ` Late-change charge waived (${chargeRow.waiveReason}).`;
        else {
            const posted = await noShow.postPending(req, chargeRow);
            suffix = posted.status === 'posted'
                ? ` Late-change charge ${Number(posted.totalAmount).toFixed(2)} posted to ${posted.bookerName} (${posted.arDocNo}).`
                : ` Late-change charge ${Number(posted.totalAmount).toFixed(2)} recorded as pending - ${posted.remarks}`;
        }
    }
    return { message: `Booking ${result.profile.bookingNo} changed.${suffix}`, changeId: result.change.id, summary: result.summary };
}

// The history of one booking, newest first.
async function history(req, id) {
    const companyId = shared.companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const profile = await BookingProfile.findOne({ where: { companyId, id }, attributes: ['id'] });
    if (!profile) return fail('Booking not found.', 404);
    const rows = await BookingChange.findAll({ where: { bookingProfileId: profile.id }, order: [['changeNo', 'DESC']] });
    return {
        changes: rows.map((r) => ({
            id: r.id, changeNo: r.changeNo, changeType: r.changeType, summary: r.summary, reason: r.reason,
            before: r.before, after: r.after, noShowChargeId: r.noShowChargeId, changedAt: r.changedAt, changedBy: r.changedBy,
        })),
    };
}

module.exports = { preview, apply, history, policy, summarize, changeTypeOf, flightText, sameFlight };
