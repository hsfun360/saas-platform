const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.FacilityType (structure approved 2026-10-25) - the KIND of facility
// and its rules: Badminton, Tennis, Gym, Pool, Locker, Towel. The `code`
// (UPPER_SNAKE, frozen once in use) is the key the booking limits, rate cards
// and reports key on; `description` is display only. `usageMode` (slot /
// entry / issue, facility.constants USAGE_MODES) decides which column group
// applies and how the Control Station treats the facility; it is frozen once
// a Facility exists under the type. Later slices add `feeTransactionTypeId`,
// `guestFeeTransactionTypeId`, `requiresApproval` (slice 2) and the no-show
// flags (slice 4). `companyId` is a Control-Plane reference, no FK.
const FacilityType = sequelize.define('FacilityType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'slot' | 'entry' | 'issue'.
    usageMode: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    // Public GCS URL of the type's tile icon.
    iconUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Inactive = hidden from booking and the station; existing bookings stand.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // ---- slot mode ----
    // Participants one slot (one court) holds; NULL = not tracked (a hall).
    maxParticipants: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Minimum participants a booking must name (1 = no rule).
    minParticipants: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Slots of THIS type one member may hold per day (0 = no limit), counted
    // as booker or participant; cancelled bookings free it.
    maxSlotsPerDayWeekday: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Weekend + public holiday.
    maxSlotsPerDayWeekend: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Adjacent slots on one facility in one booking (0 = no limit).
    maxConsecutiveSlots: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Override of the Specification's general advance days; NULL = general.
    advanceBookingDays: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // ---- entry mode ----
    // Persons inside at one time across the type's facilities; NULL = unlimited.
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // ---- issue mode ----
    // ON = each Facility row is one numbered unit issued and returned
    // (locker); OFF = a counted consumable issued by quantity (towel).
    trackUnits: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Units or pieces one patron may hold at a time (0 = no limit).
    maxIssuePerPatron: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // ---- opening hours (entry + issue modes; slot types get them from the
    // slot set). Both NULL = no restriction. ----
    openTimeWeekday: { type: DataTypes.TIME, allowNull: true },
    closeTimeWeekday: { type: DataTypes.TIME, allowNull: true },
    openTimeWeekend: { type: DataTypes.TIME, allowNull: true },
    closeTimeWeekend: { type: DataTypes.TIME, allowNull: true },
    // ---- guest policy (all modes; takes effect only while the
    // Specification's guestControlEnabled is ON) ----
    // OFF = no visitor guest under this type at all (Gym).
    guestsAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // OFF = a member may not join another member's booking / visit here.
    memberGuestsAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Visitor guests one booking (slot) or one visit (entry) may carry; NULL
    // = no limit, 0 = none. Counts against the member's monthly allowance
    // (slice 2, membership seam).
    maxGuestsPerBooking: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // The host member must be a participant / registered for the guests to
    // be admitted.
    hostMustBePresent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // ---- slice 2 (structures approved 2026-10-25) ----
    // The facility-fee transaction type auto-charged once per slot when a
    // bill opens (value ref to facility.TransactionType; NULL = no auto
    // charge). Must be a facility-fee of this type or of any type.
    feeTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The guest-fee transaction type auto-charged once per guest participant.
    guestFeeTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Every booking of this type routes through the facility-booking
    // approval chain (slice 2b).
    requiresApproval: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'FacilityType',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityType_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = FacilityType;
