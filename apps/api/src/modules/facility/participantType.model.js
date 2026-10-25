const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.ParticipantType (structure approved 2026-10-25; the shape of
// golf.PlayerType, named Participant Type because Patron is already the
// identity) - the club's catalog of participant categories. The `code` is THE
// key every participant line (BookingParticipant.participantType) and every
// rate cell (TransactionTypeRateCell.participantType) carries; `baseIdentity`
// is the engine class the type behaves as. Three SYSTEM rows per company
// (member / member-guest / guest) are seeded lazily with locked codes; the
// club adds its own (a JUNIOR or CORPORATE guest priced differently).
const ParticipantType = sequelize.define('FacilityParticipantType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Upper case for club-defined types; the three system codes stay lower
    // case. Unique per company.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'member' | 'member-guest' | 'guest' (facility.constants BASE_IDENTITIES).
    baseIdentity: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // A booking carrying this type routes through the facility-booking
    // approval chain (slice 2b).
    requiresApproval: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'ParticipantType',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityParticipantType_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = ParticipantType;
