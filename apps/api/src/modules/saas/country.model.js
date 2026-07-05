const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// ISO 3166-1 country reference, synced from stefangabos/world_countries
// (country NAMES in ~37 languages + alpha-2/alpha-3/numeric codes). The flag emoji
// is derived from alpha-2. NOTE: that dataset has no calling codes or timezones -
// those live elsewhere (the phone-input dial list + the timezone map) and can be
// folded into this table later if we want a single reference source.
const Country = sequelize.define('Country', {
    // ISO 3166-1 alpha-2, lowercase (e.g. 'my'). Natural primary key.
    alpha2: {
        type: DataTypes.STRING(2),
        primaryKey: true,
    },
    alpha3: {
        type: DataTypes.STRING(3),
        allowNull: true,
    },
    numericCode: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // English display name (convenience default; full set is in `names`).
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Localised names keyed by language code, e.g. { en: 'Malaysia', ms: 'Malaysia', zh: '马来西亚' }.
    names: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    // Emoji flag derived from alpha-2 (regional-indicator letters).
    flagEmoji: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // E.164 calling code, e.g. '+60'. Not in world_countries - populated from a
    // bundled map during sync (see dial-codes.js) and editable in maintenance.
    dialCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Whether this country is offered in the app's country pickers.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // When the row was last refreshed from the external dataset.
    syncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'Country',
    timestamps: true,
});

module.exports = Country;
