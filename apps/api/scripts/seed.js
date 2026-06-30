// scripts/seed.js
//
// Deliberate, one-off database seeder. Run with: `npm run seed`
//
// This is the ONLY supported way to run the destructive wipe + reseed. It forces
// RUN_SEED=true, runs the same schema sync + seed path the app uses, then exits
// (it does NOT start the HTTP server). The normal app boot (server.js) never
// seeds, so Cloud Run autoscaling cannot wipe data.

process.env.RUN_SEED = 'true';

const { initializeDB } = require('../src/app');

(async () => {
    try {
        await initializeDB();
        console.log('✅ Seed run complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed run failed:', err);
        process.exit(1);
    }
})();
