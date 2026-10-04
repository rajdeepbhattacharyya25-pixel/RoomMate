import { describe, it, expect } from 'vitest';
import { validateSettlementAttempt } from './referenceEngine';
import { NetPosition } from './types';

interface SecurityContext {
  callerUserId: string;
  activeRoomMembers: Map<string, Set<string>>; // roomId -> Set of userIds
  isSuperAdmin?: boolean;
}

/**
 * Pure test validator modeling the database security contract
 */
function validateSecurityContract(
  context: SecurityContext,
  operation:
    | {
        type: 'CREATE_EXPENSE';
        roomId: string;
        paidBy: string;
        createdBy: string;
        totalAmountPaise: number;
        participants: string[];
      }
    | {
        type: 'RECORD_SETTLEMENT';
        roomId: string;
        payerId: string;
        payeeId: string;
        amountPaise: number;
        payerPosition?: NetPosition;
        payeePosition?: NetPosition;
      }
): { isAllowed: boolean; error?: string } {
  const roomMembers = context.activeRoomMembers.get(operation.roomId);
  if (!roomMembers) {
    return { isAllowed: false, error: 'FORGED_OR_INVALID_ROOM_ID' };
  }

  if (operation.type === 'CREATE_EXPENSE') {
    // 10. Forged member ID / creator check
    if (context.callerUserId !== operation.createdBy && !context.isSuperAdmin) {
      return { isAllowed: false, error: 'FORGED_CREATOR_ID' };
    }
    // 1. Payer not in room
    if (!roomMembers.has(operation.paidBy)) {
      return { isAllowed: false, error: 'PAYER_NOT_IN_ROOM' };
    }
    // 2. Participant not in room & 3. Cross-room participant
    for (const p of operation.participants) {
      if (!roomMembers.has(p)) {
        return { isAllowed: false, error: 'PARTICIPANT_NOT_IN_ROOM' };
      }
    }
    // 7. Negative amount or zero
    if (operation.totalAmountPaise <= 0) {
      return { isAllowed: false, error: 'INVALID_EXPENSE_AMOUNT' };
    }
    return { isAllowed: true };
  }

  if (operation.type === 'RECORD_SETTLEMENT') {
    // 5. Unauthorized settlement (caller must be payer or admin)
    if (context.callerUserId !== operation.payerId && !context.isSuperAdmin) {
      return { isAllowed: false, error: 'UNAUTHORIZED_SETTLEMENT_CALLER' };
    }
    // 4. Cross-room settlement
    if (!roomMembers.has(operation.payerId)) {
      return { isAllowed: false, error: 'SETTLEMENT_PAYER_NOT_IN_ROOM' };
    }
    if (!roomMembers.has(operation.payeeId)) {
      return { isAllowed: false, error: 'SETTLEMENT_PAYEE_NOT_IN_ROOM' };
    }
    // 7. Negative amount
    if (operation.amountPaise <= 0) {
      return { isAllowed: false, error: 'NEGATIVE_OR_ZERO_SETTLEMENT_AMOUNT' };
    }
    // 6 & 8. Over-settlement / amount manipulation
    if (operation.payerPosition && operation.payeePosition) {
      const settleCheck = validateSettlementAttempt(
        operation.payerPosition,
        operation.payeePosition,
        operation.amountPaise
      );
      if (!settleCheck.isValid) {
        return { isAllowed: false, error: settleCheck.error };
      }
    }
    return { isAllowed: true };
  }

  return { isAllowed: false, error: 'UNKNOWN_OPERATION' };
}

describe('Part 25 — Security Test Contract (10 Security Scenarios)', () => {
  const context: SecurityContext = {
    callerUserId: 'user-alice',
    activeRoomMembers: new Map([
      ['room-101', new Set(['user-alice', 'user-bob', 'user-charlie'])],
      ['room-999', new Set(['user-stranger-x', 'user-stranger-y'])],
    ]),
  };

  it('Scenario 1: Rejects expense when payer is not in the room', () => {
    const res = validateSecurityContract(context, {
      type: 'CREATE_EXPENSE',
      roomId: 'room-101',
      createdBy: 'user-alice',
      paidBy: 'user-outsider',
      totalAmountPaise: 10000,
      participants: ['user-alice', 'user-bob'],
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('PAYER_NOT_IN_ROOM');
  });

  it('Scenario 2: Rejects expense when a participant is not in the room', () => {
    const res = validateSecurityContract(context, {
      type: 'CREATE_EXPENSE',
      roomId: 'room-101',
      createdBy: 'user-alice',
      paidBy: 'user-alice',
      totalAmountPaise: 10000,
      participants: ['user-alice', 'user-stranger-x'],
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('PARTICIPANT_NOT_IN_ROOM');
  });

  it('Scenario 3: Rejects cross-room participant contamination', () => {
    // user-stranger-x belongs to room-999, not room-101
    const res = validateSecurityContract(context, {
      type: 'CREATE_EXPENSE',
      roomId: 'room-101',
      createdBy: 'user-alice',
      paidBy: 'user-alice',
      totalAmountPaise: 5000,
      participants: ['user-stranger-x'],
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('PARTICIPANT_NOT_IN_ROOM');
  });

  it('Scenario 4: Rejects cross-room settlement', () => {
    // Attempting settlement in room-101 for a user who belongs to room-999
    const res = validateSecurityContract(context, {
      type: 'RECORD_SETTLEMENT',
      roomId: 'room-101',
      payerId: 'user-alice',
      payeeId: 'user-stranger-x',
      amountPaise: 2500,
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('SETTLEMENT_PAYEE_NOT_IN_ROOM');
  });

  it('Scenario 5: Rejects unauthorized settlement (caller is neither payer nor admin)', () => {
    // Alice tries to initiate a settlement where Bob pays Charlie
    const res = validateSecurityContract(context, {
      type: 'RECORD_SETTLEMENT',
      roomId: 'room-101',
      payerId: 'user-bob',
      payeeId: 'user-charlie',
      amountPaise: 3000,
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('UNAUTHORIZED_SETTLEMENT_CALLER');
  });

  it('Scenario 6: Rejects settlement amount manipulation (exceeding debtor balance)', () => {
    const posBob: NetPosition = {
      userId: 'user-bob',
      totalPaidPaise: 0,
      totalSharePaise: 5000,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise: -5000, // Bob owes ₹50
      direction: 'OWES',
      absoluteAmountPaise: 5000,
    };
    const posAlice: NetPosition = {
      userId: 'user-alice',
      totalPaidPaise: 5000,
      totalSharePaise: 0,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise: 5000,
      direction: 'RECEIVE',
      absoluteAmountPaise: 5000,
    };

    // Bob tries to record paying ₹9999 (manipulated payload)
    const bobContext: SecurityContext = { ...context, callerUserId: 'user-bob' };
    const res = validateSecurityContract(bobContext, {
      type: 'RECORD_SETTLEMENT',
      roomId: 'room-101',
      payerId: 'user-bob',
      payeeId: 'user-alice',
      amountPaise: 999900,
      payerPosition: posBob,
      payeePosition: posAlice,
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');
  });

  it('Scenario 7: Rejects negative amount', () => {
    const res = validateSecurityContract(context, {
      type: 'CREATE_EXPENSE',
      roomId: 'room-101',
      createdBy: 'user-alice',
      paidBy: 'user-alice',
      totalAmountPaise: -1000,
      participants: ['user-alice', 'user-bob'],
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('INVALID_EXPENSE_AMOUNT');
  });

  it('Scenario 8: Rejects over-settlement beyond outstanding debt', () => {
    const posAlice: NetPosition = {
      userId: 'user-alice',
      totalPaidPaise: 1000,
      totalSharePaise: 3000,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise: -2000, // Alice owes 2000 paise
      direction: 'OWES',
      absoluteAmountPaise: 2000,
    };
    const posBob: NetPosition = {
      userId: 'user-bob',
      totalPaidPaise: 3000,
      totalSharePaise: 1000,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise: 2000,
      direction: 'RECEIVE',
      absoluteAmountPaise: 2000,
    };

    const res = validateSecurityContract(context, {
      type: 'RECORD_SETTLEMENT',
      roomId: 'room-101',
      payerId: 'user-alice',
      payeeId: 'user-bob',
      amountPaise: 2001, // 1 paisa over!
      payerPosition: posAlice,
      payeePosition: posBob,
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');
  });

  it('Scenario 9: Rejects forged member ID (caller masquerading as another creator)', () => {
    // Alice submits request with created_by = 'user-bob'
    const res = validateSecurityContract(context, {
      type: 'CREATE_EXPENSE',
      roomId: 'room-101',
      createdBy: 'user-bob',
      paidBy: 'user-bob',
      totalAmountPaise: 10000,
      participants: ['user-alice', 'user-bob'],
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('FORGED_CREATOR_ID');
  });

  it('Scenario 10: Rejects forged or non-existent room ID', () => {
    const res = validateSecurityContract(context, {
      type: 'CREATE_EXPENSE',
      roomId: 'forged-fake-room-id-999',
      createdBy: 'user-alice',
      paidBy: 'user-alice',
      totalAmountPaise: 5000,
      participants: ['user-alice'],
    });
    expect(res.isAllowed).toBe(false);
    expect(res.error).toBe('FORGED_OR_INVALID_ROOM_ID');
  });
});
