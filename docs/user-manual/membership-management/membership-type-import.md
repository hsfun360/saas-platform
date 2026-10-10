# Membership Type Import

> **Where:** Membership Management → Membership Type Import
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create permission controls uploading and migrating; the Delete permission controls removing a staged batch.

## What this option is for

Membership Type Import loads many Membership Types at once from a one-sheet Excel workbook instead of creating them one by one on the Membership Type screen.
You download the template, fill the **Membership Types** sheet, upload it, review each staged row with the problems found, and migrate only the rows you tick.
Joining fees and standing charges are not part of the import; they are maintained from their own dialogs on the Membership Type screen afterwards.
Imports never update a type that already exists.

## The screen at a glance

[Screenshot: Membership Type Import batch list]

- A toolbar with **Download template** and **Upload Excel file**.
- Each uploaded file is a card: the file name, the upload time, and the counts of types, valid types and migrated types.
- A status chip top-right reads **Staged**, **Partial** or **Completed**.
- Each card has a **Review** button and a ⋮ menu holding **Delete**.

### The review screen

[Screenshot: Membership Type Import review]

- An **All imports** link back to the list, the file name and a count line: "N membership type(s) in the file."
- A **Select all migratable (N)** tick box.
- One card per type row: a tick box, the category code and class, the description and the Excel row number; a chip reads **Ready**, **N error(s)** or **Migrated**; issues are listed beneath (red for errors, amber for warnings).
- A **Migrate N membership type(s)** button that states exactly what will move.

## Common tasks

### Prepare the file

1. Click **Download template** to get `membership-type-import-template.xlsx`.
2. Fill one row per type: **Category Code** and **Class** (`individual` or `corporate`) are required; use `Y`/`N` for the rights and term columns; give **Term Months** when **Term Membership** is `Y`.
3. **Default Status** and **Default Fee Code** must match names and codes already on the Membership Status and Membership Fee masters.
4. **Nominee Category Code** and the comma-separated **Convert To Codes** may name types already in the system or other rows of the same file.

### Upload and review

1. Click **Upload Excel file** and pick the `.xlsx` workbook.
2. The system stages it, reports "Staged N membership type(s)." and opens the review screen.
3. Read each row; a row is **Ready** when it has no errors.
   Warnings (for example a child age on a corporate type) do not block - the value is simply ignored.

### Migrate the selection

1. Every valid, not-yet-migrated row is pre-ticked; untick any you want to hold back.
2. Click **Migrate N membership type(s)**.

Types are created one by one, then their nominee-type and convert-to links are connected.
The system reports "Migrated X of Y selected type(s)." and lists under **Needs attention** any row that failed or that needs a follow-up - for example a reference to a type that is not migrated yet, which you then link on the Membership Type screen.

### Delete a staged batch

1. Open the batch's ⋮ menu and click **Delete**.
2. Confirm **Delete** in the dialog - migrated types stay; only the staging rows are cleared.

## Field reference

### Membership Types sheet

| Column | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Category Code** | Yes | The type code, e.g. `ORD`. | Up to 50 characters; unique in the file; must not already exist. |
| **Description** | No | The type's name or summary. | - |
| **Class** | Yes | `individual` or `corporate`. | Decides which class-only columns apply. |
| **Golfing Access** / **Dependent Golfing** / **Voting Right** / **Transfer Right** | No | `Y` or `N`. | Dependent Golfing needs Golfing Access. |
| **Term Membership** / **Term Months** | No | `Y` or `N`; the term length in months. | Term Months required (whole number of at least 1) when Term Membership is `Y`; ignored otherwise. |
| **Child Age From** / **Child Age To** / **Play Times** | No | Whole numbers; individual class only (Play Times also needs Golfing Access). | "From" must not exceed "to"; ignored on a corporate type. |
| **No of Nominees** / **Nominee Category Code** | No | Whole number; another type's code; corporate class only. | Ignored on an individual type; a type cannot be its own nominee category. |
| **Convert To Codes** | No | Comma-separated type codes, in this file or existing. | A type cannot convert to itself. |
| **Default Status** | No | A status name from the Membership Status master. | Must exist. |
| **Default Fee Code** | No | A code from the Membership Fee master. | Must exist. |
| **A/R Debtor Type** | No | Free text. | - |
| **Credit Limit** | No | An amount. | 0.00 or more. |
| **Active** | No | `Y` or `N`; blank = `Y`. | - |

## Tips & troubleshooting

- If you see "The file could not be read as an .xlsx workbook." re-save the file as `.xlsx` from the template.
- If a row says "Membership type 'X' already exists - imports never update existing records." edit that type on the Membership Type screen instead.
- If a row says "Category Code 'X' appears more than once in the file." remove the duplicate.
- If a row says "Default Status 'X' not found in the Membership Status master." or "Default Fee Code 'X' not found in the Membership Fee master." create the master first or correct the spelling.
- If a row says "Nominee Category Code 'X' is neither in this file nor an existing type." or "Convert To code 'X' is neither in this file nor an existing type." add that type to the file or create it first.
- If the result says a referenced type was not migrated, migrate that row too and re-link the reference on the Membership Type screen.
- If you see "Select at least one membership type to migrate." tick a row first.
- After migrating, open each type on the Membership Type screen to add its joining fees and standing charges.

## Related options

- Membership Management → Membership Type - where the migrated types appear and their fees and charges are maintained.
- Membership Management → Membership Status and Membership Fee - the defaults the file refers to.
- Membership Management → Membership Import - loads memberships and members once the types exist.
