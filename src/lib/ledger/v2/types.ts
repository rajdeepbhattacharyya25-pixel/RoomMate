/**
 * RoomMate Shared Expense Engine V2 — Canonical Financial Types
 * Phase 3 Implementation
 * 
 * Invariants:
 * - All monetary calculations strictly use integer Paise (1 INR = 100 Paise).
 * - Zero binary floating-point drift in financial arithmetic.
 */

export type Paise = number; // Always integer (e.g. 20000 = ₹200.00, 1 = ₹0.01)

export type SplitMethodV2 = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';

export type NetPositionDirectionV2 = 'RECEIVE' | 'OWES' | 'SETTLED';

export interface ExpenseShareV2 {
  userId: string;
  sharePaise: Paise;
}

export interface ExpenseInputV2 {
  id: string;
  roomId: string;
  paidBy: string;
  totalAmountPaise: Paise;
  title: string;
  splitMethod: SplitMethodV2;
  shares: ExpenseShareV2[];
  isDeleted?: boolean;
}

export interface SettlementInputV2 {
  id: string;
  roomId: string;
  payerId: string; // Debtor sending money
  payeeId: string; // Creditor receiving money
  amountPaise: Paise;
  paymentDate?: string;
  createdAt?: string;
}

export interface MemberNetPositionV2 {
  userId: string;
  totalPaidPaise: Paise;
  totalSharePaise: Paise;
  settlementsSentPaise: Paise;
  settlementsReceivedPaise: Paise;
  grossNetPaise: Paise;        // totalPaid - totalShare
  netPositionPaise: Paise;     // grossNet + settlementsSent - settlementsReceived
  direction: NetPositionDirectionV2;
  absoluteAmountPaise: Paise;
  // Display convenience
  displayInr: string;
}

export interface SimplifiedTransferV2 {
  fromUserId: string; // Debtor (Owes)
  toUserId: string;   // Creditor (Receives)
  amountPaise: Paise;
  displayInr: string;
  upiAmount: string;  // Formatted for UPI URI (e.g. "166.67")
}

export interface RoomFinancialSummaryV2 {
  roomId: string;
  totalExpensesPaise: Paise;
  totalSettledPaise: Paise;
  members: MemberNetPositionV2[];
  simplifiedTransfers: SimplifiedTransferV2[];
  isZeroSumVerified: boolean;
  netDiscrepancyPaise: Paise;
  generatedAt: string;
}

export interface SettlementValidationResultV2 {
  isValid: boolean;
  error?: string;
  maxPermissiblePaise?: Paise;
}

export interface LeaveRoomValidationResultV2 {
  canLeave: boolean;
  reason: string;
  netPositionPaise: Paise;
}

// ============================================================================
// DATABASE V2 BOUNDARY TYPES (Explicitly typed, zero 'any')
// ============================================================================

export interface DbMemberFinancialPositionV2 {
  user_id: string;
  name: string;
  email: string;
  upi_id?: string | null;
  total_paid: number;
  total_paid_paise: number;
  total_share: number;
  total_share_paise: number;
  settlements_sent: number;
  settlements_sent_paise: number;
  settlements_received: number;
  settlements_received_paise: number;
  gross_net: number;
  net_balance: number;
  net_balance_paise: number;
  direction: NetPositionDirectionV2;
}

export interface DbFinancialSummaryV2 {
  room_id: string;
  total_expenses: number;
  total_expenses_paise: number;
  total_settled: number;
  total_settled_paise: number;
  members: DbMemberFinancialPositionV2[];
  is_zero_sum_verified: boolean;
  net_discrepancy_paise: number;
  generated_at: string;
}

export type FinancialErrorCode =
  | 'INVALID_SETTLEMENT'
  | 'ACCESS_DENIED'
  | 'OVERSETTLEMENT_EXCEEDS_DEBT'
  | 'OVERSETTLEMENT_EXCEEDS_CREDIT'
  | 'SUPABASE_NOT_CONFIGURED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_RPC_ERROR';

export interface RecordSettlementV2Success {
  success: true;
  settlement_id: string;
  room_id: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  amount_paise: number;
  created_at: string;
}

export interface RecordSettlementV2Failure {
  success: false;
  error: string;
  errorCode?: FinancialErrorCode;
}

export type RecordSettlementV2Result = RecordSettlementV2Success | RecordSettlementV2Failure;

export type FinancialDataState =
  | 'LOADING'
  | 'ONLINE_AUTHORITATIVE'
  | 'OFFLINE_LOCAL'
  | 'ERROR';
