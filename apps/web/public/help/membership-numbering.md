# Numbering Control (Membership)

> **Where:** Membership Management → Numbering Control
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

Numbering Control decides how your company issues its **Membership No.** - either the system generates the next number automatically when a membership is saved, or staff key the number in by hand (for example from a pre-printed card) and the system only checks that it is not already used.
For automatic numbering you define the pattern: a prefix, the sequence digits, optional year, month and membership-type tokens, the starting number and when the sequence resets.
Numbers are issued without gaps and in order even when several staff create memberships at the same time.
The same Membership No. series is also surfaced on the Club Specification screen; this screen is the full view, including enable/disable and copying a configuration from another company.

## The screen at a glance

[Screenshot: Numbering Control list]

- One card per configured series - for Membership Management this is the **Membership No.** series.
- The card shows the mode (**Auto-generate** or **Manual entry**); for auto-generate it also shows "Next: ..." with the next number that will be issued, and when the sequence resets.
- A status chip top-right shows **Active** or **Disabled**.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- A **Copy from company** button sits above the list.
- The **New numbering scheme** button floats at the bottom right - only while a series is still unconfigured.

## Common tasks

### Set up the Membership No. series

[Screenshot: New numbering scheme dialog]

1. Click **New numbering scheme**.
2. **Numbers** shows the series being set up (Membership No.).
3. Pick **How it's assigned**: **Auto-generate** or **Manual entry**.
4. For auto-generate, enter the **Prefix**, choose the **Reset sequence**, build the **Format** by typing or clicking the token buttons, and set the **Sequence digits** and **Starting number**.
   The box "Next number will look like" previews the result as you type.
5. Click **Save**.

From then on, new memberships get their number from this series (or, in manual mode, the Membership dialog asks for the number).

### Change the format or switch between auto and manual

1. Click **Edit** on the card.
2. Change the mode or the format fields; the running counter itself cannot be edited.
   The preview shows the next number the new format will produce from the current counter.
3. Click **Save**.

The series is fixed to its purpose; you cannot change which numbers it issues.

### Disable / enable the series

- Open the card's ⋮ menu and click **Disable** to switch the series off; the system then treats membership numbering as manual.
- Open the ⋮ menu and click **Enable** to bring it back.

### Copy the numbering configuration from another company

[Screenshot: Copy numbering dialog]

Use this when a new company should number its memberships the same way as an existing one.

1. Click **Copy from company** and pick the company; only companies you have access to are listed.
2. The next step lists that company's active series with the first number it would issue here and its reset rule.
   Series already configured in your company are marked "Already configured here - will be skipped" and cannot be ticked; new ones are pre-ticked.
   Use **Select all new** to tick every copyable series at once.
3. Click **Copy N scheme(s)**.

Only the configuration is copied - the counter starts fresh from the starting number, because the numbers already issued belong to the other company's records.

## Field reference

### New numbering scheme / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Numbers** | Yes | What the series numbers - **Membership No.** here. | Cannot be changed after creation; one series per purpose. |
| **How it's assigned** | Yes | **Auto-generate** (the system issues the next number on save) or **Manual entry** (staff key it in; only uniqueness is checked). | Manual mode hides the format fields. |
| **Prefix** | No | Fixed text placed where `{PREFIX}` appears in the format, e.g. `M`. | Up to 20 characters. |
| **Reset sequence** | Yes | When the running number returns to the starting number: **Never (continuous)**, **Annually** or **Monthly**. | One of the three. |
| **Format** | Yes | The pattern of the number built from tokens: `{PREFIX}`, `{SEQ}` (the padded sequence), `{YYYY}`, `{YY}`, `{MM}` and `{TYPE}` (the membership type code at creation), e.g. `{PREFIX}{YYYY}-{SEQ}`. | Up to 60 characters; defaults to `{PREFIX}{SEQ}`. |
| **Sequence digits** | Yes | How many digits the sequence is padded to, e.g. `5` gives `00001`. | A whole number from 0 to 12. |
| **Starting number** | Yes | The first number of the series, e.g. `1` or `1001`. | A whole number of at least 1. |

### Copy numbering dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Company** | Yes | The company to copy from, chosen from the companies you have access to. | Must differ from your current company. |
| **Series to copy** | Yes | Tick the series to copy; series already configured here are skipped. | At least one. |

## Tips & troubleshooting

- If you see "A numbering scheme for this purpose already exists." the Membership No. series is already configured; edit it instead.
- If you see "Sequence padding must be a whole number from 0 to 12." or "Starting number must be a whole number of at least 1." correct those fields.
- If you see "You have access to no other company to copy from." you belong to only one company; set the series up by hand.
- If you see "Select a different company to copy from." or "You have no access to that company." pick a company from the list offered.
- If you see "Select at least one numbering scheme to copy." tick a series before clicking Copy.
- If you see "Select a workspace first." pick a company in the header before using this screen.
- The `{TYPE}` token shows as `ORD` in the preview; at creation the actual membership type code is used, so `{TYPE}-{SEQ}` gives e.g. `CORP-00012`.
- If you use `{YYYY}` or `{MM}` in the format, pair it with the matching reset rule so numbers restart each year or month and never collide.
- Numbers already issued never change when you edit the format; only future memberships use the new pattern.

## Related options

- Membership Management → Club Specification - the auto/manual toggle and the format dialog for the same series, next to the nominee and dependent suffix settings.
- Membership Management → Memberships - where the number is issued (auto) or keyed in (manual).
- Membership Management → Membership Import - blank numbers in the file are issued from this series when it is in auto mode.
