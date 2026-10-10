# User Manuals

End-user manuals for the platform's screens, generated with the `/user-manual` skill.
Each manual is also published as an in-app guide: a static copy lives at `apps/web/public/help/<route-slug>.md` and is listed in `apps/web/public/help/index.json`, which makes the Book icon appear in the header on that screen.

## General (every user)

- [My Dashboard](general/my-dashboard.md) - the personal home page: star-pinned Quick access grouped by system, recent screens, and guides.

## SaaS Administration

- [Countries](saas-administration/countries.md) - the country reference list behind every country picker.
- [Subscriber Management](saas-administration/admin-subscribers.md) - Provision subscribers with their first Tenant Admin, plan and modules; edit name, plan, status and timezone; recover a company's Tenant Admin.
- [Platform Users](saas-administration/admin-platform-users.md) - Local sign-in accounts for platform staff: create, edit, activate or deactivate (roles are granted on Assign Role).
- [System Roles](saas-administration/admin-system-roles.md) - Platform access levels: menu permissions with Create/Edit/Delete flags and a data scope, built with the shared permission picker.
- [Assign Role](saas-administration/admin-system-setup.md) - Grant one system role to a platform user and review current assignments.
- [Unverified Registrations](saas-administration/admin-unverified-users.md) - Review and permanently delete registrations that never activated, freeing their email addresses; stale ones pre-selected, protected ones skipped.
- [Audit Log](saas-administration/admin-audit-log.md) - Read-only, append-only trail of every create, update and delete across the platform, with filters and field-by-field diffs.
- [Tenant Modules & Menus](saas-administration/admin-modules-menus.md) - Subscriber product catalogue: modules with frozen codes and their nested, draggable menu trees with translations.
- [Platform Modules & Menus](saas-administration/admin-platform-menus.md) - The platform's own staff-screen catalogue: platform modules and the menus grantable to system roles.
- [Platform Profile](saas-administration/admin-platform-profile.md) - The platform's company of record: invoice issuer identity, logo, address, tax country, base currency, default tax scheme, LHDN issuer details and a charge-tax tester.
- [Platform Tax](saas-administration/admin-platform-tax.md) - Platform-owned per-country tax schemes with effective-dated rate lines; taxes platform charges and is the starter catalogue subscribers load from.
- [Email Templates](saas-administration/admin-email-templates.md) - The fixed catalogue of platform emails: edit wording with merge fields, brand colour and logo, preview, test send, enable and tenant-override.
- [Currencies](saas-administration/admin-currencies.md) - ISO 4217 currency reference behind every currency picker: load the bundled set, add, edit, enable or disable.
- [Languages](saas-administration/admin-languages.md) - Language reference behind pickers and Translations sections: load the bundled set, add, edit, enable or disable.
- [e-Invoice Classification Codes](saas-administration/admin-e-invoice-classification-codes.md) - LHDN MyInvois classification codes for invoice lines, synced from LHDN with manual additions and enable/disable.
- [e-Invoice Document Types](saas-administration/admin-e-invoice-document-types.md) - LHDN MyInvois document type codes (invoice, credit/debit/refund note and self-billed variants), synced from LHDN.
- [e-Invoice MSIC Codes](saas-administration/admin-e-invoice-msic-codes.md) - LHDN MSIC 2008 business-activity codes with their A-U sections, synced from LHDN; feeds the Platform Profile MSIC picker.
- [e-Invoice Payment Methods](saas-administration/admin-e-invoice-payment-methods.md) - LHDN MyInvois payment method codes stamped on e-Invoices, synced from LHDN.
- [e-Invoice State Codes](saas-administration/admin-e-invoice-state-codes.md) - LHDN MyInvois Malaysian state codes for e-Invoice addresses, synced from LHDN.
- [e-Invoice Tax Types](saas-administration/admin-e-invoice-tax-types.md) - LHDN MyInvois tax type labels for e-Invoice tax amounts (separate from tax schemes), synced from LHDN.
- [e-Invoice Unit Types](saas-administration/admin-e-invoice-unit-types.md) - LHDN MyInvois UN/ECE Rec 20 unit-of-measure codes for e-Invoice quantities, synced from LHDN.

## System Setup

- [Companies](system-setup/companies.md) - the business entities under the subscription: details, modules, per-company email (SMTP) and weekend days.
- [User Management](system-setup/admin-users.md) - Create users, invite collaborators, edit profiles, place people in companies with role/department/position, revoke invitations.
- [Role Management](system-setup/admin-roles.md) - Define roles: menu permissions with Create/Edit/Delete per screen, plus the own/department/all data scope.
- [Departments](system-setup/admin-departments.md) - Organization-wide department list assigned to staff per company; drives the Department data scope.
- [Positions](system-setup/admin-positions.md) - Seniority ladder (rank = seniority) assigned to staff; Load defaults seeds Staff/Supervisor/Manager.
- [Tax Setup](system-setup/admin-tax-schemes.md) - Organization tax catalogue per country: schemes, effective-dated rate lines, stacking by priority, Load defaults from the platform.
- [Company Tax](system-setup/admin-company-tax.md) - Per company: switch tax schemes off and override the GL account per tax component.
- [Public Holidays](system-setup/admin-public-holidays.md) - Holiday calendar per country your companies operate in; single-country organizations never see a country picker.
- [Currencies](system-setup/admin-account-currencies.md) - Choose which platform currencies your organization uses and star the default offered to companies.
- [Languages](system-setup/admin-account-languages.md) - Enable the languages your users may choose and set the default/fallback language.
- [Email Templates](system-setup/admin-account-email-templates.md) - Customise the wording and brand colour of system emails, shared or per company, with live preview and test send.
- [Audit Log](system-setup/admin-account-audit-log.md) - Read-only trail of every create, update and delete your staff made, with field-by-field before/after values.
- [Workflow Setup](system-setup/admin-workflows.md) - Design approval chains per document type: ordered steps, approver rules, quorum, conditions, SLA reminder or escalation, preview.
- [Salutations](system-setup/admin-salutations.md) - Organization-wide salutation list (Mr, Mrs, Datuk) picked on member records.
- [Titles](system-setup/admin-titles.md) - Honorifics (Datuk, Tan Sri, Sir), optionally tied to a country; universal titles reach every company.
- [Races](system-setup/admin-races.md) - Organization-wide race/ethnicity list picked on member records.
- [Nationalities](system-setup/admin-nationalities.md) - Organization-wide nationality list picked on member records (kept separate from Countries).
- [Industry Types](system-setup/admin-industry-types.md) - Organization-wide industry classification picked on memberships and member records.

## Account Receivable

- [Analysis Setup](account-receivable/ar-analysis.md) - the financial-analysis dimensions documents are tagged with: the six stamped slots, which modules each applies to, and parent/child dimension hierarchies.
- [Invoices](account-receivable/ar-invoices.md) - Raise manual invoices against any debtor, save as Open drafts, submit for posting or approval, void drafts and raise credit notes against posted invoices.
- [Debit Notes](account-receivable/ar-debit-notes.md) - Charge a debtor more with a debit note: draft, submit or approve, and correct posted notes with a credit note.
- [Credit Notes](account-receivable/ar-credit-notes.md) - Reduce what a debtor owes, applied against an open invoice or debit note or left as available credit.
- [Official Receipts](account-receivable/ar-receipts.md) - Record debtor payments by payment method, collect billed deposits, and settle open items oldest first on posting.
- [Refunds](account-receivable/ar-refunds.md) - Pay back a deposit or excess payment, or apply a held deposit to outstanding through a credit note, with approval routing for money out.
- [Deposits](account-receivable/ar-deposits.md) - Bill security deposits as collateral, open them for collection via official receipt, and follow their held balance.
- [Interest Documents](account-receivable/ar-interests.md) - Read-only list of system-posted late-payment interest charges with their overdue-document breakdown and credit note correction.
- [Debtor Listing](account-receivable/ar-debtors.md) - Every ledger account in one list with credit terms, outstanding and status; maintain Other Debtors and open the account page to key or void documents.
- [Exchange Rates](account-receivable/ar-exchange-rates.md) - Effective-dated foreign-currency rates against the base currency that default onto documents on foreign-currency accounts.
- [Interest Generation](account-receivable/ar-interest-generation.md) - Compute a month's late-payment interest into a holding list, review and exclude lines per debtor, then post selectively.
- [Numbering Control](account-receivable/ar-numbering.md) - Automatic or manual numbering for every AR document series, with format tokens, padding, reset rules and copy from another company.
- [AR Specification](account-receivable/ar-settings.md) - Company-wide AR options: statement cutoff and aging buckets, statement PDF layout, Membership integration and multi-currency.
- [Statement Generation](account-receivable/ar-statement-generation.md) - Generate a month's statements of account in the background with a scope preview, live progress, cancel and resume.
- [Statement Listing](account-receivable/ar-statements.md) - View, download as PDF and void the frozen statements of account produced per debtor per month.
- [Transaction Type](account-receivable/ar-transaction-types.md) - The AR catalog of billing items and payment methods by document class, with tax scheme, module usability, interest flag and e-Invoice code.

## Golf Management

- [Unit Courses](golf-management/golf-unit-courses.md) - the 9-hole building blocks: holes (par/HCP) and tee boxes (colours + per-hole distances).
- [Golf Specification](golf-management/golf-settings.md) - the club-wide golf rules: advance window, booking limits and sessions, minimum players, guest control, handicap control, cancellation notice + no-show penalty, tee-sheet colours.
- [No-show Charges](golf-management/golf-no-show-charges.md) - the penalties raised against bookers for no-shows and late cancellations: post pending charges to the account or waive them.
- [Transaction Type](golf-management/golf-transaction-types.md) - the golf billing-item catalog: charge types, tax scheme, Default Price cards, golfer-type defaults, packages and their eligibility conditions.
- [Tee Time Sheet](golf-management/golf-tee-time-sheet.md) - the Front Desk's play-day view: register booked players, groups and walk-ins, bill from the tiles, settle, record no-shows.
- [Group Bookings](golf-management/golf-group-bookings.md) - tournaments and group outings: play days and start formats, reserved flights, roster and draw, the group bill and proforma, deposits, final settlement and refund requests.
- [Golf Booking](golf-management/golf-bookings.md) - Take advance tee-time bookings for members in three steps (member check, nearest available flights, held flight and players), and cancel bookings with the notice-period charge or refusal shown before you confirm.
- [Course Closure](golf-management/golf-closures.md) - Close a nine for maintenance or tournaments over a date period and day scope, generate and review the per-day closure rows, and enable or disable plans.
- [Courses](golf-management/golf-courses.md) - Pair two nines into an 18-hole course (plus alternate and night nines, cross over time, picture), and maintain each course's tee-time sets and generated flight times with Front desk / X-over roles.
- [Golfers](golf-management/golf-golfers.md) - Every member and public golfer identity, with the golf-owned handicap index, handicap status and remarks the Handicap Control rules read.
- [Numbering Control](golf-management/golf-numbering.md) - How the six golf document series (Booking, Registration, Bill, Rain Check, Proforma, Refund Request) are numbered: auto-generate format and counter or manual entry, plus copy from another company.
- [Payment Type](golf-management/golf-payment-types.md) - The settlement-tender catalog for golf bills - code, payment class (Cash, Member, Debtor, Deposit, etc.), description and tile icon; enable or disable.

## Membership Management

- [Club Specification](membership-management/membership-settings.md) - The club's one-off declaration: club type, committee vs commercial, sales channels, credit facility, membership numbering and the nominee/dependent number suffixes.
- [Membership Status](membership-management/membership-statuses.md) - The status master: lifecycle class, Action and Charge controls, colour, enable/disable, first-time copy from a sibling company.
- [Membership Type](membership-management/membership-types.md) - Membership categories: class, rights, term, defaults and conversions, plus the Joining fees and Standing charges dialogs.
- [Membership Fee](membership-management/membership-fees.md) - Recurring fee definitions: amount, tax scheme, AR billing item, and the generate-then-edit installment schedule.
- [Transaction Type](membership-management/membership-transaction-types.md) - Read-only view of the AR billing-item catalog entries opened to Membership (maintained on Account Receivable → Transaction Type).
- [Numbering Control](membership-management/membership-numbering.md) - The Membership No. series: auto-generate vs manual, prefix/format/tokens/padding/reset, and copying a configuration from another company.
- [Sales Agencies](membership-management/membership-sales-agencies.md) - The outsourced agency companies that sell memberships: code, name, office address, contact, enable/disable.
- [Sales Agents](membership-management/membership-sales-agents.md) - Every salesperson by kind (agency staff, external, internal), with the invite-to-portal-login flow.
- [Memberships](membership-management/membership-memberships.md) - The core CRM: creating individual and corporate memberships, editing, the Members dialog (nominees, dependents, edit, photo), addresses and credit terms.
- [Members](membership-management/membership-members.md) - The read-only server-side search across every person (individual members, nominees, dependents) with kind and status filters.
- [Billing Schedules](membership-management/membership-billing.md) - The monthly Membership Fee and Subscription Fee runs: generate the holding list, review and skip, post one Invoice per item, cancel; includes the review detail.
- [Membership Import](membership-management/membership-import.md) - Excel upload of memberships and members into staging, review with inline issues, selective migration, batch delete; includes the batch detail and the template columns.
- [Membership Type Import](membership-management/membership-type-import.md) - Excel upload of membership types into staging, review, selective migration (joining fees and standing charges excluded); includes the batch detail.
- [Membership Analysis](membership-management/membership-membership-analysis.md) - Business Insights: KPIs, movement, status/type/age/country/nationality charts, and the click-through drill-down panel.
- [Agent Performance](membership-management/membership-agent-performance.md) - Business Insights: memberships closed per channel and agent, monthly stacked trend, leaderboard, and the drill-down panel.
