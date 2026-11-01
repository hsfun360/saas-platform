# Access Requests

> **Where:** System Setup → Access Requests
>
> **Who can use it:** users whose role includes this screen (your organization's administrators, including the Tenant Admin); whoever holds it is the approver, and is notified when a request arrives.

## What this option is for

Some roles are locked to your registered workstations under Role Management, so their holders can sign in only from the front-desk computers you registered under Security Policy.
When one of them needs to work from somewhere else, a laptop at home for instance, they ask for remote access from the sign-in screen instead of being turned away.
The request lands here, and on the bell and in the mailbox of every approver.
You approve it for a number of days, decline it with a note, or grant access in advance to someone you know will be away.
A grant lifts only the workstation rule: the person still signs in with their password and their two-factor code, so a stolen password alone gets nobody in.
Grants end on their own, can be revoked early, and never last longer than the ceiling set under Security Policy.

## The screen at a glance

[Screenshot: Access Requests screen with one request waiting and one grant in force]

- Three section cards, each with a chevron that folds it to its header: **Requests waiting**, **Grants in force** and **History** (folded to start with).
- Each request shows who is asking, the device and address they asked from, their reason, and when they asked, with **Approve** and **Decline** buttons.
- Each grant in force shows who may sign in from anywhere, who approved it, any note, and the window from and until, with a **Revoke** button.
- History lists declined, revoked and expired entries, the most recent fifty.
- A **Grant remote access** button floats at the bottom right for grants made in advance.
- The Book icon at the top right opens this guide.

## Common tasks

### Approve a request

[Screenshot: the Approve dialog with the days field and the expected-result note]

1. Read the request. If the device, the address or the reason looks unfamiliar, phone the person before you decide.
2. Click **Approve**.
3. Enter the number of **Days**; the field starts at 7 or at your ceiling, whichever is lower, and cannot exceed the ceiling set under Security Policy.
4. Add a **Note to the person** if you want to.
   The blue note states exactly until when they may sign in from anywhere.
5. Click **Approve for N days**.

The person is told at once, on the bell and by email, and can sign in from anywhere until the window ends.
Any earlier grant they held ends now, so one window is in force at a time.

### Decline a request

1. Click **Decline**.
2. Add a note if you want the person to know why, then click **Decline**.

The person is told by email and keeps signing in from registered workstations only.

### Grant access before anyone asks

[Screenshot: the Grant remote access drawer]

1. Click **Grant remote access**.
2. Pick the **Person**, type the **Days**, and add a note if you like.
3. Click **Grant for N days**.

The person is told by email.
If they had a request waiting, it is answered by this grant.

### End a grant early

1. In **Grants in force**, click **Revoke** on the person's entry.
2. Read the confirmation and click **Revoke**.

From their next sign-in they are back to registered workstations only.

## Field reference

### Approve / Decline dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Days** | Yes, when approving | How long the person may sign in from anywhere, for example `5`. | A whole number from 1 to the ceiling under Security Policy; the button states the window. |
| **Note to the person** | No | A short message included in the email they receive, for example `Until the clubhouse reopens`. | Up to 500 characters. |

### Grant remote access drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Person** | Yes | Start typing a name or email and pick from the list of people in your organization. | Anyone in your organization; a grant to someone whose role is not locked changes nothing for them. |
| **Days** | Yes | How long the grant lasts. | A whole number from 1 to the ceiling under Security Policy. |
| **Note to the person** | No | A short message included in their email. | Up to 500 characters. |

## Tips & troubleshooting

- You do not need to stay on this screen: a new request rings the bell at the top and emails you, and the bell entry opens this screen.
- Approving is not the same as trusting the device: the person is still asked for their password and their two-factor code wherever they sign in.
- To change the longest window you can give, go to **Security Policy**, Registered workstations, **Longest grant, in days**.
- If a person says they still cannot sign in after approval, check that the grant is listed under **Grants in force** and that its window has started; a revoked or expired grant moves to History.
- If you see "That request is no longer waiting for a decision", another approver got to it first; the list refreshes with the outcome.
- If you see "Days must be a whole number from 1 to N", the ceiling under Security Policy is N; enter a smaller number or raise the ceiling there.

## Related options

- **System Setup → Role Management** - which roles are locked to registered workstations, and which roles may open this screen.
- **System Setup → Security Policy** - register workstations and set the longest grant an approver may give.
