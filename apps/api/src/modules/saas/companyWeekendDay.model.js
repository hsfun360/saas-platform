const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// CompanyWeekendDay - COMPANY-LEVEL setup: which weekday(s) are the weekend /
// rest days for one company. Needed because the weekend varies by location even
// within a country (some Malaysian states rest Fri+Sat, others Sat+Sun), and it
// drives weekday/weekend pricing matrices downstream (e.g. golf green fees).
//
// One row per (companyId, dayOfWeek) - a selection set like the account
// language/currency picks, saved as a whole (PUT replaces), so no isActive.
// A company with NO rows is simply "not configured": consumers get an empty
// set and weekend pricing never kicks in.
const CompanyWeekendDay = sequelize.define('CompanyWeekendDay', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The owning company. UUID reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // ISO 8601 weekday number: 1 = Monday ... 6 = Saturday, 7 = Sunday.
    dayOfWeek: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        validate: { min: 1, max: 7 },
    },
}, {
    tableName: 'CompanyWeekendDay',
    timestamps: true,
    indexes: [
        { name: 'IDX_CompanyWeekendDay_Company_Day', fields: ['companyId', 'dayOfWeek'], unique: true },
    ],
});

module.exports = CompanyWeekendDay;
