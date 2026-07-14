// Fixed domain vocabulary for the Unit Course master file (Golf Management).
//
// A unit course is a NINE-hole course - the building block of golf setup. A full
// 18-hole course is formed later (Course Setup, spec 2.2.4) by pairing two unit
// courses: one as the OUT (front) nine and one as the IN (back) nine.
// `courseType` constrains where a unit course may sit in that pairing, and drives
// hole numbering in Hole Setup (OUT -> 1-9, IN -> 10-18).
//
// Stored as the stable `key`; the API validates against the keys AND serves the
// list to the screen's dropdown (GET /api/golf/unit-courses/meta), so UI and
// validation never drift.
//
// `holeFrom`/`holeTo` is the hole-number range Hole Setup uses for the type
// (spec 2.2.2): OUT -> 1-9, IN -> 10-18, COMPOSITE -> 1-18 (the same nine under
// both the front and the back numbering context).
const COURSE_TYPES = [
    { key: 'out', label: 'OUT', description: 'Front nine only (holes 1-9)', holeFrom: 1, holeTo: 9 },
    { key: 'in', label: 'IN', description: 'Back nine only (holes 10-18)', holeFrom: 10, holeTo: 18 },
    { key: 'composite', label: 'COMPOSITE', description: 'Usable as either the front or the back nine', holeFrom: 1, holeTo: 18 },
];

const COURSE_TYPE_KEYS = COURSE_TYPES.map((t) => t.key);

// The hole numbers Hole Setup expects for a course type, in order.
function holeNumbersForType(courseType) {
    const t = COURSE_TYPES.find((c) => c.key === courseType);
    if (!t) return [];
    const numbers = [];
    for (let n = t.holeFrom; n <= t.holeTo; n++) numbers.push(n);
    return numbers;
}

// Unit a tee box's per-hole distances are measured in. (Difficulty ratings -
// course/slope rating - are NOT set here: they belong to the rated 18-hole
// composition and arrive with Course Setup, spec 2.2.4.)
const MEASUREMENT_UNITS = [
    { key: 'meter', label: 'Meter' },
    { key: 'yard', label: 'Yard' },
];

const MEASUREMENT_UNIT_KEYS = MEASUREMENT_UNITS.map((u) => u.key);

module.exports = { COURSE_TYPES, COURSE_TYPE_KEYS, holeNumbersForType, MEASUREMENT_UNITS, MEASUREMENT_UNIT_KEYS };
