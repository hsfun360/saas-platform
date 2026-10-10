# Membership Type

> **Where:** Membership Management → Membership Type
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

The Membership Type screen defines the categories of membership your club sells - for example Ordinary, Corporate, Life, Junior or Term - together with what each category entitles a member to and what a new member of that type gets by default.
Every type is either **Individual** (one person is the member) or **Corporate** (a company holds the membership and names nominees to use it); the class decides which extra fields apply.
A type carries the default status and default fee a new membership starts with, the default credit limit, golf and voting rights, whether the membership runs for a fixed term, and which other types it may later convert to.
Two further dialogs hang off each type: **Joining fees** (one-time charges billed when someone joins under the type, such as a processing or entrance fee) and **Standing charges** (recurring charges raised according to the member's status, such as a monthly subscription while Active).
Staff come here when setting up the club, introducing a new category, or changing the defaults for new members.

## The screen at a glance

[Screenshot: Membership Type list]

- A count line reads e.g. "6 types, 5 active".
- A search box filters the list as you type, matching the type code and description.
- Each type is a card: the type code as the title, then the class (Individual or Corporate) and description.
- A meta line shows the default status, default fee, credit limit (only when the club offers a credit facility), and how many joining fees and standing charges the type carries.
- Chips show the rights: **Golf**, **Dep. golf**, **Voting**, **Transfer**, and either **Term · N mo** or **Lifetime**.
- A status chip top-right shows **Active** or **Disabled**; active types are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Joining fees**, **Standing charges** and **Enable** or **Disable**.
- The **New type** button floats at the bottom right of the screen.

## Common tasks

### Add a new type

[Screenshot: New membership type dialog]

1. Click **New type**.
2. Enter the **Membership Type** code and pick the **Membership class** (Individual or Corporate); optionally add a **Description**.
3. Under **Default rights**, tick the rights members of this type enjoy.
   At a golf club you can also tick **Golfing access** and set the **Golf guest quota (per booking)**.
4. Under **Term**, leave the box unticked for a lifetime membership, or tick **Term membership (fixed period)** and enter the **Term (months)**.
5. Pick the **Default membership status** and **Default membership fee** a new membership of this type starts with, and optionally the **A/R debtor type** and **Credit limit**.
6. Under **Type conversion - can convert to**, tick the types a membership of this type may later convert into.
7. Fill the class section that appears: **Individual** (child ages, play times) or **Corporate** (number of nominees, nominee membership type).
8. Click **Save**.

The type appears in the list and can be picked when creating a membership.
Add its joining fees and standing charges from the card's ⋮ menu.

### Edit a type

1. Find the type (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   Changing the class clears the fields of the other class.
   Changing the defaults affects only memberships created from then on.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Maintain the joining fees of a type

[Screenshot: Joining fees dialog]

Joining fees are the one-time charges billed when a new member joins under this type; a type can carry several (for example a processing fee and an entrance fee).

1. Open the card's ⋮ menu and click **Joining fees**.
2. Click **Add fee** for each charge.
3. On each row pick the **Transaction type** (its tax scheme shows underneath), optionally type a **Description**, pick the **Currency** (your company's default currency is pre-filled) and enter the **Amount**.
4. Use **Remove** on a row to drop it.
5. Click **Save**.

The whole list is replaced by what you saved; the card's "Joining fees" count updates.

### Maintain the standing charges of a type

[Screenshot: Standing charges dialog]

Standing charges are recurring charges raised from the member's status at the time billing runs - a status can carry more than one charge, and statuses you never charge (deceased, terminated, resigned and so on) simply have no row.

1. Open the card's ⋮ menu and click **Standing charges**.
2. Click **Add charge** for each charge.
3. On each row pick the **Membership status** the charge applies to and the **Transaction type** (its tax scheme shows underneath), optionally type a **Description**, pick the **Currency** and enter the **Amount**.
4. Pick the **Frequency**: Monthly, Annually, or Fixed Month - for Fixed Month also pick the **Month** it is billed in.
5. Use **Remove** on a row to drop it.
6. Click **Save**.

### Disable / enable a type

- Open the card's ⋮ menu and click **Disable** to retire a type you no longer sell.
  Memberships of that type are unaffected; the type disappears from the New membership picker.
- Open the ⋮ menu of a disabled type and click **Enable** to bring it back.

Types are never deleted, because memberships reference them.

## Field reference

### New membership type / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership Type** | Yes | The short code of the category, e.g. `ORD`, `CORP`, `LIFE`. It appears on memberships and in the numbering format when the membership number carries the type. | Up to 30 characters; must be unique within the company. |
| **Membership class** | Yes | **Individual** when one person is the member; **Corporate** when a company holds the membership and names nominees. | Decides which class section appears below. |
| **Description** | No | The category's full name or summary, e.g. `Ordinary member - full golf and voting rights`. | Up to 200 characters. |
| **Golfing access** (golf clubs only) | No | Tick if members of this type may play golf; the golf booking screens check it. Shown only when the Club Specification says the club is a golf club. | Turning it on reveals Dependent golfing allow and Play times. |
| **Dependent golfing allow** | No | Tick if the member's dependents may play golf too. | Only with Golfing access. |
| **Voting right** | No | Tick if members of this type vote at general meetings. | - |
| **Transfer right** | No | Tick if a membership of this type may be transferred to another person. | - |
| **Golf guest quota (per booking)** (golf clubs only) | No | How many guests a member may bring on one golf booking; members playing as guests count. Leave blank for no limit; enter `0` if guests are not allowed. | A whole number, 0 or more. |
| **Term membership (fixed period)** | No | Tick if the membership runs for a fixed period rather than for life. | Turning it on reveals Term (months). |
| **Term (months)** | Yes, for a term membership | The length of the term in months, e.g. `18` for one and a half years. New memberships of the type get an expiry date of join date plus this many months, less one day. | A whole number of at least 1. |
| **Default membership status** | No | The status a new membership of this type starts in, e.g. `Active` or `Provisional`. | A status from the Membership Status master. |
| **Default membership fee** | No | The fee assigned to a new membership of this type. | A fee from the Membership Fee master. |
| **A/R debtor type** | No | A free-text label for the member account category, e.g. `MEMBER`. | Up to 50 characters. |
| **Credit limit** | No | The default credit limit given to a new membership of this type. Shown only when the Club Specification enables the credit facility. | 0.00 or more; always shown with two decimals. |
| **Type conversion - can convert to** | No | Tick each other type a membership of this type may be converted into later. | The type being edited is never offered. |
| **Child age from** / **Child age to** (Individual only) | No | The age band in which a dependent counts as a child member of this type, e.g. `0` to `21`. | Whole numbers, 0 or more; "from" must not exceed "to". |
| **Play times** (Individual with Golfing access only) | No | The number of golf plays allowed, as used by your club's golf rules. | A whole number, 0 or more. |
| **No. of nominee** (Corporate only) | No | How many nominees a corporate membership of this type may name; the Members dialog refuses more. | A whole number, 0 or more. |
| **Nominee membership type** (Corporate only) | No | The type that applies to the nominees of this corporate type. | Another type of this company. |

### Joining fees dialog (one row per fee)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Transaction type** | Yes | The billing item the fee posts as, e.g. an entrance-fee item; its tax scheme shows underneath. | An active Invoice-class entry opened to Membership on Account Receivable → Transaction Type. |
| **Description** | No | A note for the fee line, e.g. `Entrance fee - 2026 price`. | Up to 200 characters. |
| **Currency** | Yes | The currency of the amount; pre-filled with your company's default currency. | One of your subscription's currencies. |
| **Amount** | Yes | The one-time amount charged on joining, e.g. `500.00`. | 0.00 or more; two decimals. |

### Standing charges dialog (one row per charge)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership status** | Yes | The status during which the charge is raised, e.g. `Active (active)`. | An active status of this company; a status may appear on several rows. |
| **Transaction type** | Yes | The billing item the charge posts as; its tax scheme shows underneath. | An active Invoice-class entry opened to Membership. |
| **Description** | No | A note for the charge line, e.g. `Monthly subscription`. | Up to 200 characters. |
| **Currency** | Yes | The currency of the amount; pre-filled with your company's default currency. | One of your subscription's currencies. |
| **Amount** | Yes | The amount charged each time, e.g. `150.00`. | 0.00 or more; two decimals. |
| **Frequency** | Yes | **Monthly**, **Annually**, or **Fixed Month** (once a year in a chosen month). | One of the three values. |
| **Month** | Yes, for Fixed Month | The calendar month the charge is billed in. | January to December. |

## Tips & troubleshooting

- If you see "Membership type 'X' already exists." another type in this company already has that code.
- If you see "A term membership needs its period in months (at least 1)." tick Term membership only when you can give the term length, or untick it for a lifetime type.
- If you see "Child age 'from' must not be greater than 'to'." swap or correct the two ages.
- If you see "A type cannot convert to itself." or "A type cannot be its own nominee category." pick a different type in that field.
- If you see "Transaction type 'X' is not an active Invoice-class entry opened to Membership (AR → Transaction Type master) - required for a joining fee." (or "... for a standing charge.") the item has been disabled or closed to Membership since it was picked; choose another or fix the entry on the Account Receivable master.
- If you see "Joining fee #N: transaction type is required." / "... pick a currency." / "... amount must be a non-negative number." complete row N before saving; the same applies to "Charge #N: select the membership status." and "Charge #N: pick the month for a Fixed Month charge."
- If you see "One or more standing-charge statuses were not found." a status on a row no longer belongs to this company; pick it again.
- If the Joining fees or Standing charges dialog warns "No usable transaction types yet", open at least one Invoice-class item to Membership on Account Receivable → Transaction Type first.
- If you see "Your role's data scope does not allow amending this record." the type was created by someone outside your data scope; ask your administrator.
- Set the default status and fee on every type before creating memberships - the New membership dialog fills them in from the type, and a missing default means extra typing for the front desk.
- The Golfing access and Credit limit fields follow the Club Specification: a non-golf club never sees golf rights, and a club without a credit facility never sees credit limits.

## Related options

- Membership Management → Membership Status - the statuses offered as default status and on standing charges.
- Membership Management → Membership Fee - the fees offered as default fee.
- Membership Management → Club Specification - the club type and credit facility switches that show or hide golf rights and credit limits.
- Membership Management → Memberships - where a type is picked for a new membership and its defaults are applied.
- Membership Management → Membership Type Import - loads many types at once from an Excel workbook (joining fees and standing charges are not imported).
- Account Receivable → Transaction Type - the billing items picked on joining fees and standing charges.
- Membership Management → Transaction Type - the read-only view of the items opened to Membership.
