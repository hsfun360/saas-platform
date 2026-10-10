# Email Templates

> **Where:** System Setup → Email Templates
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).

## What this option is for

The Email Templates screen lets you customise the wording and look of the emails the system sends on your organization's behalf - collaborator invitations, membership welcome emails, approval task notices, golf booking confirmations, password notices and more.
The platform provides a default version of every template.
You can keep the default, write a shared version used by all your companies, or give an individual company its own version (for example each club with its own tone and brand colour).
At sending time the most specific version wins: a company's own version, otherwise the shared version, otherwise the platform default.
Each version also carries brand settings - an accent colour for the header band and buttons, and whether the company logo is shown.
Staff come here when the organization wants its own wording, when a club needs its own branding, or to test what an email will look like.

## The screen at a glance

[Screenshot: Email Templates list]

- Each template is a card showing its name as the title and a short description of when it is sent.
- A status chip at the top right shows **Platform default** (no version of your own yet), **Custom** (your version is in use) or **Custom · Disabled** (you have a version but switched it off).
- Each card has a **Customise** button (no version yet) or **Edit** button (version exists) that opens the editor.
- The chip reflects the shared "All companies" version; company-specific versions are visible once you open the editor.

[Screenshot: Email template editor]

The editor page shows:

- A back link **Email templates** to return to the list, the template name with a **Custom** or **Inherited** chip, and its description.
- **Editing version for** - a picker that switches between the shared **All companies (shared)** version and each company's own version.
- An information banner explaining what the selected scope currently uses (the platform default, or the shared version) when it has no version of its own.
- **Brand settings** - a colour picker with its hex value, the company logo preview and an **Include in email header** tick box.
- The **Subject** with an **Insert variable** menu, the optional **From name**, and the **Body** rich-text editor.
- **Use my version** - a tick box that lets you keep your version but temporarily fall back to the platform default.
- **Save**, and once a version exists, **Remove shared version** or **Remove [company]'s version**.
- **Send a test** - an email box and a **Send test** button.
- **Live preview** on the right, showing the subject and the rendered email with sample data; it refreshes a moment after you stop typing.

## Common tasks

### Write a shared version for all companies

1. On the list, click **Customise** on the template.
2. Leave **Editing version for** on **All companies (shared)**.
3. Edit the **Subject** and the **Body**.
   Use **Insert variable** (above the subject, and inside the body editor) to add merge fields such as the recipient's name or a link; they appear as chips and are filled in when the email is sent.
4. Set the **Brand colour** and tick **Include in email header** if the company logo should appear.
5. Watch the **Live preview** update, then click **Save**.

The list now shows the template as **Custom**, and every company without its own version sends this wording.

### Give one company its own version

1. Open the template editor and pick the company under **Editing version for**.
   The banner tells you whether that company currently uses the shared version or the platform default.
2. Edit the content and brand settings as above - the logo preview shows that company's own logo.
3. Click **Save**.

That company now sends its own version; the other companies are unaffected.

### Send a test email

1. Type your own address under **Send a test**.
2. Click **Send test**.

The test uses the content currently on screen, even if unsaved, filled with sample data, and is queued for delivery to that address.

### Temporarily fall back to the platform default

Untick **Use my version** and click **Save**.
Your wording is kept but not used until you tick the box again; the list shows **Custom · Disabled**.

### Remove a version

1. Click **Remove shared version** (or **Remove [company]'s version**).
2. Confirm in the dialog, which states what will be used instead: a removed company version falls back to the shared version, and a removed shared version falls back to the platform default for every company without its own version.

The editor reloads showing whatever the scope now inherits.

## Field reference

### Email template editor

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Editing version for** | No | **All companies (shared)** or one company; chooses which version you are viewing and saving. | Typing filters the company list; only a listed company can be chosen. |
| **Brand colour** | No | The accent colour for the header band and buttons, as a hex value such as `#2563eb`; the colour swatch and the text box mirror each other. | Must be a hex colour. With no colour the email stays neutral (no band). |
| **Include in email header** | No | Tick to centre the sending company's logo in the brand-colour band. The logo itself comes from the company's record and cannot be changed here. | A company with no logo shows "No logo" in the preview box. |
| **Subject** | Yes | The email subject line; use **Insert variable** to add merge fields. | Cannot be blank. |
| **From name** | No | The sender display name recipients see, e.g. your club's name. | Leave blank to use the default sender name. |
| **Body** | Yes | The email content, edited visually. Variables render as chips; **</>** opens the raw HTML for advanced edits such as optional blocks. | Cannot be blank; must be valid template syntax. |
| **Use my version** | No | Untick to keep this version but fall back to the platform default when sending. | - |
| **Send a test** | No | Your own email address for a test delivery. | Must be a valid email address. |

## Tips & troubleshooting

- If you see "Subject and body are required." fill in both before saving.
- If you see "Template syntax error: ..." a variable or optional block in the body is malformed (for example an unclosed `{{#if}}`); open the **</>** view and correct it, or re-insert the variable from the menu.
- If you see "A valid recipient email is required." or "Enter an email address to send the test to." type a complete address under **Send a test**.
- If you see "This template is not available to customise." or "This template cannot be customised." the platform does not allow your own version of that template (for example sign-up activation emails).
- If the live preview shows "Preview failed." the current content cannot be rendered; check the body for syntax errors.
- The logo only appears when the company has one uploaded under Companies → Edit details and **Include in email header** is ticked.
- Security emails such as password resets are always delivered by the platform's own mail service even when you brand them; product emails such as invitations go through the company's own mail server if one is configured on Companies → Email (SMTP).

## Related options

- **Companies** (System Setup → Companies) - the company logo used in branded emails, and the per-company mail server (Email (SMTP)).
- **User Management** (System Setup → User Management) - sends the collaborator invitation email customised here.
- **Workflow Setup** (System Setup → Workflow Setup) - approval steps send the task assigned and reminder emails customised here.
