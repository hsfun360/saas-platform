// Request schemas for the Classes, Class Schedules and Class Sessions routes
// (the Zod boundary seam, platform/validate.js). The controllers keep the
// business checks (code shape and freeze, the venue / instructor / fee item
// ownership, the capacity ladder, the weekday list, the date range, the
// conflict verdicts); these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key the controllers read is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const classBody = {
    code: str(50),
    description: str(255),
    details: str(4000),
    venueId: str(64),
    instructorId: str(64),
    capacity: numberish,
    enrolmentMode: str(20),
    feeTransactionTypeId: str(64),
    visitorFeeTransactionTypeId: str(64),
    visitorsAllowed: bool,
    walkInAllowed: bool,
    cancellationNoticeHours: numberish,
    sortOrder: numberish,
    isActive: bool,
};

const scheduleBody = {
    name: str(255),
    dateFrom: str(10),
    dateTo: str(10),
    weekdays: z.array(z.union([z.number(), z.string().max(2)])).max(7).nullable().optional(),
    startTime: str(8),
    endTime: str(8),
    venueId: str(64),
    instructorId: str(64),
    capacity: numberish,
    skipClosures: bool,
    skipPublicHolidays: bool,
    termFeeNote: str(255),
    remarks: str(255),
    // Edit previews exclude the schedule's own sessions from the conflicts.
    scheduleId: str(64),
};

const sessionBody = {
    classId: str(64),
    scheduleId: str(64),
    sessionDate: str(10),
    startTime: str(8),
    endTime: str(8),
    venueId: str(64),
    instructorId: str(64),
    capacity: numberish,
    remarks: str(255),
};

const reasonBody = { reason: str(255) };

// An enrolment: a member by number or a visitor profile, into a session or a term.
const enrolBody = {
    classId: str(64),
    sessionId: str(64),
    scheduleId: str(64),
    memberNo: str(50),
    visitor: z.object({ name: str(255), identityNo: str(50), mobile: str(30), email: str(255) }).nullable().optional(),
    remarks: str(255),
};
const markLine = z.object({ attendanceId: z.string().max(64), status: z.string().max(10) });

const idParam = { params: z.object({ id }) };
const scheduleParam = { params: z.object({ id, scheduleId: id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(classBody) },
    update: { ...idParam, body: z.object(classBody) },
    scheduleList: idParam,
    schedulePreview: { ...idParam, body: z.object(scheduleBody) },
    scheduleCreate: { ...idParam, body: z.object(scheduleBody) },
    scheduleUpdate: { ...scheduleParam, body: z.object(scheduleBody) },
    scheduleClose: scheduleParam,
    scheduleCancel: { ...scheduleParam, body: z.object(reasonBody) },
    sessionList: { query: z.object({ from: str(10), to: str(10), classId: str(64), instructorId: str(64), venueId: str(64) }) },
    sessionCreate: { body: z.object(sessionBody) },
    sessionUpdate: { ...idParam, body: z.object(sessionBody) },
    sessionCancel: { ...idParam, body: z.object(reasonBody) },
    enrol: { body: z.object(enrolBody) },
    roster: idParam,
    attendance: { ...idParam, body: z.object({ marks: z.array(markLine).min(1).max(500) }) },
    hold: { ...idParam, body: z.object({ confirm: bool }) },
};
