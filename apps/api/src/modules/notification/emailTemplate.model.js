const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// An email template. accountId NULL = the PLATFORM DEFAULT for that key; a row
// with an accountId is a subscriber's own override. Resolution: a subscriber's
// active row for a key wins over the platform default, but only when the default
// is `tenantOverridable`. `subject` + `bodyHtml` are Handlebars strings compiled
// at enqueue time ("render at store"), so the finished HTML lands in the outbox.
//
// accountId is a plain UUID (no Sequelize FK) so this stays clean to lift into a
// standalone Notification service later (references other services by id only).
const EmailTemplate = sequelize.define('EmailTemplate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: true, // NULL = platform default
    },
    templateKey: {
        type: DataTypes.STRING(100),
        allowNull: false, // e.g. 'collaborator.invite'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    subject: {
        type: DataTypes.TEXT,
        allowNull: false, // Handlebars
    },
    bodyHtml: {
        type: DataTypes.TEXT,
        allowNull: false, // Handlebars
    },
    // Display name in the From header; falls back to the platform default.
    fromName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Only meaningful on a platform default: may subscribers override this key?
    tenantOverridable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // A disabled platform default suppresses that email type entirely; a disabled
    // subscriber override falls back to the platform default.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // --- Brand settings (per template) ---
    // Accent colour (hex, e.g. '#10b981') for the header band + CTA buttons.
    // null = fall back to the platform default colour at render.
    brandColor: {
        type: DataTypes.STRING(9),
        allowNull: true,
    },
    // When true, the SENDING company's logo (Company.logo) is centred in the header
    // band. No logo is stored here — it always comes from the company at render.
    includeLogo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    tableName: 'EmailTemplates',
    indexes: [
        // One override per (account, key). NULLs compare distinct in Postgres, so
        // this does not constrain platform defaults — the partial index below does.
        { unique: true, name: 'UX_EmailTemplate_account_key', fields: ['accountId', 'templateKey'] },
        // Exactly one platform default per key.
        { unique: true, name: 'UX_EmailTemplate_platform_key', fields: ['templateKey'], where: { accountId: null } },
    ],
});

module.exports = EmailTemplate;
