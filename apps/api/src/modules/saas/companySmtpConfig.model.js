const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// A company's own SMTP server for OUTGOING email. When a company has an active
// config, emails sent on its behalf (e.g. collaborator invitations) go through
// THIS server and from THIS address — never the platform mailer, and (per the
// chosen policy) with no fallback if the server fails. Platform/security emails
// (activation, password reset) always use the platform mailer regardless.
//
// The password is stored encrypted at rest (AES-256-GCM via platform/secretbox);
// it is never returned to the client. One config per company.
const CompanySmtpConfig = sequelize.define('CompanySmtpConfig', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true, // one SMTP config per company
    },
    host: {
        type: DataTypes.STRING,
        allowNull: false, // e.g. smtp.sendgrid.net
    },
    port: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 587,
    },
    // true = implicit TLS (usually port 465); false = STARTTLS (usually 587).
    secure: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true, // some relays authenticate by IP and need no user/pass
    },
    // AES-256-GCM ciphertext ("v1:iv:tag:ct"), never plaintext, never returned.
    passwordEnc: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    // The address mail is sent FROM (must be one the SMTP server is allowed to send).
    fromEmail: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    fromName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Lets a subscriber turn their server off (fall back to platform) without
    // deleting the settings.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    lastVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Last send/verify error, surfaced on the subscriber's SMTP screen.
    lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'CompanySmtpConfigs',
    timestamps: true,
});

module.exports = CompanySmtpConfig;
