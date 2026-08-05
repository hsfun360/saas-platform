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
