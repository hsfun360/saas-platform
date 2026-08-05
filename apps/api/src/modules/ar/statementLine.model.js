const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// StatementLine - a statement's frozen line items (approved 2026-08-05). Doc
// number/description/person name are SNAPSHOTS at generation time; statements
// itemize by incurredBy (who consumed), per the design.
const StatementLine = sequelize.define('StatementLine', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Intra-service parent (validated in the service).
    statementId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    lineNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    txnDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The five document kinds: invoice | debit-note | credit-note | receipt |
    // refund.
    docType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    docId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    docNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    incurredByMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    incurredByName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    debit: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    credit: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
}, {
    schema: AR_SCHEMA,
    tableName: 'StatementLine',
    timestamps: true,
    indexes: [
        { name: 'IDX_StatementLine_Statement_Line', fields: ['statementId', 'lineNo'], unique: true },
        { name: 'IDX_StatementLine_Company', fields: ['companyId'] },
    ],
});

module.exports = StatementLine;
