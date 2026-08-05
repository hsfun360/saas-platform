const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Other Debtor - the city-ledger party master OWNED BY AR (approved 2026-08-05).
// Membership/member debtors keep their party data in the Membership service;
// "other" debtors (external companies, ad-hoc customers) have no home elsewhere,
// so AR carries their profile itself. Creating one on the screen creates this
// row AND find-or-creates its ar.Debtor ledger account in the same transaction.
//
// One inline address block on purpose - no typed Address table until a second
// address kind is actually needed. `countryCode` is a Control-Plane Country
// value reference (alpha-2), no FK.
const OtherDebtor = sequelize.define('OtherDebtor', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Debtor code, unique per company. Issued by Numbering Control (purpose
    // 'ar-other-debtor', auto mode) or keyed in by staff (manual mode / no scheme).
    code: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    registrationNo: { type: DataTypes.STRING, allowNull: true },
    taxNo: { type: DataTypes.STRING, allowNull: true },
    contactPerson: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    fax: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    address1: { type: DataTypes.STRING, allowNull: true },
    address2: { type: DataTypes.STRING, allowNull: true },
    address3: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    postcode: { type: DataTypes.STRING(20), allowNull: true },
    countryCode: { type: DataTypes.STRING(2), allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    // Disable rather than delete - the ledger account and its documents remain.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'OtherDebtor',
    timestamps: true,
    indexes: [
        { name: 'IDX_OtherDebtor_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = OtherDebtor;
