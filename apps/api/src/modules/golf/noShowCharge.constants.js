// Cancellation-notice / no-show penalty vocabularies (user decisions
// 2026-10-06, Tropicana procedure).

const NO_SHOW_CHARGE_STATUSES = [
    { key: 'pending', label: 'Pending' },
    { key: 'posted', label: 'Posted' },
    { key: 'waived', label: 'Waived' },
];

const CHARGE_REASONS = [
    { key: 'no-show', label: 'No show' },
    { key: 'late-cancel', label: 'Late cancellation' },
];

// What the booking channel does with a cancel inside the notice window.
const LATE_CANCELLATION_ACTIONS = [
    { key: 'charge', label: 'Allow and charge the no-show penalty' },
    { key: 'refuse', label: 'Refuse the cancellation' },
];

// How the penalty quantity is counted.
const NO_SHOW_CHARGE_BASES = [
    { key: 'player', label: 'Per no-show player' },
    { key: 'booking', label: 'Per booking' },
];

module.exports = {
    NO_SHOW_CHARGE_STATUSES,
    NO_SHOW_CHARGE_STATUS_KEYS: NO_SHOW_CHARGE_STATUSES.map((s) => s.key),
    CHARGE_REASONS,
    CHARGE_REASON_KEYS: CHARGE_REASONS.map((r) => r.key),
    LATE_CANCELLATION_ACTIONS,
    LATE_CANCELLATION_ACTION_KEYS: LATE_CANCELLATION_ACTIONS.map((a) => a.key),
    NO_SHOW_CHARGE_BASES,
    NO_SHOW_CHARGE_BASIS_KEYS: NO_SHOW_CHARGE_BASES.map((b) => b.key),
};
