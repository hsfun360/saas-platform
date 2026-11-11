// One-off move of the issue-mode Facility Types to the Utility Item master
// (slice 6a, structures approved 2026-11-11). Runs at boot BEFORE the
// alter-sync (src/app.js) and from scripts/migrate-facility-utility-items.js;
// idempotent - it does nothing once facility."IssueRecord" has lost its
// facilityTypeId column (already moved) or on a fresh database.
//
// Before: a locker or a towel was a FacilityType of usageMode 'issue', its
// numbered units were Facility rows (a counted type had ONE counter row), and
// IssueRecord pointed at both. After: each such type is a UtilityItem and
// each numbered unit a UtilityUnit - with the SAME ids, so every IssueRecord
// (and the bill hanging off it) keeps pointing at the right row once its two
// columns are renamed. The old types, their facility rows and anything that
// only made sense on them (closure plans, guest rules) are deleted, and the
// retired columns dropped. Everything after the two CREATE TABLEs is ONE
// transaction: a failure leaves the database exactly as it was.

async function columnExists(sequelize, table, column, transaction) {
    const [rows] = await sequelize.query(
        'SELECT 1 FROM information_schema.columns WHERE table_schema = \'facility\' AND table_name = :table AND column_name = :column',
        { replacements: { table, column }, transaction },
    );
    return rows.length > 0;
}

async function tableExists(sequelize, table, transaction) {
    const [rows] = await sequelize.query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = \'facility\' AND table_name = :table',
        { replacements: { table }, transaction },
    );
    return rows.length > 0;
}

async function migrateIssueTypesToUtilityItems(sequelize, { log = console.log } = {}) {
    if (!(await tableExists(sequelize, 'IssueRecord')) || !(await columnExists(sequelize, 'IssueRecord', 'facilityTypeId'))) {
        return { migrated: false };
    }

    // The two new tables, created from their models (with their indexes and
    // foreign keys) so the copy below has somewhere to land; the alter-sync
    // that follows finds them already in place.
    const UtilityItem = require('./utilityItem.model');
    const UtilityUnit = require('./utilityUnit.model');
    await UtilityItem.sync();
    await UtilityUnit.sync();

    const ISSUE_TYPES = 'SELECT id FROM facility."FacilityType" WHERE "usageMode" = \'issue\'';
    const out = await sequelize.transaction(async (transaction) => {
        const run = (sql) => sequelize.query(sql, { transaction });

        const [, items] = await run(`
            INSERT INTO facility."UtilityItem"
                (id, "companyId", code, description, "trackUnits", "returnRequired", "stockQuantity", "maxPerPerson", "dueDays",
                 "feeTransactionTypeId", "guestsAllowed", "requiresEntry", "iconUrl", "sortOrder", "isActive",
                 "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
            SELECT t.id, t."companyId", t.code, t.description, COALESCE(t."trackUnits", true), true, NULL,
                   COALESCE(t."maxIssuePerPatron", 1), COALESCE(t."issueDueDays", 0),
                   t."issueFeeTransactionTypeId", true, false, t."iconUrl", t."sortOrder", t."isActive",
                   t."createdBy", t."createdByDepartmentId", t."updatedBy", t."createdAt", t."updatedAt"
              FROM facility."FacilityType" t
             WHERE t."usageMode" = 'issue'
            ON CONFLICT (id) DO NOTHING`);

        const [, units] = await run(`
            INSERT INTO facility."UtilityUnit"
                (id, "companyId", "utilityItemId", code, location, "unitStatus", "currentIssueId", remarks, "sortOrder", "isActive",
                 "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
            SELECT f.id, f."companyId", f."facilityTypeId", f.code,
                   COALESCE(NULLIF(f.location, ''), CASE WHEN f.name IS NOT NULL AND f.name <> f.code THEN f.name END),
                   COALESCE(f."unitStatus", 'available'), f."currentIssueId", f.remarks, f."sortOrder", f."isActive",
                   f."createdBy", f."createdByDepartmentId", f."updatedBy", f."createdAt", f."updatedAt"
              FROM facility."Facility" f
              JOIN facility."FacilityType" t ON t.id = f."facilityTypeId"
             WHERE t."usageMode" = 'issue' AND COALESCE(t."trackUnits", true) = true
            ON CONFLICT (id) DO NOTHING`);

        // A counted type's issues pointed at its single counter row, which
        // does not become a unit.
        await run(`
            UPDATE facility."IssueRecord" r SET "facilityId" = NULL
             WHERE r."facilityId" IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM facility."UtilityUnit" u WHERE u.id = r."facilityId")`);

        // The issue record lets go of FacilityType / Facility and is renamed;
        // the alter-sync adds the new foreign keys to the utility tables.
        const [fks] = await run(`
            SELECT DISTINCT con.conname
              FROM pg_constraint con
              JOIN pg_class rel ON rel.oid = con.conrelid
              JOIN pg_namespace n ON n.oid = rel.relnamespace
              JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY (con.conkey)
             WHERE n.nspname = 'facility' AND rel.relname = 'IssueRecord' AND con.contype = 'f'
               AND a.attname IN ('facilityTypeId', 'facilityId')`);
        for (const fk of fks) await run(`ALTER TABLE facility."IssueRecord" DROP CONSTRAINT "${fk.conname}"`);
        await run('ALTER TABLE facility."IssueRecord" RENAME COLUMN "facilityTypeId" TO "utilityItemId"');
        await run('ALTER TABLE facility."IssueRecord" RENAME COLUMN "facilityId" TO "utilityUnitId"');
        await run('ALTER INDEX IF EXISTS facility."IX_FacilityIssueRecord_Company_Type_Status" RENAME TO "IX_FacilityIssueRecord_Company_Item_Status"');
        await run('ALTER INDEX IF EXISTS facility."IX_FacilityIssueRecord_Facility" RENAME TO "IX_FacilityIssueRecord_Unit"');

        // What only made sense on the old types goes with them. A billing
        // item scoped to an old type becomes unscoped (the utility item names
        // its fee itself); the optional tables are skipped when absent.
        if (await tableExists(sequelize, 'TransactionType', transaction)) {
            await run(`UPDATE facility."TransactionType" SET "facilityTypeId" = NULL WHERE "facilityTypeId" IN (${ISSUE_TYPES})`);
        }
        if (await tableExists(sequelize, 'GuestControlRule', transaction) && await columnExists(sequelize, 'GuestControlRule', 'facilityTypeId', transaction)) {
            await run(`DELETE FROM facility."GuestControlRule" WHERE "facilityTypeId" IN (${ISSUE_TYPES})`);
        }
        if (await tableExists(sequelize, 'Venue', transaction)) {
            await run(`UPDATE facility."Venue" SET "facilityId" = NULL WHERE "facilityId" IN (SELECT id FROM facility."Facility" WHERE "facilityTypeId" IN (${ISSUE_TYPES}))`);
        }
        if (await tableExists(sequelize, 'ClassSession', transaction)) {
            await run(`UPDATE facility."ClassSession" SET "facilityId" = NULL WHERE "facilityId" IN (SELECT id FROM facility."Facility" WHERE "facilityTypeId" IN (${ISSUE_TYPES}))`);
        }
        if (await tableExists(sequelize, 'FacilityClosurePlan', transaction)) {
            await run(`DELETE FROM facility."FacilityClosureDay" WHERE "closurePlanId" IN (SELECT id FROM facility."FacilityClosurePlan" WHERE "facilityTypeId" IN (${ISSUE_TYPES}))`);
            await run(`DELETE FROM facility."FacilityClosurePlan" WHERE "facilityTypeId" IN (${ISSUE_TYPES})`);
        }
        await run(`DELETE FROM facility."Facility" WHERE "facilityTypeId" IN (${ISSUE_TYPES})`);
        await run('DELETE FROM facility."FacilityType" WHERE "usageMode" = \'issue\'');

        // The retired columns.
        for (const column of ['trackUnits', 'maxIssuePerPatron', 'issueFeeTransactionTypeId', 'issueDueDays']) {
            await run(`ALTER TABLE facility."FacilityType" DROP COLUMN IF EXISTS "${column}"`);
        }
        for (const column of ['unitStatus', 'currentIssueId']) {
            await run(`ALTER TABLE facility."Facility" DROP COLUMN IF EXISTS "${column}"`);
        }
        return { items: Number(items) || 0, units: Number(units) || 0 };
    });
    log(`Facility utility items: ${out.items} issue-mode type(s) moved to UtilityItem with ${out.units} unit(s); IssueRecord re-pointed; the issue usage mode is retired.`);
    return { migrated: true, ...out };
}

module.exports = { migrateIssueTypesToUtilityItems };
