'use strict';

// Duplicate-constraint hygiene for the boot alter-sync.
//
// Sequelize 6's `sync({ alter: true })` re-emits `ADD FOREIGN KEY` / `ADD UNIQUE`
// through `changeColumn` on every synced column, and only removes the old
// foreign key first when the model's `references.model` is a plain string
// that equals the referenced table name - which the schema-scoped models
// (`{ tableName, schema }`) and the renamed tables never satisfy. Unique
// columns are never removed first at all. Postgres accepts the repeat and
// numbers it (`X_fkey1`, `X_fkey2`, ... `X_key103`), so every alter-sync
// leaves one more exact copy of each constraint behind.
//
// The copies are functionally inert but they are not free: the alter-sync
// itself interrogates information_schema per table, and those views join on
// the whole catalog, so each sync gets slower as the pile grows (dev and
// staging reached 8,000+ constraints for ~170 real ones, and the staging
// sync stopped finishing inside an instance's lifetime - see
// docs/ops/dev-environment.md). Dropping the copies before the sync keeps
// the introspection fast; dropping them again after the sync removes what
// that sync just added.
//
// Safe by construction: a constraint is dropped only when another constraint
// on the same table, of the same kind, with the identical definition
// (`pg_get_constraintdef`) survives - the one with the lowest ordinal (the
// unnumbered base name first). Cheap when clean: one catalog query.

const PLAN_SQL = `
    WITH c AS (
        SELECT c.oid, c.conrelid, c.conname, c.contype,
               n.nspname AS schema_name, r.relname AS table_name,
               pg_get_constraintdef(c.oid) AS def,
               COALESCE(NULLIF(substring(c.conname from '_(?:key|fkey)(\\d+)$'), '')::int, 0) AS ord
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE c.conrelid <> 0 AND c.contype IN ('f', 'u')
    ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY conrelid, contype, def ORDER BY ord, conname) AS rn
        FROM c
    )
    SELECT schema_name, table_name, conname, contype
    FROM ranked
    WHERE rn > 1
    ORDER BY schema_name, table_name, contype, ord, conname`;

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * Drops every foreign-key / unique constraint that exactly duplicates another
 * one on the same table. Returns the number dropped.
 */
async function dropDuplicateConstraints(sequelize, { log = console.log } = {}) {
    const [rows] = await sequelize.query(PLAN_SQL);
    if (!rows.length) return 0;

    let dropped = 0;
    const perKind = { f: 0, u: 0 };
    for (const row of rows) {
        await sequelize.query(
            `ALTER TABLE ${quoteIdent(row.schema_name)}.${quoteIdent(row.table_name)} DROP CONSTRAINT ${quoteIdent(row.conname)}`,
        );
        dropped += 1;
        perKind[row.contype] = (perKind[row.contype] || 0) + 1;
    }
    log(`Dropped ${dropped} duplicate constraint(s) left by earlier alter-syncs (${perKind.f} foreign-key, ${perKind.u} unique).`);
    return dropped;
}

module.exports = { dropDuplicateConstraints, PLAN_SQL };
