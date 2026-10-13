// Request schemas for the TENANT ADMINISTRATION routes tenant.controller.js
// serves from identity/auth.routes.js (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep):
// roles (the legacy per-company doors and the account-level RBAC set), users
// with their org placement, the account audit view, collaborators, companies
// with their modules, outgoing SMTP and the e-Invoice issuer identity.
//
// The controller keeps every business check (admin rights on the target
// company through canAdministerCompany, the Tenant Admin role lock, the
// last-admin guard, menu and module existence, the role-name clash, the data
// scope vocabulary, the SMTP host/port/email rules); these schemas bound SHAPE
// and SIZE at the boundary and strip unknown keys, so every key the controller
// and its helpers (normalizeGrants, resolveTargetCompany) read is listed here -
// an unlisted key would be silently dropped. Keys stay optional where undefined
// means "leave unchanged" (updateCompany, updateAccountRole, the assign-role
// departmentId/positionId presence check: a null clears, an absent key keeps),
// and the required-at-business-level keys stay optional too so the
// controller's own messages still fire. Ids are UUIDs because every table
// here (Company, Role, Menu, Module, User) keys on one.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Ports, page numbers and sizes arrive as numbers or digit strings.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;
// An optional reference: the account-wide screens' target company, a role or
// a placement pick (null = none / clear).
const optId = id.nullable().optional();
// A person's address, trimmed and format-checked; absent or null is left to
// the controller's own "required" message.
const email = fields.email.nullish();

const companyParam = { params: z.object({ companyId: id }) };
const roleParam = { params: z.object({ roleId: id }) };
const userParam = { params: z.object({ userId: id }) };
// The account-wide screens name the company they are looking at.
const companyQuery = { query: z.object({ companyId: id.optional() }) };

// One grant of the account-level role editor; a missing flag means allowed.
const grant = z.object({ menuId: id, canCreate: bool, canEdit: bool, canDelete: bool });
const roleBody = {
    roleName: str(255),
    description: str(255),
    dataScope: str(20),
    permissions: z.array(grant).max(2000).optional(),
    menuIds: z.array(id).max(2000).optional(), // legacy shape = full access per menu
};

// The company profile keys createCompany and updateCompany copy verbatim (an
// empty string clears; the e-Invoice identity is update-only).
const companyProfile = {
    name: str(255),
    registrationNumber: str(255),
    taxRegistrationNumber: str(255),
    email: str(254),
    phone: str(50),
    website: str(2048),
    addressLine1: str(255),
    addressLine2: str(255),
    city: str(255),
    state: str(255),
    postalCode: str(50),
    country: str(255),
    countryCode: str(10),
    timezone: str(100),
    logo: str(4096),
    defaultCurrencyCode: str(10),
};
const eInvoiceIdentity = {
    tin: str(20),
    msicCode: str(20),
    businessActivityDescription: str(300),
    sstRegistrationNumber: str(35),
    ttxRegistrationNumber: str(35),
};

// The SMTP server fields the save and the test share; a blank or absent
// password keeps the stored one.
const smtpBody = {
    host: str(255),
    port: numberish,
    secure: bool,
    username: str(255),
    password: str(1024),
    fromEmail: str(254),
    fromName: str(255),
};

module.exports = {
    // Legacy per-company role doors (the older Role Management client shape).
    listTenantRoles: companyQuery,
    getTenantRole: { ...roleParam, ...companyQuery },
    updateTenantRole: {
        ...roleParam,
        body: z.object({
            companyId: optId,
            roleName: str(255),
            description: str(255),
            menuIds: z.array(id).max(2000).optional(),
        }),
    },
    deleteTenantRole: { ...roleParam, ...companyQuery },
    // Account-level roles (RBAC).
    roleId: roleParam,
    createAccountRole: { body: z.object(roleBody) },
    updateAccountRole: { ...roleParam, body: z.object(roleBody) },
    // Users and their org placement.
    listTenantUsers: companyQuery,
    createTenantUser: {
        body: z.object({
            companyId: optId,
            email,
            // The tenant create-user form's own floor is 6 characters; the
            // controller hashes whatever arrives, so only the size is bounded.
            // The app-wide chosen-password floor (8) applies here too; the
            // User Management form enforced 6 until 2026-10-12.
            password: fields.newPassword.optional(),
            fullName: str(255),
            phone: str(50),
            roleId: optId,
            departmentId: optId,
            positionId: optId,
        }),
    },
    assignTenantUserRole: {
        body: z.object({ companyId: optId, userId: optId, roleId: optId, departmentId: optId, positionId: optId }),
    },
    revokeTenantUser: { body: z.object({ companyId: optId, userId: optId }) },
    userId: userParam,
    updateTenantUserProfile: {
        ...userParam,
        body: z.object({ email, fullName: str(255), phone: str(50), bio: str(5000) }),
    },
    listAccountAuditLog: {
        query: z.object({
            tableName: str(100),
            recordId: str(64),
            userEmail: str(254),
            from: str(40),
            to: str(40),
            limit: numberish,
            page: numberish,
        }),
    },
    addCollaborator: { body: z.object({ companyId: optId, email, roleId: optId }) },
    // Companies.
    createCompany: { body: z.object({ ...companyProfile, moduleIds: z.array(id).max(200).optional() }) },
    companyId: companyParam,
    updateCompany: { ...companyParam, body: z.object({ ...companyProfile, ...eInvoiceIdentity }) },
    updateCompanyModules: { ...companyParam, body: z.object({ moduleIds: z.array(id).max(200).optional() }) },
    upsertCompanySmtp: { ...companyParam, body: z.object({ ...smtpBody, isActive: bool }) },
    testCompanySmtp: { ...companyParam, body: z.object({ ...smtpBody, to: str(254) }) },
};
