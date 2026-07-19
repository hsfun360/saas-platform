const { sequelize } = require('../../platform/db');
const User = require('./user.model');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { enqueueEmail } = require('../notification/emailOutbox');
const { resolveIdentityScope } = require('../../platform/identityScope');
const { v4: uuidv4 } = require('uuid'); // Ensure you have 'uuid' installed (npm install uuid)

/**
 * Updates a user profile and queues an event in the Outbox.
 * Uses a Database Transaction to guarantee Atomicity.
 */
async function updateProfileWithOutbox(userEmail, profileData) {
    // 1. Start the Transaction
    const transaction = await sequelize.transaction();

    try {
        // 2. Load + update the User Profile (load first so we can brand the alert).
        const user = await User.findOne({ where: { email: userEmail }, transaction });
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        user.full_name = profileData.fullName;
        user.phone = profileData.phone;
        user.bio = profileData.bio;
        await user.save({ transaction });

        // 3. Queue the security-alert email, rendered from its template, in the
        // SAME transaction (atomic with the profile update). Branded for the user's
        // resolved scope, but sent via the platform mailer (a security email).
        const scope = await resolveIdentityScope(user);
        await enqueueEmail(
            {
                templateKey: 'profile.updated',
                accountId: scope.accountId,
                companyId: scope.companyId,
                to: userEmail,
                data: { email: userEmail },
                forcePlatformSender: true,
            },
            transaction,
        );

        // 5. Commit the Transaction (Saves BOTH to the database permanently)
        await transaction.commit();
        return { success: true };

    } catch (error) {
        // 6. Rollback if ANYTHING failed (Undoes the User update if the Outbox insert failed)
        await transaction.rollback();
        console.error("Transaction failed, rolled back.", error);
        throw error;
    }
}

module.exports = { updateProfileWithOutbox };