// Fixed vocabulary for a Membership Type's class. The club primarily runs two
// kinds of membership; the class drives which conditional fields apply (child age
// range + play times for personal; nominee count + nominee category for corporate).
// Served to the screen via /types/meta and validated on the server.
const MEMBERSHIP_CLASSES = [
    { key: 'personal', label: 'Personal' },
    { key: 'corporate', label: 'Corporate' },
];

const MEMBERSHIP_CLASS_KEYS = MEMBERSHIP_CLASSES.map((c) => c.key);

// How often a standing charge is applied. 'fixed-month' bills once a year in a
// specific month (the row's fixedMonth, 1-12).
const STANDING_FREQUENCIES = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'annually', label: 'Annually' },
    { key: 'fixed-month', label: 'Fixed Month' },
];

const STANDING_FREQUENCY_KEYS = STANDING_FREQUENCIES.map((f) => f.key);

module.exports = {
    MEMBERSHIP_CLASSES,
    MEMBERSHIP_CLASS_KEYS,
    STANDING_FREQUENCIES,
    STANDING_FREQUENCY_KEYS,
};
