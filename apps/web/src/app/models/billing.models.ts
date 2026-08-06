// Membership fee runs (Billing Schedules) - mirrors
// apps/api/src/modules/membership/billing.* shapes.

export interface BillingSchedule {
  id: string;
  billingType: 'membership-fee' | 'subscription-fee';
  periodMonth: string;
  docDate: string;
  trxDate: string;
  totalAmount: string;
  itemCount: number;
  status: 'pending' | 'partially-posted' | 'posted' | 'cancelled';
}

export interface BillingScheduleItem {
  id: string;
  membershipId: string;
  memberId: string | null;
  debtorTarget: 'membership' | 'member';
  transactionTypeId: string;
  description: string | null;
  amount: string;
  status: 'pending' | 'posted' | 'skipped' | 'failed';
  postedDocNo: string | null;
  issue: string | null;
}
