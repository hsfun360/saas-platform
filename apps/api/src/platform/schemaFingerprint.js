// src/platform/schemaFingerprint.js
//
// Schema-fingerprint gate for the boot-time `sequelize.sync({ alter: true })`.
//
// The full alter-sync interrogates every table/column/index/FK (thousands of
// information_schema queries, minutes of wall clock, and the window where the
// external Postgres occasionally drops connections). But the models only change
// on the rare release that actually edits a model file - every other boot the
// sync finds nothing to do.
//
// So: hash the model definitions (deterministically) into a fingerprint, store
// it in a one-row table (public."SchemaMeta"), and skip the sync whenever the
// stored fingerprint matches the code's. The one boot after a model change sees
// a different fingerprint, runs the full sync once, and updates the row.
//
// Escape hatch: deploy with FORCE_SCHEMA_SYNC=1 to run the sync regardless
// (e.g. after a manual DDL change made outside the models).

const crypto = require('crypto');

// A stable, JSON-safe rendering of an attribute default (functions/instances
// like UUIDV4 or literals reduce to their constructor name - deterministic).
function renderDefault(v) {
    if (v === undefined) return undefined;
    if (v === null) return 'NULL';
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    return (v.constructor && v.constructor.name) || t;
}

// Deterministic sha256 over every registered model's table, schema, attributes
// and indexes. Any change to a model file changes this string.
function computeSchemaFingerprint(sequelize) {
    const models = Object.keys(sequelize.models).sort().map((name) => {
        const model = sequelize.models[name];
        const attributes = {};
        for (const attrName of Object.keys(model.rawAttributes).sort()) {
            const a = model.rawAttributes[attrName];
            attributes[attrName] = {
                type: String(a.type),
                allowNull: a.allowNull !== false,
                primaryKey: !!a.primaryKey,
                unique: !!a.unique,
                defaultValue: renderDefault(a.defaultValue),
                field: a.field || attrName,
                references: a.references ? JSON.stringify(a.references) : undefined,
                onDelete: a.onDelete,
            };
        }
        return {
            name,
            table: model.tableName,
            schema: (model.options && model.options.schema) || 'public',
            attributes,
            indexes: ((model.options && model.options.indexes) || []).map((i) => ({
                name: i.name,
                unique: !!i.unique,
                fields: i.fields,
            })),
        };
    });
    return crypto.createHash('sha256').update(JSON.stringify(models)).digest('hex');
}

// One-row marker table. Created lazily (cheap, idempotent) - call under the
// boot advisory lock so concurrent instances never race the CREATE.
async function readStoredFingerprint(sequelize) {
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS public."SchemaMeta" (
            id integer PRIMARY KEY,
            fingerprint text NOT NULL,
            "syncedAt" timestamptz NOT NULL DEFAULT now()
        )`,
    );
    const [rows] = await sequelize.query('SELECT fingerprint FROM public."SchemaMeta" WHERE id = 1');
    return rows.length ? rows[0].fingerprint : null;
}

async function writeStoredFingerprint(sequelize, fingerprint) {
    await sequelize.query(
        `INSERT INTO public."SchemaMeta" (id, fingerprint, "syncedAt") VALUES (1, :fp, now())
         ON CONFLICT (id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, "syncedAt" = now()`,
        { replacements: { fp: fingerprint } },
    );
}

module.exports = { computeSchemaFingerprint, readStoredFingerprint, writeStoredFingerprint };
