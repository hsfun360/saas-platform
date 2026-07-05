const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Language reference table - the set of languages the platform can be presented
// in (future i18n / multilanguage support). Deliberately minimal: an ISO 639
// code, an English display name, and an active flag that controls whether the
// language is offered in the app's language pickers. Populated from a bundled
// default set (see language-defaults.js) via the "Load defaults" action and
// maintained by System Admins on the Languages screen.
const Language = sequelize.define('Language', {
    // ISO 639-1 code, lowercase (e.g. 'en', 'ms'); region-qualified where needed
    // (e.g. 'zh-tw'). Natural primary key.
    languageCode: {
        type: DataTypes.STRING(10),
        primaryKey: true,
    },
    // English display name (e.g. 'English', 'Malay', 'Chinese (Traditional)').
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Whether this language is offered in the app's language pickers.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'Language',
    timestamps: true,
});

module.exports = Language;
