# Security Policy

> **Where:** System Setup → Security Policy
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).

## What this option is for

The Security Policy screen holds the security rules that apply to every user of your organization, across all of your companies.
Today it has one rule: whether every user must sign in with two-factor authentication, that is a 6-digit code from an authenticator app on their phone in addition to their password or single sign-on.
Without a policy, two-factor authentication is a personal choice each user makes under their own Profile, and only administrators (the Tenant Admin role and the platform's system administrators) are obliged to use it.
Staff come here when management decides that a password alone is no longer enough for anyone, typically before an audit or after a security review, and when they want to announce that change with a start date.

## The screen at a glance

[Screenshot: Security Policy screen]

- One section card, **Two-factor authentication**, with a chevron that folds it to its header.
- A switch, **Require two-factor authentication for all users**, with an (i) that opens the full explanation.
- When the switch is on, a **Start date** block appears with a **Required from** date field.
- A blue note under the switch states the expected result before you save: how many of your users have not set up two-factor authentication yet, and exactly what will happen to them.
- A **Save** bar docks at the bottom of the screen as soon as you change something, with **Discard changes** beside it; it disappears again once you save.
- The Book icon at the top right opens this guide.

## Common tasks

### Require two-factor authentication for everyone

[Screenshot: the switch on, with the start date and the expected-result note]

1. Turn on **Require two-factor authentication for all users**.
   The note below updates at once, for example "8 of 12 users have not set up two-factor authentication. Each will be asked to set it up at their next sign-in, and none can turn it off while the policy is on."
2. Decide when it starts.
   Leave **Required from** blank to start now, or pick a date to give staff notice first; the note then says "from" that date.
3. Click **Save**.

From the start date, every user without two-factor authentication is taken to the setup screen the next time they sign in, whether by password, Google or Microsoft, and also when they switch into one of your companies.
They scan a QR code with an authenticator app, enter the code it shows, and receive their recovery codes; the system then signs them in as usual.
Users who already have it on are not interrupted.

### Give staff notice before it starts

1. Turn the switch on and pick a future **Required from** date.
2. Click **Save**.

Nothing changes for users until that date.
Tell your staff the date and point them to **Profile → Security**, where they can set up two-factor authentication early and avoid the forced setup on the day.

### Make two-factor authentication optional again

1. Turn off **Require two-factor authentication for all users**.
   The date field disappears and the note explains that users keep two-factor authentication as a personal choice.
2. Click **Save**.

Users who already set it up keep it; they may now turn it off themselves under Profile → Security with a current code.
Administrators stay obliged to use it whatever the switch says.

### Discard unsaved changes

- Click **Discard changes** in the save bar to put the screen back to what is saved.
- If you try to leave the screen, use the browser's Back button or refresh with unsaved changes, the system asks whether to discard them or keep editing.

## Field reference

### Two-factor authentication

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Require two-factor authentication for all users** | No | On = every user of your organization must sign in with an authenticator code and cannot turn it off; off = each user decides for themselves. | Administrators are required regardless of this switch. |
| **Required from** | No | The date the requirement starts, so staff can be told first, for example `2026-11-01`. Blank = from the next sign-in. | Only shown while the switch is on; pick from the calendar; a date in the past behaves like "now"; it is cleared automatically when you turn the switch off. |

## Tips & troubleshooting

- Read the blue note before you save.
  It is the number of people who will be stopped at their next sign-in and asked to set up an authenticator app, so announce it, give a start date, and have your help desk ready for recovery questions.
- A user who loses their phone uses a recovery code to get in, or asks you to reset their two-factor authentication under **User Management**; the policy then asks them to set it up again at their next sign-in.
- If a user says they cannot turn two-factor authentication off under Profile → Security, that is the policy working: the Disable button is replaced by a **Required** tag and the system refuses with "Your organisation requires two-factor authentication for every user, so it cannot be disabled."
- If a red note says two-factor authentication is not available on this platform yet, the platform has not been set up for it; you can still save the policy, but nobody is asked to enrol until your platform administrator enables two-factor authentication.
- If you see "Your account could not be resolved", you opened the screen from the System Administration workspace; switch to one of your companies and try again.
- If you see "mfaRequiredFrom must be a date (YYYY-MM-DD)", the date was not picked from the calendar; clear the field and pick the date again.

## Related options

- **Profile → Security** - where each user sets up, and if the policy allows, turns off two-factor authentication, and where they see whether it is required for them.
- **System Setup → User Management** - reset a user's two-factor authentication when they lose their authenticator.
- **System Setup → Role Management** - which roles may open this screen.
