# Statement Generation

> **Where:** Account Receivable → Statement Generation
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create permission is needed to see the **Generate a month** card and the **Cancel run** and **Resume** buttons; without it the screen shows the run history only.

## What this option is for

Statement Generation produces the monthly Statement of Account for your debtors.
You choose the statement month, confirm the date range the statement covers, choose which kinds of debtor to include, and the system freezes a statement per debtor: letterhead, billing name and address, every document of the period with a running balance, the deposit held and the aging buckets.

The run happens in the background after you confirm.
You can leave the screen or continue other work; the progress bar updates live, and you receive an in-app notification and an email when the run finishes.
Generated statements are read on the Statement Listing screen.

## The screen at a glance

[Screenshot: Statement Generation with the run card, progress panel and recent runs]

- The **Generate a month** card holds the run form: Statement Month, From date, To date, the Debtor scope boxes and the **Preview & generate** button.
  The card folds away once a run is going.
- While a run is queued or running, a progress panel under the form shows the month, period and scope, a status chip, a percentage bar, "processed of total debtors", the generated and replaced counts, and **Cancel run**.
  A failed run, or a cancelled one that did not finish, shows **Resume** instead.
- **Recent runs** lists past runs as cards: the month as the title; the period and scope on the sub-line; Progress, Generated, Replaced and Started; and a status chip (**completed** in green, anything else in grey).
  Queued or running rows carry a ⋮ menu with **Cancel**; failed or unfinished cancelled rows show **Resume**.

## Common tasks

### Generate a month's statements

[Screenshot: Generate a month card with the scope boxes]

1. Pick the **Statement Month**.
   The **From date** and **To date** fill in from the statement cutoff day set in AR Specification: with cutoff day 27, August covers 28 July to 27 August; with no cutoff, the calendar month.
   Adjust the dates if this run needs a different window.
2. Under **Debtor scope**, keep ticked the kinds of debtor to include: **Individual**, **Corporate**, **Nominee** and **Other Debtor**.
3. Click **Preview & generate**.

[Screenshot: Confirm statement run dialog]

4. The confirmation restates the month, dates and scope, then tells you how many debtors are in scope and how many already have a statement for this month.
   Debtors with no balance and no activity are skipped automatically.
   Existing statements for the month will be deleted and regenerated; the dialog warns you when that applies.
5. Click **Generate for N debtor(s)**.

The run is submitted and the progress panel starts updating.
When it completes, a message reports how many statements were generated and how many replaced.

### Cancel a run

Click **Cancel run** on the progress panel, or **Cancel** in the row's ⋮ menu.
The run stops at the end of its current batch; statements already generated stay.

### Resume a failed or cancelled run

Click **Resume** on the progress panel or the row.
The run continues exactly from the debtor it stopped at, so nothing is generated twice.

### Regenerate after corrections

Run the same month again.
Debtors already covered are replaced with fresh statements that reflect the corrected documents; the preview tells you how many will be replaced before anything happens.

## Field reference

### Generate a month

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Statement Month** | Yes | The month the statements are for, picked from the list. | One statement per debtor per month; regenerating replaces. |
| **From date** | Yes | The first document date the statement covers. | Defaults from the cutoff rule; must not be after the To date. |
| **To date** | Yes | The last document date the statement covers; aging is judged as at this date. | Defaults from the cutoff rule. |
| **Debtor scope** | At least one | Individual, Corporate, Nominee and Other Debtor. | All four start ticked. |

## Tips & troubleshooting

- **"Select at least one debtor category."**
  Tick at least one scope box.
- **"Statement month is required (YYYY-MM)."** and **"A valid date range (from and to) is required."**
  Pick the month and make sure the From date is not after the To date.
- **"Another statement run is still in progress. Wait for it to finish or cancel it first."**
  Only one run at a time; watch the progress panel or cancel the active run.
- **"No debtors match the selected scope."**
  No debtor of the ticked kinds has a balance or activity in the period.
- **"Only a failed or cancelled run can be resumed (this one is completed)."** and **"This run already processed every debtor."**
  Resume applies only to unfinished runs.
- **"This run is already completed."**
  A finished run cannot be cancelled.
- The generated count can be lower than the debtors in scope, because debtors with nothing to show are skipped.
- Statement numbers come from the Statement No. series under Numbering Control.
- The look of the PDF, the aging buckets and the cutoff day are maintained on AR Specification; change them before the run, because each statement freezes them.

## Related options

- **Account Receivable → Statement Listing** - view, download and void the generated statements.
- **Account Receivable → AR Specification** - the cutoff day, aging boundaries and statement layout.
- **Account Receivable → Numbering Control** - the Statement No. series.
- **Account Receivable → Debtor Listing** - the accounts the statements are produced for.
