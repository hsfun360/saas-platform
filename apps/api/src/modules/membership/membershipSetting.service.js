// Club Specification resolution - shared by the settings screen's controller
// AND every consumer that gates fields by it (memberships getOptions, the
// sales-agent meta, the membership-type meta). Always resolve through here so
// the find-or-create-with-defaults behaviour stays in one place.

const MembershipSetting = require('./membershipSetting.model');

// The safe defaults: an unconfigured club behaves exactly as the product did
// before Club Specification existed (golf, commercial, every channel on).
const SETTING_DEFAULTS = {
    clubType: 'golf',
    isCommittee: false,
    salesAgencyEnabled: true,
    salesExternalEnabled: true,
    salesInternalEnabled: true,
};

function toSettingsDto(row) {
    return {
        clubType: row.clubType,
        isCommittee: row.isCommittee,
        // A committee club has no sales channels, whatever the columns hold.
        salesAgencyEnabled: row.isCommittee ? false : row.salesAgencyEnabled,
        salesExternalEnabled: row.isCommittee ? false : row.salesExternalEnabled,
        salesInternalEnabled: row.isCommittee ? false : row.salesInternalEnabled,
    };
}

// The company's Club Specification row, created with defaults on first touch
// (the legacy system master is initialise-once, modify-only - never "added").
async function getSettingsRow(companyId) {
    const [row] = await MembershipSetting.findOrCreate({
        where: { companyId },
        defaults: { companyId, ...SETTING_DEFAULTS },
    });
    return row;
}

async function getSettings(companyId) {
    return toSettingsDto(await getSettingsRow(companyId));
}

// The agent kinds the club's configuration allows (empty for committee clubs).
function enabledAgentKinds(settings) {
    const kinds = [];
    if (settings.salesAgencyEnabled) kinds.push('agency-staff');
    if (settings.salesExternalEnabled) kinds.push('external');
    if (settings.salesInternalEnabled) kinds.push('internal');
    return kinds;
}

module.exports = { SETTING_DEFAULTS, getSettingsRow, getSettings, toSettingsDto, enabledAgentKinds };
