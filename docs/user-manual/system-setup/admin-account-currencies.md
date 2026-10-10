# Currencies

> **Where:** System Setup → Currencies
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).

## What this option is for

The Currencies screen is where you choose which of the platform's currencies your organization actually uses, and which one is the default.
The platform maintains the full list of world currencies; you opt in to the handful your clubs price in, for example MYR and SGD.
The currencies you select here are the only ones offered when a company's **Default currency** is set on the Companies screen, and the default you mark with a star is suggested for new companies.
Staff come here when the organization starts trading in a new currency, or when the default should change.

## The screen at a glance

[Screenshot: Currencies screen]

- **Your currencies** - a card listing the currencies you have selected as chips; the default is marked with a star and a **Default** tag, and each chip has a ✕ to remove it.
- **Add currencies** - a card with a search box and the full list of available currencies as tick boxes (code, name and symbol); ticked ones appear in the card above.
- A **Save currencies** button at the bottom applies your changes.
- If the platform has not published any currencies yet, the screen says so and asks you to contact your platform administrator.

## Common tasks

### Select the currencies your organization uses

[Screenshot: Add currencies list with a currency ticked]

1. In **Add currencies**, type part of a code or name in the search box to narrow the list.
2. Tick each currency you use; it immediately appears as a chip under **Your currencies**.
   The first currency you tick becomes the default automatically if none is set.
3. Click **Save currencies**.

The selection is saved for the whole organization and the Companies screen now offers exactly these currencies.

### Set the default currency

1. Under **Your currencies**, click the chip of the currency that should be the default.
   The star and the **Default** tag move to it.
2. Click **Save currencies**.

### Remove a currency

1. Click the ✕ on the chip under **Your currencies** (or untick it in the list below).
   If it was the default, the default is cleared and moves to the first remaining currency.
2. Click **Save currencies**.

Removing a currency only stops it being offered for new choices; companies already set to it keep their setting.

## Field reference

### Currencies screen

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search currencies** | No | Part of a currency code or name, e.g. `MYR` or `ringgit`, to filter the available list. | Filters as you type; ✕ clears it. |
| **Currency tick boxes** | No | Tick each currency your organization uses. | Only currencies published by the platform can be chosen. |
| **Default (star)** | No | Click a selected chip to make it the default suggested for new companies. | Must be one of the selected currencies; removing the default clears it. |

## Tips & troubleshooting

- If you see "Not available: XXX." a currency you selected is no longer published by the platform; remove it and save again.
- If you see "Default must be one of the selected currencies." the starred currency is not in your selection; pick a default from the chips shown.
- If you see "No currencies available. Ask your platform administrator to add currencies." the platform list is empty; nothing can be selected until it is filled.
- If a currency you need is missing from the available list, ask your platform administrator to add it on the platform's Currencies screen.
- Select currencies here before setting up companies, otherwise the company's Default currency picker will be empty.

## Related options

- **Companies** (System Setup → Companies) - each company's Default currency is chosen from the currencies selected here.
- **Languages** (System Setup → Languages) - the matching screen for the languages your organization offers.
- **Currencies** (SaaS Administration → Currencies) - the platform-wide list this screen draws from.
