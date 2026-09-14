const { defineNumberingScheme } = require('../../platform/numberingSchemeDef');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf-owned document numbering (the four golf-* series: booking,
// registration, bill, rain check). Same shared shape as membership/AR - the
// gapless counters live beside the documents they will number (see
// platform/numberingSchemeDef.js). Maintained at /golf/numbering; consumed
// through platform/numberingGateway.js.
module.exports = defineNumberingScheme({
    schema: GOLF_SCHEMA,
    modelName: 'GolfNumberingScheme',
    indexPrefix: 'Golf',
});
