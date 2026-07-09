const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { TAX_SCHEMA } = require('../../platform/schemas');

// Tax Rate TEMPLATE - the detail line(s) of a TaxSchemeTemplate.
//
// A scheme can stack several tax components (e.g. a base tax plus a levy), applied
// in `taxPriority` order, so this is a one-to-many detail, not a single rate. Each
// line carries its own claimability and GL posting account (moved here from the
// header so a scheme can post its components to different accounts).
//
// Effective-dated rate HISTORY is deliberately NOT modelled here: the template is a
// point-in-time snapshot (see TaxSchemeTemplate.seededAsOf). Rate-change-over-time
// lives in the subscriber-owned tier, where a change is a new effective-dated row.
const TaxRateTemplate = sequelize.define('TaxRateTemplate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Parent scheme. Intra-service FK (same schema) - cascade lines with the header.
    taxSchemeTemplateId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: { tableName: 'TaxSchemeTemplate', schema: TAX_SCHEMA },
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
    // Recoverable portion, 0-100. Only meaningful when isClaimable is true
    // (e.g. a partially claimable input tax at 50%).
    claimPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100 },
    },
    // GL account this component posts to. Value reference, resolved per company at
    // adoption time; nullable on the platform template.
    glAccountCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    schema: TAX_SCHEMA,
    tableName: 'TaxRateTemplate',
    timestamps: true,
    indexes: [
        { name: 'IDX_TaxRateTemplate_Scheme', fields: ['taxSchemeTemplateId'] },
        // One line per (scheme, taxCode); priority orders them, code identifies them.
        { name: 'IDX_TaxRateTemplate_Scheme_Code', fields: ['taxSchemeTemplateId', 'taxCode'], unique: true },
    ],
});

module.exports = TaxRateTemplate;
