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

export interface ArTransactionType {
  id: string;
  transactionType: string;
  chargeType: string;
  description: string | null;
  taxSchemeCode: string | null;
  isInterestChargeable: boolean;
}

export interface ArLedgerDoc {
  id: string;
  docKind: 'invoice' | 'debit-note' | 'credit-note';
  mode: 'debit' | 'credit';
  docNo: string;
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
  status: 'open' | 'settled' | 'void';
  reversalOfId: string | null;
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

export interface ArAccountMeta {
  transactionTypes: ArTransactionType[];
  persons: ArPerson[];
  // purpose -> 'auto' | 'manual' | null
  numberingModes: Record<string, string | null>;
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
    companyAddress: Record<string, string | null> | null;
    deposit: string;
    aging1: string; aging2: string; aging3: string; aging4: string;
    aging5: string; aging6: string; aging7: string;
    agingBoundaries: number[] | null;
  };
  details: ArStatementLine[];
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
