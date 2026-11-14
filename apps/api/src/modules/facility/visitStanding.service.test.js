const test = require('node:test');
const assert = require('node:assert/strict');
const standing = require('./visitStanding.service');

// The wording of what the station holds against a letter (slice 7c): read
// after the visiting member's name in Membership's refusals.

test('what holds a letter: the items its party has out, then its open facility bills', () => {
    assert.equal(standing.holdText({}), '');
    assert.equal(standing.holdText({ itemsOut: [{ label: 'L002', holder: null }] }), 'still holds L002');
    assert.equal(standing.holdText({ itemsOut: [{ label: 'L002', holder: null }, { label: 'TOWEL x 2', holder: 'E2E Companion' }] }), 'still holds L002 and TOWEL x 2 (E2E Companion)');
    assert.equal(standing.holdText({ openBills: [{ billNo: 'FBL-00017', totalAmount: 5 }] }), 'has an open bill FBL-00017 (5.00)');
    assert.equal(standing.holdText({ openBills: [{ billNo: 'FBL-00017', totalAmount: 5 }, { billNo: 'FBL-00018', totalAmount: '31.5' }] }), 'has open bills FBL-00017 (5.00) and FBL-00018 (31.50)');
    assert.equal(
        standing.holdText({ itemsOut: [{ label: 'L002', holder: null }, { label: 'TOWEL', holder: null }, { label: 'TOWEL', holder: 'E2E Companion' }], openBills: [{ billNo: 'FBL-00017', totalAmount: 31 }] }),
        'still holds L002, TOWEL and TOWEL (E2E Companion) and has an open bill FBL-00017 (31.00)',
    );
});

test('how a day\'s pass was used at the station', () => {
    assert.equal(standing.useText({}), '');
    assert.equal(standing.useText({ items: 1 }), 'took 1 item');
    assert.equal(standing.useText({ items: 3, entries: 1 }), 'took 3 items and entered 1 facility');
    assert.equal(standing.useText({ entries: 2 }), 'entered 2 facilities');
    assert.equal(standing.listText(['a']), 'a');
    assert.equal(standing.listText(['a', 'b', 'c']), 'a, b and c');
});
