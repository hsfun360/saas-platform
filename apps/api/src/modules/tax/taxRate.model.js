const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { TAX_SCHEMA } = require('../../platform/schemas');

// Tax Rate - the SUBSCRIBER-OWNED, effective-dated detail line(s) of a TaxScheme.
//
// Two dimensions live here at once:
//   1. STACKING - a scheme can carry several components effective at the same time
//      (distinct `taxCode`s), applied in `taxPriority` order. That is how "two tax
//      rates effective at once for one scheme" is modelled.
//   2. HISTORY  - a rate change over time is a NEW row with a later `effectiveFrom`,
//      never an in-place edit. Existing rows are immutable so posted documents keep
//      the rate they were charged.
//
// Resolving a scheme on a date D: for each `taxCode`, take the active row with the
// greatest `effectiveFrom <= D`. The resulting set is the concurrent components,
// ordered by `taxPriority`. Consuming systems SNAPSHOT the resolved values onto
// their own transaction rows; they never live-join back to this table.
const TaxRate = sequelize.define('TaxRate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Parent scheme. Intra-service FK (same schema) - cascade lines with the header.
    taxSchemeId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: { tableName: 'TaxScheme', schema: TAX_SCHEMA },
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
    // Business code for this specific tax component (e.g. 'SR', 'ZRL').
    taxCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Percentage rate, e.g. 6.0000 or 8.0000. DECIMAL to avoid float drift.
    taxRate: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: false,
    },
    // Calculation order when a scheme stacks multiple components (1 = first).
    taxPriority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: 1, max: 5 },
    },
    // Whether tax on this line can be recovered (input-tax credit).
    isClaimable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Recoverable portion, 0-100. Only meaningful when isClaimable is true.
    claimPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100 },
    },
    // GL account this component posts to. Subscriber-level default; a per-company
    // override can live in a future CompanyTaxScheme mapping. Value reference.
    glAccountCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The date this rate takes effect. A change is a new row with a later date;
    // the active rate on any date is the latest effectiveFrom <= that date.
    effectiveFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Lets a subscriber retire a component without deleting its history.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: TAX_SCHEMA,
    tableName: 'TaxRate',
    timestamps: true,
    indexes: [
        { name: 'IDX_TaxRate_Scheme', fields: ['taxSchemeId'] },
        // One rate value per (scheme, code, effective date). A later date is a new
        // row (history); same date twice is a data error.
        { name: 'IDX_TaxRate_Scheme_Code_From', fields: ['taxSchemeId', 'taxCode', 'effectiveFrom'], unique: true },
    ],
});

module.exports = TaxRate;
