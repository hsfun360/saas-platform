// Sales channel vocabulary (SRS 2.2, refined by the user's three-tier model).
// The kind is STRUCTURAL (it changes validation + behaviour), so it is a fixed
// vocabulary, not a user-editable master:
//   agency-staff - a salesperson employed by an outsourced Sales Agency
//   external     - an individual freelancer promoting memberships
//   internal     - sales staff employed directly by the club
const AGENT_KINDS = [
    { key: 'agency-staff', label: 'Agency staff' },
    { key: 'external', label: 'External individual' },
    { key: 'internal', label: 'Internal sales staff' },
];

const AGENT_KIND_KEYS = AGENT_KINDS.map((k) => k.key);

module.exports = { AGENT_KINDS, AGENT_KIND_KEYS };
