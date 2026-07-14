export interface MenuItem {
  Module: any;
  // Menu id (DB UUID, or a synthetic string for code-defined section headers),
  // used to build the sidebar tree from parentId.
  id?: string;
  name: string;
  // Localized menu names keyed by language code (DB Menu.names); the display label
  // resolves names[lang] ?? name at render time.
  names?: Record<string, string>;
  route: string;
  icon?: string;
  moduleName?: string;
  // Localized names of the owning module (DB Module.names), for the apps switcher.
  moduleNames?: Record<string, string>;
  moduleIcon?: string;
  // The owning system's default landing route (Module.landingRoute), carried on
  // each menu so the shell can navigate to a system's dashboard when switching.
  moduleLanding?: string | null;
  // Adjacency-list nesting: parentId null/absent = top level. A menu with
  // children renders as a collapsible sidebar section. `sequence` orders siblings.
  parentId?: string | null;
  sequence?: number;
}

export interface Workspace {
  companyId: string;
  companyName: string;
}

// A workspace the logged-in user can access, plus the role they hold in it.
// Used by the dashboard workspace switcher.
export interface WorkspaceOption {
  companyId: string;
  companyName: string;
  roleName: string;
}

// A pending collaborator invitation, as seen by the inviting Tenant Admin.
export interface CompanyInvitation {
  id: string;
  email: string;
  roleId?: string | null;
  roleName?: string | null;
  status: string;
  expiresAt?: string;
  createdAt?: string;
}

// --- Person-centric User Management (account-wide) ---
export interface AccountCompanyRole {
  id: string;
  name: string;
}

export interface AccountCompany {
  id: string;
  name: string;
  roles: AccountCompanyRole[];
}

export interface PersonMembership {
  companyId: string;
  companyName?: string;
  roleId?: string | null;
  roleName?: string | null;
}

export interface AccountPerson {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  bio?: string;
  profileEditable?: boolean;
  memberships: PersonMembership[];
}

export interface AccountPendingInvite {
  id: string;
  email: string;
  companyId: string;
  companyName?: string;
  roleName?: string | null;
  expiresAt?: string;
}

export interface AccountUsersResponse {
  companies: AccountCompany[];
  people: AccountPerson[];
  invitations: AccountPendingInvite[];
}

// A pending invitation addressed to the logged-in user (the invitee view).
export interface MyInvitation {
  id: string;
  companyId: string;
  companyName?: string;
  subscriberName?: string;
  roleName?: string | null;
  expiresAt?: string;
}

export interface AuthResponse {
  token?: string;
  message: string;
  email?: string;
  menus?: MenuItem[];
  roleName?: string;
  fullName?: string;
  profilePicture?: string;
  clubs?: Workspace[];
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  fullName?: string;
  phone?: string;
  bio?: string;
  profilePicture?: string;
  authMethod: 'local' | 'google' | 'microsoft';
}

export interface ProfileResponse {
  message: string;
  user: UserProfile;
}

export interface LeadRegistrationData {
  email: string;
  name: string;
  companyName: string;
  phone?: string;
}

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  bio?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

// A Role is an account-level named set of menu permissions (RBAC), not tied to a
// company. Company enters only at entitlement + assignment.
export interface Role {
  id: string;
  name: string;
  description?: string;
  PermittedMenus?: PermittedMenu[];
}

// A role together with the exact menu IDs it grants — returned by GET
// /company/roles/:roleId to prefill the Role Management edit form.
export interface RoleDetail {
  id: string;
  name: string;
  description?: string | null;
  menuIds: string[];
}

export interface PermittedMenu {
  id: string;
  name: string;
}

export interface AdminMenu {
  id: string;
  name: string;
  names?: Record<string, string>;
  route?: string;
  icon?: string;
  moduleId?: string;
  // Adjacency-list nesting: parent menu id (null = top level) + order among siblings.
  parentId?: string | null;
  sequence?: number;
  Module?: { name: string; icon?: string };
}

export interface AdminModule {
  id: string;
  name: string;
  names?: Record<string, string>;
  icon?: string;
  description?: string | null;
  landingRoute?: string | null;
}

// Request payloads for the Modules & Menus maintenance screen.
export interface ModuleInput {
  name: string;
  icon?: string;
  description?: string;
  landingRoute?: string;
  names?: Record<string, string>;
}

export interface MenuInput {
  name: string;
  route: string;
  icon?: string;
  moduleId: string;
  parentId?: string | null;
  names?: Record<string, string>;
}

// --- Email templates (platform defaults + tenant overrides) ---
export interface EmailTemplateVariable {
  name: string;
  description: string;
}

// Row in the templates list.
export interface EmailTemplateSummary {
  key: string;
  name: string;
  description?: string | null;
  tenantOverridable: boolean;
  isActive: boolean;
}

// Full template for the editor, plus its catalogue metadata.
export interface EmailTemplateDetail {
  key: string;
  name: string;
  description?: string | null;
  subject: string;
  bodyHtml: string;
  fromName?: string | null;
  tenantOverridable: boolean;
  isActive: boolean;
  // Brand settings (per template) + the sending company's logo for the preview.
  brandColor?: string | null;
  includeLogo?: boolean;
  companyLogoUrl?: string | null;
  variables: EmailTemplateVariable[];
  sample: Record<string, unknown>;
}

// Rendered preview (compiled subject + HTML) returned by the preview endpoint.
export interface EmailPreview {
  subject: string;
  html: string;
}

// --- Tenant (subscriber) overrides of overridable platform templates ---
export interface AccountEmailTemplateSummary {
  key: string;
  name: string;
  description?: string | null;
  hasOverride: boolean;
  isActive: boolean | null; // the override's active flag, or null when none exists
}

export interface AccountEmailTemplateDetail {
  key: string;
  name: string;
  description?: string | null;
  variables: EmailTemplateVariable[];
  sample: Record<string, unknown>;
  hasOverride: boolean;
  subject: string;
  bodyHtml: string;
  fromName?: string | null;
  isActive: boolean;
  brandColor?: string | null;
  includeLogo?: boolean;
  companyLogoUrl?: string | null;
  platformDefault: { subject: string; bodyHtml: string; fromName?: string | null };
}

// A company's outgoing SMTP config as returned to the client (never the password).
export interface CompanySmtp {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  hasPassword?: boolean;
  fromEmail?: string;
  fromName?: string;
  isActive?: boolean;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

export interface Country {
  alpha2: string;
  alpha3?: string;
  numericCode?: number;
  name: string;
  names?: Record<string, string>;
  flagEmoji?: string;
  dialCode?: string | null;
  isActive?: boolean;
  syncedAt?: string;
}

export interface Language {
  languageCode: string;
  name: string;
  isActive?: boolean;
}

// Industry Type - subscriber-owned reference data (one taxonomy per Account,
// shared by all companies and consumed by Membership / Golf pickers).
export interface IndustryType {
  id: string;
  industryTypeCode: string;
  description?: string | null;
  isActive?: boolean;
}

// Salutation - subscriber-owned reference data (Mr/Mrs/Datuk/..., one list per
// Account, shared by all companies and consumed by Membership / Golf pickers).
export interface Salutation {
  id: string;
  salutationCode: string;
  description?: string | null;
  isActive?: boolean;
}

// Nationality - subscriber-owned reference data (one list per Account).
// Deliberately NOT linked to Country: Country is address data, and a person's
// residential country is not their nationality.
export interface Nationality {
  id: string;
  nationalityCode: string;
  description?: string | null;   // the demonym, e.g. 'Malaysian'
  isActive?: boolean;
}

// Subscriber-owned public holiday, scoped by country (Company.countryCode).
export interface PublicHoliday {
  id: string;
  countryCode: string;           // ISO 3166-1 alpha-2, lowercase (e.g. 'my')
  holidayDate: string;           // YYYY-MM-DD
  description: string;           // the holiday's name, e.g. 'Hari Merdeka'
  isActive?: boolean;
}

// A country a Tenant Admin can maintain holidays for - derived from the
// account's active companies' address countries.
export interface HolidayCountry {
  countryCode: string;
  name: string;
  flagEmoji?: string | null;
}

// A company's weekend/rest-day set (company-level setup): ISO 8601 weekday
// numbers, 1 = Monday ... 7 = Sunday. Empty = not configured, so weekday/
// weekend pricing (e.g. golf green fees) never applies a weekend rate.
export interface CompanyWeekendDays {
  weekendDays: number[];
}

// Race - subscriber-owned reference data (one race/ethnicity list per Account,
// shared by all companies; pure demographic vocabulary, linked to nothing else).
export interface Race {
  id: string;
  raceCode: string;
  description?: string | null;
  isActive?: boolean;
}

// Membership Status master record (per company) - a product-tier master file.
export interface MembershipStatus {
  id: string;
  companyId?: string;
  membershipStatus: string;     // the status value, unique per company (e.g. 'Active', 'OA')
  statusClass: string;          // one of MembershipStatusMeta.classes[].key
  description?: string | null;
  systemControl: string;        // one of MembershipStatusMeta.controls[].key
  statusColor?: string | null;  // hex, e.g. '#22c55e'
  isActive?: boolean;
}

// A fixed option (key + display label) served by the API.
export interface MembershipStatusOption {
  key: string;
  label: string;
}

// The fixed vocabularies for Membership Status dropdowns, served by the API so
// the screen never drifts from server-side validation.
export interface MembershipStatusMeta {
  classes: MembershipStatusOption[];
  controls: MembershipStatusOption[];
}

// A sibling company (same subscription) whose statuses can be copied during
// first-time setup, with the statuses themselves for a selectable list.
export interface MembershipStatusCopySource {
  companyId: string;
  companyName: string;
  count: number;
  statuses: MembershipStatus[];
}

// One installment stage of a Membership Fee (the Membership Fee Scheme detail).
export interface MembershipFeeStage {
  id?: string;
  stageNo: number;
  amount: number;
  isPosted?: boolean;
}

// Membership Fee master record (per company) with its installment schedule.
export interface MembershipFee {
  id: string;
  companyId?: string;
  membershipFeeCode: string;
  description?: string | null;
  taxSchemeCode?: string | null;
  amount: number;
  allowInstallment: boolean;
  noOfInstallment?: number | null;
  installmentInterval?: string | null;   // one of MembershipFeeMeta.intervals[].key
  isActive?: boolean;
  stages: MembershipFeeStage[];
}

// Installment interval options, served by the API.
export interface MembershipFeeMeta {
  intervals: MembershipStatusOption[];
}

// A tax scheme available to the active company (for the fee's Tax Scheme picker).
export interface TaxSchemeRef {
  taxSchemeCode: string;
  name: string;
}

// One additional-fee line of a Membership Type (Category Details - Fee).
export interface MembershipTypeFeeLine {
  id?: string;
  transactionType: string;
  description?: string | null;
  taxSchemeCode?: string | null;
  currencyCode: string;
  amount: number;
}

// One standing charge of a Membership Type - the standard periodic fee applied
// while a member carries a given Membership Status.
export interface MembershipTypeStandingCharge {
  id?: string;
  membershipStatusId: string;
  description?: string | null;
  chargesControl?: string | null;
  transactionType: string;
  transactionDescription?: string | null;
  taxSchemeCode?: string | null;
  currencyCode: string;
  amount: number;
  frequency: string;              // one of MembershipTypeMeta.frequencies[].key
  fixedMonth?: number | null;     // 1-12 when frequency is 'fixed-month'
}

// Membership Type master record (main table - category details + default rights).
export interface MembershipType {
  additionalFees: MembershipTypeFeeLine[];
  standingCharges: MembershipTypeStandingCharge[];
  id: string;
  companyId?: string;
  category: string;
  description?: string | null;
  membershipClass: string;            // 'personal' | 'corporate'
  golfingAllow: boolean;
  dependentGolfingAllow: boolean;
  votingRight: boolean;
  transferRight: boolean;
  conversionTargetIds: string[];      // other MembershipType ids it can convert to
  childAgeFrom?: number | null;       // personal
  childAgeTo?: number | null;         // personal
  playTimes?: number | null;          // personal
  noOfNominee?: number | null;        // corporate
  nomineeCategoryId?: string | null;  // corporate → another MembershipType id
  defaultMembershipStatusId?: string | null;
  defaultMembershipFeeId?: string | null;
  arDebtorType?: string | null;
  creditLimit?: number | null;
  isActive?: boolean;
}

// Membership class + standing-charge frequency options, served by the API.
export interface MembershipTypeMeta {
  classes: MembershipStatusOption[];
  frequencies: MembershipStatusOption[];
}

// Golf - course-type option served by the API (OUT / IN / COMPOSITE).
// holeFrom/holeTo is the hole-number range Hole Setup uses for the type.
export interface UnitCourseTypeOption {
  key: string;
  label: string;
  description: string;
  holeFrom: number;
  holeTo: number;
}

// Golf - one hole row of a unit course (par / handicap index / remarks).
// HCP parity follows the numbering: holes 1-9 odd, holes 10-18 even.
export interface UnitCourseHole {
  id?: string;
  holeNumber: number;
  par?: number | null;
  handicapIndex?: number | null;
  remarks?: string | null;
}

export interface UnitCourseMeta {
  types: UnitCourseTypeOption[];
  measurementUnits: MembershipStatusOption[];
}

// Golf - per-hole distance from a tee box (a scorecard yardage cell).
export interface UnitCourseTeeBoxDistance {
  holeNumber: number;
  distance: number;
}

// Golf - one tee box of a unit course. Distances are per hole (OUT/IN totals
// are computed) in the header's measurementUnit. `Distances` is the API list
// shape (association alias); `distances` is the save-payload shape. Difficulty
// ratings live at the 18-hole Course level, not here.
export interface UnitCourseTeeBox {
  id?: string;
  colorCode: string;
  seq?: number | null;          // display order, 1-5
  colorHex?: string | null;     // actual display colour for future UI rendering
  description?: string | null;
  measurementUnit?: string;     // 'meter' | 'yard'
  distances?: UnitCourseTeeBoxDistance[];
  Distances?: UnitCourseTeeBoxDistance[];
}

// Golf - Unit Course (9-hole) master record. A full 18-hole course is formed
// later by pairing two unit courses: one OUT (front nine) + one IN (back nine).
export interface UnitCourse {
  id: string;
  companyId?: string;
  unitCourseCode: string;
  seq?: number | null;
  description?: string | null;
  courseType: string;                    // 'out' | 'in' | 'composite'
  remarks?: string | null;
  completionMinutes?: number | null;
  hasFloodlight: boolean;
  floodlightLeadMinutes?: number | null; // minutes before dark the lighting fee starts
  isActive?: boolean;
}

// Golf - 18-hole Course master record: a pairing of unit courses (first nine
// OUT|COMPOSITE + second nine IN|COMPOSITE) with optional alternate and night
// fallback nines. Nine references are UnitCourse ids. Field names match the
// screen labels and DB columns (user's business vocabulary).
export interface GolfCourse {
  id: string;
  companyId?: string;
  courseCode: string;
  displaySequence?: number | null;
  description?: string | null;
  firstNineId: string;
  secondNineId: string;
  alternateNineId?: string | null;
  nightNineId?: string | null;
  crossOverMinutes?: number | null;
  photo?: string | null; // public URL of the course picture
  isActive?: boolean;
}

// ISO 4217 currency reference row.
export interface Currency {
  code: string;          // ISO 4217 alpha-3, e.g. 'MYR'
  numericCode?: number | null;
  name: string;
  symbol?: string | null;
  minorUnit?: number;    // decimal places (2 for most, 0 for JPY, 3 for KWD…)
  isActive?: boolean;
}

// A subscriber's (Account's) currency selection: which currencies are available to
// choose from, which are selected, and the default among them.
export interface AccountCurrencyState {
  available: Currency[];   // all active platform currencies (the pick list)
  selected: Currency[];    // the ones this account opted into
  defaultCurrencyCode: string | null;
}

// A subscriber's (Account's) language selection: which languages are available to
// choose from, which are selected, and the default among them.
export interface AccountLanguageState {
  available: Language[];   // all active platform languages (the pick list)
  selected: Language[];    // the ones this account opted into
  defaultLanguageCode: string | null;
}

// The languages a user may pick from + their current/effective choice.
export interface UserLanguageState {
  options: Language[];
  preferred: string | null;
  accountDefault: string | null;
  effective: string;
}

export interface CreateRoleRequest {
  name: string;
  description: string;
  companyId?: string;
  menuIds?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  menuIds: string[];
}

export interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  bio?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  bio?: string;
  authMethod?: string;
  createdAt?: string;
  isActive?: boolean;
  roleId?: string | null;
  roleName?: string | null;
}

export interface UpdateUserData {
  email?: string;
  fullName?: string;
  phone?: string;
  bio?: string;
}

export interface AssignRoleData {
  userId: string;
  roleId: string;
  companyId?: string;
}

// 👇 NEW: For System Admin Subscriber Provisioning
export interface CreateSubscriptionData {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
  subscriptionPlan?: string;
  registrationNumber?: string;
  timezone?: string;
  phone?: string;
  moduleIds?: string[];
}

// Tenant-scoped user management (Tenant Admin within their own company)
export interface TenantUser {
  id: string;
  email: string;
  full_name?: string;
  authMethod?: string;
  roleId?: string | null;
  roleName?: string | null;
}

export interface CreateTenantUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleId?: string;
}

export interface SubscriptionInfo {
  id: string;
  subscriberName: string;
  subscriptionPlan: string;
  status: string;
  createdAt: string;
  Companies?: CompanyInfo[];
}

// Platform-admin amendment of a subscriber. The backend applies the
// account-level fields (subscriberName / subscriptionPlan / status) to the
// Account and the company-level fields to the subscriber's primary Company.
export interface UpdateSubscriptionData {
  subscriberName?: string;
  subscriptionPlan?: string;
  status?: string;
  registrationNumber?: string;
  timezone?: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  registrationNumber?: string;
  timezone?: string;
  isActive: boolean;
}

// A module a Tenant Admin can attach to a company (chosen from all system modules).
export interface ModuleOption {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

// A company (business entity) under the subscriber's account, with its modules.
export interface CompanyEntity {
  id: string;
  name: string;
  registrationNumber?: string;
  taxRegistrationNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  // Canonical ISO 3166-1 alpha-2 (lowercase) the company operates in; drives tax.
  countryCode?: string | null;
  timezone?: string;
  logo?: string | null;
  defaultCurrencyCode?: string | null;
  isActive: boolean;
  createdAt?: string;
  SubscribedModules?: ModuleOption[];
}

// Editable company profile / billing fields (PUT /auth/companies/:id).
export interface UpdateCompanyData {
  name?: string;
  registrationNumber?: string;
  taxRegistrationNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  // Canonical ISO 3166-1 alpha-2 (lowercase) the company operates in; drives tax.
  countryCode?: string | null;
  timezone?: string;
  logo?: string | null;
  defaultCurrencyCode?: string | null;
}

// Payload to create a new company under the caller's account.
export interface CreateCompanyData {
  name: string;
  registrationNumber?: string;
  taxRegistrationNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  // Canonical ISO 3166-1 alpha-2 (lowercase) the company operates in; drives tax.
  countryCode?: string | null;
  timezone?: string;
  moduleIds?: string[];
  logo?: string | null;
  defaultCurrencyCode?: string | null;
}

// --- Tax scheme setup (subscriber-owned catalog, consumed per company by country) ---
export type TaxIeFlag = 'INCLUSIVE' | 'EXCLUSIVE';
export type TaxClass = 'INPUT' | 'OUTPUT' | 'CONTRA';

// A single option in a dropdown (key stored, label shown). Matches GET /tax/meta.
export interface TaxOption {
  key: string;
  label: string;
}

export interface TaxMeta {
  ieFlags: TaxOption[];
  taxClasses: TaxOption[];
  taxTypes: TaxOption[];
}

// One effective-dated rate line (a component of a scheme). A rate change is a new
// line with a later effectiveFrom; several taxCodes can be effective at once.
export interface TaxRate {
  id: string;
  taxCode: string;
  taxRate: number;
  taxType: string; // 'Tax' | 'Service Charge' (descriptive; no effect on calculation)
  taxPriority: number;
  isClaimable: boolean;
  claimPercentage: number;
  glAccountCode?: string | null;
  effectiveFrom: string; // YYYY-MM-DD
  isActive?: boolean;
}

// One component of a scheme as seen from a company's adoption view: the current
// rate plus the subscriber-default GL account and this company's override (if any).
export interface CompanyTaxLine {
  taxCode: string;
  taxRate: number;
  defaultGlAccountCode: string | null;
  companyGlAccountCode: string | null;
}

// A scheme available to the active company, with its per-company adoption state.
// `id` is the taxSchemeId (the PUT target). isEnabled reflects the opt-out row
// (true when there is no override row).
export interface CompanyTaxAdoption {
  id: string;
  taxSchemeCode: string;
  name: string;
  ieFlag: TaxIeFlag;
  taxClass: TaxClass;
  isEnabled: boolean;
  components: CompanyTaxLine[];
}

// A platform template's rate line, as shown in the Load-defaults preview.
export interface TaxTemplateRate {
  taxCode: string;
  taxRate: number;
  taxPriority: number;
  isClaimable: boolean;
  claimPercentage: number;
}

// A loadable platform-owned tax scheme (accountId NULL) with its current rate lines
// and a flag for whether the subscriber already has it. Drives the Load-defaults
// multi-select screen - what the platform curates is exactly what the subscriber loads.
export interface TaxTemplateOption {
  id: string;
  countryCode: string;
  taxSchemeCode: string;
  name: string;
  description?: string | null;
  ieFlag: TaxIeFlag;
  taxClass: TaxClass;
  alreadyLoaded: boolean;
  rates: TaxTemplateRate[];
}

// A tax scheme header plus its rate lines (the API returns rates inline on list).
export interface TaxScheme {
  id: string;
  countryCode: string;
  taxSchemeCode: string;
  name: string;
  description?: string | null;
  ieFlag: TaxIeFlag;
  taxClass: TaxClass;
  sourceTemplateId?: string | null;
  isActive?: boolean;
  rates?: TaxRate[];
}

// The platform's own "company of record" (a singleton): the invoice-issuer identity
// plus the billing country/scheme that anchors the platform's own tax.
export interface PlatformProfile {
  legalName: string | null;
  tradingName: string | null;
  registrationNumber: string | null;
  taxRegistrationNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  logo: string | null;
  countryCode: string | null;
  baseCurrencyCode: string | null;
  defaultTaxSchemeCode: string | null;
}

// One tax line of a computed charge breakdown (from the shared calculator).
export interface TaxQuoteLine {
  taxCode: string;
  taxRate: number;
  taxAmount: number;
  taxPriority: number;
}

// The computed tax breakdown for a platform charge (what the invoice will snapshot).
export interface PlatformChargeQuote {
  scheme: { taxSchemeCode: string; name: string; ieFlag: TaxIeFlag; taxClass: TaxClass };
  asOf?: string | null;
  ieFlag: TaxIeFlag;
  net: number;
  taxTotal: number;
  gross: number;
  lines: TaxQuoteLine[];
}

