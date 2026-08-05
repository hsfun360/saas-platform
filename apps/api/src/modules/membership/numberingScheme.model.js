const { defineNumberingScheme } = require('../../platform/numberingSchemeDef');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership-owned document numbering (purpose 'membership' + future
// prospect/application series). Split out of the Control Plane 2026-08-05 so
// the gapless counter lives beside the documents it numbers - see
// platform/numberingSchemeDef.js. Maintained at /membership/numbering;
// consumed through platform/numberingGateway.js, never a direct join.
module.exports = defineNumberingScheme({
    schema: MEMBERSHIP_SCHEMA,
    modelName: 'MembershipNumberingScheme',
    indexPrefix: 'Ms',
});
