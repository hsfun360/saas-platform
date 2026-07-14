const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Title (honorific) - SUBSCRIBER-OWNED reference data (Control Plane). The
// honorific placed before a name (Datuk, Tan Sri, Sir, Prof, Dr...), one list per
// Account, shared by every company and consumed by Membership profiles by VALUE
// reference (`titleCode`).
//
// Unlike Nationality, a Title IS legitimately country-bound (Tun/Tan Sri/Datuk are
// Malaysian honours), so each entry may carry a `countryCode` (platform
// Country.alpha2, value reference - no FK). NULL = universal (applies anywhere,
// e.g. Prof/Dr). Enable/disable via isActive.
const Title = sequelize.define('Title', {
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
    // Subscriber-defined short code, unique per account (e.g. 'DATUK', 'SIR').
    titleCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // The honorific shown to users (e.g. 'Datuk', 'Tan Sri').
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The country this title belongs to - platform Country.alpha2 (value ref, no
    // FK). NULL = universal (applies to any country).
    countryCode: {
        type: DataTypes.STRING(2),
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'Title',
    timestamps: true,
    indexes: [
        { name: 'IDX_Title_Account_Code', fields: ['accountId', 'titleCode'], unique: true },
    ],
});

module.exports = Title;
