const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golfer - the THIN player identity of Golf Management, mirroring ar.Debtor
// (user decisions 2026-09-17): one row per person who plays, and every
// downstream row (booking, flight player, registration, bill, rain check)
// references golferId - ONE reference shape, no member/public branching.
//
// The PROFILE lives at the source, never here (golden rule: one owner):
//   golferType 'member' -> sourceId = membership Member.id (plain UUID value
//     ref, no FK); status / golfing right / credit are asked LIVE through
//     platform/membershipGateway.js + arGateway at booking, registration and
//     charge-to-account time - never stored.
//   golferType 'other'  -> sourceId = golf.OtherGolfer.id (golf's own profile
//     master for public / walk-in players).
// `name` / `memberNo` are search-and-sort SNAPSHOTS refreshed from the source
// (the same deliberate exception ar.Debtor makes) - display only, never
// authoritative.
//
// Rows are created LAZILY (find-or-create at first booking, like Debtor
// provisioning at first posting). A public golfer who later joins the club is
// RE-POINTED ('other' -> 'member') keeping the same golferId, so booking
// history, rain checks and no-show records survive the conversion.
const Golfer = sequelize.define('Golfer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // One of golfer.constants GOLFER_TYPE_KEYS: 'member' | 'other'.
    golferType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Polymorphic profile reference (see header). Validated in the service
    // layer; deliberately no DB-level FK, like ar.Debtor.
    sourceId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Display/sort snapshot of the source's name (both kinds).
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Member number snapshot - member kind only (front-desk search).
    memberNo: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Golf-owned for BOTH kinds (membership holds no handicap). The planned
    // handicap-control feature will maintain it; until then front-desk entry.
    handicapIndex: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: true,
    },
    // Account-level front-desk notes (bans, VIP flags) - both kinds.
    remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'Golfer',
    timestamps: true,
    indexes: [
        { name: 'UX_Golfer_Company_Type_Source', fields: ['companyId', 'golferType', 'sourceId'], unique: true },
        { name: 'IDX_Golfer_Company_Name', fields: ['companyId', 'name'] },
    ],
});

module.exports = Golfer;
