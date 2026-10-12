// Request schemas for the Business Insights (dashboard) routes (the Zod
// boundary seam, platform/validate.js - mounted 2026-10-12). Everything is a
// GET with query filters; the controller keeps the period defaulting, the
// dimension and band vocabularies and the paging clamp. These schemas bound
// SHAPE and SIZE and strip unknown keys, so every query key the controller or
// its filter helpers (getPeriod, getClassFilter, getKindFilter, drill's q())
// read is listed here - an unlisted key would be silently dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Paging offsets arrive as digit strings on the query string.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

// The dashboard period (from/to, YYYY-MM-DD) and the contract class filter.
const period = { from: str(10), to: str(10) };
const classFilter = { class: str(20) };
const kindFilter = { kind: str(20) };

module.exports = {
    summary: { query: z.object({ ...period, ...classFilter }) },
    movement: { query: z.object({ ...period, ...classFilter }) },
    breakdown: { query: z.object({ ...classFilter, ...kindFilter, dimension: str(30) }) },
    agents: { query: z.object({ ...period, ...classFilter }) },
    // The drill combines membership-side and member-side filters.
    drill: {
        query: z.object({
            entity: str(20),
            ...classFilter,
            ...kindFilter,
            offset: numberish,
            statusId: str(64),
            typeId: str(64),
            agentId: str(64),
            agencyId: str(64),
            agentKind: str(20),
            joinedFrom: str(10),
            joinedTo: str(10),
            expiredFrom: str(10),
            expiredTo: str(10),
            memberStatusId: str(64),
            nationality: str(20),
            ageBand: str(20),
            countryCode: str(20),
        }),
    },
};
