const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// BillingSchedule - the fee-run HOLDING header (approved 2026-08-06, user
// naming): one row per generation batch per billing type per month. The
// staged pattern shared with the interest run: GENERATE into holding, review
// the items, POST selectively - each posted item becomes exactly ONE AR
// Invoice (user decision: invoice per line, never consolidated).
//
// The run lives in the MEMBERSHIP module (producer owns its billing run - it
// needs fee schemes / effective types / bear flags); AR stays the dumb ledger
// it posts into via platform/arGateway.js.
const BillingSchedule = sequelize.define('BillingSchedule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'membership-fee' | 'subscription-fee'.
    billingType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // First-of-month key - which month this schedule bills.
    periodMonth: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The document date the posted Invoices carry (keyed on the run form).
    docDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Accounting-period date for the Invoices (defaults to docDate).
    trxDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Sum of non-skipped items - NET (tax is quoted per item at posting from
    // the billing item's scheme).
    totalAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    itemCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // 'pending' | 'partially-posted' | 'posted' | 'cancelled' - selective
    // posting makes the partial state real.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
    },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'BillingSchedule',
    timestamps: true,
    indexes: [
        // Month duplicate guard - a cancelled schedule can be regenerated.
        {
            name: 'IDX_BillingSchedule_Month_Guard',
            fields: ['companyId', 'billingType', 'periodMonth'],
            unique: true,
            where: { status: { [Op.ne]: 'cancelled' } },
        },
        { name: 'IDX_BillingSchedule_Company_Month', fields: ['companyId', 'periodMonth'] },
    ],
});

module.exports = BillingSchedule;
