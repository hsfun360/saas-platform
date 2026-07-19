// src/modules/notification/email-templates.catalog.js
//
// The catalogue of platform email templates: the source of truth for seeding the
// platform defaults, for the editor's variable reference + preview sample data,
// and for "reset to default". Each entry maps a stable templateKey to its default
// Handlebars subject/body plus metadata. Keys are referenced by producers via
// enqueueEmail(templateKey, ...).
//
// Subject and bodyHtml are Handlebars strings ({{var}} auto-escapes; use
// {{#if x}}…{{/if}} for optional blocks). `variables` documents what a producer
// passes; `sample` drives the live preview / test send.
//
// Branding is applied AUTOMATICALLY at render (emailBrand.applyBrandToHtml): the
// brand-colour header band (with the company logo when enabled) is prepended, and
// CTA buttons are recoloured to the brand colour. Bodies therefore don't need to
// reference brand variables — which is what lets branding work on older/customised
// templates without a "reset to default". Keep buttons as normal styled <a>s.

// Bodies are CONTENT ONLY. The surrounding card (border, padding, rounded corners),
// the brand header band, and the CTA button colour are all applied automatically at
// render time (see emailBrand.applyBrandToHtml) — which is what makes branding work
// on older/customised templates too, without a "reset to default". Kept as a helper
// so the catalogue entries stay tidy and consistent.
const card = (content) => content.trim();

// Shared CTA button (brand-coloured). `url` and `label` are Handlebars-safe strings.
const button = (url, label) =>
    `<a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: {{brandColor}}; color: #ffffff; text-decoration: none; border-radius: 6px; margin-top: 8px; font-weight: bold;">${label}</a>`;

module.exports = [
    {
        key: 'user.activation',
        name: 'User account activation',
        description: 'Sent to a new local (email/password) user to verify their address.',
        tenantOverridable: false,
        variables: [
            { name: 'email', description: "The recipient's email address." },
            { name: 'activationLink', description: 'The one-time link that verifies the account.' },
        ],
        sample: { email: 'jane@example.com', activationLink: 'https://app.example.com/activate?token=SAMPLE' },
        fromName: null,
        subject: 'Activate Your Account',
        bodyHtml: card(`
            <div style="text-align: center;">
                <h2 style="color: #1e293b; margin-top: 0;">Welcome!</h2>
                <p>Thank you for registering. Please click the button below to verify your email address and activate your account.</p>
                ${button('{{activationLink}}', 'Activate Account')}
                <p style="margin-top: 20px; font-size: 12px; color: #777;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    {{activationLink}}
                </p>
            </div>
        `),
    },
    {
        key: 'password.reset',
        name: 'Password reset request',
        description: 'Sent when a user requests a password reset link.',
        tenantOverridable: true,
        variables: [
            { name: 'email', description: "The recipient's email address." },
            { name: 'resetLink', description: 'The one-time password-reset link (expires in 1 hour).' },
        ],
        sample: { email: 'jane@example.com', resetLink: 'https://app.example.com/reset?token=SAMPLE' },
        fromName: null,
        subject: 'Password Reset Request',
        bodyHtml: card(`
            <div style="text-align: center;">
                <h2 style="color: #1e293b; margin-top: 0;">Reset Your Password</h2>
                <p>We received a request to reset the password for your account.</p>
                <p>Click the button below to choose a new password. This link will expire in 1 hour.</p>
                ${button('{{resetLink}}', 'Reset Password')}
                <p style="margin-top: 20px; font-size: 12px; color: #666;">
                    If you did not request this, please ignore this email. Your password will remain unchanged.
                </p>
            </div>
        `),
    },
    {
        key: 'password.reset.success',
        name: 'Password changed confirmation',
        description: 'Sent after a password is successfully changed (security notice).',
        tenantOverridable: true,
        variables: [
            { name: 'email', description: "The recipient's email address." },
        ],
        sample: { email: 'jane@example.com' },
        fromName: null,
        subject: 'Your Password Has Been Changed',
        bodyHtml: card(`
            <h2 style="color: #0f5132; margin-top: 0;">Password Reset Successful</h2>
            <p>Hello,</p>
            <p>This email is to confirm that your password has been successfully changed.</p>
            <p>You can now log in to your dashboard using your new password.</p>
            <p style="margin-top: 30px; font-size: 12px; color: #dc3545; border-top: 1px solid #eee; padding-top: 10px;">
                <strong>Security Notice:</strong> If you did not make this change, please contact our support team immediately.
            </p>
        `),
    },
    {
        key: 'account.activation',
        name: 'New subscriber workspace activation',
        description: 'Sent to a brand-new subscriber to set their password and provision their workspace.',
        tenantOverridable: false,
        variables: [
            { name: 'email', description: "The recipient's email address." },
            { name: 'companyName', description: 'The subscribing company name.' },
            { name: 'activationLink', description: 'The link to set the password and provision the workspace.' },
        ],
        sample: { email: 'owner@acme.com', companyName: 'Acme Club', activationLink: 'https://app.example.com/activate?token=SAMPLE' },
        fromName: null,
        subject: 'Set up your workspace for {{companyName}}',
        bodyHtml: card(`
            <div style="text-align: center;">
                <h2 style="color: #1e293b; margin-top: 0;">Welcome to the Platform!</h2>
                <p>We are thrilled to have <strong>{{companyName}}</strong> on board.</p>
                <p>To get started, please click the button below to set your secure password and provision your workspace:</p>
                ${button('{{activationLink}}', 'Activate Workspace')}
                <p style="margin-top: 20px; font-size: 12px; color: #777;">If you did not request this, please ignore this email.</p>
            </div>
        `),
    },
    {
        key: 'collaborator.invite',
        name: 'Collaborator invitation',
        description: 'Sent when a subscriber invites someone to collaborate on one of their companies.',
        tenantOverridable: true,
        variables: [
            { name: 'email', description: "The invitee's email address." },
            { name: 'companyName', description: 'The company they are invited to.' },
            { name: 'subscriberName', description: 'The subscriber (account) name, if any.' },
            { name: 'roleName', description: 'The role they will join with, if any.' },
            { name: 'acceptLink', description: 'The deep link to review/accept the invitation.' },
        ],
        sample: {
            email: 'friend@example.com', companyName: 'Acme Club', subscriberName: 'Acme Holdings',
            roleName: 'Manager', acceptLink: 'https://app.example.com/dashboard?invite=SAMPLE',
        },
        fromName: null,
        subject: "You've been invited to collaborate on {{#if companyName}}{{companyName}}{{else}}a company{{/if}}",
        bodyHtml: card(`
            <h2 style="color: #1e3a8a; margin-top: 0;">You've been invited to collaborate</h2>
            <p>You've been invited to join <strong>{{#if companyName}}{{companyName}}{{else}}a company{{/if}}</strong>{{#if subscriberName}} ({{subscriberName}}){{/if}} as a collaborator.</p>
            {{#if roleName}}<p>You'll join with the role: <strong>{{roleName}}</strong>.</p>{{/if}}
            <p>Sign in to review and accept the invitation. If you don't have an account yet, you can create one with this email address — your invitation will be waiting on your dashboard.</p>
            ${button('{{acceptLink}}', 'Review Invitation')}
            <p style="margin-top: 20px; font-size: 12px; color: #777;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                {{acceptLink}}
            </p>
            <p style="margin-top: 20px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                If you weren't expecting this, you can safely ignore this email — no access is granted unless you accept.
            </p>
        `),
    },
    {
        key: 'membership.welcome',
        name: 'Membership welcome',
        description: 'Sent to the new member (or corporate contact) when a membership is created and needs no approval.',
        tenantOverridable: true,
        variables: [
            { name: 'memberName', description: "The member's name (corporate: the contact person or company name)." },
            { name: 'membershipNo', description: 'The membership number issued.' },
            { name: 'membershipTypeName', description: 'The Membership Type, e.g. Golf Individual.' },
            { name: 'companyName', description: 'The club/company the membership belongs to.' },
            { name: 'joinDate', description: 'The join date (YYYY-MM-DD).' },
            { name: 'email', description: "The recipient's email address." },
            { name: 'portalRegisterLink', description: 'The Member Portal self-registration link (individual members only; empty otherwise).' },
        ],
        sample: {
            memberName: 'Jane Tan', membershipNo: 'MS-000123', membershipTypeName: 'Golf Individual',
            companyName: 'Acme Golf & Country Club', joinDate: '2026-07-17', email: 'jane@example.com',
            portalRegisterLink: 'https://app.example.com/portal/register?token=SAMPLE',
        },
        fromName: null,
        subject: 'Welcome to {{companyName}} - membership {{membershipNo}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Welcome{{#if memberName}}, {{memberName}}{{/if}}!</h2>
            <p>We are delighted to welcome you as a member of <strong>{{companyName}}</strong>.</p>
            <p>Your membership is now active. Here are your details:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #64748b;">Membership no.</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #eee;"><strong>{{membershipNo}}</strong></td>
                </tr>
                <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #64748b;">Membership type</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">{{membershipTypeName}}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #64748b;">Join date</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">{{joinDate}}</td>
                </tr>
            </table>
            <p>Please quote your membership number in any correspondence with us.</p>
            {{#if portalRegisterLink}}
            <div style="text-align: center; margin-top: 24px; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                <h3 style="color: #1e293b; margin: 0 0 8px;">Your Member Portal</h3>
                <p style="margin: 0 0 12px;">Register for the Member Portal to book golf, facilities and dining, keep your profile up to date, and raise requests with us online.</p>
                ${button('{{portalRegisterLink}}', 'Register for the Member Portal')}
                <p style="margin: 12px 0 0; font-size: 12px; color: #777;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    {{portalRegisterLink}}
                </p>
            </div>
            {{/if}}
            <p style="margin-top: 20px; font-size: 12px; color: #777;">
                If you believe you received this email in error, please contact {{companyName}}.
            </p>
        `),
    },
    {
        key: 'profile.updated',
        name: 'Profile updated security alert',
        description: 'Sent to a user when their profile information changes (security notice).',
        tenantOverridable: true,
        variables: [
            { name: 'email', description: "The recipient's email address." },
        ],
        sample: { email: 'jane@example.com' },
        fromName: null,
        subject: 'Security Alert: Your Profile Was Updated',
        bodyHtml: card(`
            <h2 style="color: #333; margin-top: 0;">Profile Update Notice</h2>
            <p>Hello,</p>
            <p>We are writing to let you know that your profile information was recently updated in our system.</p>
            <p><strong>If you made this change, no further action is required.</strong></p>
            <p style="margin-top: 20px; padding: 10px; background-color: #ffeaea; color: #cc0000; border-left: 4px solid #cc0000;">
                If you did <b>not</b> make this change, please log in and change your password immediately, or contact our support team.
            </p>
        `),
    },
];
