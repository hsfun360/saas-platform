const { defineNumberingScheme } = require('../../platform/numberingSchemeDef');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility-owned document numbering (the facility-* series: booking, bill;
// registration joins in slice 3). Same shared shape as membership / golf / AR
// - the gapless counters live beside the documents they number (see
// platform/numberingSchemeDef.js). Maintained at /facility/numbering;
// consumed through platform/numberingGateway.js.
module.exports = defineNumberingScheme({
    schema: FACILITY_SCHEMA,
    modelName: 'FacilityNumberingScheme',
    indexPrefix: 'Facility',
});
