// One-off migration for the 2026-09-29 golf booking/registration revamp:
//   golf.Booking            -> golf.BookingProfile (header only)
//   golf.BookingPlayer      -> absorbed into golf.Player, then DROPPED
//   golf.RegistrationPlayer -> golf.Player (one record per golfer per NINE;
//                              18 holes = a linked pair via firstNinePlayerId)
//   golf.Bill.registrationPlayerId -> playerId
//   golf.FlightLock re-keyed to (unitCourseId, teeTime)
//
// Run BEFORE deploying the revamped api (renames/drops run before deploy;
// the boot alter-sync then adds the new indexes). Idempotent: every step
// guards on the current catalog state, so a re-run is a no-op.
//
// How to run (the seed-users Cloud Run job pattern - scripts/ is excluded
// from the image, so the body ships via the SEED_CODE env var):
//   1. gcloud run jobs update seed-users --region asia-southeast3 \
//        --project my-easy-software-dev --env-vars-file <file with SEED_CODE: <this file's body>>
//   2. gcloud run jobs execute seed-users ... --wait
//   3. Restore the job's usual SEED_CODE afterwards.
// Locally it runs as `node scripts/migrate-golf-player-revamp.js` with
// DATABASE_URL set, cwd = apps/api.

/* eslint-disable no-console */
const path = require('path');
const dbPath = require('fs').existsSync(path.join(process.cwd(), 'src', 'platform', 'db.js'))
    ? path.join(process.cwd(), 'src', 'platform', 'db')
    : '../src/platform/db';
const { sequelize } = require(dbPath);

async function tableExists(t, table) {
    const [rows] = await sequelize.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='golf' AND table_name=:table`,
        { replacements: { table }, transaction: t },
    );
    return rows.length > 0;
}

async function columnExists(t, table, column) {
    const [rows] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='golf' AND table_name=:table AND column_name=:column`,
        { replacements: { table, column }, transaction: t },
    );
    return rows.length > 0;
}

async function run() {
    await sequelize.transaction(async (t) => {
        const q = (sql) => sequelize.query(sql, { transaction: t });

        // ---- 1. Booking -> BookingProfile --------------------------------
        if (await tableExists(t, 'Booking')) {
            if (await tableExists(t, 'BookingProfile')) {
                throw new Error('Both golf.Booking and golf.BookingProfile exist - resolve manually before migrating.');
            }
            await q('ALTER TABLE golf."Booking" RENAME TO "BookingProfile"');
            console.log('Renamed golf.Booking -> golf.BookingProfile');
        }
        if (await tableExists(t, 'BookingProfile') && !(await columnExists(t, 'BookingProfile', 'bookingType'))) {
            await q(`ALTER TABLE golf."BookingProfile" ADD COLUMN "bookingType" varchar(20) NOT NULL DEFAULT 'flight'`);
        }

        // ---- 2. RegistrationPlayer -> Player + new columns ----------------
        if (await tableExists(t, 'RegistrationPlayer')) {
            if (await tableExists(t, 'Player')) {
                throw new Error('Both golf.RegistrationPlayer and golf.Player exist - resolve manually before migrating.');
            }
            await q('ALTER TABLE golf."RegistrationPlayer" RENAME TO "Player"');
            console.log('Renamed golf.RegistrationPlayer -> golf.Player');
        }
        if (!(await tableExists(t, 'Player'))) {
            console.log('golf.Player missing - nothing to migrate (fresh DB, sync will create it).');
            return;
        }
        if (await columnExists(t, 'Player', 'bookingId')) {
            await q('ALTER TABLE golf."Player" RENAME COLUMN "bookingId" TO "bookingProfileId"');
        }
        if (!(await columnExists(t, 'Player', 'secondNineFlag'))) {
            await q('ALTER TABLE golf."Player" ADD COLUMN "secondNineFlag" integer NOT NULL DEFAULT 0');
        }
        if (!(await columnExists(t, 'Player', 'firstNinePlayerId'))) {
            await q('ALTER TABLE golf."Player" ADD COLUMN "firstNinePlayerId" uuid NULL');
        }
        if (!(await columnExists(t, 'Player', 'unitCourseId'))) {
            await q('ALTER TABLE golf."Player" ADD COLUMN "unitCourseId" uuid NULL');
        }
        await q('ALTER TABLE golf."Player" ALTER COLUMN "registrationNo" DROP NOT NULL');
        await q('ALTER TABLE golf."Player" ALTER COLUMN "golferId" DROP NOT NULL');
        await q(`ALTER TABLE golf."Player" ALTER COLUMN "status" SET DEFAULT 'booked'`);
        await q('ALTER TABLE golf."Player" ALTER COLUMN "registeredAt" DROP NOT NULL');
        await q('ALTER TABLE golf."Player" ALTER COLUMN "registeredAt" DROP DEFAULT');

        // ---- 3. Data transform (only while the legacy columns exist) ------
        if (await columnExists(t, 'Player', 'nine')) {
            // 3a. Cancelled registrations OF BOOKED LINES were "back to
            // unregistered" markers - drop them (unless a voided bill still
            // references the row); the line re-enters below as a 'booked'
            // record. Walk-in cancellations stay as the record.
            await q(`DELETE FROM golf."Player" p WHERE p.status='cancelled' AND p."bookingProfileId" IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM golf."Bill" b WHERE b."registrationPlayerId" = p.id)`);

            // 3b. The physical nine of every existing record.
            await q(`UPDATE golf."Player" p SET "unitCourseId" =
                        CASE WHEN p."nine"='second' THEN c."secondNineId" ELSE c."firstNineId" END
                     FROM golf."Course" c WHERE c.id = p."courseId" AND p."unitCourseId" IS NULL`);

            // 3c. Booked-but-unregistered BookingPlayer lines -> 'booked'
            // Player records (cancelled bookings carry their state along).
            if (await tableExists(t, 'BookingPlayer')) {
                await q(`INSERT INTO golf."Player"
                            (id, "companyId", "bookingProfileId", "secondNineFlag", "unitCourseId", "courseId",
                             "playDate", "nine", "teeTime", "holes", "golferId", "playerType", "playerName", "memberNo",
                             status, "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
                         SELECT gen_random_uuid(), b."companyId", b.id, 0, c."firstNineId", b."courseId",
                                b."playDate", 'first', b."startTime", b.holes, bp."golferId", bp."playerType", bp."playerName", bp."memberNo",
                                CASE WHEN b.status='cancelled' THEN 'cancelled' ELSE 'booked' END,
                                bp."createdBy", bp."createdByDepartmentId", bp."updatedBy", bp."createdAt", now()
                         FROM golf."BookingPlayer" bp
                         JOIN golf."BookingProfile" b ON b.id = bp."bookingId"
                         JOIN golf."Course" c ON c.id = b."courseId"
                         WHERE NOT EXISTS (SELECT 1 FROM golf."Player" p WHERE p."bookingPlayerId" = bp.id)`);
            }

            // 3d. Crossover records for every 18-hole starting record (its
            // own snapshotted crossTime, or the booking header's).
            await q(`INSERT INTO golf."Player"
                        (id, "companyId", "bookingProfileId", "secondNineFlag", "firstNinePlayerId", "unitCourseId", "courseId",
                         "playDate", "nine", "teeTime", "holes", "golferId", "playerType", "playerName", "memberNo",
                         status, "registrationNo", "registeredAt", "cancelledAt", "cancelledBy", "cancelReason",
                         "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
                     SELECT gen_random_uuid(), p."companyId", p."bookingProfileId", 1, p.id, c."secondNineId", p."courseId",
                            p."playDate", 'second', COALESCE(p."crossTime", b."crossTime"), p.holes, p."golferId", p."playerType", p."playerName", p."memberNo",
                            p.status, NULL, p."registeredAt", p."cancelledAt", p."cancelledBy", p."cancelReason",
                            p."createdBy", p."createdByDepartmentId", p."updatedBy", p."createdAt", now()
                     FROM golf."Player" p
                     JOIN golf."Course" c ON c.id = p."courseId"
                     LEFT JOIN golf."BookingProfile" b ON b.id = p."bookingProfileId"
                     WHERE p."secondNineFlag" = 0
                       AND COALESCE(p."crossTime", b."crossTime") IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM golf."Player" s WHERE s."firstNinePlayerId" = p.id)`);

            // 3e. Legacy columns off.
            await q('ALTER TABLE golf."Player" ALTER COLUMN "unitCourseId" SET NOT NULL');
            await q('ALTER TABLE golf."Player" DROP COLUMN IF EXISTS "bookingPlayerId"');
            await q('ALTER TABLE golf."Player" DROP COLUMN IF EXISTS "nine"');
            await q('ALTER TABLE golf."Player" DROP COLUMN IF EXISTS "crossNine"');
            await q('ALTER TABLE golf."Player" DROP COLUMN IF EXISTS "crossTime"');
            await q('ALTER TABLE golf."Player" DROP COLUMN IF EXISTS "holes"');
            console.log('Transformed golf.Player records (pairs created, legacy columns dropped)');
        }

        // ---- 4. BookingProfile sheds the flight placement -----------------
        for (const col of ['holes', 'startNine', 'startTime', 'crossNine', 'crossTime']) {
            await q(`ALTER TABLE golf."BookingProfile" DROP COLUMN IF EXISTS "${col}"`);
        }

        // ---- 5. BookingPlayer is absorbed ---------------------------------
        await q('DROP TABLE IF EXISTS golf."BookingPlayer"');

        // ---- 6. Bill points at the Player record --------------------------
        if (await columnExists(t, 'Bill', 'registrationPlayerId')) {
            await q('ALTER TABLE golf."Bill" RENAME COLUMN "registrationPlayerId" TO "playerId"');
        }

        // ---- 7. FlightLock re-keyed to the nine (rows are transient) ------
        if (await columnExists(t, 'FlightLock', 'nine')) {
            await q('DELETE FROM golf."FlightLock"');
            await q('ALTER TABLE golf."FlightLock" DROP COLUMN "nine"'); // drops UX_FlightLock_Cell too
        }
        if (!(await columnExists(t, 'FlightLock', 'unitCourseId'))) {
            await q('ALTER TABLE golf."FlightLock" ADD COLUMN "unitCourseId" uuid NOT NULL');
        }

        // ---- 8. Old-name indexes off (boot alter-sync creates the new) ----
        for (const idx of [
            'UX_GolfBooking_Company_No',
            'IX_GolfBooking_Company_Course_Date',
            'UX_GolfRegistrationPlayer_Company_No',
            'IX_GolfRegistrationPlayer_Company_Date',
            'UX_GolfRegistrationPlayer_BookingPlayer',
            'IX_GolfBill_RegistrationPlayer',
        ]) {
            await q(`DROP INDEX IF EXISTS golf."${idx}"`);
        }

        const [[profiles]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM golf."BookingProfile"', { transaction: t });
        const [[players]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM golf."Player"', { transaction: t });
        const [[pairs]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM golf."Player" WHERE "secondNineFlag"=1', { transaction: t });
        console.log(`GOLF_REVAMP_DONE profiles=${profiles.n} players=${players.n} crossoverRecords=${pairs.n}`);
    });
    await sequelize.close();
}

run().catch((err) => {
    console.error('GOLF_REVAMP_FAILED', err);
    process.exit(1);
});
