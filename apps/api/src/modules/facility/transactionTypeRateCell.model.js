const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.TransactionTypeRateCell (structure approved 2026-10-25) - one
// price of a matrix card, as a ROW rather than a fixed column, because the
// axis is participant type x day type x session band and the club's
// sessions are its own. Resolution for a slot (rateCard.service): the cell
// whose participantType matches, an exact sessionId outranking NULL and an
// exact day scope outranking 'all'; NO cell = no price (the line is refused,
// never silently zero). PUT-replaced with the card; no ownership stamps.
// Intra-service FK, cascades with the card.
const TransactionTypeRateCell = sequelize.define('FacilityTransactionTypeRateCell', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    rateId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // A ParticipantType code.
    participantType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // 'all' | 'weekday' | 'weekend' (holidays = weekend).
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // A FacilitySession; NULL = any session. Value ref (a deleted session
    // leaves the cell unmatched).
    sessionId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Tax-exclusive.
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'TransactionTypeRateCell',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityRateCell_Rate_Axis', fields: ['rateId', 'participantType', 'dayScope', 'sessionId'], unique: true },
    ],
});

module.exports = TransactionTypeRateCell;
