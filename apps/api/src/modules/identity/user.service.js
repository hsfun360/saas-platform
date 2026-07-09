const { sequelize } = require('../../platform/db');
const User = require('./user.model');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { enqueueEmail } = require('../notification/emailOutbox');
const { v4: uuidv4 } = require('uuid'); // Ensure you have 'uuid' installed (npm install uuid)

/**
 * Updates a user profile and queues an event in the Outbox.
 * Uses a Database Transaction to guarantee Atomicity.
 */
async function updateProfileWithOutbox(userEmail, profileData) {
    // 1. Start the Transaction
    const transaction = await sequelize.transaction();

    try {
        // 2. Update the User Profile
        const [updatedRows] = await User.update(
            { 
                full_name: profileData.fullName, 
                phone: profileData.phone, 
                bio: profileData.bio 
            },
            { 
                where: { email: userEmail },
                transaction // 👈 CRITICAL: Bind this query to the transaction
            }
        );

        if (updatedRows === 0) {
            throw new Error("USER_NOT_FOUND");
        }

        // 3. Queue the security-alert email, rendered from its template, in the
        // SAME transaction (atomic with the profile update).
        await enqueueEmail(
            { templateKey: 'profile.updated', to: userEmail, data: { email: userEmail } },
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