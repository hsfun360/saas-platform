# Membership Analysis

> **Where:** Membership Management → Business Insights → Membership Analysis
>
> **Who can use it:** users whose role includes the Membership Management module and holds this menu.

## What this option is for

Membership Analysis gives management a live picture of the membership base: how many memberships there are, how many are active, how many joined or expired in a period, and how the members break down by status, type, age, country and nationality.
Every number and chart segment can be clicked to see the actual memberships or members behind it, with filters that combine.
The figures are computed live from the memberships and members on record; nothing is entered or changed here.
Agent and sales-channel figures live on the sibling Agent Performance screen.

## The screen at a glance

[Screenshot: Membership Analysis]

- Period chips **This month**, **This year**, **Last 12 months** and **Custom** (which reveals **From** and **To** date fields); the period drives the KPIs and the movement chart.
- Two filters: a membership class filter (**All classes**, Individual, Corporate) applied to everything, and a people filter (**All people**, Individual members, Nominees, Dependents) applied to the member charts.
- A KPI row: **Memberships**, **Active**, **New joins** (clickable), **Expired** (clickable), **Net movement** and **Members (people)**.
- **Membership movement** - a monthly bar chart of joins versus term expiries.
- **Status** - a donut of memberships or members by status (toggle **Memberships** / **Members**), coloured with each status's own colour.
- **Membership type**, **Age**, **Country** (residential country) and **Nationality** - horizontal bar charts.
- A **Records behind the numbers** panel opens at the bottom whenever you click a number or chart segment.

## Common tasks

### Read the headline figures

1. Pick the period with the chips, or **Custom** and both dates.
2. Read the KPI row: **Active** counts memberships in a status of class Active or Active (Absent); **New joins** counts join dates in the period; **Expired** counts membership expiry dates falling in the period; **Net movement** is joins minus expiries.

### See the records behind a number

[Screenshot: Records behind the numbers panel]

1. Click the **New joins** or **Expired** KPI, a bar in the movement chart, a slice of the status donut, or a bar in the type, age, country or nationality charts.
2. The panel lists the matching memberships or members as cards (number, name, type, status dot, join and expiry dates, agent) with "N membership(s) match." above.
3. Click another segment to add a filter: the chips at the top of the panel show every active filter and they combine; click a chip's ✕ to remove it.
4. Switch **Memberships** / **Members** in the panel to view the same selection as memberships or as people.
5. Click **Load N more** for the next page (50 at a time) and **Close** to hide the panel.

### Compare individual and corporate

- Pick **Individual** or **Corporate** in the class filter; every KPI, chart and drill-down narrows to that class.

### Focus the people charts on one kind of member

- Pick **Individual members**, **Nominees** or **Dependents** in the people filter; the Members status donut and the age, country and nationality charts narrow to that kind.

## Field reference

This screen has no form; the filters are the only inputs.

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Period** | No | This month, This year, Last 12 months or Custom. | Custom needs both From and To before the figures reload. |
| **From** / **To** | For Custom | The period, picked from the calendar. | - |
| **Class** | No | All classes, Individual or Corporate. | Applies to everything on the screen. |
| **People** | No | All people, Individual members, Nominees or Dependents. | Applies to the member charts only. |

## Tips & troubleshooting

- If you see "Failed to load the analysis." reload the page; if it persists, your role may lack this menu - ask your administrator.
- A chart shows "No members yet." or "No memberships yet." when there is nothing to count for the current filters.
- "Unknown" in the age, country or nationality charts means members without a birth date, residential address or nationality on record; fill them in on the Memberships screen to improve the picture.
- The status donut uses the colours set on Membership Management → Membership Status; give statuses distinct colours so the chart reads at a glance.
- Expiries count the expiry date on term memberships; a membership's status does not change automatically on that date.

## Related options

- Membership Management → Business Insights → Agent Performance - closings by sales channel and agent.
- Membership Management → Memberships and Members - the records being counted.
- Membership Management → Membership Status - the statuses and colours used in the status chart.
