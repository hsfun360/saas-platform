# Email Templates

> **Where:** SaaS Administration → Configuration → Email Templates
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.

## What this option is for

Every email the platform sends - account activation, password reset links, subscriber workspace activation, collaborator invitations, membership welcome letters, approval task notices and so on - is produced from a template on this screen.
The set of templates is fixed: you cannot add or remove one, but you can rewrite the wording of each, give it a brand colour and logo, switch it off, and decide whether subscribers may customise it for their own companies.
A template marked **Tenant-overridable** can be given a subscriber-specific or company-specific version by a Tenant Admin under System Setup; the version you keep here is the platform default that applies wherever no override exists.
Staff come here to change the tone or wording of a platform email, to brand it, to check what an email will look like before it goes out, or to stop an email being sent at all.

## The screen at a glance

[Screenshot: Email Templates list]

- One card per template, showing its name on the title line, its key (the short identifier used internally, e.g. `password.reset`) on the sub-line, a **Tenant-overridable** badge where subscribers may customise it, and a short description of when it is sent.
- A status chip on the right shows **Active** (the email is sent) or **Disabled** (the email is suppressed).
- Each card has an **Edit** button that opens the editor for that template.

[Screenshot: Email template editor]

The editor screen has:

- An **Email templates** back button at the top, then the template name, key and description.
- A **Brand settings** card with a **Brand colour** picker and hex box, a preview of the platform logo, and an **Include in email header** checkbox.
- The **Subject** box with an **Insert variable** menu beside it.
- The optional **From name** box.
- The **Body**, a rich-text editor in which merge fields appear as chips; its toolbar includes a `</>` button for editing the underlying HTML.
- Two checkboxes: **Active** and **Tenant-overridable**.
- **Save** and **Reset to default** buttons.
- A **Send a test** box with an email address field and a **Send test** button.
- A **Live preview** panel on the right that renders the subject and body with sample data, refreshing about half a second after you stop typing.

## Common tasks

### Change the wording of an email

1. On the list, click **Edit** on the template.
2. Edit the **Subject**.
   To insert a merge field such as the recipient's name, place the cursor where it should go and pick it from **Insert variable**.
3. Edit the **Body** in the rich-text editor.
   Merge fields are the chips; use the editor's own **Insert variable** control to add one, and the `</>` button to work on the raw HTML when you need an optional block (for example text shown only when a value is present).
4. Watch the **Live preview** on the right; it shows the subject and the finished email with sample values filled in.
5. Click **Save**.

Saving takes effect immediately: the next email of this type uses the new wording.
If the template contains a merge-field mistake, the save is refused with the message "Template syntax error: ..." and the preview panel shows the same error.

### Brand an email

1. In **Brand settings**, pick a **Brand colour** with the colour picker, or type its hex value, e.g. `#10b981`.
   The colour becomes the header band of the email and recolours its buttons.
2. Tick **Include in email header** to centre the platform logo in the band.
   The logo shown is the one uploaded on the Platform Profile screen; "No logo" means none has been uploaded yet.
3. The preview updates with the band and colour (the platform preview shows the colour and band but not a logo).
4. Click **Save**.

Branding is applied when the email is produced, not written into the body, so it works on every template without changing its wording.

### Send yourself a test

1. Type your address in the **Send a test** box.
2. Click **Send test**.
   The button reads "Queuing…" and a green message confirms "Test email queued to you@example.com. It should arrive shortly."

The test uses the content currently in the editor, even if you have not saved it, with sample data filled in, and its subject is prefixed `[TEST]`.
It is delivered through the normal outgoing mail queue, so it arrives within a few minutes.

### Switch an email off or on

1. Open the template and untick **Active** to suppress this email; the system simply does not send it.
2. Tick **Active** to resume sending.
3. Click **Save**.

Be careful with security emails (activation, password reset): switching them off blocks the flows that depend on them.

### Allow or stop subscribers customising an email

1. Open the template and tick **Tenant-overridable** to let Tenant Admins write their own version for their subscriber or an individual company.
2. Untick it to make every subscriber use the platform version only; existing overrides are then ignored.
3. Click **Save**.

### Reset a template to the platform default

1. Open the template and click **Reset to default**.
2. A confirmation warns that your changes to it will be lost; click **Reset**.
3. The original subject, body and settings are restored and the preview refreshes.

### Return to the list

- Click the **Email templates** button at the top of the editor.
  The list scrolls back to the template you were editing and highlights it briefly.

## Field reference

### Template card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The template name, e.g. Password reset request. |
| **Sub-line** | The template key, and the **Tenant-overridable** badge where subscribers may customise it. |
| **Description** | When the platform sends this email. |
| **Status chip** | **Active** means the email is sent; **Disabled** means it is suppressed. |

### Editor

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Brand colour** | No | The accent colour for the email's header band and buttons, picked or typed as a hex value, e.g. `#2563eb`. Leave it as the default to send a neutral, unbranded email. | Must be a hex colour. |
| **Include in email header** | No | Tick to show the platform logo centred in the header band. | Uses the logo from Platform Profile; nothing is shown if no logo is uploaded. |
| **Subject** | Yes | The email's subject line, e.g. `Activate your account`. Merge fields such as the company name may be inserted with **Insert variable**. | Must not be blank. |
| **From name** | No | The sender name the recipient sees, e.g. `MyEasySoft Support`. Leave blank to use the platform's standard sender name. | - |
| **Body** | Yes | The email content, edited visually. Merge fields appear as chips; `</>` opens the raw HTML for optional blocks and loops. | Must not be blank; must be free of merge-field syntax errors. |
| **Active** | No | Tick to send this email; untick to suppress it entirely. | - |
| **Tenant-overridable** | No | Tick to let subscribers customise this email for their own companies. | - |
| **Send a test** (email address) | Only to send a test | The address that should receive the test email. | Must be a valid email address. |

## Tips & troubleshooting

- If you see "Subject and body are required." fill in both before saving.
- If you see "Template syntax error: ..." a merge field is malformed - usually an unclosed `{{` or an optional block without its closing tag; open the `</>` view and fix it.
- If you see "Enter an email address to send the test to." or "A valid recipient email is required." type a complete address in the Send a test box.
- If you see "Unknown template." or "Template not found." the template no longer exists in the catalogue; go back to the list and refresh.
- If you see "Preview failed." the preview could not be rendered; the message under it says why, usually a syntax error in what you are typing.
- If you see "Failed to load the template.", "Failed to save the template.", "Failed to reset the template." or "Failed to send the test email." something went wrong on the server; try again, and contact support if it persists.
- Only use merge fields listed under **Insert variable** for that template: each template has its own set, and an unknown field simply renders blank.
- The sample data in the preview is fixed example content; real emails fill in the actual values.
- Password reset and other account-security emails are always sent through the platform's own mail server, even when branded, so a subscriber's mail-server problems cannot block them.

## Related options

- **Platform Profile** (SaaS Administration → Configuration → Platform Profile) - the logo that **Include in email header** places in the band.
- **Account Email Templates** (System Setup, used by Tenant Admins) - where subscribers write their own versions of the templates marked Tenant-overridable.
- **Companies** (System Setup → Companies) - each company's own outgoing mail server, used for company emails such as invitations and membership welcomes.
