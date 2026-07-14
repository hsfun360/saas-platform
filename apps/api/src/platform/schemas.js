// src/platform/schemas.js
//
// PHYSICAL DB NAMESPACING for the strangler-fig split.
//
// Each product-tier service owns its own Postgres SCHEMA. Its tables live under
// that schema (e.g. `membership."MembershipStatus"`) instead of the shared
// `public` schema, so when the service is extracted into its own deployment it
// can be lifted out with a clean `pg_dump --schema=<name>` -> restore into the
// new service's database, with NO table renames and NO app changes.
//
// The boundary is also enforced, not just documented: a cross-service query would
// have to schema-qualify, which makes accidental coupling obvious in review. This
// complements the ownership rules in docs/systems/README.md.
//
// Platform / control-plane tables (identity, saas, notification) stay in `public`
// for now - they are the shared core. They can be moved to their own schema later
// with the same mechanism if/when they split.

const MEMBERSHIP_SCHEMA = 'membership';
const GOLF_SCHEMA = 'golf';
const FACILITY_SCHEMA = 'facility';
// Shared financial reference consumed by every product (Membership/Facility/Golf).
// It owns tax definitions + rate resolution; it is nobody's sub-module, so it lives
// in its own schema and extracts cleanly like any other product service.
const TAX_SCHEMA = 'tax';

// Schemas that must exist before `sequelize.sync()` creates the product tables.
// A service is added here as soon as it defines its first schema-scoped model.
const PRODUCT_SCHEMAS = [MEMBERSHIP_SCHEMA, GOLF_SCHEMA, TAX_SCHEMA];

// Idempotently create every product schema. Runs once at boot, before sync,
// inside the same advisory-locked block so only one instance does it.
async function ensureProductSchemas(sequelize) {
    for (const schema of PRODUCT_SCHEMAS) {
        // Quote the identifier; CREATE SCHEMA IF NOT EXISTS is safe to re-run.
        await sequelize.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }
}

module.exports = {
    MEMBERSHIP_SCHEMA,
    GOLF_SCHEMA,
    FACILITY_SCHEMA,
    TAX_SCHEMA,
    PRODUCT_SCHEMAS,
    ensureProductSchemas,
};
