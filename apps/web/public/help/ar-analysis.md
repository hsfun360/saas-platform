# Analysis Setup

> **Where:** Account Receivable → Common Setup → Analysis Setup
>
> **Who can use it:** users whose role includes the Account Receivable module.

## What this option is for

Analysis Setup is where you decide how your documents are broken down for financial analysis.
You define the dimensions your club analyses by, such as Department, Project or Division, and you fill each one with the values staff can pick.

These definitions are used when someone raises an invoice, credit note or receipt: the entry screen shows one picker per dimension, and the value chosen is stored on the document forever.
That is what lets you later report revenue by Department, by Project, or by any other dimension you set up here.

Your company can stamp up to six dimensions onto documents at once.
You may define as many dimensions as you like, but only six can carry an Analysis Dimension number, and only numbered ones appear on entry screens.

## The screen at a glance

[Screenshot: Analysis Setup with the dimension list on the left and a selected dimension's options on the right]

- The left side lists your **dimensions**.
  Each card shows the dimension name, then a row of labels: the Analysis Dimension number, the parent dimension if it has one, the modules it applies to, and a red warning when some of its values still need attention.
- Click a dimension card to open its **options** on the right.
  Options are the values staff actually pick, such as `FNB` or `GOLF`.
- The status chip on each card reads **Active** or **Disabled**.
  A disabled dimension or option disappears from entry screens but stays on every document that already used it, so your history and reports never change.
- **New dimension** at the bottom right adds a dimension.
  **New option** at the top of the options pane adds a value to the dimension you have selected.
- Each row has **Edit**, plus a **⋮** menu holding Enable or Disable.
  Nothing here can be deleted, because documents refer to these records.

## Common tasks

### Add a new dimension

[Screenshot: New dimension dialog]

1. Click **New dimension**.
2. Enter the **Name** in your own vocabulary, for example `Department`.
3. Choose an **Analysis Dimension** number.
   Pick one of the six slots to have this dimension appear on entry screens, or leave it as *Catalog only* to define it now and start using it later.
   Numbers already taken are shown with the dimension holding them and cannot be selected.
4. Leave **Parent dimension** as *Standalone dimension* unless this is a level under another dimension.
   See "Build a two-level hierarchy" below.
5. Under **Applies to**, tick the modules that should offer this dimension on their entry screens, and tick **Required** beside any module where staff must choose a value before saving.
6. Click **Save**.

The dimension appears in the list straight away, but staff cannot use it until you add options to it.

### Add options to a dimension

1. Click the dimension in the list.
2. Click **New option**.
3. Enter a short **Code** that staff will recognise, for example `FNB`, and a **Description** such as `Food and Beverage`.
4. Click **Save**.

Repeat for every value you need.
Options appear on entry screens immediately.

### Edit a dimension or an option

1. Find the record and click **Edit**.
2. Change what you need, then click **Save**.

Renaming is always safe.
Documents remember which option was chosen, not the words, so correcting a spelling or rewording a description updates every screen and report at once without disturbing history.

One thing cannot be changed: once documents have been analysed under a dimension, its **Analysis Dimension** number is locked.
If you genuinely need a different number, disable the dimension and create a new one.

If you leave a dialog without saving, the system asks whether to discard your changes or keep editing.

### Disable or enable a dimension or option

- Open the **⋮** menu and choose **Disable** to retire something you no longer use.
  It stops appearing on entry screens, while every document that already used it keeps its value.
- Open the same menu and choose **Enable** to bring it back.

Disable rather than trying to delete.
Deleting would strand the documents that refer to the record.

### Choose which modules a dimension applies to

Not every dimension is every department's business.
A dimension you use to track vehicle expenditure has no place on an accounts receivable invoice, and a revenue dimension may matter to several modules at once.

In the dimension dialog, the **Applies to** list shows the modules your company can use this dimension in.
Tick a module to have it offer the dimension on its manual entry screens, and tick **Required** beside that module when staff there must pick a value before saving.

Two points worth knowing:

- **Required is set per module.**
  The same dimension can be compulsory in one module and optional in another.
- **Automatically generated documents are exempt.**
  A fee run or an interest run has no clerk to prompt, so it is never blocked by a Required tick.

If a module you subscribe to is missing from the list, it is not yet able to use analysis dimensions.
The list only offers modules where ticking the box would actually change something.

### Build a two-level hierarchy

Use this when one dimension is a level under another, for example several Departments belonging to one Division.

1. Create the higher level first, for example a `Division` dimension, and add its options such as `OPS` and `COM`.
2. Edit the lower level, for example `Department`, and set **Parent dimension** to `Division`.
3. Save.
   Every existing Department option is now listed under a red **UNASSIGNED** heading, because the system does not yet know which Division each one belongs to.
   Until you assign them, those options do not appear on entry screens.
4. Edit each option in turn and choose its **Division**, then save.
   As you go, the options regroup under their Division heading and the red warning on the dimension card counts down and disappears.

The parent dimension has nothing to do with the Analysis Dimension number.
Division can sit on Dimension 3 while Department sits on Dimension 1.
The numbers are only storage slots; the parent setting is what expresses the relationship.

### What staff see once a hierarchy exists

On an invoice or credit note, the two dimensions work together:

- Choosing the **Division** narrows the **Department** list to that Division's departments only.
- Choosing the **Department** first fills in its Division automatically, because a department belongs to exactly one division.
- Changing the Division to one the chosen Department does not belong to clears the Department, so a mismatched pair can never be saved.

Both values are stored on the document.
That means moving a Department to a different Division next year changes only new documents; last year's reports stay exactly as they were.

## Field reference

### New / Edit dimension

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Name** | Yes | The dimension in your own words, for example `Department` or `Cost Centre`. | Up to 100 characters; must be unique within the company. |
| **Analysis Dimension** | No | The slot this dimension stamps into on documents, or *Catalog only* to define it without using it yet. | One of six slots; numbers already in use are shown with their holder and cannot be picked. Locked once documents use it. |
| **Parent dimension** | No | The dimension this one sits under, for example `Division` for a `Department`. Leave as *Standalone dimension* for a normal, single-level dimension. | The dimension itself and anything already beneath it are not offered, so a loop cannot be created. A parent must be a numbered dimension, not a catalog-only one. |
| **Applies to** (module ticks) | Yes when the dimension has a number | The modules that offer this dimension on their entry screens. | At least one module must be ticked for a numbered dimension. A parent dimension must cover every module its child covers. |
| **Required** (per module) | No | Tick where staff in that module must choose a value before saving. | Only available while the module itself is ticked. Automatically generated documents are always exempt. |

A catalog-only dimension shows no module list, because it is not stamped on documents and so applies nowhere.

### New / Edit option

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **&lt;Parent dimension name&gt;** | Yes, when the dimension has a parent | The parent value this option belongs to, for example the `Division` a `Department` sits in. | Only shown when the dimension has a parent. Until it is set, the option stays off every entry screen. |
| **Code** | Yes | A short code staff recognise, for example `FNB`. | Up to 30 characters; must be unique within this dimension. |
| **Description** | No | The fuller wording, for example `Food and Beverage`. | Up to 255 characters. |

## Tips & troubleshooting

- **"Dimension 'X' already exists."**
  Another dimension already uses that name. Names must be unique within the company.
- **"Option 'X' already exists under 'Y'."**
  That code is already used in this dimension. Codes only need to be unique within their own dimension, so the same code may appear under two different dimensions.
- **"'X' has documents analysed under Dimension N - its dimension number can no longer change."**
  Staff have already tagged documents using this dimension, so its slot is fixed. Disable it and create a new dimension if you need a different number.
- **"Pick at least one module - a dimension stamped on documents must apply somewhere."**
  A dimension with an Analysis Dimension number must apply to at least one module, otherwise it occupies one of your six slots while nothing can ever record it.
- **"'X' does not apply to &lt;module&gt;, so this dimension cannot either."**
  A parent must cover every module its child covers. Add the missing module to the parent first, then save the child.
- **"'X' is catalog only, so it cannot be the parent of a stamped dimension."**
  Give the parent an Analysis Dimension number first. A parent that is never recorded on documents cannot anchor a child that is.
- **"A dimension cannot be its own parent." / "That would make 'X' a descendant of itself."**
  The chosen parent already sits beneath this dimension. Pick a different parent.
- **"Select the &lt;Division&gt; this option belongs to."**
  The dimension has a parent, so every option must say which parent value it belongs to.
- **"&lt;Department&gt; 'X' does not belong to the selected &lt;Division&gt;."**
  Someone is trying to save a document with a mismatched pair. Reselect the Division or the Department so the two agree.
- **Options are missing from an entry screen.**
  Check three things: the option is Active, its dimension is Active and carries an Analysis Dimension number, and, if the dimension has a parent, the option has been assigned to a parent value. Unassigned options are listed under a red heading on this screen.
- **Naming advice.**
  Keep codes short and stable, since staff read them in the pickers, and put the full wording in the description. You can reword a description at any time without affecting history.

## Related options

- **Account Receivable → Invoice**, **Credit Notes**, **Official Receipt** - where staff pick the dimension values while entering documents.
- **System Setup → Companies** - the modules a company subscribes to, which decides what appears in the **Applies to** list.
