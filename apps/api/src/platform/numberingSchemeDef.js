// src/platform/numberingSchemeDef.js
//
// Shared COLUMN DEFINITION for the per-module NumberingScheme tables
// (membership + ar). The numbering DATA is owned per product - gapless issue
// locks the counter row inside the owning module's posting transaction, so the
// counter must live in the same schema as the documents it numbers (a
// service-split prerequisite, 2026-08-05). The CODE (this shape, the
// generator, the config service, the controller factory) stays shared so the
// tables can never drift apart.

const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');

// Define a NumberingScheme model in `schema`. `indexPrefix` keeps index names
// distinct across schemas for clarity in pg introspection.
function defineNumberingScheme({ schema, modelName, indexPrefix }) {
    return sequelize.define(modelName, {
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
        // What this scheme numbers - one of the OWNING module's purpose keys.
        purpose: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        // 'auto' | 'manual'.
        mode: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'auto',
        },
        // Fixed prefix segment used by the {PREFIX} token.
        prefix: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Template of tokens ({PREFIX}{SEQ}{YYYY}{YY}{MM}{TYPE}).
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
        // atomically by numberingGenerator.issue under its row lock.
        currentNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        // 'never' | 'annually' | 'monthly'.
        resetRule: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'never',
        },
        // The period the counter belongs to ('2026' or '2026-07'); rolling past
        // it resets the counter on the next issue.
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
        schema,
        tableName: 'NumberingScheme',
        timestamps: true,
        indexes: [
            { name: `IDX_${indexPrefix}NumberingScheme_Company_Purpose`, fields: ['companyId', 'purpose'], unique: true },
        ],
    });
}

module.exports = { defineNumberingScheme };
