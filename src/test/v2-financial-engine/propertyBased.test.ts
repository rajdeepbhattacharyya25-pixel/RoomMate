import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  validateAndCalculateExactSplits,
  calculatePercentageSplits,
  calculateSharesSplits,
  calculateMemberNetPositions,
  simplifyDebts,
  calculateRoomSummaryV2,
  validateSettlementAttempt,
} from './referenceEngine';
import { Expense, Settlement, SplitMethod } from './types';

// Simple deterministic PRNG (Mulberry32) for reproducible property-based testing
function createPrng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Part 18 — Randomized Property-Based Tests (Properties P1–P10)', () => {
  it('verifies all 10 core financial properties across 100 randomized scenarios', () => {
    const rng = createPrng(42); // Fixed seed for 100% deterministic reproducibility

    for (let scenarioIdx = 0; scenarioIdx < 100; scenarioIdx++) {
      // 1. Members: 2 to 15 members
      const numMembers = 2 + Math.floor(rng() * 14);
      const members = Array.from({ length: numMembers }, (_, i) => `user_${i.toString().padStart(2, '0')}`);

      // 2. Expenses: 1 to 30 expenses
      const numExpenses = 1 + Math.floor(rng() * 30);
      const expenses: Expense[] = [];

      for (let eIdx = 0; eIdx < numExpenses; eIdx++) {
        // Random amount between ₹1 (100 paise) and ₹5000 (500000 paise)
        const totalAmountPaise = 100 + Math.floor(rng() * 499900);
        // Random payer
        const paidBy = members[Math.floor(rng() * members.length)];

        // Random subset of participants (at least 2)
        const shuffled = [...members].sort(() => rng() - 0.5);
        const participantCount = 2 + Math.floor(rng() * (members.length - 1));
        const participants = shuffled.slice(0, participantCount).sort();

        // Random split mode
        const modes: SplitMethod[] = ['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'];
        const splitMethod = modes[Math.floor(rng() * modes.length)];

        let shares;
        if (splitMethod === 'EQUAL') {
          shares = calculateEqualSplits(totalAmountPaise, participants);
        } else if (splitMethod === 'EXACT') {
          // Generate positive random integer shares that sum to totalAmountPaise
          const rawWeights = participants.map(() => 1 + Math.floor(rng() * 100));
          const sumW = rawWeights.reduce((a, b) => a + b, 0);
          let allocated = 0;
          const exactRecord: Record<string, number> = {};
          participants.forEach((p, idx) => {
            if (idx === participants.length - 1) {
              exactRecord[p] = totalAmountPaise - allocated;
            } else {
              const share = Math.max(1, Math.floor((totalAmountPaise * rawWeights[idx]) / sumW));
              exactRecord[p] = share;
              allocated += share;
            }
          });
          // Fix last if edge case negative or zero
          if (exactRecord[participants[participants.length - 1]] <= 0) {
            // fallback to equal
            shares = calculateEqualSplits(totalAmountPaise, participants);
          } else {
            shares = validateAndCalculateExactSplits(totalAmountPaise, exactRecord);
          }
        } else if (splitMethod === 'PERCENTAGE') {
          // Generate basis points summing to 10000
          const rawWeights = participants.map(() => 1 + Math.floor(rng() * 100));
          const sumW = rawWeights.reduce((a, b) => a + b, 0);
          let allocatedBp = 0;
          const bpRecord: Record<string, number> = {};
          participants.forEach((p, idx) => {
            if (idx === participants.length - 1) {
              bpRecord[p] = 10000 - allocatedBp;
            } else {
              const bp = Math.max(1, Math.floor((10000 * rawWeights[idx]) / sumW));
              bpRecord[p] = bp;
              allocatedBp += bp;
            }
          });
          if (bpRecord[participants[participants.length - 1]] <= 0) {
            shares = calculateEqualSplits(totalAmountPaise, participants);
          } else {
            shares = calculatePercentageSplits(totalAmountPaise, bpRecord);
          }
        } else {
          // SHARES
          const weightRecord: Record<string, number> = {};
          participants.forEach((p) => {
            weightRecord[p] = 1 + Math.floor(rng() * 10);
          });
          shares = calculateSharesSplits(totalAmountPaise, weightRecord);
        }

        // PROPERTY P1: All expense shares sum exactly to expense total
        const sumShares = shares.reduce((acc, s) => acc + s.sharePaise, 0);
        expect(sumShares).toBe(totalAmountPaise);

        // PROPERTY P8: All shares are integers
        for (const s of shares) {
          expect(Number.isInteger(s.sharePaise)).toBe(true);
        }

        expenses.push({
          id: `exp-${scenarioIdx}-${eIdx}`,
          roomId: `room-${scenarioIdx}`,
          paidBy,
          totalAmountPaise,
          title: `Expense ${eIdx}`,
          splitMethod,
          shares,
        });
      }

      // Compute initial net positions
      const preSettlementNet = calculateMemberNetPositions(members, expenses, []);

      // PROPERTY P2: All room net positions sum to zero
      let netSumPre = 0;
      for (const pos of preSettlementNet.values()) {
        netSumPre += pos.netPositionPaise;
        expect(Number.isInteger(pos.netPositionPaise)).toBe(true);
      }
      expect(netSumPre).toBe(0);

      // 3. Random Settlements (0 to 5 settlements)
      const numSettlements = Math.floor(rng() * 6);
      const settlements: Settlement[] = [];

      let currentNet = calculateMemberNetPositions(members, expenses, settlements);

      for (let sIdx = 0; sIdx < numSettlements; sIdx++) {
        const debtors = [...currentNet.values()].filter((p) => p.netPositionPaise < 0);
        const creditors = [...currentNet.values()].filter((p) => p.netPositionPaise > 0);

        if (debtors.length === 0 || creditors.length === 0) break;

        const debtor = debtors[Math.floor(rng() * debtors.length)];
        const creditor = creditors[Math.floor(rng() * creditors.length)];

        // Max possible settlement between this debtor and creditor
        const maxAmount = Math.min(Math.abs(debtor.netPositionPaise), creditor.netPositionPaise);
        if (maxAmount <= 0) continue;

        // Random partial or full settlement
        const settleAmount = Math.max(1, Math.floor(rng() * maxAmount) + 1);

        // PROPERTY P5 & P6 validation
        const valRes = validateSettlementAttempt(debtor, creditor, settleAmount);
        expect(valRes.isValid).toBe(true);

        settlements.push({
          id: `settle-${scenarioIdx}-${sIdx}`,
          roomId: `room-${scenarioIdx}`,
          payerId: debtor.userId,
          payeeId: creditor.userId,
          amountPaise: settleAmount,
          createdAt: new Date().toISOString(),
        });

        currentNet = calculateMemberNetPositions(members, expenses, settlements);
      }

      // PROPERTY P3: All settlements preserve value (sum of nets after settlements remains 0)
      let netSumPost = 0;
      for (const pos of currentNet.values()) {
        netSumPost += pos.netPositionPaise;
      }
      expect(netSumPost).toBe(0);

      // Run Debt Simplification
      const transfers = simplifyDebts(currentNet);

      // PROPERTY P4: No debtor becomes creditor because of settlement simplification
      // (Transfers only move money from debtors to creditors)
      const debtorsSet = new Set([...currentNet.values()].filter((p) => p.netPositionPaise < 0).map((p) => p.userId));
      const creditorsSet = new Set([...currentNet.values()].filter((p) => p.netPositionPaise > 0).map((p) => p.userId));

      for (const t of transfers) {
        expect(debtorsSet.has(t.fromUserId)).toBe(true);
        expect(creditorsSet.has(t.toUserId)).toBe(true);
        // PROPERTY P6: No self-settlement
        expect(t.fromUserId).not.toBe(t.toUserId);
        expect(t.amountPaise).toBeGreaterThan(0);
      }

      // PROPERTY P7: No cycles (strictly bipartite graph)
      const fromNodes = new Set(transfers.map((t) => t.fromUserId));
      const toNodes = new Set(transfers.map((t) => t.toUserId));
      const intermediateNodes = [...fromNodes].filter((x) => toNodes.has(x));
      expect(intermediateNodes).toHaveLength(0);

      // PROPERTY P9: Repeated calculation is deterministic
      const repeatedTransfers = simplifyDebts(currentNet);
      expect(repeatedTransfers).toEqual(transfers);

      // PROPERTY P10: Settlement simplification produces equivalent final balances
      const transferredOut = new Map<string, number>();
      const transferredIn = new Map<string, number>();

      for (const t of transfers) {
        transferredOut.set(t.fromUserId, (transferredOut.get(t.fromUserId) || 0) + t.amountPaise);
        transferredIn.set(t.toUserId, (transferredIn.get(t.toUserId) || 0) + t.amountPaise);
      }

      for (const [userId, pos] of currentNet.entries()) {
        if (pos.netPositionPaise < 0) {
          expect(transferredOut.get(userId) || 0).toBe(Math.abs(pos.netPositionPaise));
        } else if (pos.netPositionPaise > 0) {
          expect(transferredIn.get(userId) || 0).toBe(pos.netPositionPaise);
        } else {
          expect(transferredOut.has(userId)).toBe(false);
          expect(transferredIn.has(userId)).toBe(false);
        }
      }

      // Full summary helper check
      const fullSummary = calculateRoomSummaryV2(`room-${scenarioIdx}`, members, expenses, settlements);
      expect(fullSummary.isZeroSumVerified).toBe(true);
      expect(fullSummary.netDiscrepancyPaise).toBe(0);
    }
  });
});
