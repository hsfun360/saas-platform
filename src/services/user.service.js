const { sequelize } = require('../config/db');
const User = require('../models/user.model');
const OutboxMessage = require('../models/outboxMessage.model');
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

        // 3. Prepare the Event Payload
        // This is the data your background worker will eventually send (e.g., to Kafka/RabbitMQ or an Email Service)
        const eventPayload = {
            email: userEmail,
            updatedFields: ['full_name', 'phone', 'bio'],
            timestamp: new Date().toISOString()
        };

        // 4. Insert into the OutboxMessages table
        await OutboxMessage.create(
            {
                id: uuidv4(), // We generate the ID here for Idempotency
                type: 'UserProfileUpdated',
                payload: eventPayload
            },
            { 
                transaction // 👈 CRITICAL: Bind to the SAME transaction
            }
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