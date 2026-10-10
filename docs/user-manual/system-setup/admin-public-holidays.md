# Public Holidays

> **Where:** System Setup → Public Holidays
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Public Holidays screen maintains your organization's public holiday calendar - the dates on which the clubs are on holiday, such as Hari Merdeka or Chinese New Year.
Holidays are kept per country: you maintain one calendar for each country your companies operate in, and each company automatically uses the calendar of its own country.
The calendars are consumed across the system wherever a holiday matters, for example booking calendars and holiday pricing.
When all your companies are in a single country, the screen hides the country choice and files every holiday under that country for you.
Staff come here at the start of each year to enter the year's holidays, when a holiday is announced or moved, and when a wrongly entered date should be retired.

## The screen at a glance

[Screenshot: Public Holidays list]

- The subtitle names the country when all your companies share one; otherwise it explains that calendars are kept per country.
- A count line at the top shows how many holidays exist and how many are active.
- When your companies span several countries, a row of country buttons (**All countries** plus one per country, with its flag) filters the list.
- A search box filters the list as you type; it matches the holiday name, the date and the country name.
- Each holiday is a card showing its name as the title, with the date (including the weekday) underneath, and the country flag and name when there is more than one country.
- Holidays are listed by date, active first, followed by the disabled ones.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New holiday** button sits at the bottom right of the screen; it only appears once at least one of your companies has a country set.

## Common tasks

### Add a public holiday

[Screenshot: New public holiday dialog]

1. Click **New holiday**.
2. If your companies span several countries, pick the **Country** the holiday applies to.
   The dialog starts on the country you were filtering by, and the field is hidden altogether when there is only one country.
3. Pick the **Date** from the calendar.
4. Enter the **Holiday name**, for example `Hari Merdeka`.
5. Click **Save**.

The holiday appears in the list as Active and is immediately part of that country's calendar.
A holiday that falls on a different date each year is entered once per year.

### Edit a public holiday

1. Find the holiday (use the search box or the country buttons if the list is long) and click **Edit**.
2. Change the country, date or name.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a public holiday

- Open the card's **⋮** menu and click **Disable** to take a holiday out of the calendar - for example a date that was entered by mistake or later cancelled.
  A disabled holiday no longer counts as a holiday anywhere in the system, but stays on this screen for reference.
- Open the **⋮** menu of a disabled holiday and click **Enable** to bring it back.

There is no delete: disabling is how you remove a holiday while keeping history intact.

## Field reference

### New public holiday / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Country** | Yes | The country whose calendar the holiday belongs to. Shown only when your companies operate in more than one country; otherwise it is filled in for you. | Must be a country one of your active companies is set to; typing filters the list and only a listed country can be chosen. |
| **Date** | Yes | The holiday date - pick it from the calendar. | One entry per date and name per country. |
| **Holiday name** | Yes | The name as it should appear, e.g. `Hari Merdeka`. | Up to 200 characters. |

## Tips & troubleshooting

- If the screen says "None of your companies has an address country set yet." go to Companies and set each company's Country first; holidays are filed per country and the New holiday button stays hidden until then.
- If you see "Holidays can only be set up for countries your companies operate in." the country you picked is not the country of any active company; set a company to that country first.
- If you see "'X' on YYYY-MM-DD already exists for this country." that holiday is already entered (it may be disabled); search for it and enable or edit it instead.
- If you see "A valid holiday date (YYYY-MM-DD) is required." or "Holiday name is required." fill in the missing field.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- If a card unexpectedly shows a country while you only operate in one, that holiday was filed under a country none of your companies uses any more; edit it onto the right country or disable it.
- Enter the whole year's holidays in one sitting at year end so booking and pricing rules are right from January.

## Related options

- **Companies** (System Setup → Companies) - each company's Country decides which holiday calendar it uses, and which countries this screen offers.
- **Weekend days** (System Setup → Companies → Weekend days) - the per-company rest days that work alongside public holidays for weekday / weekend rules.
- **Countries** (SaaS Administration → Countries) - the country names and flags shown here.
