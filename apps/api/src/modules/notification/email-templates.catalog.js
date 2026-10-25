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
// reference brand variables - which is what lets branding work on older/customised
// templates without a "reset to default". Keep buttons as normal styled <a>s.

// Bodies are CONTENT ONLY. The surrounding card (border, padding, rounded corners),
// the brand header band, and the CTA button colour are all applied automatically at
// render time (see emailBrand.applyBrandToHtml) - which is what makes branding work
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
                <p>Click the button below to choose a new password. This link will expire in 30 minutes.</p>
                ${button('{{resetLink}}', 'Reset Password')}
                <p style="margin-top: 20px; font-size: 12px; color: #666;">
                    If you did not request this, please ignore this email. Your password will remain unchanged.
                </p>
            </div>
        `),
    },
    {
        // Anti-enumeration companion to password.reset: a reset request for an
        // SSO (Google/Microsoft) account answers the SAME generic success over
        // HTTP - the guidance goes to the inbox, where only the owner sees it.
        key: 'password.reset.sso',
        name: 'Password reset requested (SSO account)',
        description: 'Sent when a password reset is requested for an account that signs in with Google or Microsoft.',
        tenantOverridable: true,
        variables: [
            { name: 'email', description: "The recipient's email address." },
            { name: 'provider', description: "The sign-in provider ('Google' or 'Microsoft')." },
            { name: 'loginLink', description: 'Link to the login page.' },
        ],
        sample: { email: 'jane@example.com', provider: 'Google', loginLink: 'https://app.example.com/login' },
        fromName: null,
        subject: 'About your password reset request',
        bodyHtml: card(`
            <div style="text-align: center;">
                <h2 style="color: #1e293b; margin-top: 0;">No password to reset</h2>
                <p>A password reset was requested for this account, but your account signs in with <strong>{{provider}}</strong> - it has no password of its own.</p>
                <p>Just use the "{{provider}}" button on the login page as usual.</p>
                ${button('{{loginLink}}', 'Go to Login')}
                <p style="margin-top: 20px; font-size: 12px; color: #666;">
                    If you did not request this, you can safely ignore this email - nothing about your account has changed.
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
            <p>Sign in to review and accept the invitation. If you don't have an account yet, you can create one with this email address - your invitation will be waiting on your dashboard.</p>
            ${button('{{acceptLink}}', 'Review Invitation')}
            <p style="margin-top: 20px; font-size: 12px; color: #777;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                {{acceptLink}}
            </p>
            <p style="margin-top: 20px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                If you weren't expecting this, you can safely ignore this email - no access is granted unless you accept.
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
        key: 'sales-agent.invite',
        name: 'Sales agent login invitation',
        description: 'Sent to a sales agent (agency staff, external individual or internal sales staff) to register their portal login.',
        tenantOverridable: true,
        variables: [
            { name: 'agentName', description: "The agent's name." },
            { name: 'agentCode', description: 'The agent code at this club.' },
            { name: 'companyName', description: 'The club/company inviting the agent.' },
            { name: 'agencyName', description: 'The agency the agent belongs to (agency staff only; empty otherwise).' },
            { name: 'portalRegisterLink', description: 'The agent portal self-registration link.' },
            { name: 'email', description: "The recipient's email address." },
        ],
        sample: {
            agentName: 'Amir Rahman', agentCode: 'AGT-001', companyName: 'Acme Fitness Club',
            agencyName: 'Prime Leads Agency', portalRegisterLink: 'https://app.example.com/agent/register?token=SAMPLE',
            email: 'amir@example.com',
        },
        fromName: null,
        subject: '{{companyName}} - your sales agent account',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Welcome aboard{{#if agentName}}, {{agentName}}{{/if}}!</h2>
            <p><strong>{{companyName}}</strong> has registered you as a sales agent{{#if agencyName}} under <strong>{{agencyName}}</strong>{{/if}} (agent code <strong>{{agentCode}}</strong>).</p>
            <div style="text-align: center; margin-top: 24px; padding: 16px; background-color: #f8fafc; border-radius: 8px;">
                <p style="margin: 0 0 12px;">Register for the Agent Portal to manage your engagements online.</p>
                ${button('{{portalRegisterLink}}', 'Register for the Agent Portal')}
                <p style="margin: 12px 0 0; font-size: 12px; color: #777;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    {{portalRegisterLink}}
                </p>
            </div>
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
    {
        key: 'workflow.task.assigned',
        name: 'Approval task assigned',
        description: 'Sent to each approver when a workflow step assigns them a pending approval task.',
        tenantOverridable: true,
        variables: [
            { name: 'assigneeName', description: "The approver's display name." },
            { name: 'stepName', description: 'The approval step awaiting them (e.g. "Membership Manager approval").' },
            { name: 'documentLabel', description: 'The document under approval (e.g. "Membership APP-2026-00012").' },
            { name: 'purposeName', description: 'The document type (e.g. "Membership application").' },
            { name: 'approvalsLink', description: 'Link to the My Approvals inbox.' },
        ],
        sample: {
            assigneeName: 'Jane Lim',
            stepName: 'Membership Manager approval',
            documentLabel: 'Membership APP-2026-00012',
            purposeName: 'Membership application',
            approvalsLink: 'https://app.example.com/approvals',
        },
        fromName: null,
        subject: 'Approval needed: {{documentLabel}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Your approval is needed</h2>
            <p>Hello {{assigneeName}},</p>
            <p>A {{purposeName}} - <strong>{{documentLabel}}</strong> - is waiting for you at the step <strong>{{stepName}}</strong>.</p>
            <div style="text-align: center; margin-top: 24px;">
                ${button('{{approvalsLink}}', 'Open My Approvals')}
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #777;">
                You are receiving this because an approval workflow step is assigned to you.
            </p>
        `),
    },
    {
        key: 'workflow.task.reminder',
        name: 'Approval task reminder',
        description: 'Sent once when a pending approval task passes its reminder time (the step SLA hours).',
        tenantOverridable: true,
        variables: [
            { name: 'assigneeName', description: "The approver's display name." },
            { name: 'stepName', description: 'The approval step still awaiting them.' },
            { name: 'documentLabel', description: 'The document under approval.' },
            { name: 'purposeName', description: 'The document type.' },
            { name: 'approvalsLink', description: 'Link to the My Approvals inbox.' },
        ],
        sample: {
            assigneeName: 'Jane Lim',
            stepName: 'Membership Manager approval',
            documentLabel: 'Membership APP-2026-00012',
            purposeName: 'Membership application',
            approvalsLink: 'https://app.example.com/approvals',
        },
        fromName: null,
        subject: 'Reminder - approval still needed: {{documentLabel}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">A pending approval needs your attention</h2>
            <p>Hello {{assigneeName}},</p>
            <p>The {{purposeName}} <strong>{{documentLabel}}</strong> is still waiting for your decision at the step <strong>{{stepName}}</strong>.</p>
            <div style="text-align: center; margin-top: 24px;">
                ${button('{{approvalsLink}}', 'Open My Approvals')}
            </div>
        `),
    },
    {
        key: 'workflow.completed',
        name: 'Approval outcome',
        description: 'Sent to the submitter when the approval workflow of their document finishes (approved or rejected).',
        tenantOverridable: true,
        variables: [
            { name: 'submitterName', description: "The submitter's display name." },
            { name: 'documentLabel', description: 'The document that completed approval.' },
            { name: 'purposeName', description: 'The document type.' },
            { name: 'outcome', description: "'approved' or 'rejected'." },
            { name: 'approved', description: 'Boolean convenience flag for {{#if approved}} blocks.' },
        ],
        sample: {
            submitterName: 'Adam Tan',
            documentLabel: 'Membership APP-2026-00012',
            purposeName: 'Membership application',
            outcome: 'approved',
            approved: true,
        },
        fromName: null,
        subject: '{{documentLabel}} - {{outcome}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">{{#if approved}}Approved{{else}}Not approved{{/if}}</h2>
            <p>Hello {{submitterName}},</p>
            <p>The approval for your {{purposeName}} <strong>{{documentLabel}}</strong> has completed: it was <strong>{{outcome}}</strong>.</p>
            {{#if approved}}
            <p>No further action is needed from you.</p>
            {{else}}
            <p>You can review the approvers' comments on the document's approval history, make the necessary changes and submit it again.</p>
            {{/if}}
        `),
    },
    {
        key: 'ar.statement-run-completed',
        name: 'Statement run completed',
        description: 'Sent to the user who started a statement generation run when the background run finishes (or fails).',
        tenantOverridable: true,
        variables: [
            { name: 'userName', description: "The recipient's name." },
            { name: 'companyName', description: 'The company the statements were generated for.' },
            { name: 'monthLabel', description: "The Statement Month, e.g. 'Aug 2026'." },
            { name: 'status', description: "'completed' or 'failed'." },
            { name: 'failed', description: 'True when the run failed (drives the failure wording).' },
            { name: 'generated', description: 'Number of statements generated.' },
            { name: 'replaced', description: 'How many of those replaced an existing statement.' },
            { name: 'processed', description: 'Debtors processed.' },
            { name: 'total', description: 'Debtors in scope.' },
            { name: 'errorMessage', description: 'The failure reason (failed runs only).' },
            { name: 'listLink', description: 'Deep link to the Statement Listing screen.' },
        ],
        sample: {
            userName: 'Jane Tan', companyName: 'Acme Golf & Country Club', monthLabel: 'Aug 2026',
            status: 'completed', failed: false, generated: 1842, replaced: 12, processed: 1900, total: 1900,
            errorMessage: '', listLink: 'https://app.example.com/ar/statements',
        },
        fromName: null,
        subject: '{{#if failed}}Statement run FAILED - {{monthLabel}}{{else}}{{monthLabel}} statements are ready - {{companyName}}{{/if}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">{{#if failed}}Statement run failed{{else}}Statement run completed{{/if}}</h2>
            <p>Hello{{#if userName}} {{userName}}{{/if}},</p>
            {{#if failed}}
            <p>The statement generation run for <strong>{{monthLabel}}</strong> at <strong>{{companyName}}</strong> stopped after {{processed}} of {{total}} debtor(s):</p>
            <p style="padding: 10px; background-color: #ffeaea; color: #cc0000; border-left: 4px solid #cc0000;">{{errorMessage}}</p>
            <p>Already-generated statements are kept. Open Statement Generation and use Resume to continue from where it stopped.</p>
            {{else}}
            <p>The statement generation run for <strong>{{monthLabel}}</strong> at <strong>{{companyName}}</strong> has finished.</p>
            <p><strong>{{generated}}</strong> statement(s) generated ({{replaced}} replaced) across {{total}} debtor(s) in scope.</p>
            {{/if}}
            ${button('{{listLink}}', 'View statements')}
        `),
    },
    {
        key: 'membership.visit.confirmed',
        name: 'Affiliated visit confirmed',
        description: 'Sent to the visiting member and their home club when the host club confirms a visit under a letter of introduction.',
        tenantOverridable: true,
        variables: [
            { name: 'visitorName', description: "The visiting member's name." },
            { name: 'clubName', description: "The visitor's home club or association." },
            { name: 'visitNo', description: 'The visit number.' },
            { name: 'visitDateText', description: "The visit date, e.g. '22 Oct 2026'." },
            { name: 'golfText', description: "The booked flight, e.g. 'E1 - East Course 1 at 08:04, 18 holes, 3 players (booking B261000031)', or empty." },
            { name: 'facilitiesText', description: 'The other facilities requested (dining, accommodation, other), or empty.' },
            { name: 'arrivalText', description: 'What to present on arrival (letter, home club card, ID).' },
            { name: 'settlementText', description: 'How bills are settled (before leaving, or signed back to the home club).' },
            { name: 'companyName', description: "The host club's name." },
        ],
        sample: {
            visitorName: 'Tan Wei Ming', clubName: 'Saujana Golf & Country Club', visitNo: 'V261000001', visitDateText: '22 Oct 2026',
            golfText: 'E1 - East Course 1 at 08:04, 18 holes, 3 players (booking B261000031)', facilitiesText: 'Dining: lunch for 3 after the round',
            arrivalText: 'Please present your letter of introduction, your home club membership card and a passport or ID at the front desk.',
            settlementText: 'All charges are settled before you leave the club.', companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Visit {{visitNo}} on {{visitDateText}} confirmed - {{companyName}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Your visit is confirmed</h2>
            <p>Dear {{visitorName}},</p>
            <p><strong>{{companyName}}</strong> is pleased to confirm your visit on <strong>{{visitDateText}}</strong> under the letter of introduction from {{clubName}} (visit no. {{visitNo}}).</p>
            {{#if golfText}}<p><strong>Golf:</strong> {{golfText}}</p>{{/if}}
            {{#if facilitiesText}}<p><strong>Also requested:</strong> {{facilitiesText}}</p>{{/if}}
            <p>{{arrivalText}}</p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">{{settlementText}}</p>
        `),
    },
    {
        key: 'membership.visit.declined',
        name: 'Affiliated visit declined',
        description: 'Sent to the visiting member and their home club when the host club declines a visit request.',
        tenantOverridable: true,
        variables: [
            { name: 'visitorName', description: "The visiting member's name." },
            { name: 'clubName', description: "The visitor's home club or association." },
            { name: 'visitNo', description: 'The visit number.' },
            { name: 'visitDateText', description: 'The requested date.' },
            { name: 'reason', description: 'Why the visit was declined.' },
            { name: 'companyName', description: "The host club's name." },
        ],
        sample: {
            visitorName: 'Tan Wei Ming', clubName: 'Saujana Golf & Country Club', visitNo: 'V261000001', visitDateText: '22 Oct 2026',
            reason: 'The course is closed for a tournament on that date.', companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Visit {{visitNo}} on {{visitDateText}} - {{companyName}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">We are unable to confirm your visit</h2>
            <p>Dear {{visitorName}},</p>
            <p><strong>{{companyName}}</strong> is sorry to say that the visit requested for <strong>{{visitDateText}}</strong> under the letter of introduction from {{clubName}} (visit no. {{visitNo}}) cannot be confirmed.</p>
            <p><strong>Reason:</strong> {{reason}}</p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Your home club may write again with another date.</p>
        `),
    },
    {
        key: 'membership.visit.loi',
        name: 'Letter of introduction (outbound)',
        description: 'The letter the Membership Department issues to a partner club when one of our members visits it; sent to the partner\'s contact and to the member.',
        tenantOverridable: true,
        variables: [
            { name: 'memberName', description: "Our member's name." },
            { name: 'memberNo', description: "Our member's number." },
            { name: 'clubName', description: 'The partner club or association.' },
            { name: 'visitNo', description: 'The letter number.' },
            { name: 'visitDateText', description: "The intended visit date, e.g. '22 Oct 2026'." },
            { name: 'alternateDateText', description: 'An alternate date, or empty.' },
            { name: 'facilitiesText', description: 'The facilities requested (golf with holes and preferred time, dining, accommodation, sports, other).' },
            { name: 'playerCount', description: 'The golf party size.' },
            { name: 'guestCount', description: 'Guests in the party.' },
            { name: 'visitsThisPeriod', description: 'Visits by the member to this club in the cap period, this one included.' },
            { name: 'companyName', description: "Our club's name." },
        ],
        sample: {
            memberName: 'Ahmad Faizal', memberNo: 'A0018', clubName: 'Saujana Golf & Country Club', visitNo: 'L261000001', visitDateText: '22 Oct 2026', alternateDateText: '23 Oct 2026',
            facilitiesText: 'Golf: 18 holes at 08:00; Dining: lunch for 2', playerCount: 2, guestCount: 1, visitsThisPeriod: 3, companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Letter of introduction {{visitNo}} - {{memberName}} ({{companyName}}) on {{visitDateText}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Letter of introduction</h2>
            <p>To the Membership Office, <strong>{{clubName}}</strong>,</p>
            <p><strong>{{companyName}}</strong> is pleased to introduce our member <strong>{{memberName}}</strong> (membership no. {{memberNo}}), who is in good standing with us, and requests the courtesies of your club under our arrangement on <strong>{{visitDateText}}</strong>{{#if alternateDateText}} (alternatively {{alternateDateText}}){{/if}}.</p>
            {{#if facilitiesText}}<p><strong>Facilities requested:</strong> {{facilitiesText}}</p>{{/if}}
            <p><strong>Party:</strong> {{playerCount}} player(s){{#if guestCount}}, of whom {{guestCount}} guest(s){{/if}}. This is visit {{visitsThisPeriod}} by this member in the current period of the arrangement.</p>
            <p>Letter no. {{visitNo}}. Our member will present this letter, their membership card and a passport or ID on arrival, and will settle all charges before leaving unless the arrangement provides otherwise.</p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Please reply to this email to confirm the visit. Thank you for extending the courtesies of your club.</p>
        `),
    },
    {
        key: 'golf.raincheck.issued',
        name: 'Golf rain check issued',
        description: 'Sent to the golfer when the front desk issues a rain check for an abandoned round.',
        tenantOverridable: true,
        variables: [
            { name: 'golferName', description: "The golfer's name." },
            { name: 'rainCheckNo', description: 'The rain check number.' },
            { name: 'amount', description: "The credit value, e.g. '60.00'." },
            { name: 'playDateText', description: "The abandoned round's date, e.g. '15 Oct 2026'." },
            { name: 'holesPlayed', description: 'Holes played before play stopped.' },
            { name: 'holesRegistered', description: 'Holes registered (9 or 18).' },
            { name: 'expiryDateText', description: "The last day the rain check can be redeemed, e.g. '13 Jan 2027'." },
            { name: 'reason', description: 'Why play was abandoned (may be empty).' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            golferName: 'Ahmad Faizal', rainCheckNo: 'RC261000001', amount: '60.00', playDateText: '15 Oct 2026',
            holesPlayed: 6, holesRegistered: 18, expiryDateText: '13 Jan 2027', reason: 'Thunderstorm - course closed',
            companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Rain check {{rainCheckNo}} - {{amount}} credit at {{companyName}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Your rain check</h2>
            <p>Dear {{golferName}},</p>
            <p>Play on {{playDateText}} was stopped after {{holesPlayed}} of {{holesRegistered}} holes{{#if reason}} ({{reason}}){{/if}}. <strong>{{companyName}}</strong> has issued you a rain check.</p>
            <p>
                <strong>Rain check No.:</strong> {{rainCheckNo}}<br>
                <strong>Value:</strong> {{amount}}<br>
                <strong>Valid until:</strong> {{expiryDateText}}
            </p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Quote the rain check number at the front desk when you pay for your next round. It is for your own use, can be redeemed once, and any value above that bill is not carried over.</p>
        `),
    },
    {
        key: 'golf.booking.changed',
        name: 'Golf booking change',
        description: 'Sent to every player with an email address (dropped players included) when a golf booking is changed - moved to another flight, players added or dropped, or its details updated.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number (unchanged by the change).' },
            { name: 'changeSummary', description: "What changed, e.g. 'Moved from 24 Oct 2026 07:15 (E1) to 24 Oct 2026 08:30 (E2); 1 player dropped'." },
            { name: 'previousFlight', description: "The flight before the change, e.g. '24 Oct 2026 07:15 - E1 East Course'." },
            { name: 'playDateText', description: "The play date after the change, e.g. '27 Sept 2026'." },
            { name: 'teeTime', description: "The tee-off time after the change, e.g. '08:05'." },
            { name: 'crossTime', description: 'The 18-hole cross-over time (empty for 9 holes).' },
            { name: 'courseName', description: 'The course after the change, e.g. WEST - West Course.' },
            { name: 'holes', description: '9 or 18.' },
            { name: 'playersTable', description: 'The players of the flight AFTER the change as an HTML table (insert with triple braces).' },
            { name: 'chargeText', description: "The late-change charge sentence, or empty when nothing is charged." },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'B260900001',
            changeSummary: 'Moved from 27 Sept 2026 08:05 (WEST) to 27 Sept 2026 09:15 (WEST); 1 player added',
            previousFlight: '27 Sept 2026 08:05 - WEST - West Course',
            playDateText: '27 Sept 2026', teeTime: '09:15', crossTime: '11:15', courseName: 'WEST - West Course', holes: 18,
            playersTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            chargeText: '',
            companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} changed - {{playDateText}} {{teeTime}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking changed</h2>
            <p>Dear Player(s),</p>
            <p>Booking <strong>{{bookingNo}}</strong> at <strong>{{companyName}}</strong> has been changed. This email is sent to every player affected who has an email address on record.</p>
            <p><strong>What changed:</strong> {{changeSummary}}</p>
            <p>
                <strong>Previously:</strong> {{previousFlight}}<br>
                <strong>Now:</strong> {{playDateText}} {{teeTime}} · {{holes}} holes{{#if crossTime}} · cross over {{crossTime}}{{/if}} · {{courseName}}
            </p>
            {{{playersTable}}}
            {{#if chargeText}}<p style="margin-top: 12px;">{{chargeText}}</p>{{/if}}
            <p style="font-size: 12px; color: #666; margin-top: 16px;">If you were dropped from this flight, the table above no longer lists you. Contact the front desk for any further changes.</p>
        `),
    },
    {
        key: 'golf.booking.confirmed',
        name: 'Golf booking confirmation',
        description: 'Sent to every player with an email address when a golf booking is confirmed.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: "The play date, e.g. '27 Sept 2026'." },
            { name: 'teeTime', description: "The tee-off time, e.g. '08:05'." },
            { name: 'crossTime', description: 'The 18-hole cross-over time (empty for 9 holes).' },
            { name: 'courseName', description: 'The course, e.g. WEST - West Course.' },
            { name: 'holes', description: '9 or 18.' },
            { name: 'playersTable', description: 'All players of the flight as an HTML table (insert with triple braces).' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'B260900001', playDateText: '27 Sept 2026',
            teeTime: '08:05', crossTime: '10:05', courseName: 'WEST - West Course', holes: 18,
            playersTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} confirmed - {{playDateText}} {{teeTime}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Tee time confirmed</h2>
            <p>Dear Player(s),</p>
            <p>Your flight at <strong>{{companyName}}</strong> is confirmed. This email is sent to every player of the flight with an email address on record.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{playDateText}}<br>
                <strong>Tee time:</strong> {{teeTime}} · {{holes}} holes{{#if crossTime}} · cross over {{crossTime}}{{/if}}<br>
                <strong>Course:</strong> {{courseName}}
            </p>
            {{{playersTable}}}
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Please arrive at the club in good time before your tee-off. Contact the front desk for any changes.</p>
        `),
    },
    {
        key: 'golf.booking.pending',
        name: 'Golf booking awaiting approval',
        description: 'Sent to the booker when a booking with a player type that needs approval is held pending the club\'s decision.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: "The play date, e.g. '27 Sept 2026'." },
            { name: 'teeTime', description: "The tee-off time, e.g. '08:05'." },
            { name: 'crossTime', description: 'The 18-hole cross-over time (empty for 9 holes).' },
            { name: 'courseName', description: 'The course, e.g. WEST - West Course.' },
            { name: 'holes', description: '9 or 18.' },
            { name: 'approvalTypes', description: 'The player types that need approval, e.g. Corporate nominee.' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'B260900001', playDateText: '27 Sept 2026', teeTime: '08:05', crossTime: '10:05', courseName: 'WEST - West Course', holes: 18,
            approvalTypes: 'Corporate nominee', companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} awaits approval - {{playDateText}} {{teeTime}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Your booking awaits approval</h2>
            <p>Dear Member,</p>
            <p>Your booking at <strong>{{companyName}}</strong> includes a player of a type that needs the club's approval ({{approvalTypes}}). The flight is held for you while the club decides; you will receive a confirmation or a notice either way.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{playDateText}}<br>
                <strong>Tee time:</strong> {{teeTime}} · {{holes}} holes{{#if crossTime}} · cross over {{crossTime}}{{/if}}<br>
                <strong>Course:</strong> {{courseName}}
            </p>
        `),
    },
    {
        key: 'golf.booking.rejected',
        name: 'Golf booking not approved',
        description: 'Sent to the booker when a booking held for approval is rejected or the approval is withdrawn; the booking is cancelled.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: 'The play date.' },
            { name: 'teeTime', description: 'The tee-off time.' },
            { name: 'courseName', description: 'The course.' },
            { name: 'holes', description: '9 or 18.' },
            { name: 'reason', description: 'Why the booking was not approved.' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'B260900001', playDateText: '27 Sept 2026', teeTime: '08:05', courseName: 'WEST - West Course', holes: 18,
            reason: 'Rejected in approval.', companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} not approved - {{playDateText}} {{teeTime}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking not approved</h2>
            <p>Dear Member,</p>
            <p>We are sorry: booking <strong>{{bookingNo}}</strong> at <strong>{{companyName}}</strong> for {{playDateText}} at {{teeTime}} ({{courseName}}, {{holes}} holes) was not approved and has been cancelled.</p>
            <p><strong>Reason:</strong> {{reason}}</p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Please contact the club to arrange another flight.</p>
        `),
    },
    {
        key: 'golf.booking.cancelled',
        name: 'Golf booking cancellation',
        description: 'Sent to every player with an email address when a golf booking is cancelled.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: "The play date, e.g. '27 Sept 2026'." },
            { name: 'teeTime', description: "The tee-off time, e.g. '08:05'." },
            { name: 'courseName', description: 'The course, e.g. WEST - West Course.' },
            { name: 'cancelReason', description: 'The reason keyed at cancellation (may be empty).' },
            { name: 'playersTable', description: 'All players of the flight as an HTML table (insert with triple braces).' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'B260900001', playDateText: '27 Sept 2026',
            teeTime: '08:05', courseName: 'WEST - West Course', cancelReason: 'Course maintenance',
            playersTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} cancelled - {{playDateText}} {{teeTime}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking cancelled</h2>
            <p>Dear Player(s),</p>
            <p>The following flight at <strong>{{companyName}}</strong> has been <strong>cancelled</strong>. This email is sent to every player of the flight with an email address on record.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{playDateText}}<br>
                <strong>Tee time:</strong> {{teeTime}}<br>
                <strong>Course:</strong> {{courseName}}{{#if cancelReason}}<br>
                <strong>Reason:</strong> {{cancelReason}}{{/if}}
            </p>
            {{{playersTable}}}
            <p style="font-size: 12px; color: #666; margin-top: 16px;">If this is unexpected, please contact the club's front desk.</p>
        `),
    },
    {
        key: 'golf.noshow.charged',
        name: 'Golf no-show / late cancellation charge',
        description: 'Sent to the booker when a no-show or late-cancellation charge is posted to their account (never for pending or waived charges).',
        tenantOverridable: true,
        variables: [
            { name: 'bookerName', description: "The booker's name." },
            { name: 'bookingNo', description: 'The booking number the charge relates to.' },
            { name: 'playDateText', description: "The play date, e.g. '27 Sept 2026'." },
            { name: 'reasonLabel', description: "'No show' or 'Late cancellation'." },
            { name: 'isLateCancel', description: 'True for a late cancellation (drives the wording).' },
            { name: 'playerNames', description: 'The players who did not show / were cancelled late.' },
            { name: 'description', description: 'The charge item, e.g. NOSHOW - No-show charge.' },
            { name: 'quantity', description: 'Number of players charged (1 when charged per booking).' },
            { name: 'unitAmount', description: "The price per player, e.g. '80.00'." },
            { name: 'taxAmount', description: "The tax, e.g. '6.40' ('0.00' when none)." },
            { name: 'totalAmount', description: "The amount posted, e.g. '86.40'." },
            { name: 'arDocNo', description: 'The invoice number on the account.' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookerName: 'Ahmad Faizal', bookingNo: 'B260900001', playDateText: '27 Sept 2026',
            reasonLabel: 'No show', isLateCancel: false, playerNames: 'Ahmad Faizal, Guest One',
            description: 'NOSHOW - No-show charge', quantity: 2, unitAmount: '80.00', taxAmount: '12.80', totalAmount: '172.80',
            arDocNo: 'INV-000123', companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: '{{reasonLabel}} charge {{totalAmount}} - booking {{bookingNo}} ({{playDateText}})',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">{{#if isLateCancel}}Late cancellation charge{{else}}No-show charge{{/if}}</h2>
            <p>Dear {{bookerName}},</p>
            {{#if isLateCancel}}
            <p>Booking <strong>{{bookingNo}}</strong> at <strong>{{companyName}}</strong> for <strong>{{playDateText}}</strong> was cancelled inside the club's cancellation notice period, so the no-show charge applies to the booker.</p>
            {{else}}
            <p>The following player(s) of booking <strong>{{bookingNo}}</strong> at <strong>{{companyName}}</strong> did not register for their tee time on <strong>{{playDateText}}</strong>, so the club's no-show charge applies to the booker.</p>
            {{/if}}
            <p>
                <strong>Players:</strong> {{playerNames}}<br>
                <strong>Charge:</strong> {{description}}<br>
                <strong>Amount:</strong> {{quantity}} × {{unitAmount}}{{#if taxAmount}} + {{taxAmount}} tax{{/if}} = <strong>{{totalAmount}}</strong><br>
                <strong>Invoice:</strong> {{arDocNo}}
            </p>
            <p>The amount has been posted to your account and will appear on your next statement.</p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">If you believe this charge was raised in error, please contact the club's front desk.</p>
        `),
    },
    // --- Group booking lifecycle (2026-10-11): the clocks' warnings and outcomes ---
    {
        key: 'golf.group.hold-expiring',
        name: 'Golf group booking - hold expiring',
        description: 'Sent to the user who created a tentative group booking 24 hours before its reserved flights are released, unless it is submitted for approval.',
        tenantOverridable: true,
        variables: [
            { name: 'userName', description: "The recipient's name." },
            { name: 'groupName', description: 'The group / tournament name.' },
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: "The first play date, e.g. '24 Nov 2026'." },
            { name: 'expiresText', description: "When the hold ends, e.g. '14 Oct 2026, 18:33'." },
            { name: 'flightCount', description: 'The reserved flights that would be released.' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: { userName: 'Sales Executive', groupName: 'IFCA Invitational', bookingNo: 'B261000017', playDateText: '24 Nov 2026', expiresText: '14 Oct 2026, 18:33', flightCount: 12, companyName: 'Kuala Lumpur Golf & Country Club' },
        fromName: null,
        subject: 'Hold on {{groupName}} ({{bookingNo}}) ends {{expiresText}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Hold expiring</h2>
            <p>Dear {{userName}},</p>
            <p>The <strong>{{flightCount}}</strong> reserved flight(s) of tentative group booking <strong>{{groupName}}</strong> ({{bookingNo}}, playing {{playDateText}}) at <strong>{{companyName}}</strong> will be released at <strong>{{expiresText}}</strong> unless the booking is submitted for approval before then.</p>
            <p>Open the booking under Golf Management → Group Bookings and submit it, or let the hold lapse if the deal is off.</p>
        `),
    },
    {
        key: 'golf.group.hold-expired',
        name: 'Golf group booking - hold expired',
        description: 'Sent to the user who created a tentative group booking when its reserved flights were released because it was not submitted in time.',
        tenantOverridable: true,
        variables: [
            { name: 'userName', description: "The recipient's name." },
            { name: 'groupName', description: 'The group / tournament name.' },
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: 'The first play date.' },
            { name: 'flightCount', description: 'The flights released.' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: { userName: 'Sales Executive', groupName: 'IFCA Invitational', bookingNo: 'B261000017', playDateText: '24 Nov 2026', flightCount: 12, companyName: 'Kuala Lumpur Golf & Country Club' },
        fromName: null,
        subject: 'Hold on {{groupName}} ({{bookingNo}}) has expired',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Hold expired</h2>
            <p>Dear {{userName}},</p>
            <p>The <strong>{{flightCount}}</strong> reserved flight(s) of tentative group booking <strong>{{groupName}}</strong> ({{bookingNo}}, playing {{playDateText}}) at <strong>{{companyName}}</strong> have been released to the tee sheet because the booking was not submitted for approval in time.</p>
            <p>The booking is still tentative. Reserve its flights again under Golf Management → Group Bookings when you are ready to submit it.</p>
        `),
    },
    {
        key: 'golf.group.deposit-due',
        name: 'Golf group booking - deposit due',
        description: "Sent 24 hours before an approved group booking's pay-by date to the user who created it and to the organiser's contact email, while the deposit is still short.",
        tenantOverridable: true,
        variables: [
            { name: 'recipientName', description: "The recipient's name (the user, or the organiser's contact)." },
            { name: 'groupName', description: 'The group / tournament name.' },
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: 'The first play date.' },
            { name: 'dueText', description: "The pay-by instant, e.g. '18 Oct 2026, 23:59'." },
            { name: 'depositRequired', description: "The deposit demanded, e.g. '1,036.80'." },
            { name: 'depositHeld', description: 'The deposit already received.' },
            { name: 'depositShort', description: 'The amount still outstanding.' },
            { name: 'isOrganiser', description: "True when sent to the organiser's contact (drives the wording)." },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: { recipientName: 'Mr Lim', groupName: 'IFCA Invitational', bookingNo: 'B261000017', playDateText: '24 Nov 2026', dueText: '18 Oct 2026, 23:59', depositRequired: '1036.80', depositHeld: '0.00', depositShort: '1036.80', isOrganiser: true, companyName: 'Kuala Lumpur Golf & Country Club' },
        fromName: null,
        subject: 'Deposit of {{depositShort}} for {{groupName}} due {{dueText}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Deposit due</h2>
            <p>Dear {{#if recipientName}}{{recipientName}}{{else}}{{userName}}{{/if}},</p>
            {{#if isOrganiser}}
            <p>Your group booking <strong>{{groupName}}</strong> ({{bookingNo}}, playing {{playDateText}}) at <strong>{{companyName}}</strong> is approved and its tee times are held for you. The deposit must reach the club by <strong>{{dueText}}</strong> to confirm the booking; after that the held tee times are released.</p>
            {{else}}
            <p>Group booking <strong>{{groupName}}</strong> ({{bookingNo}}, playing {{playDateText}}) is approved but its deposit is still short. Unless it is received by <strong>{{dueText}}</strong>, the booking lapses and its flights are released.</p>
            {{/if}}
            <p>
                <strong>Deposit required:</strong> {{depositRequired}}<br>
                <strong>Received:</strong> {{depositHeld}}<br>
                <strong>Outstanding:</strong> {{depositShort}}
            </p>
            <p style="font-size: 12px; color: #666; margin-top: 16px;">If the deposit has already been sent, please contact the club so it can be recorded.</p>
        `),
    },
    {
        key: 'golf.group.lapsed',
        name: 'Golf group booking - lapsed',
        description: "Sent when an approved group booking lapses because its deposit was not received by the pay-by date, to the user who created it and to the organiser's contact email.",
        tenantOverridable: true,
        variables: [
            { name: 'recipientName', description: "The recipient's name." },
            { name: 'groupName', description: 'The group / tournament name.' },
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'playDateText', description: 'The first play date.' },
            { name: 'depositRequired', description: 'The deposit demanded.' },
            { name: 'depositHeld', description: 'The deposit received.' },
            { name: 'flightCount', description: 'The flights released.' },
            { name: 'isOrganiser', description: "True when sent to the organiser's contact." },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: { recipientName: 'Mr Lim', groupName: 'IFCA Invitational', bookingNo: 'B261000017', playDateText: '24 Nov 2026', depositRequired: '1036.80', depositHeld: '0.00', flightCount: 12, isOrganiser: true, companyName: 'Kuala Lumpur Golf & Country Club' },
        fromName: null,
        subject: 'Group booking {{groupName}} ({{bookingNo}}) has lapsed',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking lapsed</h2>
            <p>Dear {{#if recipientName}}{{recipientName}}{{else}}{{userName}}{{/if}},</p>
            <p>Group booking <strong>{{groupName}}</strong> ({{bookingNo}}, playing {{playDateText}}) at <strong>{{companyName}}</strong> has lapsed: the deposit of <strong>{{depositRequired}}</strong> was not received by the pay-by date ({{depositHeld}} received). Its <strong>{{flightCount}}</strong> reserved flight(s) have been released to the tee sheet.</p>
            {{#if isOrganiser}}
            <p>If you still wish to play, please contact the club - the booking can be reopened and the tee times reserved again, subject to availability.</p>
            {{else}}
            <p>Reopen the booking under Golf Management → Group Bookings to start again, or request a refund of any deposit it holds.</p>
            {{/if}}
        `),
    },
    {
        key: 'golf.group.waitlist-offer',
        name: 'Golf group booking - next in line',
        description: 'Sent to the user whose tentative group booking is next in the waitlist when the course frees up on the date: they have an exclusive window to reserve the flights.',
        tenantOverridable: true,
        variables: [
            { name: 'userName', description: "The recipient's name." },
            { name: 'groupName', description: 'The waiting group / tournament name.' },
            { name: 'bookingNo', description: 'The waiting booking number.' },
            { name: 'courseName', description: 'The course that freed up.' },
            { name: 'playDateText', description: "The play date, e.g. '24 Nov 2026'." },
            { name: 'offerExpiresText', description: "When the exclusive window ends, e.g. '15 Oct 2026, 18:33'." },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: { userName: 'Sales Executive', groupName: 'Tuesday Society', bookingNo: 'B261000018', courseName: 'E1 - East Course 1', playDateText: '24 Nov 2026', offerExpiresText: '15 Oct 2026, 18:33', companyName: 'Kuala Lumpur Golf & Country Club' },
        fromName: null,
        subject: 'Next in line: {{courseName}} on {{playDateText}} is free for {{groupName}} until {{offerExpiresText}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">You are next in line</h2>
            <p>Dear {{userName}},</p>
            <p>The group that held <strong>{{courseName}}</strong> on <strong>{{playDateText}}</strong> at <strong>{{companyName}}</strong> has released it, and <strong>{{groupName}}</strong> ({{bookingNo}}) is next in the waitlist.</p>
            <p>Until <strong>{{offerExpiresText}}</strong> no other group may reserve flights on that course and date - open the booking under Golf Management → Group Bookings and reserve them. After that the offer passes to the next group in the queue.</p>
        `),
    },
    // ---- Facility Management booking emails (structures approved 2026-10-25,
    // sub-slice 2b): ONE email to the booker's contact address and every
    // member participant with an address, like golf. ----
    {
        key: 'facility.booking.confirmed',
        name: 'Facility booking confirmation',
        description: 'Sent to the booker and every member participant with an email address when a facility booking is confirmed.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'bookingDateText', description: "The booking date, e.g. '27 Sept 2026'." },
            { name: 'timeRange', description: "The first slot start to the last slot end, e.g. '19:00 - 21:00'." },
            { name: 'facilityType', description: 'The facility type, e.g. BADMINTON - Badminton Courts.' },
            { name: 'facilities', description: 'The unit codes booked, e.g. BC1.' },
            { name: 'bookerName', description: "The booker's name." },
            { name: 'slotsTable', description: 'The booked slots as an HTML table (insert with triple braces).' },
            { name: 'participantsTable', description: 'The participants as an HTML table (insert with triple braces; empty when none were keyed).' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'FB-00012', bookingDateText: '27 Sept 2026', timeRange: '19:00 - 20:00',
            facilityType: 'BADMINTON - Badminton Courts', facilities: 'BC1', bookerName: 'Ahmad Faizal',
            slotsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">BC1 - Badminton Court 1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">19:00 - 20:00</td></tr></table>',
            participantsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} confirmed - {{bookingDateText}} {{timeRange}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Facility booking confirmed</h2>
            <p>Dear Member,</p>
            <p>Your booking at <strong>{{companyName}}</strong> is confirmed.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{bookingDateText}}<br>
                <strong>Time:</strong> {{timeRange}}<br>
                <strong>Facility:</strong> {{facilityType}} ({{facilities}})<br>
                <strong>Booked by:</strong> {{bookerName}}
            </p>
            {{{slotsTable}}}
            {{{participantsTable}}}
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Please arrive in good time before your slot. Contact the front desk for any changes.</p>
        `),
    },
    {
        key: 'facility.booking.pending',
        name: 'Facility booking awaiting approval',
        description: 'Sent to the booker when a facility booking is held pending the club\'s approval.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'bookingDateText', description: "The booking date, e.g. '27 Sept 2026'." },
            { name: 'timeRange', description: "The first slot start to the last slot end, e.g. '19:00 - 21:00'." },
            { name: 'facilityType', description: 'The facility type, e.g. BADMINTON - Badminton Courts.' },
            { name: 'facilities', description: 'The unit codes booked, e.g. BC1.' },
            { name: 'bookerName', description: "The booker's name." },
            { name: 'slotsTable', description: 'The booked slots as an HTML table (insert with triple braces).' },
            { name: 'participantsTable', description: 'The participants as an HTML table (insert with triple braces; empty when none were keyed).' },
            { name: 'companyName', description: "The club's name." },
        ],
        sample: {
            bookingNo: 'FB-00012', bookingDateText: '27 Sept 2026', timeRange: '19:00 - 20:00',
            facilityType: 'BADMINTON - Badminton Courts', facilities: 'BC1', bookerName: 'Ahmad Faizal',
            slotsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">BC1 - Badminton Court 1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">19:00 - 20:00</td></tr></table>',
            participantsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            companyName: 'Kuala Lumpur Golf & Country Club',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} awaiting approval - {{bookingDateText}} {{timeRange}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking awaiting approval</h2>
            <p>Dear Member,</p>
            <p>Your booking at <strong>{{companyName}}</strong> has been received and is <strong>awaiting the club's approval</strong>. The slots are held for you while the club decides; you will receive a confirmation or a notice once decided.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{bookingDateText}}<br>
                <strong>Time:</strong> {{timeRange}}<br>
                <strong>Facility:</strong> {{facilityType}} ({{facilities}})<br>
                <strong>Booked by:</strong> {{bookerName}}
            </p>
            {{{slotsTable}}}
            {{{participantsTable}}}
        `),
    },
    {
        key: 'facility.booking.rejected',
        name: 'Facility booking not approved',
        description: 'Sent to the booker when a pending facility booking is rejected or its approval withdrawn.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'bookingDateText', description: "The booking date, e.g. '27 Sept 2026'." },
            { name: 'timeRange', description: "The first slot start to the last slot end, e.g. '19:00 - 21:00'." },
            { name: 'facilityType', description: 'The facility type, e.g. BADMINTON - Badminton Courts.' },
            { name: 'facilities', description: 'The unit codes booked, e.g. BC1.' },
            { name: 'bookerName', description: "The booker's name." },
            { name: 'slotsTable', description: 'The booked slots as an HTML table (insert with triple braces).' },
            { name: 'participantsTable', description: 'The participants as an HTML table (insert with triple braces; empty when none were keyed).' },
            { name: 'companyName', description: "The club's name." },
            { name: 'reason', description: 'The rejection reason.' },
        ],
        sample: {
            bookingNo: 'FB-00012', bookingDateText: '27 Sept 2026', timeRange: '19:00 - 20:00',
            facilityType: 'BADMINTON - Badminton Courts', facilities: 'BC1', bookerName: 'Ahmad Faizal',
            slotsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">BC1 - Badminton Court 1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">19:00 - 20:00</td></tr></table>',
            participantsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            companyName: 'Kuala Lumpur Golf & Country Club',
            reason: 'Rejected in approval.',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} not approved - {{bookingDateText}} {{timeRange}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking not approved</h2>
            <p>Dear Member,</p>
            <p>Your booking at <strong>{{companyName}}</strong> was <strong>not approved</strong> and the slots have been released.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{bookingDateText}}<br>
                <strong>Time:</strong> {{timeRange}}<br>
                <strong>Facility:</strong> {{facilityType}} ({{facilities}})<br>
                <strong>Booked by:</strong> {{bookerName}}
            </p>
            {{{slotsTable}}}
            {{{participantsTable}}}
            {{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
            <p style="font-size: 12px; color: #666; margin-top: 16px;">Please contact the front desk if you have any questions.</p>
        `),
    },
    {
        key: 'facility.booking.cancelled',
        name: 'Facility booking cancellation',
        description: 'Sent to the booker and every member participant with an email address when a facility booking is cancelled.',
        tenantOverridable: true,
        variables: [
            { name: 'bookingNo', description: 'The booking number.' },
            { name: 'bookingDateText', description: "The booking date, e.g. '27 Sept 2026'." },
            { name: 'timeRange', description: "The first slot start to the last slot end, e.g. '19:00 - 21:00'." },
            { name: 'facilityType', description: 'The facility type, e.g. BADMINTON - Badminton Courts.' },
            { name: 'facilities', description: 'The unit codes booked, e.g. BC1.' },
            { name: 'bookerName', description: "The booker's name." },
            { name: 'slotsTable', description: 'The booked slots as an HTML table (insert with triple braces).' },
            { name: 'participantsTable', description: 'The participants as an HTML table (insert with triple braces; empty when none were keyed).' },
            { name: 'companyName', description: "The club's name." },
            { name: 'cancelReason', description: 'The reason keyed at cancellation (may be empty).' },
        ],
        sample: {
            bookingNo: 'FB-00012', bookingDateText: '27 Sept 2026', timeRange: '19:00 - 20:00',
            facilityType: 'BADMINTON - Badminton Courts', facilities: 'BC1', bookerName: 'Ahmad Faizal',
            slotsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">BC1 - Badminton Court 1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">19:00 - 20:00</td></tr></table>',
            participantsTable: '<table style="border-collapse: collapse; width: 100%;"><tr><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">1</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Ahmad Faizal</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">A0018</td><td style="border: 1px solid #e2e8f0; padding: 6px 10px;">Member</td></tr></table>',
            companyName: 'Kuala Lumpur Golf & Country Club',
            cancelReason: 'Court maintenance',
        },
        fromName: null,
        subject: 'Booking {{bookingNo}} cancelled - {{bookingDateText}} {{timeRange}}',
        bodyHtml: card(`
            <h2 style="color: #1e293b; margin-top: 0;">Booking cancelled</h2>
            <p>Dear Member,</p>
            <p>The following booking at <strong>{{companyName}}</strong> has been <strong>cancelled</strong>.</p>
            <p>
                <strong>Booking No.:</strong> {{bookingNo}}<br>
                <strong>Date:</strong> {{bookingDateText}}<br>
                <strong>Time:</strong> {{timeRange}}<br>
                <strong>Facility:</strong> {{facilityType}} ({{facilities}})<br>
                <strong>Booked by:</strong> {{bookerName}}
            </p>
            {{{slotsTable}}}
            {{{participantsTable}}}
            {{#if cancelReason}}<p><strong>Reason:</strong> {{cancelReason}}</p>{{/if}}
            <p style="font-size: 12px; color: #666; margin-top: 16px;">If this is unexpected, please contact the club's front desk.</p>
        `),
    },
];
