# Membership Import

> **Where:** Membership Management → Membership Import
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create permission controls uploading and migrating; the Delete permission controls removing a staged batch.

## What this option is for

Membership Import brings an existing membership base into the system from an Excel workbook instead of keying each membership by hand - typically when a club moves from its old system.
You download the template, fill the **Memberships** sheet (one row per membership, individual and corporate) and the **Members** sheet (one row per person: individual member, nominee or dependent), and upload the file.
The system checks every row and holds it in a staging area where you review the memberships, each with its members and any problems found, and then migrate only the ones you tick.
A membership always moves together with all its members.
Imports never update records that already exist, and no welcome or portal emails are sent for migrated members.

## The screen at a glance

[Screenshot: Membership Import batch list]

- A toolbar with **Download template** and **Upload Excel file**.
- Each uploaded file is a card: the file name as the title, the upload time, and the counts of memberships, members, valid memberships and migrated memberships.
- A status chip top-right reads **Staged** (nothing migrated yet), **Partial** or **Completed**.
- Each card has a **Review** button and a ⋮ menu holding **Delete**.

### The review screen

[Screenshot: Membership Import review]

- An **All imports** link back to the list, the file name and a count line: "N membership(s), M member(s) in the file."
- A **Select all migratable (N)** tick box.
- One card per membership in the file: a tick box, the membership number (or "(auto number)"), the type code and class, the corporate name, the join date and the Excel row number; a chip reads **Ready**, **N error(s)** or **Migrated**.
- Under each membership, its issues (red for errors, amber for warnings) and the list of its members with their kind, number (or "(derived)"), name, dependent type, row number and issues.
- A final card, **Members with no matching membership**, lists person rows whose Membership No is not on the Memberships sheet.
- A **Migrate N membership(s) / M member(s)** button that states exactly what will move.

## Common tasks

### Prepare the file

1. Click **Download template** to get `membership-import-template.xlsx`.
2. On the **Memberships** sheet fill one row per membership: the **Type Code** and **Join Date** are required; leave **Membership No** blank to let the club's auto-numbering issue it (manual-numbering clubs must fill it); **Corporate Name** is required for a corporate type.
3. On the **Members** sheet fill one row per person with the **Membership No** it belongs to, the **Kind** (individual, nominee or dependent) and the **Last Name**; dependents also need the **Dependent Type** and, on a corporate membership, the **Principal Member No**.
   Leave **Member No** blank to have it derived (the individual member takes the membership number; nominees and dependents get the principal's number plus the club suffix).
4. Status, fee, agent, salutation, nationality and other codes must match the names and codes already set up in the system.
   Column headers may be reordered and extra columns are ignored.

### Upload and review

1. Click **Upload Excel file** and pick the `.xlsx` workbook (up to 10 MB).
2. The system stages the file, reports "Staged N membership(s) and M member(s)." and opens the review screen.
3. Read each card: a membership is **Ready** only when it and all its members have no errors; warnings do not block.
4. Fix errors in the spreadsheet and upload again, or proceed with the valid memberships only.

### Migrate the selection

1. Every valid, not-yet-migrated membership is pre-ticked; untick any you want to hold back, or use **Select all migratable**.
2. Click **Migrate N membership(s) / M member(s)**.

Each membership moves in its own step, so one failure never undoes the others.
The system reports "Migrated X of Y selected membership(s)." and lists under **Not migrated** any that failed with the reason; the cards flip to **Migrated**.
Migrated memberships and members appear on the Memberships and Members screens at once, with the type's defaults applied where the file left a column blank (status, fee, credit, term expiry).

### Delete a staged batch

1. Open the batch's ⋮ menu and click **Delete**.
2. Confirm **Delete** in the dialog - it reminds you that migrated records stay and only the staging rows are cleared.

## Field reference

### Memberships sheet (main columns)

| Column | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership No** | Manual-numbering clubs only | The membership number; blank = auto-issued when the club auto-numbers. | Must not already exist; must be unique in the file. |
| **Type Code** | Yes | The Membership Type code, e.g. `ORD`. | Must be an active type; it decides individual vs corporate. |
| **Status** | No | A status name; blank = the type's default. | Must exist; required if the type has no default. |
| **Fee Code** | No | A Membership Fee code; blank = the type's default. | Must exist. |
| **Join Date** | Yes | `YYYY-MM-DD`. | A valid date. |
| **Expiry Date** | No | Blank on a term type = the day before the anniversary. | Must be after the join date. |
| **Billing Date** | No | Corporate only. | A valid date. |
| **Credit Flag** / **Credit Limit** / **Terms (days)** / **Statement Mode** | No | `personal` or `combined`; an amount; whole days; `individual` or `combined`. | Ignored (limit stored as 0) when the club has no credit facility. |
| **Send Reminders** / **Charge Interest** / **Monthly Fee** / **Yearly Fee** | No | `Y` or `N`. | - |
| **Certificate No** / **Application No** / **Reference** / **Proposer** | No | Document references; Proposer for committee clubs. | - |
| **Sales Agent Code** / **Followup Agent Code** | No | Agent codes, commercial clubs. | Must exist. |
| **Corporate Name** and the company columns | Corporate types | Company name, registration, tax, contact, phone, email, industry. | Corporate Name required for a corporate type. |
| **Residential ... / Mailing ...** address columns | No | Address, city, postcode, state, country (two-letter code, e.g. `my`). | For a corporate row the residential columns become the Company address. |
| **Remarks** | No | Free notes. | - |

### Members sheet (main columns)

| Column | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership No** | Yes | The membership the person belongs to. | Must match a row on the Memberships sheet. |
| **Member No** | No | Blank = derived from the membership or principal number plus the club suffix. | Must not already exist; unique in the file. |
| **Kind** | Yes | `individual`, `nominee` or `dependent`. | An individual membership needs exactly one individual row; nominees only on corporate memberships, within the type's seat count. |
| **Dependent Type** | Dependents | `spouse`, `son`, `daughter` or `ward`. | - |
| **Principal Member No** | Dependents on a corporate membership | The nominee the dependent belongs to; blank on an individual membership = its member. | Must be a principal row of the same membership. |
| **Status** | No | Blank = follows the membership. | Must exist. |
| **Last Name** | Yes | The person's family name. | - |
| Profile columns (salutation, title, names, gender, birth date, identity no, nationality, race, marital status, contacts, employer, industry, join and expiry dates, credit limit, addresses, remarks) | No | As on the Members dialog; dates `YYYY-MM-DD`; gender `male`/`female`; marital `single`/`married`/`divorced`/`widowed`. | Codes must exist; credit limit ignored without a credit facility. |

## Tips & troubleshooting

- If you see "The file could not be read as an .xlsx workbook." or "The Memberships sheet has no data rows." re-save the file as `.xlsx` from the template and check the sheet names.
- If a row says "Membership No 'X' already exists - imports never update existing records." (or "Member No ...") the record is already in the system; remove the row or correct the number.
- If a row says "Membership No is required (no auto-numbering scheme is active)." the club numbers manually; fill the column or switch on auto-numbering on Club Specification.
- If a row says "Blank Membership No cannot be linked to its member row - give it a file-local number or fill the real one." the membership's number is blank, so its members cannot find it; type any temporary number in both sheets - the real number is still issued on migration.
- If a row says "An individual membership needs its member row (Kind = individual) on the Members sheet." or "... can only have ONE individual member row." fix the Members sheet.
- If a row says "Type 'X' allows at most N nominee(s); the file has M." reduce the nominees or raise the type's seat count.
- If a row says "Principal Member No 'X' is not a principal (individual/nominee) row of this membership." or "Principal Member No is required for a dependent on a corporate membership." fill the nominee's number.
- If a row says "Status 'X' not found.", "Fee code 'X' not found.", "Type code 'X' not found." or "Sales Agent Code 'X' not found." the name or code does not match the master; check spelling and set the master up first.
- If a row warns "The club has no credit facility - the credit columns are ignored and the credit limit is stored as 0." that is by design; enable the credit facility first if the values matter.
- If you see "Row has validation errors." or "Already migrated." for a membership, it was not eligible; the screen only lets you tick valid, unmigrated ones.
- If you see "Select at least one membership to migrate." tick a membership first.
- Set up the masters (types, statuses, fees, agents, salutations and so on) before uploading - most errors come from codes that do not exist yet.
- Upload a small test file first, migrate it, and check the Memberships screen before loading the whole base.

## Related options

- Membership Management → Memberships and Members - where the migrated records appear.
- Membership Management → Membership Type, Membership Status, Membership Fee, Sales Agents - the codes the file refers to.
- Membership Management → Club Specification - auto or manual numbering, the nominee/dependent suffix and the credit facility.
- Membership Management → Membership Type Import - loads the types themselves from Excel.
- System Setup → Salutations, Titles, Nationalities, Races, Industry Types - the profile codes.
