// One-off migration for the 2026-09-30 closure re-key (closures are a fact
// about the PHYSICAL NINE, not the 18-hole course):
//   golf.CourseClosurePlan -> golf.UnitCourseClosurePlan (unitCourseId
//                             replaces courseId + nineScope; a plan that
//                             covered both nines is SPLIT into one plan per
//                             nine, day rows following their scope)
//   golf.CourseClosureDay  -> golf.UnitCourseClosureDay (nineScope dropped)
//
// Run BEFORE deploying the re-keyed api (renames/drops run before deploy;
// the boot alter-sync then adds the new indexes). Idempotent: every step
// guards on the current catalog state, so a re-run is a no-op.
//
// How to run: the seed-users Cloud Run job SEED_CODE pattern (scripts/ is
// excluded from the image), or locally as
// `node scripts/migrate-golf-closure-to-nine.js` with DATABASE_URL set,
// cwd = apps/api.

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

        // ---- 1. Renames ----------------------------------------------------
        if (await tableExists(t, 'CourseClosurePlan')) {
            if (await tableExists(t, 'UnitCourseClosurePlan')) {
                throw new Error('Both golf.CourseClosurePlan and golf.UnitCourseClosurePlan exist - resolve manually before migrating.');
            }
            await q('ALTER TABLE golf."CourseClosurePlan" RENAME TO "UnitCourseClosurePlan"');
            await q('ALTER TABLE golf."CourseClosureDay" RENAME TO "UnitCourseClosureDay"');
            console.log('Renamed golf.CourseClosurePlan/Day -> golf.UnitCourseClosurePlan/Day');
        }
        if (!(await tableExists(t, 'UnitCourseClosurePlan'))) {
            console.log('No closure tables - nothing to migrate (fresh DB, sync will create them).');
            return;
        }
        if (!(await columnExists(t, 'UnitCourseClosurePlan', 'unitCourseId'))) {
            await q('ALTER TABLE golf."UnitCourseClosurePlan" ADD COLUMN "unitCourseId" uuid NULL');
        }

        // ---- 2. Transform (only while the legacy columns exist) ------------
        if (await columnExists(t, 'UnitCourseClosurePlan', 'nineScope')) {
            // A plan "uses" a nine when its header scope covers it OR any of
            // its (hand-adjustable) day rows does. The original row becomes
            // the FIRST nine's plan when that nine is used, else the second's;
            // a plan using both gets a SIBLING plan on the second nine.

            // 2a. Assign the original plan its nine.
            await q(`UPDATE golf."UnitCourseClosurePlan" p SET "unitCourseId" =
                        CASE WHEN (p."nineScope" IN ('first-nine','all')
                                   OR EXISTS (SELECT 1 FROM golf."UnitCourseClosureDay" d
                                              WHERE d."closurePlanId" = p.id AND d."nineScope" IN ('first-nine','all')))
                             THEN c."firstNineId" ELSE c."secondNineId" END
                     FROM golf."Course" c
                     WHERE c.id = p."courseId" AND p."unitCourseId" IS NULL`);

            // 2b. Sibling plans on the second nine for plans that use both
            // nines. srcPlanId is a temp pointer for copying day rows.
            if (!(await columnExists(t, 'UnitCourseClosurePlan', 'srcPlanId'))) {
                await q('ALTER TABLE golf."UnitCourseClosurePlan" ADD COLUMN "srcPlanId" uuid NULL');
            }
            await q(`INSERT INTO golf."UnitCourseClosurePlan"
                        (id, "unitCourseId", "courseId", "nineScope", "srcPlanId", description, "dayScope",
                         "dateFrom", "dateTo", "startTime", "endTime", "isActive",
                         "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
                     SELECT gen_random_uuid(), c."secondNineId", p."courseId", p."nineScope", p.id, p.description, p."dayScope",
                            p."dateFrom", p."dateTo", p."startTime", p."endTime", p."isActive",
                            p."createdBy", p."createdByDepartmentId", p."updatedBy", p."createdAt", now()
                     FROM golf."UnitCourseClosurePlan" p
                     JOIN golf."Course" c ON c.id = p."courseId"
                     WHERE p."srcPlanId" IS NULL
                       AND p."unitCourseId" = c."firstNineId"
                       AND (p."nineScope" IN ('second-nine','all')
                            OR EXISTS (SELECT 1 FROM golf."UnitCourseClosureDay" d
                                       WHERE d."closurePlanId" = p.id AND d."nineScope" IN ('second-nine','all')))
                       AND NOT EXISTS (SELECT 1 FROM golf."UnitCourseClosurePlan" s WHERE s."srcPlanId" = p.id)`);

            // 2c. Copy the second-nine day rows to the siblings.
            await q(`INSERT INTO golf."UnitCourseClosureDay"
                        (id, "closurePlanId", "closureDate", "nineScope", "startTime", "endTime", "isActive", "createdAt", "updatedAt")
                     SELECT gen_random_uuid(), s.id, d."closureDate", d."nineScope", d."startTime", d."endTime", d."isActive", d."createdAt", now()
                     FROM golf."UnitCourseClosurePlan" s
                     JOIN golf."UnitCourseClosureDay" d ON d."closurePlanId" = s."srcPlanId"
                     WHERE s."srcPlanId" IS NOT NULL
                       AND d."nineScope" IN ('second-nine','all')`);

            // 2d. Day rows that do not belong to their plan's nine any more.
            await q(`DELETE FROM golf."UnitCourseClosureDay" d USING golf."UnitCourseClosurePlan" p, golf."Course" c
                     WHERE p.id = d."closurePlanId" AND c.id = p."courseId" AND p."srcPlanId" IS NULL
                       AND ((p."unitCourseId" = c."firstNineId" AND d."nineScope" = 'second-nine')
                            OR (p."unitCourseId" = c."secondNineId" AND d."nineScope" = 'first-nine'))`);

            // 2e. Legacy columns off.
            await q('ALTER TABLE golf."UnitCourseClosurePlan" ALTER COLUMN "unitCourseId" SET NOT NULL');
            await q('ALTER TABLE golf."UnitCourseClosurePlan" DROP COLUMN "nineScope"');
            await q('ALTER TABLE golf."UnitCourseClosurePlan" DROP COLUMN "courseId"');
            await q('ALTER TABLE golf."UnitCourseClosurePlan" DROP COLUMN "srcPlanId"');
            await q('ALTER TABLE golf."UnitCourseClosureDay" DROP COLUMN "nineScope"');
            console.log('Transformed closure plans (per-nine keys, both-nine plans split)');
        }

        // ---- 3. Old-name indexes off (boot alter-sync creates the new) -----
        for (const idx of ['IDX_CourseClosurePlan_Course', 'UX_CourseClosureDay_Plan_Date']) {
            await q(`DROP INDEX IF EXISTS golf."${idx}"`);
        }

        const [[plans]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM golf."UnitCourseClosurePlan"', { transaction: t });
        const [[days]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM golf."UnitCourseClosureDay"', { transaction: t });
        console.log(`GOLF_CLOSURE_REKEY_DONE plans=${plans.n} days=${days.n}`);
    });
    await sequelize.close();
}

run().catch((err) => {
    console.error('GOLF_CLOSURE_REKEY_FAILED', err);
    process.exit(1);
});
