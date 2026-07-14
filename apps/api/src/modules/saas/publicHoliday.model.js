const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// PublicHoliday - SUBSCRIBER-OWNED reference data (Control Plane). One holiday
// calendar per Account, scoped BY COUNTRY: a Tenant Admin maintains holidays for
// each country their companies operate in (Company.countryCode), and every
// company in that country shares the same list. Consumed by the product systems
// (Membership / Golf / Facility booking calendars) via /api/public-holidays,
// which resolves the caller's company country automatically.
const PublicHoliday = sequelize.define('PublicHoliday', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The owning subscriber (Account). UUID reference, no FK.
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // ISO 3166-1 alpha-2, lowercase (e.g. 'my'), referencing Country.alpha2 by
    // value (no cross-service FK) - same convention as Company.countryCode.
    countryCode: {
        type: DataTypes.STRING(2),
        allowNull: false,
    },
    // The calendar date of the holiday (no time-of-day, no timezone).
    holidayDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The holiday's name shown to users (e.g. 'Hari Merdeka').
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'PublicHoliday',
    timestamps: true,
    indexes: [
        // Two distinct holidays MAY share a date (e.g. overlapping observances),
        // so uniqueness includes the name.
        { name: 'IDX_PublicHoliday_Acc_Ctry_Date_Desc', fields: ['accountId', 'countryCode', 'holidayDate', 'description'], unique: true },
    ],
});

module.exports = PublicHoliday;
