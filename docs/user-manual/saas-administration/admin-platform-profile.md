# Platform Profile

> **Where:** SaaS Administration → Configuration → Platform Profile
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.

## What this option is for

The Platform Profile is the platform operator's own "company of record": the legal entity that issues invoices to subscribers.
Its identity and address head every invoice the platform issues, its logo is the one offered on platform email templates, and its country and default tax scheme decide how the platform's own charges (such as the Subscription Fee) are taxed.
Because the platform's tax catalogue spans several countries while the platform itself is one company in one country, the country set here is what guarantees a Malaysian platform never taxes a charge with another country's scheme.
The profile also carries the platform's Malaysian e-Invoice issuer details for MyInvois.
There is only ever one profile; staff come here once at setup and whenever the registered details, logo, currency or tax anchor change.

## The screen at a glance

[Screenshot: Platform Profile form]

One form in four sections, followed by a test panel:

- **Issuer identity** - legal name, trading name, registration numbers, email, phone, website and the logo.
- **Address** - two address lines, city, state, postal code and the **Country**, which is also the platform's tax country.
- **Billing & tax** - the **Base currency** and the **Default tax scheme**, offered from the platform tax schemes of the chosen country.
- **e-Invoice (LHDN)** - TIN, MSIC code, business activity description and the SST and tourism-tax registration numbers.
- A **Save profile** button under the form.
- A **Test a charge** panel with an amount box and a **Compute tax** button that shows the net, tax and gross a platform charge would produce.

## Common tasks

### Fill in or update the issuer identity

1. Type the **Legal name** (required - it heads every invoice) and, if different, the **Trading name**.
2. Type the **Company registration no.** and the **Tax registration no. (SST/GST)** as they should appear on tax invoices.
3. Fill in the **Email**, **Phone** (pick the country code, then type the number) and **Website**.
4. Under **Logo**, click **Choose logo** and pick an image file under 1 MB; a preview appears once it is uploaded.
   Click **Remove** to clear it.
5. Click **Save profile**.

### Set the address and tax country

1. Fill in the address lines, **City**, **State** and **Postal code**.
2. Pick the **Country** from the list; type a few letters to filter.
   This is also the platform's tax country: changing it clears the **Default tax scheme** if that scheme belongs to another country.
3. Click **Save profile**.

### Choose the base currency and the default tax scheme

1. Pick the **Base currency**, e.g. `MYR`.
2. Pick the **Default tax scheme** from the platform tax schemes defined for the chosen country.
   Choose "No tax (none)" if platform charges are untaxed.
   If the list is empty, the hint says no platform tax schemes exist for that country yet - add them on Platform Tax first.
3. Click **Save profile**.

### Enter the e-Invoice issuer details (Malaysia)

1. Type the platform's **TIN (Tax Identification No.)**.
2. Type or pick the **MSIC code**; suggestions come from the e-Invoice MSIC Codes list, and picking a known code fills in the **Business activity description** when it is still blank.
3. Type the **SST registration no.** (leave blank if not registered) and, for accommodation operators only, the **Tourism tax (TTX) registration no.**.
4. Click **Save profile**.

### Test how a platform charge will be taxed

1. Save the profile first; the test uses the saved country and default scheme.
2. In **Test a charge**, type a **Charge amount** (it is shown with two decimals and the whole value is selected when you click into it).
3. Click **Compute tax**.
4. The panel shows the scheme used, whether the price is inclusive or exclusive, the net, tax and gross figures, and one line per tax component with its rate and amount.

This is exactly the calculation a platform invoice will use, so it is the quickest way to check the country and scheme are right.

## Field reference

### Issuer identity

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Legal name** | Yes | The registered name of the platform company, e.g. `ACME Software Sdn Bhd`. It heads every invoice. | Up to 150 characters. |
| **Trading name** | No | The name the platform trades under if it differs from the legal name. | Up to 150 characters. |
| **Company registration no.** | No | The company registration number, e.g. `202301012345`. | Up to 50 characters. |
| **Tax registration no. (SST/GST)** | No | The sales/service tax registration shown on tax invoices. | Up to 50 characters. |
| **Email** | No | The billing contact address printed on invoices, e.g. `billing@example.com`. | Must be a valid email address; up to 255 characters. |
| **Phone** | No | The contact number: pick the country code, then type the number. | - |
| **Website** | No | The platform's website address, e.g. `https://example.com`. | Up to 255 characters. |
| **Logo** | No | An image file for the invoice header and branded emails. | Image files only, under 1 MB; **Remove** clears it. |

### Address

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Address line 1** / **Address line 2** | No | The street address. | Up to 150 characters each. |
| **City** | No | The city. | Up to 100 characters. |
| **State** | No | The state or region. | Up to 100 characters. |
| **Postal code** | No | The postal code. | Up to 20 characters. |
| **Country** | No | The platform's country, picked from the active countries. It is also the platform's tax country and limits the Default tax scheme to that country's schemes. | Changing it clears a default scheme that belongs to another country. |

### Billing & tax

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Base currency** | No | The currency the platform bills in, picked from the active currencies, e.g. `MYR`. | - |
| **Default tax scheme** | No | The platform tax scheme applied to every platform charge, picked from the platform schemes of the chosen country. "No tax (none)" means platform charges carry no tax. | Only available once a Country is chosen; only active platform schemes for that country are offered. |

### e-Invoice (LHDN)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **TIN (Tax Identification No.)** | No | The platform's tax identification number for MyInvois, e.g. `C1234567890`. | Up to 20 characters; stored in capitals. |
| **MSIC code** | No | The platform's business activity code, e.g. `62011`; suggestions come from the e-Invoice MSIC Codes list. | Up to 20 characters; stored in capitals. |
| **Business activity description** | No | The wording of the business activity; filled in automatically from a known MSIC code when blank, and editable afterwards. | Up to 300 characters. |
| **SST registration no.** | No | The SST registration number; leave blank when not registered. | Up to 35 characters. |
| **Tourism tax (TTX) registration no.** | No | For accommodation operators only. | Up to 35 characters. |

### Test a charge

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Charge amount** | Yes (to compute) | The amount to test, e.g. `100.00`. | 0.00 or more; always shown with two decimals. |

## Tips & troubleshooting

- If you see "Legal name is required (it heads every invoice)." fill in the Legal name before saving.
- If you see "Enter a valid email address." correct the Email box.
- If you see "Please choose an image file for the logo." or "Logo is too large. Please choose an image under 1MB." pick a smaller image file.
- If you see "No image file uploaded." or "Failed to upload logo." the upload did not complete; try again.
- If you see "A numeric amount is required." or "Enter a numeric amount." type a number in the Charge amount box.
- If **Compute tax** shows "Set up the Platform Profile before quoting a charge.", "The Platform Profile has no country set." or "The Platform Profile has no default tax scheme set." save the profile with a Country and a Default tax scheme first.
- If **Compute tax** shows "No active platform tax scheme 'SST-OUT' for MY." the saved scheme has since been disabled or has no rate line effective on today's date; check it on Platform Tax.
- If you see "Failed to load platform profile." or "Failed to save platform profile." something went wrong on the server; try again, and contact support if it persists.
- The Default tax scheme list is empty until Platform Tax has at least one active scheme for the profile's country.
- The logo uploaded here is what **Include in email header** on Email Templates places in the branded header band.

## Related options

- **Platform Tax** (SaaS Administration → Configuration → Platform Tax) - defines the schemes offered as Default tax scheme.
- **Countries** and **Currencies** (SaaS Administration → Reference data) - supply the Country and Base currency pickers.
- **e-Invoice MSIC Codes** (SaaS Administration → Reference data → e-Invoice MSIC Codes) - supplies the MSIC code suggestions.
- **Email Templates** (SaaS Administration → Configuration → Email Templates) - uses this profile's logo for branded emails.
