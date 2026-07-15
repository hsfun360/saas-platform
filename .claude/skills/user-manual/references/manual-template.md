# Manual template

Use this exact structure for every screen manual.
Replace the angle-bracket placeholders; drop a section only when it truly does not apply (e.g. no Special actions).
Remember the repo Markdown rules: one sentence per line, no em dashes.

```markdown
# <Screen name>

> **Where:** <System> → <Menu label>
> **Who can use it:** users whose role includes the <System> module.

## What this option is for

<2-4 sentences: the business purpose, what records it manages, and when staff would come here.
Mention how these records are used elsewhere in the system (e.g. "fees defined here are picked when billing a member").>

## The screen at a glance

[Screenshot: <screen> list]

<Short bullets describing what the reader sees:>
- <The list and what each card/row shows (title, sub-line, badges).>
- <Search box / filters and what they match on.>
- <Status chips: Active / Disabled and what a disabled record means here.>
- <The "New <record>" button and per-row actions (Edit, Enable/Disable in green/red, etc.).>

## Common tasks

### Add a new <record>

[Screenshot: New <record> dialog]

1. Click **New <record>**.
2. <Step per meaningful field group - reference fields by their on-screen label in bold.>
3. Click **Save**.

<Note what happens after save (appears in the list, becomes available in pickers, etc.).>

### Edit a <record>

1. Find the record (use the search box if the list is long) and click **Edit**.
2. Change what you need. <Call out anything that cannot be changed after creation, and why.>
3. Click **Save**.

<If you leave without saving, the system asks whether to discard your changes or keep editing.>

### Disable / enable a <record>

- Click the red **Disable** button to retire a record you no longer use.
  <What disabling means for this screen - e.g. hidden from pickers, history kept.>
- Click the green **Enable** button to bring it back.

### <Special actions - one sub-section each, only if the screen has them>

<e.g. Load defaults, Sync now, Generate schedule, Test send.
Describe what will happen BEFORE the user clicks, including any preview/confirmation the system shows.>

## Field reference

### <Dialog / form name>

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **<Label>** | Yes/No | <what it means and why it matters, with an example value> | <plain-language limits: "up to 150 characters", "0.00 or more", "must be unique in this company"> |

<One table per dialog or form section on the screen, in the order the user meets them.>

## Tips & troubleshooting

- <"If you see '<server/validation message>' it means ... do ...">
- <Practical advice: naming conventions for codes, when to disable vs delete, etc.>

## Related options

- <Other screens this one feeds or depends on, with the menu path.>
```

## Worked example of field rows (style to imitate)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership fee code** | Yes | A short code that identifies this fee on bills and reports, e.g. `ANNUAL`. | Must be unique within the company. |
| **Amount** | Yes | The fee amount in your company currency, e.g. `1200.00`. | 0.00 or more; always shown with two decimals. |
| **Allow installment** | No | Tick if members may pay this fee in stages instead of one payment. | Turning it on reveals the installment fields below. |
