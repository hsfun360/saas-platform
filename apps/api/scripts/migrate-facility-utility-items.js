// Manual runner for the facility utility-item move (slice 6a, 2026-11-11).
// The API runs the same step at boot before its schema sync, so this script
// is only for running it ahead of a deploy or re-checking an environment:
//
//   node scripts/migrate-facility-utility-items.js
//
// Idempotent: it reports "nothing to move" once the move has happened.
require('dotenv').config();
const { sequelize } = require('../src/platform/db');
require('../src/wiring/associations');
const { migrateIssueTypesToUtilityItems } = require('../src/modules/facility/utilityMigration');

(async () => {
    await sequelize.authenticate();
    const out = await migrateIssueTypesToUtilityItems(sequelize);
    if (!out.migrated) console.log('Facility utility items: nothing to move (already moved, or a fresh database).');
    await sequelize.close();
})().catch((err) => {
    console.error('Facility utility-item move failed:', err);
    process.exit(1);
});
