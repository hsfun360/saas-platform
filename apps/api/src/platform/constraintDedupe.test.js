'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dropDuplicateConstraints, PLAN_SQL } = require('./constraintDedupe');

function fakeSequelize(planRows) {
    const queries = [];
    return {
        queries,
        async query(sql) {
            queries.push(sql);
            if (sql === PLAN_SQL) return [planRows];
            return [[], {}];
        },
    };
}

test('drops each duplicate on its own schema-qualified table and reports the count', async () => {
    const sequelize = fakeSequelize([
        { schema_name: 'public', table_name: 'Invitation', conname: 'Invitation_token_key1', contype: 'u' },
        { schema_name: 'membership', table_name: 'Address', conname: 'Address_memberId_fkey1', contype: 'f' },
        { schema_name: 'membership', table_name: 'Address', conname: 'Address_memberId_fkey2', contype: 'f' },
    ]);
    const lines = [];

    const dropped = await dropDuplicateConstraints(sequelize, { log: (l) => lines.push(l) });

    assert.equal(dropped, 3);
    assert.deepEqual(sequelize.queries.slice(1), [
        'ALTER TABLE "public"."Invitation" DROP CONSTRAINT "Invitation_token_key1"',
        'ALTER TABLE "membership"."Address" DROP CONSTRAINT "Address_memberId_fkey1"',
        'ALTER TABLE "membership"."Address" DROP CONSTRAINT "Address_memberId_fkey2"',
    ]);
    assert.deepEqual(lines, ['Dropped 3 duplicate constraint(s) left by earlier alter-syncs (2 foreign-key, 1 unique).']);
});

test('a clean catalog costs one query and logs nothing', async () => {
    const sequelize = fakeSequelize([]);
    const lines = [];

    const dropped = await dropDuplicateConstraints(sequelize, { log: (l) => lines.push(l) });

    assert.equal(dropped, 0);
    assert.equal(sequelize.queries.length, 1);
    assert.deepEqual(lines, []);
});

test('the plan keeps the unnumbered base constraint and only lists later copies', () => {
    // The ranking is in SQL; pin the two properties the safety argument rests on.
    assert.match(PLAN_SQL, /PARTITION BY conrelid, contype, def ORDER BY ord, conname/);
    assert.match(PLAN_SQL, /WHERE rn > 1/);
});
