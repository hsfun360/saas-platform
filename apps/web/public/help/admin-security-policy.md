# Security Policy

> **Where:** System Setup → Security Policy
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).

## What this option is for

The Security Policy screen holds the security rules that apply to every user of your organization, across all of your companies.
It has three rules today.
The first is whether every user must sign in with two-factor authentication, that is a 6-digit code from an authenticator app on their phone in addition to their password or single sign-on.
Without a policy, two-factor authentication is a personal choice each user makes under their own Profile, and only administrators (the Tenant Admin role and the platform's system administrators) are obliged to use it.
The second is whether a user who has entered their code may tick "Don't ask again on this device", and for how many days that browser then skips the code.
The third is whether your registered workstations, the shared front-desk computers an administrator has registered here, let staff give their password only, so a receptionist is not asked for a code at every shift change.
Staff come here when management decides that a password alone is no longer enough for anyone, typically before an audit or after a security review, when they want to announce that change with a start date, when they want to tighten how long a trusted browser may skip the code, and when they set up or retire a shared front-desk computer.

## The screen at a glance

[Screenshot: Security Policy screen]

- Two section cards, each with a chevron that folds it to its header: **Two-factor authentication** holds every rule about the code, and **Registered workstations** every rule about the place staff sign in from.
- A switch, **Require two-factor authentication for all users**, with an (i) that opens the full explanation.
- When the switch is on, a **Start date** block appears with a **Required from** date field.
- A blue note under the switch states the expected result before you save: how many of your users have not set up two-factor authentication yet, and exactly what will happen to them.
- Below a divider, a second switch, **Allow "Don't ask again on this device"**, with its own (i); when it is on, a **Days a device stays trusted** field appears.
- A second blue note states how many devices currently skip the code and what your change will do to them.
  While two-factor authentication is optional, this note and the next open by saying whom they cover: only the users who sign in with a code.
- Below another divider, a third switch, **Registered workstations skip the two-factor code for staff**, with its (i) and a blue note stating what Save will do to the stations registered in the card below.
- In the **Registered workstations** card, a **Workstations** block: the list of registered workstations (name, device, who registered it, dates, a **This workstation** tag on the computer you are sitting at) each with a **Revoke** button, and a **Register this workstation** button.
- Below it, a **Roles locked to these workstations** block: a line saying how many roles sign in only from a station (set under Role Management) or that none is locked yet, then **Longest remote-access grant, in days** and a blue note stating how many grants are in force and how many requests wait.
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

### Shorten how long a trusted device skips the code

[Screenshot: the trusted-devices switch on, with the days field and its note]

1. Under **Allow "Don't ask again on this device"**, change **Days a device stays trusted**, for example from 30 to 7.
   The note updates at once, for example "5 trusted devices currently skip the code. Any device trusted more than 7 days ago will be asked for a code at its next sign-in; devices trusted from now on skip it for 7 days."
2. Click **Save**.

The new window applies immediately, including to browsers your users trusted earlier: any of them trusted longer ago than the new number of days is asked for a code at its next sign-in.
Lengthening the window does the opposite only for new trust: devices already trusted keep the window they were given.

### Stop devices skipping the code altogether

1. Turn off **Allow "Don't ask again on this device"**.
   The days field disappears and the note says how many devices currently skipping the code will be asked for one at their next sign-in.
2. Click **Save**.

From then on the "Don't ask again on this device" box is no longer shown on the verification-code step, the step after the password where the code is entered, and every sign-in to your companies asks for the code.
The number of days you had chosen is kept, so turning the switch back on later restores it.

### Register a shared front-desk computer

[Screenshot: the Registered workstations card with one station and the register drawer]

1. Sit at the computer you want to register and sign in there with an account that can open this screen.
   The registration is tied to the browser you are using, so it cannot be done from somewhere else.
2. In **Registered workstations**, click **Register this workstation**.
3. Type a name staff will recognise, for example `Front Desk 1`, and click **Register**.
   The station appears in the list with the **This workstation** tag.
4. If the switch **Registered workstations skip the two-factor code for staff**, under **Two-factor authentication**, is still off, turn it on and click **Save**.
   The blue note tells you how many stations will start skipping the code.

From then on, staff who sign in from that computer give their password only.
Administrators are still asked for a code there, and everyone is still asked for a code from any other computer or phone, so each staff member still needs their authenticator app for work from home.
A registration lasts one year; registering the same browser again replaces its earlier registration and restarts the year.

### Retire a front-desk computer

1. Find the station in the list and click **Revoke**.
2. Read the confirmation, which says staff signing in from it will be asked for a code again, and click **Revoke**.

Revoking takes effect at the next sign-in from that computer.
Turning the switch under **Two-factor authentication** off instead keeps every registration and stops all of them skipping the code at once; turning it back on later restores them.
The registrations still count for roles locked to them while the switch is off: the switch governs the code only, not the place.
If any role is locked to registered workstations (see **Role Management**), revoking the last station shuts those people out until a station is registered again; the line under **Roles locked to these workstations** warns you.

### Set the longest remote-access grant

1. Under **Roles locked to these workstations**, change **Longest remote-access grant, in days**, for example from 30 to 7.
   The note states how many grants are in force; they keep their windows.
2. Click **Save**.

From then on an approver under **Access Requests** can give at most that many days to a person locked to registered workstations who asks to sign in from elsewhere.

### Discard unsaved changes

- Click **Discard changes** in the save bar to put the screen back to what is saved.
- If you try to leave the screen, use the browser's Back button or refresh with unsaved changes, the system asks whether to discard them or keep editing.

## Field reference

### Two-factor authentication

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Require two-factor authentication for all users** | No | On = every user of your organization must sign in with an authenticator code and cannot turn it off; off = each user decides for themselves. | Administrators are required regardless of this switch. |
| **Required from** | No | The date the requirement starts, so staff can be told first, for example `2026-11-01`. Blank = from the next sign-in. | Only shown while the switch is on; pick from the calendar; a date in the past behaves like "now"; it is cleared automatically when you turn the switch off. |
| **Allow "Don't ask again on this device"** | No | On = a user who enters their code may tick the box under the code field on the verification-code step, and that browser then skips the code for the number of days below; off = the box is not offered and every sign-in asks for the code. | The password is always required; only the code is skipped. Turning it off also stops devices trusted earlier from skipping the code. |
| **Days a device stays trusted** | Yes, while the switch is on | A whole number of days from 1 to 90, for example `7`. The platform default is 30. | Only shown while the switch is on; shortening it applies to devices already trusted; the value is kept while the switch is off. |
| **Registered workstations skip the two-factor code for staff** | No | On = staff who sign in from a registered workstation give their password only; off = staff confirm a code at the desk too and the registrations are kept. | Administrators are asked for a code everywhere whatever this switch says; nobody is excused from setting up an authenticator; the registrations still count for locked roles while it is off. Off by default. |

### Registered workstations

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Workstation name** (in the register drawer) | Yes | A name staff recognise, for example `Front Desk 1`, up to 100 characters. | Must be unique among your registered workstations; the registration is tied to the browser you register from and lasts one year. |
| **Longest remote-access grant, in days** | Yes | The most days an approver may give someone locked to registered workstations to sign in from elsewhere, for example `7`. The platform default is 30. | A whole number from 1 to 90; shortening it does not cut grants already in force. |

## Tips & troubleshooting

- Read the blue notes before you save.
  The first is the number of people who will be stopped at their next sign-in and asked to set up an authenticator app, so announce it, give a start date, and have your help desk ready for recovery questions.
  The second is the number of browsers that will start asking for a code again.
- A user who loses their phone uses a recovery code to get in, or asks you to reset their two-factor authentication under **User Management**; the policy then asks them to set it up again at their next sign-in.
- A user who no longer recognises a trusted browser, or who used a shared computer, removes it themselves under **Profile → Security → Trusted devices**; you do not need to change the policy for one person.
- Do not ask staff to tick "Don't ask again on this device" on a shared front-desk computer: that trusts the computer for one person and lets anyone who learns their password sign in as them from that desk.
  Register the computer as a workstation instead; the station, not the person, is then trusted.
- If staff at a registered workstation are still asked for a code, check that the switch **Registered workstations skip the two-factor code for staff** under **Two-factor authentication** is on and saved, that the station is still in the list (registrations expire after a year), and that the person is not an administrator, who is always asked.
  If the browser's cookies were cleared or the staff use a different browser on the same computer, register it again from that browser.
- "Don't ask again on this device" is not offered on a registered workstation; that is intended.
- To keep a role on the premises altogether, lock it under **System Setup → Role Management** with **Sign in only from registered workstations**; its holders are then refused from any other computer or phone, whether or not the skip switch is on.
- The two cards are two different questions: **Two-factor authentication** decides who must sign in with a code and where it may be skipped; **Registered workstations** decides where locked roles may sign in from and how long an exception may last.
  The intended front-desk setup uses both: require two-factor authentication, let registered workstations skip the code, and lock the front-desk role, so the desk needs a password only and home needs the password, the code and a grant.
- If you see "A workstation named ... is already registered", pick another name or revoke the old station first.
- If a user says they cannot turn two-factor authentication off under Profile → Security, that is the policy working: the Disable button is replaced by a **Required** tag and the system refuses with "Your organisation requires two-factor authentication for every user, so it cannot be disabled."
- If a user says the "Don't ask again on this device" box is missing from the verification-code step, trusted devices are switched off here for your organization, or they are signing in from a registered workstation, which never offers it. The password page has no such box; "Keep me signed in" there is about the session, not the code.
- If a red note says two-factor authentication is not available on this platform yet, the platform has not been set up for it; you can still save the policy, but nobody is asked to enrol until your platform administrator enables two-factor authentication.
- If you see "Your account could not be resolved", you opened the screen from the System Administration workspace; switch to one of your companies and try again.
- If you see "mfaRequiredFrom must be a date (YYYY-MM-DD)", the date was not picked from the calendar; clear the field and pick the date again.
- If you see "Days a device stays trusted must be a whole number from 1 to 90", correct the number; decimals and blanks are refused.

## Related options

- **Profile → Security** - where each user sets up, and if the policy allows, turns off two-factor authentication, sees whether it is required for them, and reviews and removes their own trusted devices.
- **System Setup → User Management** - reset a user's two-factor authentication when they lose their authenticator.
- **System Setup → Role Management** - which roles may open this screen, and which roles are locked to registered workstations.
- **System Setup → Access Requests** - approve, decline, grant and revoke remote access for people in locked roles.
