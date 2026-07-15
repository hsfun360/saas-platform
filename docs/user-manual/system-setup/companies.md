# Companies

> **Where:** System Setup → Companies
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators).

## What this option is for

The Companies screen maintains the business entities that operate under your subscription - for example each club, branch, or legal entity your organization runs.
A company's details feed the rest of the system: its name, address, registration numbers and logo appear on printed documents and emails, its country anchors country-based setup such as public holidays and tax, its timezone drives date and time display, and its default currency seeds pricing.
This is also where you choose which modules (Membership, Golf, and so on) each company uses, and where you configure the company's own email server and weekend days.
Staff come here when setting up a new entity, correcting company particulars, or changing what a company is allowed to use.

## The screen at a glance

[Screenshot: Companies list]

- Each company is a card showing its name, the registration number in brackets, the timezone with its UTC offset, the default currency, and how many modules it uses.
- A status chip shows **Active** or **Inactive**.
- A search box filters the list as you type; it matches the name, registration number, timezone, and module names.
- Each card has four buttons: **Edit modules**, **Edit details**, **Email (SMTP)** and **Weekend days**.
- The **New company** button sits at the bottom right of the screen.

## Common tasks

### Add a new company

[Screenshot: New company dialog]

1. Click **New company**.
2. Enter the **Company name** (the only field you must fill).
3. Optionally upload the **Company logo** and fill in the contact, registration and address details.
4. Pick the **Country**: the **Timezone** list then narrows to that country's timezones (a single-timezone country fills it in for you).
5. Pick the **Default currency** and tick the **Modules** this company needs.
6. Click **Save**.

The company appears in the list; you can refine its modules and details at any time afterwards.

### Edit a company's details

1. Find the company (use the search box if the list is long) and click **Edit details**.
2. Change what you need - the fields are the same as when creating.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Change a company's modules

1. Click **Edit modules** on the company's card.
2. Tick or untick the modules; the count updates as you go.
3. Click **Save**.

Modules control what the company's users can be given access to - removing a module hides its menus from that company.

### Set up the company's own email server (Email (SMTP))

[Screenshot: Email delivery (SMTP) dialog]

Use this when the company should send its emails (e.g. collaborator invitations) through its own mail server, from its own address.

1. Click **Email (SMTP)** on the company's card.
2. Fill in the **SMTP host**, **Port** and, if your provider requires sign-in, the **Username** and **Password**.
3. Set the **From email** (the address recipients will see) and optionally a **From name**.
4. Enter your own address under **Send a test** and click **Verify & send test** - this checks the connection and sends a test using the values on screen, even before saving.
5. Click **Save**.

Notes:

- Leave the whole thing unset to use the platform's default sender.
- Security emails (sign-in, password reset) always use the platform sender, never this server.
- The dialog shows when the settings were last verified, and the last delivery error if sending has been failing.
- **Remove** deletes the configuration and returns the company to the platform default; unticking **Active** pauses it without deleting.

### Set the company's weekend days

[Screenshot: Weekend days dialog]

1. Click **Weekend days** on the company's card.
2. Tick the day or days that count as this company's weekend / rest days - e.g. Friday and Saturday in Johor, Saturday and Sunday in Kuala Lumpur.
   A summary line always shows exactly what you have selected.
3. Click **Save**.

Weekend days drive weekday/weekend pricing downstream (for example golf green fees).
Leaving every day unticked is valid: the company is "not configured" and weekend pricing never applies.

## Field reference

### New company / Edit details dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Company logo** | No | The logo shown on this company's printed documents and branded emails. Click **Choose logo**, pick an image, and it uploads immediately; **Remove** clears it. | PNG or JPG, under 1MB. |
| **Company name** | Yes | The entity's legal or trading name, e.g. `Tropicana Golf & Country Resort`. | Up to 150 characters. |
| **Email** | No | The company's general contact address. | Must be a valid email if filled. |
| **Phone** | No | The company's phone number - pick the country code, then type the number. | - |
| **Website** | No | The company's website, e.g. `https://yourclub.com`. | - |
| **Registration no.** | No | The business registration number, shown in brackets on the company card and on documents. | - |
| **Tax registration no.** | No | The tax/SST/GST registration number used on tax documents. | - |
| **Address line 1 / 2, City, State, Postal code** | No | The company's registered address, used on printed documents. | - |
| **Country** | No | The country the company operates in. It anchors country-based setup elsewhere - public holidays, tax schemes - and drives the Timezone choices. The special **Others** entry (bottom of the list) is for a country not in the list. | Choices come from the active countries maintained on the Countries screen. |
| **Timezone** | No | The timezone used when showing this company's dates and times, displayed with its UTC offset. | After picking a country, choose from that country's timezones (a single-timezone country is filled automatically). With no country (or Others), type the timezone name, e.g. `Asia/Kuala_Lumpur`. |
| **Default currency** | No | The currency this company prices in, e.g. `MYR`. | Choices are the currencies your organization opted into - if the list is empty, add them under System Setup → Currencies first. |
| **Modules** (New company only) | No | Tick each module this company will use; the selected count is shown. On an existing company use **Edit modules** instead. | - |

### Email (SMTP) dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **SMTP host** | Yes | Your mail provider's server name, e.g. `smtp.sendgrid.net`. | - |
| **Port** | Yes | The server's port - usually `587`, or `465` with implicit TLS. | 1 to 65535. |
| **Use implicit TLS** | No | Tick for port 465; leave off for 587 (STARTTLS). | - |
| **Username** | No | The sign-in name your provider gave you, if it requires one. | - |
| **Password** | No | The sign-in password. On a saved configuration the box shows dots - leave it blank to keep the stored password. | Stored encrypted; never shown back. |
| **From email** | Yes | The address recipients see as the sender, e.g. `noreply@yourcompany.com`. Use an address your server is allowed to send from. | Must be a valid email. |
| **From name** | No | The display name next to the From address, e.g. your company name. | - |
| **Active** | No | Untick to pause this server and fall back to the platform sender without deleting the settings. | - |
| **Send a test** | No | Your own address - **Verify & send test** checks the connection and delivers a test message using the values on screen. | - |

### Weekend days dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Monday … Sunday** | No | Tick each day that is this company's weekend / rest day; the summary line shows the result before you save. | Any combination, including none - no selection means weekend pricing never applies for this company. |

## Tips & troubleshooting

- If you see "Company name is required." fill in the name - it is the only mandatory field.
- If you see "Logo is too large. Please choose an image under 1MB." or "Please choose an image file for the logo." pick a smaller PNG/JPG.
- If you see "You don't have admin rights for that company." your role does not allow managing that company; ask your administrator.
- If you see "SMTP test failed: …" the message after the colon comes from your mail provider - check the host, port, TLS setting and sign-in details with them.
- If invitations from a company arrive from the wrong address, check that company's **Email (SMTP)** dialog: an Active configuration sends from its From email, otherwise the platform default is used.
- The **Country** list only offers countries that are active on the Countries screen - if one is missing, enable it there first.
- Set the country and weekend days early: public holidays, tax and weekend pricing elsewhere in the system rely on them.

## Related options

- **Countries** (SaaS Administration → Reference data → Countries) - the active countries offered in the Country picker.
- **Currencies** (System Setup → Currencies) - the currencies offered as a company's default currency.
- **Public Holidays** (System Setup → Public Holidays) - holidays are scoped by the countries your companies operate in.
- **Tax Setup** (System Setup → Tax Setup) - tax schemes are country-bound; a company consumes schemes for its country.
- **Numbering** (System Setup → Numbering) - per-company document numbering.
- **User Management / Roles** - who can sign in to each company and what they may do there.
