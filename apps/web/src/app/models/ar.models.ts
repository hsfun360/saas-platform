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

export type ArTrxClass = 'invoice' | 'debit-note' | 'credit-note' | 'interest' | 'deposit' | 'receipt' | 'forex';

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
  settledAmount: string;
  status: ArDocStatus;
  reversalOfId: string | null;
  voidReason?: string | null;
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
  allocatedAmount: string;
  // 'draft' = manual receipt saved, not yet financial (lifecycle 2026-08-20).
  status: 'draft' | 'open' | 'void';
}

export interface ArDepositDoc {
  id: string;
  docNo: string;
  docDate: string;
  trxDate: string;
  description: string | null;
  amount: string;
  collectedAmount: string;
  utilizedAmount: string;
  status: 'open' | 'closed' | 'void';
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
export type ArDocStatus = 'draft' | 'pending-approval' | 'open' | 'settled' | 'void';

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
  settledAmount: string;
  status: ArDocStatus;
  voidReason?: string | null;
  transactionTypeId: string;
  // CN drafts: the allocation intent (apply-against target), for edit prefill.
  applyToLedgerId?: string | null;
  // Receipt rows: payment-method snapshot + draft intent, for edit prefill.
  paymentMethod?: string | null;
  paymentRef?: string | null;
  collectDepositId?: string | null;
  canModify?: boolean;
  debtor: { id: string; debtorType: string | null; no: string | null; name: string | null };
}

export interface ArDocListResult {
  total: number;
  limit: number;
  offset: number;
  documents: ArDocListRow[];
}

export interface ArAccountMeta {
  transactionTypes: ArTransactionType[];
  // purpose -> 'auto' | 'manual' | null
  numberingModes: Record<string, string | null>;
  // An approval chain is active for the kind -> "Submit for Approval" label.
  invoiceApproval?: boolean;
  creditNoteApproval?: boolean;
  // The debtor's open debits - the CN entry's "Apply against" choices.
  openDebits?: { id: string; docKind: string; docNo: string | null; grossAmount: string; settledAmount: string }[];
  // The debtor's collectable deposits - the Receipt entry's optional
  // "Collect deposit" choices.
  openDeposits?: { id: string; docNo: string | null; amount: string; collectedAmount: string }[];
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
