/**
 * RoomMate Shared Expense Engine V2 — Pure Financial Reference Model Types
 * Phase 2 Test Harness
 * 
 * Strict Invariant: All monetary calculations are performed in integer Paise (1 INR = 100 Paise).
 * Zero floating-point arithmetic is permitted in financial calculations.
 */

export type Paise = number; // Always integer (e.g. 20000 = ₹200.00)

export interface Member {
  userId: string;
  name: string;
  email: string;
}

export interface ExpenseShare {
  userId: string;
  sharePaise: Paise;
}

export type SplitMethod = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';

export interface Expense {
  id: string;
  roomId: string;
  paidBy: string; // userId of the payer
  totalAmountPaise: Paise;
  title: string;
  splitMethod: SplitMethod;
  shares: ExpenseShare[];
  isDeleted?: boolean;
}

export interface Settlement {
  id: string;
  roomId: string;
  payerId: string; // Member sending money
  payeeId: string; // Member receiving money
  amountPaise: Paise;
  createdAt: string;
}

export type NetPositionDirection = 'RECEIVE' | 'OWES' | 'SETTLED';

export interface NetPosition {
  userId: string;
  totalPaidPaise: Paise;
  totalSharePaise: Paise;
  settlementsSentPaise: Paise;
  settlementsReceivedPaise: Paise;
  netPositionPaise: Paise; // Signed: >0 creditor, <0 debtor, 0 settled
  direction: NetPositionDirection;
  absoluteAmountPaise: Paise;
}

export interface SimplifiedTransfer {
  fromUserId: string; // Debtor
  toUserId: string;   // Creditor
  amountPaise: Paise;
}

export interface RoomFinancialSummaryV2 {
  roomId: string;
  totalExpensesPaise: Paise;
  totalSettledPaise: Paise;
  members: NetPosition[];
  simplifiedTransfers: SimplifiedTransfer[];
  isZeroSumVerified: boolean;
  netDiscrepancyPaise: Paise;
}
