# Agent Performance

> **Where:** Membership Management → Business Insights → Agent Performance
>
> **Who can use it:** users whose role includes the Membership Management module and holds this menu.

## What this option is for

Agent Performance shows how many memberships each sales channel and each salesperson closed in a period.
A membership counts for the agent recorded as **Sales agent (closed the sale)** on the membership, grouped into three channels: the club's own **Internal staff**, **External agents** (freelancers) and **Agencies** (each agency with its staff rolled up under it).
Memberships with no agent recorded are shown separately so the totals always add up.
Every number can be clicked to list the memberships behind it.
Nothing is entered or changed here.

## The screen at a glance

[Screenshot: Agent Performance]

- Period chips **This month**, **This year**, **Last 12 months** and **Custom** (which reveals **From** and **To** date fields).
- A class filter: **All classes**, Individual or Corporate.
- A KPI row: **Closed in period**, **Internal staff**, **External agents**, **Agencies** (all clickable) and **No agent recorded**.
- **Closings by channel** - a monthly bar chart stacked by channel, with unattributed closings in grey.
- **Leaderboard** - one row per channel (Staff (Internal), Agents (External) and each agency by name) with its count; a chevron expands the agents inside, each with their code and count; a muted **No agent recorded** row at the end.
- A **Records behind the numbers** panel opens at the bottom whenever you click a number, bar or row.

## Common tasks

### See who closed the most

1. Pick the period with the chips, or **Custom** and both dates.
2. Read the **Leaderboard**: channels are ordered by count; click the chevron on a channel to see its agents.

### List the memberships an agent closed

[Screenshot: Records behind the numbers panel]

1. Click an agent's row in the leaderboard (or a channel row, a KPI, or a bar segment in the chart).
2. The panel lists the matching memberships with "N membership(s) match." above, each showing the number, name, type, status, join date and agent.
3. Click further numbers to add filters; the chips at the top combine, and ✕ removes one.
4. Click **Load N more** for the next page and **Close** to hide the panel.

### Compare months

- In **Closings by channel**, hover a month to read each channel's figure, or click a coloured segment to list that channel's memberships joined in that month.
  The grey "No agent" segment cannot be clicked.

## Field reference

This screen has no form; the filters are the only inputs.

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Period** | No | This month, This year, Last 12 months or Custom. | Custom needs both From and To before the figures reload. |
| **From** / **To** | For Custom | The period, picked from the calendar. | - |
| **Class** | No | All classes, Individual or Corporate. | Applies to everything on the screen. |

## Tips & troubleshooting

- If you see "Failed to load agent performance." reload the page; if it persists, your role may lack this menu - ask your administrator.
- "No memberships were closed in this period." means no join dates fall in the period for the current class filter.
- A high **No agent recorded** figure means memberships were saved without a sales agent; set the **Sales agent (closed the sale)** on each membership to attribute them.
- The closing agent is fixed at joining; changing the **Follow-up sales agent** later does not move the closing to another agent.
- A committee club has no sales agents, so this screen will show every membership under **No agent recorded**.

## Related options

- Membership Management → Business Insights → Membership Analysis - movement and demographics of the membership base.
- Membership Management → Sales Agents and Sales Agencies - the people and agencies being measured.
- Membership Management → Memberships - where the sales agent is recorded on each membership.
- Membership Management → Club Specification - the sales channels enabled for the club.
