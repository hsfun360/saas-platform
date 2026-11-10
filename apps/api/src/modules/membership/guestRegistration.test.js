// Unit tests for the Guest Registration pure rules and the guest-visit
// counting rule (structure approved 2026-11-10).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { passStateOf, normalizeMobile, normalizeGuest, tokenFromCode, whatsappLink, shareText } = require('./guestRegistration.service');
const { countVisits, groupReport } = require('./guestVisit.service');

test('passStateOf: valid on the visit date only, by the club date', () => {
    assert.equal(passStateOf('registered', '2026-11-14', '2026-11-14'), 'valid');
    assert.equal(passStateOf('arrived', '2026-11-14', '2026-11-14'), 'valid');
    assert.equal(passStateOf('registered', '2026-11-15', '2026-11-14'), 'upcoming');
    assert.equal(passStateOf('registered', '2026-11-13', '2026-11-14'), 'expired');
    assert.equal(passStateOf('arrived', '2026-11-13', '2026-11-14'), 'expired');
    assert.equal(passStateOf('cancelled', '2026-11-14', '2026-11-14'), 'cancelled');
});

test('normalizeMobile: a bare dialling code is no number; separators are dropped', () => {
    assert.equal(normalizeMobile('+60'), null);
    assert.equal(normalizeMobile(''), null);
    assert.equal(normalizeMobile(null), null);
    assert.equal(normalizeMobile('+60 12-345 6789'), '+60123456789');
});

test('normalizeGuest: name is mandatory, and mobile or email is mandatory', () => {
    assert.match(normalizeGuest({ mobile: '+60123456789' }).error, /name/);
    assert.match(normalizeGuest({ name: 'Lim Mei Ling' }).error, /mobile number or email/);
    assert.match(normalizeGuest({ name: 'Lim Mei Ling', mobile: '+60' }).error, /mobile number or email/);
    assert.match(normalizeGuest({ name: 'Lim Mei Ling', email: 'not-an-email' }).error, /email/);
    assert.match(normalizeGuest({ name: 'Lim Mei Ling', mobile: '+60abc12345' }).error, /mobile number is not valid/);
    assert.deepEqual(normalizeGuest({ name: ' Lim Mei Ling ', email: 'Mei@Example.com' }).value, {
        name: 'Lim Mei Ling', mobile: null, email: 'mei@example.com', identityNo: null, remarks: null,
    });
    assert.equal(normalizeGuest({ name: 'Lim', mobile: '+60123456789' }).value.mobile, '+60123456789');
});

test('tokenFromCode: reads the token from the pass link or the bare token', () => {
    const token = 'a'.repeat(64);
    assert.equal(tokenFromCode(`https://app.example.com/guest-pass/${token}`), token);
    assert.equal(tokenFromCode(token.toUpperCase()), token);
    assert.equal(tokenFromCode('BUGGY-0042'), null);
    assert.equal(tokenFromCode(''), null);
});

test('whatsappLink: digits only in the number, the message encoded; none without a mobile', () => {
    const text = shareText({ guestName: 'Mei', clubName: 'KLGCC', hostName: 'Ahmad', visitDate: '2026-11-14', passUrl: 'https://x/guest-pass/t' });
    assert.match(text, /14 Nov 2026/);
    const link = whatsappLink('+60 12-345 6789', text);
    assert.ok(link.startsWith('https://wa.me/60123456789?text='));
    assert.ok(link.includes(encodeURIComponent('https://x/guest-pass/t')));
    assert.equal(whatsappLink(null, text), null);
});

test('countVisits: a known guest counts once per host per day across modules', () => {
    const lines = [
        // The same guest: registered at the desk, then on a court booking.
        { memberId: 'm1', guestId: 'g1', visitDate: '2026-11-14', guestCount: 1 },
        { memberId: 'm1', guestId: 'g1', visitDate: '2026-11-14', guestCount: 1 },
        // The same guest on another day counts again.
        { memberId: 'm1', guestId: 'g1', visitDate: '2026-11-15', guestCount: 1 },
        // The same guest with ANOTHER host that day is that host's visit.
        { memberId: 'm2', guestId: 'g1', visitDate: '2026-11-14', guestCount: 1 },
        // Lines without a guest record count on their own.
        { memberId: 'm1', guestId: null, visitDate: '2026-11-14', guestCount: 1 },
        { memberId: 'm1', guestId: null, visitDate: '2026-11-14', guestCount: 2 },
    ];
    assert.equal(countVisits(lines), 6);
    assert.equal(countVisits([]), 0);
});

test('groupReport: hosts and known guests, most visits first, totals by the counting rule', () => {
    const line = (memberId, memberNo, guestId, guestName, visitDate) => ({ memberId, memberNo, memberName: memberNo, guestId, guestName, visitDate, guestCount: 1 });
    const out = groupReport([
        line('m1', 'A001', 'g1', 'Mei', '2026-11-14'),
        line('m1', 'A001', 'g1', 'Mei', '2026-11-14'),
        line('m1', 'A001', 'g2', 'Raj', '2026-11-14'),
        line('m2', 'A002', 'g1', 'Mei', '2026-11-20'),
        line('m2', 'A002', null, 'Walk-in guest', '2026-11-20'),
    ]);
    assert.equal(out.totalVisits, 4);
    assert.deepEqual(out.byMember.map((m) => [m.memberNo, m.visits, m.lines.length]), [['A001', 2, 3], ['A002', 2, 2]]);
    assert.deepEqual(out.byGuest.map((g) => [g.guestName, g.visits, g.hosts]), [['Mei', 2, 2], ['Raj', 1, 1]]);
});
