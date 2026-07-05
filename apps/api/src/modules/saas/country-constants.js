// Shared country reference constants.
//
// 'zz' is an ISO 3166-1 user-assigned code we repurpose as the "Others" choice -
// a valid, list-picked value for a company whose country isn't in the reference
// set (or that the user prefers not to specify precisely). It is always present
// and active so the picker can offer it. Note: it carries no timezone linkage
// (it's not in COUNTRY_TIMEZONES), so selecting it leaves the timezone free.
const OTHERS_ALPHA2 = 'zz';

const OTHERS_COUNTRY = {
    alpha2: OTHERS_ALPHA2,
    alpha3: null,
    numericCode: null,
    name: 'Others',
    names: {},
    flagEmoji: null,
    dialCode: null,
};

module.exports = { OTHERS_ALPHA2, OTHERS_COUNTRY };
