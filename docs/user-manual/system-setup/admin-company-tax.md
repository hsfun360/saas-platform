# Company Tax

> **Where:** System Setup → Company Tax
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The Edit and Enable/Disable controls only appear when the role also has the Edit permission on this screen.

## What this option is for

Tax Setup defines your organization's tax schemes once, per country.
The Company Tax screen is where one company decides which of its country's schemes it actually uses, and where it can post each tax component to its own ledger (GL) account instead of the organization-wide default.
The screen always works on the company you are currently signed in to (the workspace shown in the header): switch workspace to configure another company.
By default a company uses every scheme defined for its country, so you only need to come here to switch a scheme off for this company or to override a GL account.
Staff come here after loading or adding schemes in Tax Setup, when a company is not registered for a particular tax, or when Finance asks for company-specific GL accounts.

## The screen at a glance

[Screenshot: Company Tax list]

- A count line shows how many schemes exist for the company's country and how many are enabled for this company.
- A search box filters the list as you type; it matches the scheme code and name.
- Each scheme is a card showing its code and name as the title, with the price treatment (INCLUSIVE / EXCLUSIVE) and class (INPUT / OUTPUT) underneath.
- A status chip at the top right of each card shows **Enabled** or **Disabled** for this company; disabled cards are dimmed.
- Below the title, one chip per tax component shows its code, its current rate and the GL account that will be used - highlighted when it is a company override, plain when it is the organization default, or **No GL** when neither is set.
- Enabled schemes are listed first, in code order.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- There is no New button: schemes are created in Tax Setup, not here.

## Common tasks

### Switch a scheme off (or back on) for this company

- Open the card's **⋮** menu and click **Disable** when this company does not use the scheme - for example a club that is not registered for a tax its sister company charges.
  Any GL overrides you had entered are kept, so re-enabling restores them.
- Open the **⋮** menu of a disabled scheme and click **Enable** to use it again.

A disabled scheme is no longer offered when this company's charges are taxed; the organization-wide definition in Tax Setup is untouched.

### Override the GL account per component

[Screenshot: Company tax edit dialog]

1. Click **Edit** on the scheme's card.
2. Tick or untick **This company uses [scheme]** to enable or disable it at the same time if needed.
3. For each component listed, type the GL account this company should post that component to.
   The box shows the organization default as its placeholder; leave a box blank to keep using that default.
4. Click **Save**.

The component chips on the card now show the override highlighted.
To go back to the default for a component, open Edit, clear that box and save.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### Company tax edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **This company uses [scheme]** | No | Tick if this company applies the scheme; untick to switch it off for this company only. | Same effect as Enable / Disable in the ⋮ menu. |
| **GL account per component** (one box per tax code) | No | The ledger account this company posts that component to, e.g. `2100-SST`. Leave blank to use the organization default shown as the placeholder. | Up to 50 characters per component. |

## Tips & troubleshooting

- If the screen says "This company has no country set yet." open Companies, edit this company's details and pick its Country, then return here.
- If the screen says "No tax schemes exist for this company's country yet." go to Tax Setup and add schemes for that country, or use Load defaults there.
- If you see "Tax scheme not found for this company." the scheme was removed or belongs to another country; reload the screen.
- If you see "GL account code is too long (max 50 characters)." shorten the account code.
- Remember that a scheme is on unless you switch it off: only companies that differ from the organization standard need entries here.
- Posted transactions keep the tax and GL values that applied when they were posted; a change here affects future charges only.

## Related options

- **Tax Setup** (System Setup → Tax Setup) - defines the schemes and their rate lines, including the organization-default GL account per component.
- **Companies** (System Setup → Companies) - a company's Country decides which schemes appear here.
- **Workspace switcher** (header) - change the active company to configure a different company's tax.
