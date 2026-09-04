// Account Receivable - Debtor Listing / ledger-account maintenance / Other
// Debtor party master (slice 1). Mirrors apps/api/src/modules/ar shapes.

export interface ArOption {
  key: string;
  label: string;
}

export interface ArCurrencyOption {
  code: string;
  name: string;
  symbol: string | null;
  isBase?: boolean;
}

export interface ArDebtorsMeta {
  debtorTypes: ArOption[];
  debtorStatuses: ArOption[];
  // 'auto' | 'manual' | null - drives whether the Other Debtor dialog's Code
  // field is keyed in or issued by Numbering Control.
  otherDebtorNumberingMode: string | null;
  // Multi-currency (step 2): off = no currency controls on the screen at all.
  multiCurrencyEnabled: boolean;
  baseCurrencyCode: string | null;
  currencies: ArCurrencyOption[];
}

export interface ArDebtor {
  id: string;
  debtorType: 'membership' | 'member' | 'other';
  sourceId: string;
  // Party display data resolved server-side (membership no / member no / code,
  // person or corporate name, class or parent-membership context line).
  no: string | null;
  name: string | null;
  sub: string | null;
  terms: number | null;
  sendReminders: boolean;
  chargeInterest: boolean;
  status: 'active' | 'suspended' | 'closed';
  // The ACCOUNT currency (ISO 4217); every amount on the account is in it.
  currencyCode: string | null;
  // DECIMAL(21,2) columns arrive as strings.
  creditLimit: string;
  outstanding: string;
  createdAt?: string;
}

export interface ArDebtorListResult {
  total: number;
  limit: number;
  offset: number;
  debtors: ArDebtor[];
}

// --- Debtor account (slice 2: document ledger) ---

export interface ArPerson {
  id: string;
  memberNo: string;
  memberKind: string;
  name: string;
}

export type ArTrxClass = 'invoice' | 'debit-note' | 'credit-note' | 'interest' | 'deposit' | 'receipt' | 'refund' | 'forex';

export interface ArTransactionType {
  id: string;
  transactionType: string;
  trxClass: ArTrxClass;
  description: string | null;
  taxSchemeCode: string | null;
  isInterestChargeable: boolean;
}

// The AR-owned Transaction Type master (moved from Membership 2026-08-15).
export interface ArTransactionTypeRow {
  id: string;
  canModify?: boolean;
  transactionType: string;
  trxClass: ArTrxClass;
  description: string | null;
  taxSchemeCode: string | null;
  isInterestChargeable: boolean;
  usableInModules: string[];
  isEInvoice: boolean;
  eInvoiceClassificationCode: string | null;
  isActive: boolean;
}

export interface ArTransactionTypeMeta {
  trxClasses: ArOption[];
  // Only modules the company is ENTITLED to (AR-only subscribers get none).
  modules: ArOption[];
  // LHDN MyInvois is Malaysia-only: false hides the e-Invoice section (and
  // the classification list arrives empty).
  eInvoiceApplicable: boolean;
  eInvoiceClassifications: { code: string; description: string | null }[];
}

export interface ArLedgerDoc {
  id: string;
  docKind: 'invoice' | 'debit-note' | 'credit-note';
  mode: 'debit' | 'credit';
  docNo: string | null;
  docDate: string;
  trxDate: string;
  dueDate: string | null;
  description: string | null;
  incurredBy: ArPerson | null;
  sourceModule: string;
  sourceRef: string;
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  // The REMAINING balance (gross at creation, reduced to 0 by allocations;
  // renamed from settledAmount, user decision 2026-08-24).
  balanceAmount: string;
  status: ArDocStatus;
  reversalOfId: string | null;
  voidReason?: string | null;
  currencyCode?: string | null;
  exchangeRate?: string | null;
  baseGrossAmount?: string | null;
}

export interface ArReceiptDoc {
  id: string;
  docKind: 'receipt' | 'refund';
  mode: 'debit' | 'credit';
  docNo: string;
  docDate: string;
  trxDate: string;
  paymentMethod: string | null;
  paymentRef: string | null;
  description: string | null;
  amount: string;
  // Remaining balance (= amount at creation, reduced by allocations to 0):
  // a receipt's unallocated credit / a refund's unfunded portion.
  balanceAmount: string;
  // 'draft' = manual receipt saved, not yet financial (lifecycle 2026-08-20).
  status: 'draft' | 'open' | 'void';
  currencyCode?: string | null;
  exchangeRate?: string | null;
  baseAmount?: string | null;
}

export interface ArDepositDoc {
  id: string;
  docNo: string;
  docDate: string;
  trxDate: string;
  description: string | null;
  amount: string;
  // Still to collect (= amount at creation, reduced by collections to 0).
  balanceAmount: string;
  // Held balance: rises with collections, falls with refunds/conversions.
  heldAmount: string;
  // 'draft'/'pending-approval' = deposit lifecycle 2026-09-01 (not financial:
  // not collectable, not refundable, excluded from statements).
  status: 'draft' | 'pending-approval' | 'open' | 'closed' | 'void';
  currencyCode?: string | null;
  exchangeRate?: string | null;
  baseAmount?: string | null;
}

export interface ArAccount {
  multiCurrencyEnabled?: boolean;
  debtor: {
    id: string;
    debtorType: string;
    sourceId: string;
    no: string | null;
    name: string | null;
    terms: number | null;
    sendReminders: boolean;
    chargeInterest: boolean;
    status: string;
    currencyCode?: string | null;
  };
  balances: { creditLimit: string; outstanding: string };
  personCaps: Array<{ memberId: string; person: ArPerson | null; personalLimit: string; personalUsed: string }>;
  ledger: ArLedgerDoc[];
  receipts: ArReceiptDoc[];
  deposits: ArDepositDoc[];
}

// --- AR Transaction screens (per-document-type menus; invoice first) ---

// Internal status vocabulary (display maps draft->"Open", open|settled->
// "Posted"): 'draft' and 'pending-approval' are NOT financial yet.
// 'closed' is deposit-only (fully collected and fully drawn down) and also
// displays as "Posted".
export type ArDocStatus = 'draft' | 'pending-approval' | 'open' | 'settled' | 'closed' | 'void';

// What a refund does (refund slice 2026-08-31): 'deposit' pays back a
// deposit's held balance, 'credit' pays back excess payment (unallocated
// receipt credit), 'offset' applies a deposit's held balance to outstanding
// via a Credit Note leg (no money movement, no payment method).
export type ArRefundMode = 'deposit' | 'credit' | 'offset';

export interface ArDocListRow {
  id: string;
  docKind: string;
  mode: 'debit' | 'credit';
  docNo: string | null;
  docDate: string;
  trxDate: string;
  dueDate: string | null;
  description: string | null;
  sourceModule: string;
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  // Remaining balance (receipt rows: the unallocated credit).
  balanceAmount: string;
  status: ArDocStatus;
  voidReason?: string | null;
  // Multicurrency (step 3): account currency + the frozen rate + base gross.
  currencyCode?: string | null;
  exchangeRate?: string | null;
  baseGrossAmount?: string | null;
  transactionTypeId: string;
  // Analysis dimension values (option ids), for edit prefill.
  analysis1Id?: string | null;
  analysis2Id?: string | null;
  analysis3Id?: string | null;
  analysis4Id?: string | null;
  analysis5Id?: string | null;
  analysis6Id?: string | null;
  // CN drafts: the allocation intent (apply-against target), for edit prefill.
  applyToLedgerId?: string | null;
  // Receipt rows: payment-method snapshot + draft intent, for edit prefill.
  paymentMethod?: string | null;
  paymentRef?: string | null;
  collectDepositId?: string | null;
  refundMode?: ArRefundMode | null;
  // Deposit rows: the held balance (balanceAmount is the still-to-collect).
  heldAmount?: string | null;
  canModify?: boolean;
  debtor: { id: string; debtorType: string | null; no: string | null; name: string | null };
}

export interface ArDocListResult {
  total: number;
  limit: number;
  offset: number;
  // Multicurrency (step 5): rows whose currencyCode differs get a chip.
  baseCurrencyCode?: string | null;
  documents: ArDocListRow[];
}

// One allocation of a document (the drill-down viewer): the credit doc funds
// the debit doc; fxGainLoss is the realized exchange difference in BASE
// currency (positive = gain), classified under the named Forex designation.
export interface ArAllocationRow {
  id: string;
  creditDocType: 'receipt' | 'ledger' | 'deposit';
  creditDocId: string;
  creditDoc: { docNo: string; docKind: string } | null;
  debitDocType: 'ledger' | 'refund' | 'deposit';
  debitDocId: string;
  debitDoc: { docNo: string; docKind: string } | null;
  amount: string;
  fxGainLoss: string | null;
  fxTransactionType: string | null;
  createdAt: string;
  // Deposit trail (2026-09-01): a deposit->refund draw whose refund posted an
  // OFFSET Credit Note carries the CN's number and the documents it settled.
  onwardVia?: string | null;
  onward?: ArAllocationOnwardRow[];
}

// One document an offset/conversion Credit Note settled (the deposit trail's
// second hop).
export interface ArAllocationOnwardRow {
  docNo: string | null;
  docKind: string;
  amount: string;
}

// A DIRECT deposit conversion (the Convert button's DEPCONV Credit Note -
// no allocation row of its own; sourceRef = the deposit's id).
export interface ArDepositConversionRow {
  id: string;
  docNo: string | null;
  amount: string;
  // Remaining CN credit not (yet) applied to anything.
  unallocated: string;
  status: ArDocStatus;
  settled: ArAllocationOnwardRow[];
  createdAt: string;
}

// --- Financial-analysis dimensions (hybrid design 2026-08-25) ---

// One consuming module a dimension applies to, with that module's own
// "required on manual entry" flag (2026-08-27). A row whose moduleId is absent
// from ArAnalysisSetup.availableModules belongs to a module the company no
// longer subscribes to - shown greyed, kept on save.
export interface ArAnalysisCategoryModule {
  moduleId: string;
  moduleName: string;
  isRequired: boolean;
}

export interface ArAnalysisCategory {
  id: string;
  canModify?: boolean;
  name: string;
  // 1..6 = stamped onto Ledger.analysis<dimensionNo>Id; null = catalog-only.
  dimensionNo: number | null;
  // Entry display order; null = automatic (parent before child).
  displaySeq: number | null;
  // The dimension this one sits under (Department under Division), or null for
  // a standalone dimension. Deliberately unrelated to dimensionNo: the number
  // is a storage slot, the parent link is semantic.
  parentCategoryId: string | null;
  // Empty for a catalog-only dimension (it stamps nothing, so it applies
  // nowhere); at least one entry for a numbered dimension.
  modules: ArAnalysisCategoryModule[];
  isActive: boolean;
}

export interface ArAnalysisOption {
  id: string;
  canModify?: boolean;
  categoryId: string;
  // Which option of the parent category this belongs to. Null under a parented
  // dimension means UNASSIGNED: listed on this screen, withheld from entry.
  parentOptionId: string | null;
  code: string;
  description: string | null;
  isActive: boolean;
}

// The Analysis Setup dialog's save payload (create + update share it).
export interface ArAnalysisCategoryPayload {
  name: string;
  dimensionNo: number | null;
  displaySeq: number | null;
  parentCategoryId: string | null;
  modules: { moduleId: string; isRequired: boolean }[];
}

export interface ArAnalysisSetup {
  categories: ArAnalysisCategory[];
  options: ArAnalysisOption[];
  // The modules this company may tick: registered dimension consumers
  // intersected with its subscriptions.
  availableModules: { moduleId: string; name: string }[];
}

// The entry dialogs' picker meta: one entry per number-assigned active dimension.
export interface ArAnalysisEntryMeta {
  categoryId: string;
  dimensionNo: number;
  name: string;
  // Entry display order; null = automatic (parent before child).
  displaySeq: number | null;
  isRequired: boolean;
  // Hierarchy for the entry cascade. parentDimensionNo is what the dialog keys
  // on, since selections are keyed by dimension number; it may be HIGHER than
  // this dimension's own number.
  parentCategoryId: string | null;
  parentDimensionNo: number | null;
  options: { id: string; code: string; description: string | null; parentOptionId: string | null }[];
}

// The entry dialogs' account-currency block (multicurrency step 3): the
// account's currency, the company base, and - for a FOREIGN account - the
// currency's rate history so the Exchange rate field defaults per document
// date client-side.
export interface ArAccountCurrency {
  code: string | null;
  baseCurrencyCode: string | null;
  isBase: boolean;
  rates: { effectiveDate: string; rate: string }[];
}

export interface ArAccountMeta {
  currency?: ArAccountCurrency;
  // Slot-assigned analysis dimensions (empty = no pickers rendered).
  analysis?: ArAnalysisEntryMeta[];
  transactionTypes: ArTransactionType[];
  // purpose -> 'auto' | 'manual' | null
  numberingModes: Record<string, string | null>;
  // An approval chain is active for the kind -> "Submit for Approval" label.
  invoiceApproval?: boolean;
  creditNoteApproval?: boolean;
  debitNoteApproval?: boolean;
  refundApproval?: boolean;
  depositApproval?: boolean;
  // The debtor's open debits - the CN entry's "Apply against" choices.
  openDebits?: { id: string; docKind: string; docNo: string | null; grossAmount: string; balanceAmount: string }[];
  // The debtor's OPEN deposits with both counters: the Receipt dialog offers
  // balanceAmount > 0 (collectable), the Refund dialog heldAmount > 0
  // (refundable) - each filters client-side.
  openDeposits?: { id: string; docNo: string | null; amount: string; balanceAmount: string; heldAmount?: string | null }[];
}

// --- Periodic processing (slice 3) ---

export interface ArDebtorRef {
  debtorType: string;
  no: string | null;
  name: string | null;
}

export interface ArInterestGeneration {
  id: string;
  debtorId: string;
  debtor: ArDebtorRef | null;
  periodMonth: string;
  cutoffDate: string;
  interestRate: string;
  graceDays: number;
  // The debtor account's currency; null = the company base (step 5).
  currencyCode: string | null;
  totalOverdue: string;
  interestAmount: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  postedLedgerId: string | null;
}

export interface ArInterestDetail {
  id: string;
  chargeId: string;
  docNo: string;
  docDate: string;
  dueDate: string;
  overdueAmount: string;
  overdueDays: number;
  interestAmount: string;
  // Pre-post maintenance: excluded lines stay visible (struck through) and
  // never contribute to the header totals or the posted Debit Note.
  isExcluded?: boolean;
}

export type ArStatementCategory = 'individual' | 'corporate' | 'nominee' | 'other';

export interface ArStatementSummary {
  id: string;
  debtorId: string;
  statementNo: string;
  statementDate: string;
  statementMonth: string;
  periodStart: string;
  periodEnd: string;
  debtorType: 'membership' | 'member' | 'other';
  debtorCategory: ArStatementCategory;
  debtorNo: string | null;
  // The account currency all amounts are in; null = the company base (step 5).
  currencyCode: string | null;
  openingBalance: string;
  closingBalance: string;
  billName: string;
  status: 'generated' | 'sent' | 'void';
}

export interface ArStatementLine {
  id: string;
  lineNo: number;
  docDate: string;
  docType: string;
  docNo: string;
  description: string | null;
  incurredByName: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface ArStatementDetail {
  statement: ArStatementSummary & {
    billAddress: Record<string, string | null> | null;
    contactPerson: string | null;
    companyName: string;
    companyRegistrationNo: string | null;
    companyAddress: Record<string, string | null> | null;
    deposit: string;
    unallocatedAmount: string;
    aging1: string; aging2: string; aging3: string; aging4: string;
    aging5: string; aging6: string; aging7: string;
    agingBoundaries: number[] | null;
  };
  details: ArStatementLine[];
  columns: ArStatementColumn[] | null;
}

export type ArStatementColumnKey = 'date' | 'docNo' | 'details' | 'debit' | 'credit' | 'balance';

export interface ArStatementColumn {
  key: ArStatementColumnKey;
  label?: string;
}

export interface ArSetting {
  statementCutoffDay: number | null;
  aging1: number | null;
  aging2: number | null;
  aging3: number | null;
  aging4: number | null;
  aging5: number | null;
  aging6: number | null;
  // Statement layout (Level 1): branding + section toggles + remittance text.
  statementShowLogo: boolean;
  statementBrandColor: string | null;
  statementShowAging: boolean;
  statementShowDeposit: boolean;
  statementShowIncurredBy: boolean;
  statementShowGeneratedNote: boolean;
  statementFooterText: string | null;
  // Lines-table column layout: ordered VISIBLE columns (hidden = omitted);
  // null = the standard order/labels.
  statementColumns: ArStatementColumn[] | null;
  // Membership integration (2026-08-15): membership bills through AR when on.
  membershipIntegration: boolean;
  interestTransactionTypeId: string | null;
  depositConversionTransactionTypeId: string | null;
  // Multi-currency (2026-08-21): foreign-currency Other Debtor accounts; the
  // Forex-class types realized exchange gain/loss is classified under.
  multiCurrencyEnabled: boolean;
  fxGainTransactionTypeId: string | null;
  fxLossTransactionTypeId: string | null;
}

export interface ArDesignatedTypeOption {
  id: string;
  transactionType: string;
  description: string | null;
}

// GET /ar/settings response wrapper (entitlement + designated-type options).
export interface ArSettingResponse {
  setting: ArSetting;
  membershipModuleEntitled: boolean;
  interestTypeOptions: ArDesignatedTypeOption[];
  depositConversionTypeOptions: ArDesignatedTypeOption[];
  // The AR base currency (Company default); null = prerequisite missing, the
  // multi-currency toggle cannot be switched on.
  baseCurrencyCode: string | null;
  forexTypeOptions: ArDesignatedTypeOption[];
}

// --- Exchange Rates (multicurrency step 1) ---

// 1 unit of currencyCode = `rate` units of the company base currency.
export interface ArExchangeRate {
  id: string;
  canModify?: boolean;
  currencyCode: string;
  effectiveDate: string;
  // DECIMAL(21,10) arrives as a string.
  rate: string;
  updatedAt?: string;
}

export interface ArExchangeRateMeta {
  baseCurrencyCode: string | null;
  multiCurrencyEnabled: boolean;
  // The subscriber's currency set minus the base currency.
  currencies: { code: string; name: string; symbol: string | null }[];
}

export interface ArStatementRun {
  id: string;
  statementMonth: string;
  periodStart: string;
  periodEnd: string;
  scope: ArStatementCategory[];
  status: 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';
  totalDebtors: number;
  processedCount: number;
  generatedCount: number;
  replacedCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface ArStatementRunPreview {
  statementMonth: string;
  periodStart: string;
  periodEnd: string;
  categories: ArStatementCategory[];
  total: number;
  replaced: number;
}

export interface ArOtherDebtor {
  id: string;
  code: string;
  name: string;
  registrationNo: string | null;
  taxNo: string | null;
  contactPerson: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  countryCode: string | null;
  remarks: string | null;
  // Account currency (step 2) + whether it may still change (false once the
  // account has any document).
  currencyCode?: string | null;
  currencyLocked?: boolean;
  isActive: boolean;
  debtorId?: string | null;
  canModify?: boolean;
}
