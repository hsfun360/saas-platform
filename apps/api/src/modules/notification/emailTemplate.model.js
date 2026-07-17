const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// An email template, resolved as a THREE-LEVEL cascade (see resolveTemplate):
//
//   accountId NULL, companyId NULL  -> the PLATFORM DEFAULT for that key
//   accountId set,  companyId NULL  -> the subscriber-wide override (all companies)
//   accountId set,  companyId set   -> that ONE company's override (wins)
//
// So two clubs on the same subscription (e.g. KL G&CC and Tropicana G&CR) can each
// have their own subject/body AND their own brand colour, while a subscriber that
// wants one version everywhere just keeps the subscriber-wide row. An override only
// applies when the platform default is `tenantOverridable`.
//
// `subject` + `bodyHtml` are Handlebars strings compiled at enqueue time
// ("render at store"), so the finished HTML lands in the outbox.
//
// accountId/companyId are plain UUIDs (no Sequelize FK) so this stays clean to lift
// into a standalone Notification service later (references other services by id only).
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
    // Scope of a subscriber override, resolved as a cascade:
    //   companyId set  = that ONE company's own version (wins)
    //   companyId NULL = subscriber-wide, applies to every company in the account
    // Only meaningful when accountId is set (platform defaults are both NULL).
    // A plain UUID (no FK), same as accountId, so this lifts out cleanly later.
    companyId: {
        type: DataTypes.UUID,
        allowNull: true,
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
        // Exactly one platform default per key.
        { unique: true, name: 'UX_EmailTemplate_platform_key', fields: ['templateKey'], where: { accountId: null } },
        // One SUBSCRIBER-WIDE override per (account, key). Partial on companyId IS
        // NULL so a company override can coexist with the subscriber-wide row.
        // (Platform rows also have companyId NULL, but their accountId is NULL and
        // NULLs compare distinct in Postgres, so they are not constrained here.)
        { unique: true, name: 'UX_EmailTemplate_account_key', fields: ['accountId', 'templateKey'], where: { companyId: null } },
        // One COMPANY override per (account, company, key). All three are non-NULL
        // for company rows; rows with a NULL companyId are left unconstrained here
        // (NULLs distinct), which the two indexes above already cover.
        { unique: true, name: 'UX_EmailTemplate_company_key', fields: ['accountId', 'companyId', 'templateKey'] },
    ],
});

module.exports = EmailTemplate;
