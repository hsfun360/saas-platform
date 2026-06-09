// src/modules/notification/notification.worker.js
//
// Notification module: consumes the transactional Outbox and sends emails.
// Exposes startWorker() so the root `outboxworker.js` bootstrap (which owns the
// Cloud Run health-check port) can launch it. Kept as a single module so it can
// later be lifted into a standalone Notification service that subscribes to a
// real broker (e.g. Google Pub/Sub) instead of polling the shared Outbox table.

const { sequelize } = require('../../platform/db');
const OutboxMessage = require('../../platform/outboxMessage.model');
const nodemailer = require('nodemailer');

// 1. Setup Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS  // MUST be a Google "App Password", not your normal password
    }
});

// 2. The Email Sending for User Registration (Activation Link)
async function sendActivationEmail(toEmail, activationLink) {
    const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Activate Your Account',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2>Welcome!</h2>
                <p>Thank you for registering. Please click the button below to verify your email address and activate your account.</p>
                <a href="${activationLink}" style="display: inline-block; padding: 10px 20px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px; margin-top: 15px;">
                    Activate Account
                </a>
                <p style="margin-top: 20px; font-size: 12px; color: #777;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    ${activationLink}
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

// 3. The Email Sending for Password Reset
async function sendPasswordResetEmail(toEmail, resetLink) {
    const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2>Reset Your Password</h2>
                <p>We received a request to reset the password for your account.</p>
                <p>Click the button below to choose a new password. This link will expire in 1 hour.</p>
                <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #0d6efd; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; font-weight: bold;">
                    Reset Password
                </a>
                <p style="margin-top: 20px; font-size: 12px; color: #666;">
                    If you did not request this, please ignore this email. Your password will remain unchanged.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

// 4. The Email Sending for Password Reset Success Confirmation
async function sendPasswordResetSuccessEmail(toEmail) {
    const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Your Password Has Been Changed',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #0f5132;">Password Reset Successful</h2>
                <p>Hello,</p>
                <p>This email is to confirm that your password has been successfully changed.</p>
                <p>You can now log in to your dashboard using your new password.</p>
                <p style="margin-top: 30px; font-size: 12px; color: #dc3545; border-top: 1px solid #eee; padding-top: 10px;">
                    <strong>Security Notice:</strong> If you did not make this change, please contact our support team immediately.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

// 5. The email sending for profile updates (Security Alert)
async function sendProfileUpdateEmail(toEmail, payload) {
    const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Security Alert: Your Profile Was Updated',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                <h2 style="color: #333;">Profile Update Notice</h2>
                <p>Hello,</p>
                <p>We are writing to let you know that your profile information was recently updated in our system.</p>
                <p><strong>If you made this change, no further action is required.</strong></p>
                <p style="margin-top: 20px; padding: 10px; background-color: #ffeaea; color: #cc0000; border-left: 4px solid #cc0000;">
                    If you did <b>not</b> make this change, please log in and change your password immediately, or contact our support team.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

// The Email Sending for BRAND NEW SaaS Accounts
async function sendAccountActivationEmail(toEmail, companyName, activationLink) {
    const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `Set up your workspace for ${companyName}`,
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2>Welcome to the Platform!</h2>
                <p>We are thrilled to have <strong>${companyName}</strong> on board.</p>
                <p>To get started, please click the button below to set your secure password and provision your workspace:</p>
                <a href="${activationLink}" style="margin-top: 15px; display: inline-block; padding: 12px 24px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Activate Workspace
                </a>
                <p style="margin-top: 20px; font-size: 12px; color: #777;">If you did not request this, please ignore this email.</p>
            </div>
        `
    };
    await transporter.sendMail(mailOptions);
}

// 6. The Polling Logic
async function processOutboxSafely() {
    // 1. Start a transaction to hold the locks
    const transaction = await sequelize.transaction();

    try {
        // 2. Fetch pending messages safely (FOR UPDATE SKIP LOCKED)
        const pendingMessages = await OutboxMessage.findAll({
            where: {
                status: 'PENDING',
                processedDate: null },
            limit: 10,
            transaction: transaction,
            lock: true,           // Adds "FOR UPDATE"
            skipLocked: true      // Adds "SKIP LOCKED"
        });

        if (pendingMessages.length === 0) {
            await transaction.commit(); // Nothing to do, release transaction
            return;
        }

        console.log(`[OUTBOX WORKER] Safely claimed ${pendingMessages.length} messages.`);

        // 3. Process the messages (e.g., send emails)
        for (const msg of pendingMessages) {
            try {
                if (msg.type === 'UserProfileUpdated') {

                    // 👇 ACTUALLY SEND THE EMAIL NOW!
                    await sendProfileUpdateEmail(msg.payload.email, msg.payload);
                    console.log(`[OUTBOX WORKER] Sending email for: ${msg.payload.email}`);
                }
                // 👇 ADD THIS NEW BLOCK:
                else if (msg.type === 'UserRegistered') {

                    // IF it's a Google SSO user, they are already verified, so skip the email!
                    if (msg.payload.authMethod === 'google') {
                        console.log(`[OUTBOX WORKER] Skipping activation email for Google SSO user: ${msg.payload.email}`);
                    }
                    else if (msg.payload.authMethod === 'microsoft') {
                        console.log(`[OUTBOX WORKER] Skipping activation email for Microsoft SSO user: ${msg.payload.email}`);
                    }
                    else {
                        // Otherwise, send the activation link
                        // 👇 Trigger the actual email!
                        await sendActivationEmail(msg.payload.email, msg.payload.activationLink);
                        console.log(`[OUTBOX WORKER] Activation email sent to ${msg.payload.email}`);
                    }

                }
                else if (msg.type === 'PasswordResetRequested') {

                    await sendPasswordResetEmail(msg.payload.email, msg.payload.resetLink);
                    console.log(`[OUTBOX WORKER] Password reset email sent to ${msg.payload.email}`);
                }
                else if (msg.type === 'PasswordResetSuccess') {

                    await sendPasswordResetSuccessEmail(msg.payload.email);
                    console.log(`[OUTBOX WORKER] Password reset SUCCESS confirmation sent to ${msg.payload.email}`);
                }
                else if (msg.type === 'AccountRegistered') {

                    await sendAccountActivationEmail(msg.payload.email, msg.payload.companyName, msg.payload.activationLink);
                    console.log(`[OUTBOX WORKER] Account activation email sent to ${msg.payload.email}`);
                }

                // Mark as done
                // 🟢 SUCCESS: Mark as completed
                msg.status = 'COMPLETED';
                msg.processedDate = new Date();
                await msg.save({ transaction });

            } catch (err) {
                // 🔴 FAILURE: Increment the retry count
                msg.retryCount += 1;
                msg.errorLog = err.message;

                if (msg.retryCount >= 5) {
                    // ☠️ POISON MESSAGE: It failed 3 times. Give up and remove it from the queue.
                    console.error(`[POISON MESSAGE] Message ${msg.id} failed 3 times. Moving to FAILED state.`);
                    msg.status = 'FAILED';
                    msg.processedDate = new Date(); // We set the date so the query stops picking it up
                } else {
                    // ⚠️ RETRY: Leave processedDate as null so it gets picked up again
                    console.warn(`[RETRY] Message ${msg.id} failed. Attempt ${msg.retryCount}/3`);
                }

                await msg.save({ transaction });
            }
        }

        // 4. Commit to save changes and release the row locks
        await transaction.commit();

    } catch (error) {
        await transaction.rollback();
        console.error('[OUTBOX WORKER] Database error during polling:', error);
    }
}

// --- Worker Initialization ---
async function startWorker() {
    try {
        // The worker must establish its own database connection
        await sequelize.authenticate();
        console.log('[OUTBOX WORKER] Connected to PostgreSQL. Starting poll loop...');

        // Run the process function every 5 seconds
        setInterval(processOutboxSafely, 5000);

    } catch (error) {
        console.error('[OUTBOX WORKER] Failed to start:', error);
        // We remove process.exit(1) so the container stays alive even if the DB hiccups
    }
}

module.exports = { startWorker, processOutboxSafely };
