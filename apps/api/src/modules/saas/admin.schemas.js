// Request schemas for the SaaS Administration routes served by admin.controller
// (the Zod boundary seam, platform/validate.js - mounted 2026-10-12, the sixth
// standards sweep). The controller keeps every business check (role name
// uniqueness, the data-scope and audience vocabularies, the frozen module code
// rule, parent/cycle checks on menu nesting, email uniqueness, the System Admin
// role guard, the self-deactivation guard, provisioning through provisionTenant);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller and its helpers (normalizeGrants, mergeNames, provisionTenant's
// moduleIds) read is listed here - an unlisted key would be silently dropped.
//
// Presence semantics are kept: every body key stays optional so the controllers'
// own "X is required." messages still fire, and `'parentId' in req.body` style
// checks still see an explicit null. Ids are UUIDs wherever the model's primary
// key is one (Role, Module, Menu, User, Account, Company) - a malformed id would
// otherwise reach Postgres and surface as a 500.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Page numbers, limits and sequences arrive as numbers or digit strings.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;
const optionalId = id.nullable().optional();

// Localized text maps ({ "<languageCode>": "text" }) merged by mergeNames: an
// empty value clears that language, so null is a legitimate entry.
const namesMap = z.record(z.string().max(10), z.string().max(500).nullable()).nullable().optional();

// --- Roles ------------------------------------------------------------------
// normalizeGrants reads `permissions[].{menuId,canCreate,canEdit,canDelete}` or
// the legacy `menuIds[]` (full access). The role builder lists every platform
// menu, so the bounds sit well above the catalogue.
const grantLine = z.object({ menuId: id, canCreate: bool, canEdit: bool, canDelete: bool });
const roleBody = {
    name: str(200),
    description: str(1000),
    dataScope: str(20),
    permissions: z.array(grantLine).max(2000).nullable().optional(),
    menuIds: z.array(id).max(2000).nullable().optional(),
};

// --- Modules & menus --------------------------------------------------------
const moduleBody = {
    code: str(50),
    name: str(200),
    icon: str(100),
    description: str(1000),
    audience: str(20),
    names: namesMap,
};
const menuBody = {
    name: str(200),
    route: str(200),
    icon: str(100),
    moduleId: optionalId,
    parentId: optionalId, // null = top level (the web sends null, never '')
    names: namesMap,
    description: str(1000),
    descriptions: namesMap,
};

// --- Users ------------------------------------------------------------------
// A platform user's password is CHOSEN here (the admin sets it), so the
// app-wide floor applies when one is present; presence itself stays the
// controller's "Email, password, and full name are required." check.
const createUserBody = {
    email: fields.email.optional(),
    password: fields.newPassword.optional(),
    fullName: str(200),
    phone: str(50),
    bio: str(2000),
};
// updateUser String()-coerces whatever it gets, so a null would persist as the
// text "null"; the screen sends trimmed strings, and the schema says so.
const updateUserBody = {
    email: fields.email.optional(),
    fullName: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    bio: z.string().max(2000).optional(),
};

// --- Subscribers ------------------------------------------------------------
const createSubscriptionBody = {
    email: fields.email.optional(),
    password: fields.newPassword.optional(),
    fullName: str(200),
    companyName: str(200),
    subscriptionPlan: str(100),
    registrationNumber: str(100),
    timezone: str(100),
    phone: str(50),
    moduleIds: z.array(id).max(100).nullable().optional(),
};
const updateSubscriptionBody = {
    subscriberName: str(200),
    subscriptionPlan: str(100),
    status: str(50),
    registrationNumber: str(100),
    timezone: str(100),
};

const idParam = { params: z.object({ id }) };
const moduleParam = { params: z.object({ moduleId: id }) };
const menuParam = { params: z.object({ menuId: id }) };
const companyParam = { params: z.object({ companyId: id }) };

module.exports = {
    // Roles
    createRole: { body: z.object(roleBody) },
    roleId: idParam,
    updateRole: { ...idParam, body: z.object(roleBody) },
    // Modules & menus (the catalogue gate runs before validate and reads the
    // raw body.audience / body.moduleId / params ids itself)
    createModule: { body: z.object(moduleBody) },
    moduleId: moduleParam,
    updateModule: { ...moduleParam, body: z.object(moduleBody) },
    reorderMenus: {
        ...moduleParam,
        body: z.object({
            items: z.array(z.object({ id, sequence: numberish })).max(2000).nullable().optional(),
        }),
    },
    createMenu: { body: z.object(menuBody) },
    menuId: menuParam,
    updateMenu: { ...menuParam, body: z.object(menuBody) },
    // Users
    createUser: { body: z.object(createUserBody) },
    assignRole: { body: z.object({ userId: optionalId, roleId: optionalId, companyId: optionalId }) },
    userIdParam: { params: z.object({ userId: id }) },
    setUserStatus: { ...idParam, body: z.object({ isActive: bool }) },
    updateUser: { ...idParam, body: z.object(updateUserBody) },
    // Audit log viewer: free-text filters, an ISO date pair and paging.
    listAuditLog: {
        query: z.object({
            tableName: str(200),
            recordId: str(100),
            userEmail: str(254),
            from: str(40),
            to: str(40),
            page: numberish,
            limit: numberish,
        }),
    },
    // The review page can select every unverified registration at once.
    deleteUnverifiedUsers: { body: z.object({ userIds: z.array(id).max(5000).nullable().optional() }) },
    // Subscribers
    createSubscription: { body: z.object(createSubscriptionBody) },
    updateSubscription: { ...idParam, body: z.object(updateSubscriptionBody) },
    // Tenant Admin management for one company
    companyId: companyParam,
    setTenantAdmin: { ...companyParam, body: z.object({ userId: optionalId }) },
};
