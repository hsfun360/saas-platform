const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// StatementDetail - a statement's frozen line items (renamed from StatementLine
// 2026-08-06). Doc number/description/person name are SNAPSHOTS at generation
// time; statements itemize by incurredBy (who consumed). Lines carry docDate
// (the occurrence date - statements/aging are docDate-based, never trxDate) and
// the running balance after the line, so printing never recomputes.
const StatementDetail = sequelize.define('StatementDetail', {
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
    docDate: {
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
    // Running balance AFTER this line (opening + deltas so far).
    balance: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
}, {
    schema: AR_SCHEMA,
    tableName: 'StatementDetail',
    timestamps: true,
    indexes: [
        { name: 'IDX_StatementDetail_Statement_Line', fields: ['statementId', 'lineNo'], unique: true },
        { name: 'IDX_StatementDetail_Company', fields: ['companyId'] },
    ],
});

module.exports = StatementDetail;
