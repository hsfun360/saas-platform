# AR Specification

> **Where:** Account Receivable → AR Specification
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Edit permission is needed to see **Save specification**; without it the screen is read-only, though **Preview layout (PDF)** still works.

## What this option is for

AR Specification holds your company's Account Receivable options, in the same way Club Specification holds membership options.
Everything here applies company-wide:

- the statement cutoff day and the aging buckets printed on every statement;
- the look of the Statement of Account PDF: logo, accent colour, which sections and columns print, and the remittance advice;
- whether Membership bills through Account Receivable, and which transaction types the interest run and deposit conversions post under;
- multi-currency: whether Other Debtor accounts may be opened in a foreign currency, and which entry exchange differences post under.

Changes take effect for documents and statements produced after you save; existing statements keep the buckets and layout they were printed with.

## The screen at a glance

[Screenshot: AR Specification with its section cards]

- The options are grouped into collapsible section cards: **Statement cutoff**, **Aging boundaries**, **Statement layout**, **Membership integration** (shown only to companies subscribed to Membership Management) and **Multi-currency**.
- **Save specification** and **Preview layout (PDF)** sit at the bottom, with a reminder that the preview renders the last saved options.

## Common tasks

### Set the statement period

1. In **Statement cutoff**, enter the **Statement cutoff day**, or leave it blank for calendar months.
   Day 27 makes August's statement cover 28 July to 27 August; blank makes it 1 to 31 August.
   Short months clamp to their last day, and day 31 behaves like blank.
2. Click **Save specification**.

Statement Generation reads this to fill in its default From and To dates.

### Define the aging buckets

1. In **Aging boundaries**, fill in **Aging 1** and as many of the following boundaries as you need, left to right, each greater than the last.
   Boundaries `30, 60, 90, 120` print the buckets `<=30`, `31-60`, `61-90`, `91-120` and `>120`.
2. Click **Save specification**.

N filled boundaries print N+1 buckets.
Statements generated after the change use the new buckets; earlier statements keep theirs.

### Brand and trim the statement layout

[Screenshot: Statement layout section]

1. Tick or untick what prints: the club logo (the Company logo, when one is set), the aging strip, who incurred each charge, the security deposit held, and the "computer-generated statement" note.
2. Tick **Use a brand accent colour** and pick a colour to tint the title and band fills; label text flips white or dark automatically.
3. Arrange the **Table columns**: drag rows to set the printed order, untick a column to hide it (the rest stretch to fill the page), and type a heading to rename one.
   **Reset to standard** restores the six columns in their standard order with their standard headings.
4. Enter the **Remittance advice / footer text** printed below every statement, for example your bank details.
5. Click **Save specification**, then **Preview layout (PDF)** to see the saved options on a sample statement in a new tab.

### Switch Membership billing through AR

Only shown when the company subscribes to Membership Management.

1. Tick **Membership bills through AR** to have fee runs and standing charges post as AR documents, collected after the statement.
   Leave it off when fees are collected at the membership front desk; the runs then refuse to post.
   This is independent of Club Specification's credit facility switch, which governs charge-to-account at the front desk.
2. Optionally choose which **Interest run posts under** (an Interest-class entry) and which **Deposit conversions post under** (a Credit Note-class entry).
   Blank uses the seeded INTEREST and DEPCONV entries.
3. Click **Save specification**.

### Enable multi-currency

1. In **Multi-currency**, check the base currency readout.
   It is the company default currency from the Companies screen; without it the switch stays off.
2. Tick **Enable multi-currency**.
   Other Debtor accounts may then be opened in a foreign currency; Membership and Nominee accounts always stay in the base currency.
3. Choose which entry **Exchange difference posts under**: a Forex-class transaction type.
   When a receipt settles a foreign-currency document at a different rate, the realised gain or loss is classified under this one entry; the sign of the difference says whether it is a gain or a loss, and nothing is posted to the debtor.
4. Click **Save specification**, then maintain the rates under Exchange Rates.

## Field reference

### Statement cutoff

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Statement cutoff day** | No | The day of the month a statement period ends, for example `27`. Blank means calendar month. | A whole number from 1 to 31. |

### Aging boundaries

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Aging 1** | Yes | The upper day boundary of the first bucket, for example `30`. | A whole number of 1 or more. |
| **Aging 2** to **Aging 6** | No | Further boundaries, for example `60`, `90`, `120`. | Fill left to right with no gaps; each greater than the previous one. |

### Statement layout

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Print the club logo** | No | Tick to print the Company logo in the letterhead. | Prints nothing when no logo is set. |
| **Print the aging buckets strip** | No | Tick to print the aging strip under the lines. | |
| **Show who incurred each charge on the lines** | No | Tick to print the person behind each charge. | |
| **Print the security deposit held** | No | Tick to print the deposit figure in the header block. | |
| **Print the "computer-generated statement" note** | No | Tick to print the standard note. | |
| **Use a brand accent colour** | No | Tick to tint the title and band fills. | Reveals the colour picker. |
| **Brand colour** | No | The accent colour. | A six-digit hex colour such as `#1e3a8a`. |
| **Table columns** | At least one visible | The order, visibility and heading of DATE, DOCUMENT, DETAILS, DEBIT, CREDIT and BALANCE. | Headings up to 30 characters; at least one column must stay ticked. |
| **Remittance advice / footer text** | No | Text printed below the statement body. | Up to 2000 characters; blank prints nothing. |

### Membership integration

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership bills through AR** | No | Tick when fee runs and standing charges should post as AR documents. | Only for companies subscribed to Membership Management. |
| **Interest run posts under** | No | An Interest-class transaction type. | Blank uses the seeded INTEREST entry. Must be an active Interest-class entry. |
| **Deposit conversions post under** | No | A Credit Note-class transaction type. | Blank uses the seeded DEPCONV entry. Must be an active Credit Note-class entry. |

### Multi-currency

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable multi-currency** | No | Tick to allow foreign-currency Other Debtor accounts. | Disabled until the company default currency is set. |
| **Exchange difference posts under** | No, but required before a foreign-currency allocation can realise a difference | A Forex-class transaction type. | Must be an active Forex-class entry. |

## Tips & troubleshooting

- **"Statement cutoff day must be between 1 and 31 (or blank for calendar month)."**
  Enter a whole day number or clear the field.
- **"At least the first aging boundary is required."**, **"Aging boundaries must be filled left to right with no gaps."**, **"Each aging boundary must be a whole number of days (1 or more)."** and **"Each aging boundary must be greater than the previous one."**
  Fill Aging 1 first, then the next fields in order, each larger than the one before.
- **"Brand colour must be a 6-digit hex value like #1e3a8a (or blank for the standard look)."**
  Pick the colour with the picker rather than typing it.
- **"The statement needs at least one visible column."**
  Tick at least one table column.
- **"Your workspace is not subscribed to Membership Management."**
  Membership integration cannot be switched on without that module.
- **"Select an active Interest transaction type."**, **"The Interest type must be a interest-class entry."** and the equivalent messages for the deposit conversion and Forex entries.
  The designated entry must be active and of the right class; check it under Transaction Type.
- **"Set the company default currency (Companies screen) before enabling multi-currency - it becomes the AR base currency."**
  Set the default currency under System Setup → Companies first.
- If posting a receipt reports "This allocation realizes an exchange difference - designate a Forex Transaction Type in AR Specification first", set **Exchange difference posts under** here.
- The PDF preview uses sample figures and your saved options only; it touches no real debtor.

## Related options

- **Account Receivable → Statement Generation** and **Statement Listing** - consume the cutoff, buckets and layout.
- **Account Receivable → Interest Generation** - posts under the designated Interest-class entry.
- **Account Receivable → Refunds** - the "Deposit to outstanding" kind posts its credit note under the deposit-conversion entry.
- **Account Receivable → Exchange Rates** and **Debtor Listing** - the currency controls that appear once multi-currency is on.
- **Account Receivable → Transaction Type** - where the Interest, Credit Note and Forex-class entries are defined.
- **System Setup → Companies** - the company logo and default currency.
- **Membership Management → Club Specification** - the separate credit facility switch for charge-to-account.
