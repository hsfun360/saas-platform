// Fixed vocabulary for a Membership Type's class. The club primarily runs two
// kinds of membership; the class drives which conditional fields apply (child age
// range + play times for personal; nominee count + nominee category for corporate).
// Served to the screen via /types/meta and validated on the server.
const MEMBERSHIP_CLASSES = [
    { key: 'personal', label: 'Personal' },
    { key: 'corporate', label: 'Corporate' },
];

const MEMBERSHIP_CLASS_KEYS = MEMBERSHIP_CLASSES.map((c) => c.key);

module.exports = { MEMBERSHIP_CLASSES, MEMBERSHIP_CLASS_KEYS };
