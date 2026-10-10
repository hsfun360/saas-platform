# Languages

> **Where:** System Setup → Languages
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).

## What this option is for

The Languages screen is where you choose which of the platform's languages your organization offers to its users, and which one is the default.
The platform maintains the list of available languages; you enable the ones your staff work in, for example English and Bahasa Malaysia.
Each user can then pick a personal preferred language from the ones you enable here (under their own Settings), and the default applies to users who have not chosen one.
The default is also the fallback: when a translation is missing in another language, the default language's text is shown.
Staff come here when the organization wants to offer a new language, or when the default should change.

## The screen at a glance

[Screenshot: Languages screen]

- **Your languages** - a card listing the languages you have enabled as chips; the default is marked with a star and a **Default** tag, and each chip has a ✕ to remove it.
- **Available languages** - a card with the full list of platform languages as tick boxes (name and code); ticked ones appear in the card above.
- A **Save languages** button at the bottom applies your changes; it stays disabled until at least one language is selected.
- If the platform has not published any languages yet, the screen says so and asks you to contact your platform administrator.

## Common tasks

### Enable the languages your organization offers

[Screenshot: Available languages list with a language ticked]

1. In **Available languages**, tick each language your users should be able to choose; it immediately appears as a chip under **Your languages**.
   The first language you tick becomes the default automatically if none is set.
2. Click **Save languages**.

Users can now pick any of these languages in their personal Settings.

### Set the default language

1. Under **Your languages**, click the chip of the language that should be the default.
   The star and the **Default** tag move to it.
2. Click **Save languages**.

The default applies to everyone who has not chosen a personal language, and is the fallback when a translation is missing.

### Remove a language

1. Click the ✕ on the chip under **Your languages** (or untick it in the list below).
   If it was the default, the default moves to the first remaining language.
2. Click **Save languages**.

You cannot save with no languages at all - at least one must stay selected.

## Field reference

### Languages screen

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Language tick boxes** | Yes (at least one) | Tick each language your organization offers. | Only languages published by the platform can be chosen; the Save button stays disabled until one is ticked. |
| **Default (star)** | No | Click an enabled chip to make it the default and fallback language. | Must be one of the selected languages; removing the default moves it to the first remaining one. |

## Tips & troubleshooting

- If you see "Not available: xx." a language you selected is no longer published by the platform; remove it and save again.
- If you see "Default must be one of the selected languages." the starred language is not in your selection; pick a default from the chips shown.
- If you see "No languages available. Ask your platform administrator to add languages." the platform list is empty; nothing can be selected until it is filled.
- If a user reports "That language is not available to you." when choosing their personal language, enable that language here first.
- Screen titles and menu names can be translated per language on the Modules & Menus screen; the default language's text is used wherever a translation is missing.

## Related options

- **Currencies** (System Setup → Currencies) - the matching screen for the currencies your organization uses.
- **Settings** (avatar menu → Settings) - where each user picks their personal language from the ones enabled here.
- **Languages** (SaaS Administration → Languages) - the platform-wide list this screen draws from.
