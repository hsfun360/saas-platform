// Request schemas for the eight SUBSCRIBER REFERENCE TABLES' maintenance
// routes under /auth/account/... (the Zod boundary seam, platform/validate.js
// - mounted 2026-10-12, the sixth standards sweep): Industry Types,
// Salutations, Nationalities, Races, Titles, Departments, Positions and Public
// Holidays. The consumer lists (/api/titles, /api/public-holidays, ...) carry
// their own schemas beside their route files.
//
// The eight controllers share one shape - a code, a description, an isActive
// toggle on update - plus Title's optional country, Position's seniority rank
// and the bundled-defaults seed, and Public Holiday's country + date. Each
// controller keeps its business checks (required code, the clash on rename,
// the country must be one the account's companies operate in, the whole-
// number rank, the real calendar date); these schemas bound SHAPE and SIZE at
// the boundary and strip unknown keys, so every key each controller reads is
// listed here - an unlisted key would be silently dropped. Keys stay optional
// because a PATCH leaves an absent key unchanged, and so the controllers' own
// "required" messages still fire on create. Every table keys on a UUID.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Ranks arrive as numbers or digit strings from the web form.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const idParam = { params: z.object({ id }) };
const code = str(255);
const description = str(255);
// A Country.alpha2, trimmed and lower-cased by the controller; blank = none.
const countryCode = str(10);

// The plain code + description tables.
const simple = (codeKey) => ({
    create: { body: z.object({ [codeKey]: code, description }) },
    update: { ...idParam, body: z.object({ [codeKey]: code, description, isActive: bool }) },
});

module.exports = {
    industryType: simple('industryTypeCode'),
    salutation: simple('salutationCode'),
    nationality: simple('nationalityCode'),
    race: simple('raceCode'),
    department: simple('departmentCode'),
    title: {
        create: { body: z.object({ titleCode: code, description, countryCode }) },
        update: { ...idParam, body: z.object({ titleCode: code, description, countryCode, isActive: bool }) },
    },
    position: {
        create: { body: z.object({ positionCode: code, description, rank: numberish }) },
        update: { ...idParam, body: z.object({ positionCode: code, description, rank: numberish, isActive: bool }) },
        // The bundled ladder's codes to create; omitted = every missing one.
        seed: { body: z.object({ codes: z.array(z.string().max(50)).max(100).nullable().optional() }) },
    },
    publicHoliday: {
        // holidayDate is a YYYY-MM-DD string the controller parses itself.
        create: { body: z.object({ countryCode, holidayDate: str(32), description }) },
        update: { ...idParam, body: z.object({ countryCode, holidayDate: str(32), description, isActive: bool }) },
    },
};
