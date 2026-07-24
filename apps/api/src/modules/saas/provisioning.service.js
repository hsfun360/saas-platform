// src/modules/saas/provisioning.service.js
//
// ONE provisioning path for a new subscriber (tenant), whoever triggers it:
//   - the System Admin portal (POST /api/admin/subscriptions),
//   - the pricing-page lead flow (activation link -> POST /api/auth/activate),
//   - self-service onboarding (verified user with no workspace -> POST
//     /api/auth/onboarding/provision).
//
// All three MUST create the same shape - Account (with ownerUserId), first
// Company, the account-level "Tenant Admin" role, module entitlements, the
// owner's CompanyUser link, and the TenantProvisioned outbox event - so the
// entry points can never drift apart.

const { v4: uuidv4 } = require('uuid');
const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const CompanyModule = require('./companyModule.model');
const Role = require('./role.model');
const Module = require('./module.model');
const OutboxMessage = require('../../platform/outboxMessage.model');

// The tenant-administration module (System Setup screens: users, roles,
// companies, reference data). A tenant without it is UNMANAGEABLE - its Tenant
// Admin would have no admin screens - so provisioning always entitles it,
// whatever the caller selected. It is therefore not a choice to offer.
const MANDATORY_MODULE_NAME = 'System Administration';

// The OPTIONAL product modules a subscriber chooses from (onboarding wizard,
// System Admin portal). The mandatory admin module is excluded - it is always
// added by provisionTenant() itself.
async function listEntitlableModules(transaction) {
    const modules = await Module.findAll({
        attributes: ['id', 'name', 'icon', 'description'],
        order: [['name', 'ASC']],
        transaction,
    });
    return modules.filter(m => m.name !== MANDATORY_MODULE_NAME);
}

// Create a complete tenant inside the caller's transaction. The caller owns the
// transaction (and any pre-checks such as "does this user already have a
// workspace"); this function only guarantees the created shape is complete.
// Returns { account, company, role, companyUser }.
async function provisionTenant(
    { userId, ownerEmail, subscriberName, companyName, subscriptionPlan, registrationNumber, timezone, moduleIds },
    transaction,
) {
    if (!transaction) throw new Error('provisionTenant requires a transaction');
    if (!userId || !subscriberName) throw new Error('provisionTenant requires userId and subscriberName');

    // A. The billing Account, owned by its SuperUser: the owner administers
    // every company under the account (see modules/saas/account.js).
    const account = await Account.create({
        subscriberName,
        subscriptionPlan: subscriptionPlan || 'BASIC',
        status: 'ACTIVE',
        ownerUserId: userId,
    }, { transaction });

    // B. The first Company (tenant workspace).
    const company = await Company.create({
        accountId: account.id,
        name: companyName || subscriberName,
        registrationNumber: registrationNumber || null,
        timezone: timezone || 'Asia/Kuala_Lumpur',
        isActive: true,
    }, { transaction });

    // C. The account-level "Tenant Admin" role. Implicit full access: menus are
    // computed at login as role menus ∩ company entitlement, so no grants.
    const role = await Role.create({
        accountId: account.id,
        name: 'Tenant Admin',
        description: 'Full administrative access to the company workspace.',
    }, { transaction });

    // D. Module entitlements. Only ids that exist are accepted - a bogus id in
    // the request must not create a dangling entitlement row. The mandatory
    // admin module is ALWAYS added on top of the selection: without it the
    // Tenant Admin would have no System Setup screens to manage the tenant.
    const requestedIds = Array.isArray(moduleIds) ? [...new Set(moduleIds)] : [];
    const valid = requestedIds.length > 0
        ? await Module.findAll({ where: { id: requestedIds }, attributes: ['id'], transaction })
        : [];
    const entitledIds = new Set(valid.map(m => m.id));
    const mandatory = await Module.findOne({ where: { name: MANDATORY_MODULE_NAME }, attributes: ['id'], transaction });
    if (mandatory) entitledIds.add(mandatory.id);
    if (entitledIds.size > 0) {
        await CompanyModule.bulkCreate(
            [...entitledIds].map(moduleId => ({ companyId: company.id, moduleId, isActive: true })),
            { transaction },
        );
    }

    // E. Link the owner into the workspace with the Tenant Admin role.
    const companyUser = await CompanyUser.create({
        userId,
        companyId: company.id,
        roleId: role.id,
        isActive: true,
    }, { transaction });

    // F. Announce the new tenant to the rest of the platform (outbox, atomic
    // with the provisioning itself).
    await OutboxMessage.create({
        id: uuidv4(),
        type: 'TenantProvisioned',
        payload: { accountId: account.id, companyId: company.id, ownerEmail: ownerEmail || null },
    }, { transaction });

    return { account, company, role, companyUser };
}

module.exports = { provisionTenant, listEntitlableModules };
