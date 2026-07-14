const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Numbering Control (SRS 2.1.13) - PER-COMPANY document numbering, Control Plane.
//
// One scheme per (company, purpose). `mode` decides whether the number is
// auto-generated on save or keyed in manually (pre-printed cards). For 'auto',
// the running counter (`currentNumber` + `currentPeriod`) plus `format` produce
// the next value; consumers reach it through platform/numberingGateway.js, never
// a direct join. `companyId` is a value reference (no FK), like CompanySmtpConfig.
const NumberingScheme = sequelize.define('NumberingScheme', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Owning company (active workspace). UUID reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // What this scheme numbers - one of numberingScheme.constants PURPOSE_KEYS
    // (only 'membership' today). Unique per company.
    purpose: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'auto' | 'manual' - one of NUMBERING_MODE_KEYS.
    mode: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'auto',
    },
    // Fixed prefix segment used by the {PREFIX} token (e.g. 'M', 'KLGCC-').
    prefix: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Template of tokens ({PREFIX}{SEQ}{YYYY}{YY}{MM}{TYPE}) - see the constants.
    format: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '{PREFIX}{SEQ}',
    },
    // Zero-pad width of the {SEQ} token (5 -> 00042).
    seqPadLength: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
    },
    // First sequence value issued (and after a reset).
    startingNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Running counter: the last sequence issued (0 = none yet). Advanced
    // atomically by the gateway when a number is issued.
    currentNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // 'never' | 'annually' | 'monthly' - one of RESET_RULE_KEYS.
    resetRule: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'never',
    },
    // The period the counter currently belongs to ('2026' or '2026-07'); when the
    // real period rolls past this, the counter resets on the next issue.
    currentPeriod: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'NumberingScheme',
    timestamps: true,
    indexes: [
        { name: 'IDX_NumberingScheme_Company_Purpose', fields: ['companyId', 'purpose'], unique: true },
    ],
});

module.exports = NumberingScheme;
