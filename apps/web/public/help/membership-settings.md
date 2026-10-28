# Club Specification

> **Where:** Membership Management → Club Specification
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Edit permission decides whether you can save changes.

## What this option is for

The Club Specification is the one place where your club declares what kind of club it is, so that the membership screens show only the fields that apply.
It is a single record per company that always exists - there is nothing to add or delete, only settings to change.
The choices made here decide whether golfing rights appear on Membership Types, whether the Proposer field or the salesperson pickers appear on a membership, which kinds of sales agent can be created, whether members may charge expenses to their account, and how membership numbers and the numbers of nominees and dependents are issued.
Staff set this once when the club is set up and revisit it only when the club's model changes.

## The screen at a glance

[Screenshot: Club Specification screen]

- Three collapsible section cards, each with a title band you can click to fold or unfold: **Club profile** (the club type, the Committee club switch and, for a commercial club, the Sales channels), **Credit facility** and **Membership number**.
- The on/off settings are toggle switches; the sales channels stay tick boxes.
  Every option carries a one-line caption, and the (i) beside a switch opens the full explanation of what the entry screens will show or hide.
- Under **Membership number**, a preview reads "Next number will look like ..." when auto-numbering is on, with a **Configure format…** button, and a second preview shows what the first nominee and dependent numbers will look like.
- A sticky bar with **Discard changes** and **Save** appears at the bottom as soon as you change something.

## Common tasks

### Declare the club type

1. Under **Club profile**, pick **Golf Club**, **Leisure Club** or **Others**.
   Only a Golf Club can grant golfing access on its Membership Types; the other two hide every golfing option.
2. Click **Save**.

### Choose the admission model

1. Under **Club profile**, switch **Committee club** on if members are proposed and vouched in (proposal, interview, provision).
   The membership entry screen then shows the **Proposer** field and hides the salesperson pickers, and the Sales channels below the switch disappear because a committee club has no sales agents.
2. Leave it off for a commercial pay-to-join club.
3. Click **Save**.

### Enable the sales channels (commercial clubs)

1. Under **Club profile**, with Committee club off, tick each kind of salesperson your club uses under **Sales channels**: **Sales agencies**, **External individuals**, **Internal sales staff**.
2. Click **Save**.

Only the ticked kinds can be chosen when creating a sales agent and only their agents appear in the membership entry pickers.
Agents of a kind you later untick stay on record.

### Switch the credit facility on or off

1. Under **Credit facility**, switch **Members can charge expenses to their account** on or off.
2. Click **Save**.

When on, the membership dialog shows the credit terms (credit limit, terms, statement, arrears reminders, late-payment interest) and the Membership Type shows a default credit limit.
When off, those fields are hidden and every membership is saved with a credit limit of 0.

### Set how membership numbers are issued

[Screenshot: Membership number section with the Configure format dialog]

1. Under **Membership number**, switch **Auto-generate membership numbers** on to have the system issue the next number on save, or off so staff key the number in (for example from a pre-printed card) and the system only checks that it is not already used.
2. With auto-numbering on, click **Configure format…** to set the **Prefix**, **Format**, **Sequence digits**, **Starting number** and **Reset sequence**; the dialog previews the next number as you type.
   Click the token buttons under Format to insert `{PREFIX}`, `{SEQ}`, `{YYYY}`, `{YY}`, `{MM}` or `{TYPE}`.
3. Click **Save** in the dialog, then **Save** on the screen for the switch.

The same series can also be maintained on Membership Management → Numbering Control; both screens edit one and the same scheme.

### Set the suffix style for nominee and dependent numbers

1. Under **Membership number**, pick the separator and the numbering style for the **Nominee suffix** and the **Dependent suffix**.
   The preview line shows the first numbers these choices produce for a nominee, a nominee's dependent and an individual member's dependent.
2. Click **Save**.

Nominees take their number from the membership number plus the suffix; dependents take theirs from their principal's member number plus the suffix.
Letter styles fill the first free letter; numeric styles always count upward and never reuse a removed number.
Changing the style affects only future suggestions - existing numbers never change.

## Field reference

### Club Specification form

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Club type** | Yes | **Golf Club** (golf and facilities - types can grant golfing access), **Leisure Club** (facilities without golfing) or **Others** (any other profile, e.g. a fitness centre). | One of the three. |
| **Committee club** (switch) | No | On for a committee-vouched admission model; off for a commercial pay-to-join club. | Switching it on hides the Sales channels and switches every sales channel off. |
| **Sales agencies** | No | Tick if outsourced agencies and their staff sell your memberships. | Commercial clubs only. |
| **External individuals** | No | Tick if freelance salespeople outside the company sell your memberships. | Commercial clubs only. |
| **Internal sales staff** | No | Tick if salespeople employed by the club sell memberships. | Commercial clubs only. |
| **Members can charge expenses to their account** (switch) | No | On if the club extends credit to members. | When off, memberships are saved with a credit limit of 0 and the credit fields are hidden. |
| **Auto-generate membership numbers** (switch) | No | On to let the system issue membership numbers; off for manual entry. | Writes through to the Membership No. scheme on Numbering Control. |
| **Nominee suffix** | No | A separator (- / . #) and a style: Letters (A, B, C…) or Numbers with 1, 2, 3 or 4 digits. | Default `-` and Letters. |
| **Dependent suffix** | No | The same choice for dependents. | Default `-` and Letters. |

### Membership number format dialog (Configure format…)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Prefix** | No | Fixed text placed where `{PREFIX}` appears, e.g. `M`. | Up to 20 characters. |
| **Reset sequence** | Yes | When the running number returns to the starting number: **Never (continuous)**, **Annually** or **Monthly**. | One of the three. |
| **Format** | Yes | The pattern of the number built from tokens, e.g. `{PREFIX}{YYYY}-{SEQ}` or `{TYPE}-{SEQ}`. `{TYPE}` is replaced by the membership type code at creation. | Up to 60 characters; defaults to `{PREFIX}{SEQ}`. |
| **Sequence digits** | Yes | How many digits the running number is padded to, e.g. `5` gives `00001`. | A whole number from 0 to 12. |
| **Starting number** | Yes | The first number of the series, e.g. `1` or `1001`. | A whole number of at least 1. |

## Tips & troubleshooting

- If you see "Invalid club type." reload the page and pick one of the three types again.
- If you see "Nominee suffix: ..." or "Dependent suffix: ..." followed by a rule, the suffix choice did not pass - pick a separator and style from the lists.
- If you see "Sequence padding must be a whole number from 0 to 12." or "Starting number must be a whole number of at least 1." correct the numbering format dialog.
- If you see "Select a workspace first." pick a company in the header before using this screen.
- The save bar appears only once you change something; the numbering format dialog has its own Save.
- Decide the club type, admission model and credit facility before creating Membership Types and memberships: these switches change which fields those screens show, and credit values entered while the facility is off are discarded.
- Switching the credit facility off hides the credit fields; any membership or nominee saved afterwards is stored with a credit limit of 0, so switch it off only when the club truly extends no credit.

## Related options

- Membership Management → Membership Type - golf rights and the default credit limit follow the club type and credit facility set here.
- Membership Management → Memberships - the Proposer field, the salesperson pickers, the credit terms and the auto or manual membership number follow this screen.
- Membership Management → Sales Agents - only the enabled channel kinds can be created.
- Membership Management → Numbering Control - the full view of the Membership No. series, including enable/disable and copying from another company.
