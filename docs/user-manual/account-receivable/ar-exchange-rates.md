# Exchange Rates

> **Where:** Account Receivable → Exchange Rates
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New exchange rate**, without Edit no **Edit**, and without Delete no **Delete**.

## What this option is for

The Exchange Rates screen holds your company's table of foreign-currency rates against the base currency, each effective from a date.
One unit of the foreign currency equals the rate in base currency: a USD rate of 4.71 means 1 USD = 4.71 MYR.

The rates are used when a document is keyed on a foreign-currency Other Debtor account: the entry dialog defaults its Exchange rate field from the rate in force on the document date.
Every document keeps the rate it was posted with, so editing or deleting a rate here only changes what future documents default to.

The base currency is the company's default currency set on the Companies screen.
Rates matter once multi-currency is switched on in AR Specification; they can be keyed beforehand and start applying when it is enabled.

## The screen at a glance

[Screenshot: Exchange Rates list with the count line, search box and rate cards]

- A note at the top warns when no base currency is set yet, or tells you multi-currency is still off.
- A count line reads, for example, "7 rates across 2 currencies, against MYR".
- A search box filters by currency code, currency name or effective date as you type.
- Each rate is a card: the currency code and name as the title; a sub-line with the rate ("1 USD = 4.7100 MYR") and "Effective 1 Aug 2026".
  Cards are grouped by currency, newest effective date first.
- The chip top-right reads **Current** for the rate in force today for that currency, or **Upcoming** for a rate whose effective date is still ahead.
  Older superseded rates carry no chip.
- Each row has **Edit** and a ⋮ menu holding **Delete**.
- **New exchange rate** sits bottom-right, shown only once a base currency exists and your subscription has at least one foreign currency.

## Common tasks

### Add a rate

[Screenshot: New exchange rate dialog]

1. Click **New exchange rate**.
2. Pick the **Currency**.
   The list holds the foreign currencies of your subscription's currency set; the base currency needs no rate.
3. Set **Effective from**, the first day the rate applies.
   It defaults to today.
4. Enter the **Rate**: how many units of the base currency one unit of the foreign currency buys.
   A preview line underneath reads back what you typed, for example "1 USD = 4.7100 MYR".
5. Click **Save**.

The new rate takes over from its effective date; documents dated earlier keep defaulting to the previous rate.

### Edit a rate

1. Find the rate and click **Edit**.
2. Change the **Effective from** date or the **Rate**.
   The currency cannot be changed, because a rate belongs to its currency.
3. Click **Save**.

Documents already posted keep the rate they used.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Delete a rate

[Screenshot: Delete exchange rate confirmation]

1. Open the ⋮ menu and click **Delete**.
2. The confirmation names the currency, the effective date and the rate, and reminds you that documents keep the rate they were posted with.
3. Click **Delete rate**.

Deletion is allowed precisely because nothing posted depends on this table; only future defaults change.

### Find a rate

Type a currency code, part of the currency name, or part of a date such as `2026-08` in the search box; **Clear search** restores the full list.

## Field reference

### New / Edit exchange rate

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Currency** | Yes | The foreign currency, for example `USD - US Dollar`. | Must be in your subscription's currency set and must not be the base currency. Fixed after creation. |
| **Effective from** | Yes | The first date the rate applies, picked from the calendar. | One rate per currency per date. |
| **Rate** | Yes | Base-currency units per one unit of the foreign currency, for example `4.71`. | A positive decimal with at most 10 decimal places; greater than zero. |

## Tips & troubleshooting

- **"Set the company default currency on the Companies screen first - rates are expressed against it, so none can be keyed until then."**
  The base currency is missing; set the company's default currency under System Setup → Companies.
- **"Multi-currency is switched off in AR Specification. Rates keyed here are kept, and start defaulting onto documents once it is enabled."**
  An information note, not an error; rates can be prepared in advance.
- **"USD is the base currency - rates are keyed for foreign currencies only."**
  The base currency never needs a rate.
- **"USD is not in your subscription's currency set (Account Currencies)."**
  Add the currency to your subscription's currency set first.
- **"A USD rate already exists for that effective date - edit that row instead."**
  Only one rate per currency per day; edit the existing row.
- **"Rate must be a positive decimal with at most 10 decimal places."**, **"Rate must be greater than zero."** and **"Rate is too large."**
  Type the rate as a plain decimal such as `4.71`, without symbols or thousands separators.
- **"Your role's data scope does not allow amending this record."**
  Your role can only amend rates created by you or your department.
- If a document dialog reports "No USD exchange rate is effective on the document date", add a rate effective on or before that date here, or type the rate directly in the dialog.
- Key tomorrow's rate today with tomorrow's effective date; it shows as **Upcoming** and takes over automatically.

## Related options

- **Account Receivable → AR Specification** - the multi-currency switch and the Forex entry for exchange differences.
- **Account Receivable → Debtor Listing** - where an Other Debtor is opened in a foreign currency.
- **Account Receivable → Invoices**, **Credit Notes**, **Official Receipts**, **Refunds** and **Deposits** - the entry dialogs that default their Exchange rate from this table.
- **System Setup → Companies** - the company default currency that serves as the base currency.
