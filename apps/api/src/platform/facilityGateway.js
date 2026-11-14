// src/platform/facilityGateway.js
//
// PLATFORM SEAM: other services -> Facility Management (2026-11-14, slice
// 7c). Membership owns the letter of introduction of a visiting affiliated or
// reciprocal member and the day passes issued on it; the Facility station
// serves those passes and keeps its own records (items out, entries, bills)
// against the letter. Membership asks about them here, never by requiring
// the facility models. Read-only. In-process today; WHEN SPLIT each call
// becomes an HTTP request to internalServiceUrl('facility').

// What the letter still owes the station:
// { clear, itemsOut: [{ label, holder }], openBills: [{ billNo, totalAmount }],
//   text } - `holder` names a guest the visiting member brought (null = the
// visiting member), `text` reads after their name ("still holds L002 and has
// an open bill FBL-00017 (5.00)"). A letter the station never served is clear.
// WHEN SPLIT: GET {internalServiceUrl('facility')}/internal/visit-standing?affiliatedVisitId
async function getVisitFacilityStanding(companyId, affiliatedVisitId, opts = {}) {
    return require('../modules/facility/visitStanding.service').standingOf(companyId, affiliatedVisitId, opts);
}

// Whether a day's pass of the letter was used at the station:
// { used, items, entries, text }. `opts.guestRegistrationId` asks about ONE
// guest the visiting member brought (that guest's pass); without it the
// question is the visiting member's own day, their guests' use included.
// WHEN SPLIT: GET {internalServiceUrl('facility')}/internal/visit-day-use?affiliatedVisitId&date&guestRegistrationId
async function getVisitDayFacilityUse(companyId, affiliatedVisitId, date, opts = {}) {
    return require('../modules/facility/visitStanding.service').dayUseOf(companyId, affiliatedVisitId, date, opts);
}

module.exports = { getVisitFacilityStanding, getVisitDayFacilityUse };
