const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.PaymentType (structure approved 2026-10-25) - the settlement-
// tender catalog the facility desk picks from when a bill is paid; golf's
// shape (user decision 2026-10-24: billing copies golf's shape into the
// facility schema, the shared billing service is extracted when POS
// arrives). Classes in facility.constants PAYMENT_CLASSES. `companyId` is a
// Control-Plane reference, no FK.
const PaymentType = sequelize.define('FacilityPaymentType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The code ('CASH', 'VISA') - unique per company.
    paymentType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    paymentClass: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Public GCS URL of the settlement-tile icon.
    iconUrl: {
        type: DataTypes.STRING,
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
    schema: FACILITY_SCHEMA,
    tableName: 'PaymentType',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityPaymentType_Company_Code', fields: ['companyId', 'paymentType'], unique: true },
    ],
});

module.exports = PaymentType;
