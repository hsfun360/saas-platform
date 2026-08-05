const { defineNumberingScheme } = require('../../platform/numberingSchemeDef');
const { AR_SCHEMA } = require('../../platform/schemas');

// AR-owned document numbering (the eight ar-* series). Split out of the
// Control Plane 2026-08-05 so the gapless counters live beside the documents
// they number - see platform/numberingSchemeDef.js. Maintained at
// /ar/numbering; consumed through platform/numberingGateway.js.
module.exports = defineNumberingScheme({
    schema: AR_SCHEMA,
    modelName: 'ArNumberingScheme',
    indexPrefix: 'Ar',
});
