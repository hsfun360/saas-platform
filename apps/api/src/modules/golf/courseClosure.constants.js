// Fixed vocabulary for a closure's nine scope - WHICH PART of the 18-hole
// course closes (legacy spec 2.2.8: 前九洞 front nine / 后九洞 back nine /
// 全部 all). Our Course owns its nine pairing (firstNineId/secondNineId), so
// the scope is expressed against the course, not raw unit-course references.
// Served via GET /api/golf/courses/meta and validated on the server.
const NINE_SCOPES = [
    { key: 'first-nine', label: 'First nine' },
    { key: 'second-nine', label: 'Second nine' },
    { key: 'all', label: 'Whole course' },
];

const NINE_SCOPE_KEYS = NINE_SCOPES.map((s) => s.key);

module.exports = { NINE_SCOPES, NINE_SCOPE_KEYS };
