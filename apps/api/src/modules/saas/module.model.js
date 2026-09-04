const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Module = sequelize.define('Module', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Stable MACHINE IDENTITY (approved 2026-09-04): THE key for entitlement
    // checks (requireModule), boot seeds, frontend route gating, and any future
    // license artifact for self-hosted deployments. UPPER_SNAKE, globally
    // unique (not per-audience - a license file must not need an audience
    // qualifier), FROZEN at creation: no API updates it, ever. Display naming
    // lives in `name`/`names`, which are freely renamable/translatable.
    code: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { is: /^[A-Z][A-Z0-9_]*$/ },
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "Golf Management" — base/English name + fallback.
        // DISPLAY ONLY since `code` became the identity - renamable at will.
        // Unique PER AUDIENCE (composite index below), not globally: the tenant
        // and platform catalogues are separate worlds and may reuse a name
        // (e.g. an "Account Receivable" product module AND a platform-side
        // "Account Receivable" for subscriber billing).
    },
    // Localized names keyed by language code, e.g. { en: 'Golf Management', ms: '...' }.
    // Edited in the Modules & Menus screen; resolved to the active language at
    // display, falling back to `name`.
    names: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    icon: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'widgets' // Fallback icon
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    landingRoute: {
        type: DataTypes.STRING,
        allowNull: true // the system's default dashboard route, e.g. '/golf'
    },
    // System module (like a system Role): platform infrastructure every tenant
    // needs - always entitled by provisioning, never deletable. Stamped at
    // boot by ensureSystemModules(), keyed by `code`; currently TENANT_ADMIN.
    isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    // Who the module serves. 'tenant' modules are the subscriber-facing catalogue
    // (entitlable via CompanyModule; isSystem tenant modules are always entitled).
    // 'platform' modules (SaaS Administration) exist ONLY for platform users
    // (CompanyUser.companyId NULL): never offered to or entitled by tenants, and
    // only platform roles can be granted their menus. Seeded at boot by
    // ensurePlatformNav(); never deletable, base name locked (routing key).
    audience: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'tenant' // 'tenant' | 'platform'
    }
}, {
    indexes: [
        // The machine identity is globally unique.
        { name: 'UX_Module_code', unique: true, fields: ['code'] },
        // One name per catalogue side (the legacy global unique on `name` is
        // dropped by an idempotent boot statement in app.js).
        { name: 'UX_Module_name_audience', unique: true, fields: ['name', 'audience'] },
    ],
});

module.exports = Module;