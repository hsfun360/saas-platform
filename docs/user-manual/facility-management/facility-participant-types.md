# Participant Types

> **Where:** Facility Management → Participant Types
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New participant type button needs the Create permission for this screen; Edit and Enable/Disable need the Edit permission; Delete needs the Delete permission as well as Edit.

## What this option is for

The Participant Types screen maintains the categories a person taking part in a facility booking can be.
Every club starts with three system types - **member**, **member-guest** (Member as Guest) and **guest** (Guest / Visitor) - and can add its own, such as a junior or a corporate guest that is priced differently.
The code of a participant type is the key the fee rate cards price by and the label every participant line on a booking carries.
Each type also has a **base identity** that tells the system how to treat the person: as a member, as a member joining another member's booking, or as a visitor.

## The screen at a glance

[Screenshot: Participant Types list]

- A count line shows how many participant types exist and how many are active.
- A search box filters the list as you type; it matches the code, the description and the base identity.
  When nothing matches, the screen says so and offers a **Clear search** button.
- Each participant type is a card titled with its code and description, with a chip for its base identity, a **System** chip on the three system types, and the note "Bookings need approval" when that option is ticked.
- A status chip at the top right shows **Active** or **Disabled**.
- The three system types are listed first, then active types before disabled ones, then by sort order and code.
- Each card has an **Edit** button; a club-defined type also has a ⋮ menu holding **Enable** or **Disable** and **Delete**.
  A system type has Edit only: it always stays active and cannot be deleted.
- A card shows no buttons when the record lies outside your role's data scope.
- The **New participant type** button floats at the bottom right of the screen.

## Common tasks

### Add a new participant type

[Screenshot: New participant type dialog]

1. Click **New participant type**.
2. Enter the **Code** (e.g. `JUNIOR`); it is stored in capitals and becomes a row on every fee rate card.
3. Pick the **Base Identity**; a line under the field explains what the choice means for the participant.
4. Enter the **Description** (e.g. `Junior member`) and, if you wish, change the **Sort Order**.
5. Tick **Bookings with a participant of this type need approval** if such bookings must be approved before they stand.
6. Click **Save**.

The new type appears in the list as Active and is offered where staff pick a participant type on Facility Bookings and the Control Station.
Remember to give it a price on the fee rate cards under Transaction Types.

### Edit a participant type

1. Find the participant type (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   On a system type the **Code** and the **Base Identity** are locked, because the rate cards and every participant line already carry that code; you can change its description, sort order and the approval option.
   On a club-defined type the code and the base identity can be changed only while no transaction type default and no rate card cell uses the type.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a participant type

- Open the card's ⋮ menu and click **Disable** to retire a club-defined type you no longer use.
  It stays on this screen marked **Disabled**, and it is no longer offered when staff pick a participant type on Facility Bookings and the Control Station.
- Open the ⋮ menu and click **Enable** to bring it back.
- The three system types cannot be disabled.

### Delete a participant type

[Screenshot: Delete participant type confirmation]

1. Open the ⋮ menu of a club-defined type and click **Delete**.
2. The system asks you to confirm and reminds you that the delete is refused while a transaction type default or a rate card cell still uses the type.
3. Click **Delete participant type** to go ahead.

Delete is for a type created by mistake.
For a type that has been used, disable it instead so that history is kept.

## Field reference

### New / Edit participant type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code for the category, e.g. `JUNIOR`. It is the key the fee rate cards price by. | Up to 20 characters; letters, digits, underscores and hyphens only, starting with a letter or a digit; stored in capitals; must be unique in your company. Locked on a system type. |
| **Base Identity** | Yes | How the system treats the participant. **Member** - a member of this club: standing, the per-type slots-per-day limit and the booking window apply, and the person books in advance. **Member as Guest** - a member joining another member's booking: member standing, but the guest-control answer for members as guests applies and the host's guest cap counts them. **Guest / Visitor** - a visitor with no standing: guest control, the host's guest cap and the host's monthly guest allowance apply, and the person may be registered at the station. | Pick one of the three choices. Locked on a system type; on a club-defined type it cannot change once the type is in use. |
| **Description** | Yes | The name staff see beside the code, e.g. `Junior member`. | Up to 255 characters. |
| **Sort Order** | Yes | The position of the type in lists; lower numbers come first, after the three system types. | A whole number from 1 to 999; starts at 100. |
| **Bookings with a participant of this type need approval** | No | Tick to hold a booking that includes a participant of this type until it is approved. The booking follows the approval chain set up for Facility booking under Workflow Setup; when no chain is set up it is approved at once. | Not ticked at first. |

## Tips & troubleshooting

- If you see "Participant type 'X' already exists." another participant type in your company already uses that code; pick a different code.
- If you see "Participant type 'X' is used by ... - its code cannot change." or "... - its base identity cannot change." a transaction type default or a rate card cell already uses the type; the message says how many.
  Leave the code and base identity as they are, or create a new type.
- If you see "Participant type 'X' is used by ... - disable it instead." the type cannot be deleted because it is in use; use **Disable**.
- If you see "Code is required.", "Use letters, digits, underscores and hyphens only." or "Use 20 characters or fewer." correct the Code box.
- If you see "Description is required (255 characters or fewer)." or "Select the base identity." complete that field.
- If you see "Enter a whole number between 1 and 999." or "Sort order must be a whole number between 1 and 999." correct the Sort Order.
- If you see "Your role's data scope does not allow amending this record." the participant type was created by someone outside your data scope; ask the record's owner or an administrator.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- The three system types keep lower-case codes (`member`, `member-guest`, `guest`); the codes you create are always stored in capitals.
- Choose the base identity with care: it decides which guest rules, limits and allowances apply, while the code only decides the price row.

## Related options

- Facility Management → Transaction Types - the fee rate cards priced per participant type, and the default fee item of a participant type.
- Facility Management → Facility Bookings - where each participant on a booking is given a participant type.
- Facility Management → Control Station - where guests are registered with a participant type on arrival.
- Facility Management → Facility Specification - the guest-control answers that apply to the guest base identities.
- System Setup → Workflow Setup - the approval chain a booking follows when a participant type needs approval.
