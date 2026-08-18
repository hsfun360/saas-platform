// Account Receivable - Debtor Listing / ledger-account maintenance / Other
// Debtor party master (slice 1). Mirrors apps/api/src/modules/ar shapes.

export interface ArOption {
  key: string;
  label: string;
}

export interface ArDebtorsMeta {
  debtorTypes: ArOption[];
  debtorStatuses: ArOption[];
  // 'auto' | 'manual' | null - drives whether the Other Debtor dialog's Code
  // field is keyed in or issued by Numbering Control.
  otherDebtorNumberingMode: string | null;
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
  status: 'open' | 'void';
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
  incurredByMemberId: string | null;
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
  persons: ArPerson[];
  // purpose -> 'auto' | 'manual' | null
  numberingModes: Record<string, string | null>;
  // An ar-invoice approval chain is active -> "Submit for Approval" label.
  invoiceApproval?: boolean;
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
}

// GET /ar/settings response wrapper (entitlement + designated-type options).
export interface ArSettingResponse {
  setting: ArSetting;
  membershipModuleEntitled: boolean;
  interestTypeOptions: { id: string; transactionType: string; description: string | null }[];
  depositConversionTypeOptions: { id: string; transactionType: string; description: string | null }[];
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
  isActive: boolean;
  debtorId?: string | null;
  canModify?: boolean;
}
