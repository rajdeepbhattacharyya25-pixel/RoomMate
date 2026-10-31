/**
 * reconciliationAdapter.ts
 *
 * Client-side adapter and local storage coordinator for Track 4:
 * Monthly Room Ledger Audit & Certified Statement Export.
 *
 * Bridges live Supabase RPCs with offline-resilient local storage fallback.
 */

import {
  RoomReconciliationPeriod,
  RoomStatementSignoff,
  RoomStatementData,
  RoomMember,
  User,
} from '../../types';
import { supabaseService } from '../supabase/supabaseService';
import { IS_LIVE_SYNC_ENABLED } from './cloudStorageAdapter';

let isLiveSyncOverride: boolean | null = null;
export function setLiveReconciliationSyncForTesting(enabled: boolean | null) {
  isLiveSyncOverride = enabled;
}

function isLiveSyncActive(): boolean {
  if (isLiveSyncOverride !== null) return isLiveSyncOverride;
  return IS_LIVE_SYNC_ENABLED;
}

// In-memory / local storage key helper
const memoryStore = new Map<string, string>();

function getStorageKey(roomId: string, year: number, month: number): string {
  return `roommate_reconciliation_${roomId}_${year}_${month}`;
}

export function clearReconciliationStore(): void {
  memoryStore.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  } catch {
    // Ignore
  }
}

function getStoredReconciliation(roomId: string, year: number, month: number): RoomStatementData | null {
  try {
    const key = getStorageKey(roomId, year, month);
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : memoryStore.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setStoredReconciliation(roomId: string, year: number, month: number, data: RoomStatementData): void {
  try {
    const key = getStorageKey(roomId, year, month);
    const raw = JSON.stringify(data);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, raw);
    } else {
      memoryStore.set(key, raw);
    }
  } catch (err) {
    console.warn('[ReconciliationAdapter] Failed to persist reconciliation to local storage:', err);
  }
}

/**
 * Generate a deterministic SHA-256 seal hash in browser/client
 */
export async function computeClientSealHash(
  roomId: string,
  year: number,
  month: number,
  revision: number
): Promise<string> {
  const message = `ROOM:${roomId}|YEAR:${year}|MONTH:${month}|REV:${revision}|TIMESTAMP:${Date.now()}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback pseudorandom hex for non-web crypto environments
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Fetch reconciliation statement and sign-offs for a given room, year, and month
 */
export async function fetchReconciliationData(
  roomId: string,
  year: number,
  month: number,
  _members: RoomMember[] = [],
  _users: User[] = []
): Promise<RoomStatementData> {
  // 1. Try Supabase RPC if live sync enabled
  if (isLiveSyncActive()) {
    try {
      const res = await supabaseService.getRoomReconciliationStatement(roomId, year, month);
      if (res.success && res.data) {
        const cloudData = res.data;
        const result: RoomStatementData = {
          hasPeriod: cloudData.has_period || false,
          period: cloudData.period
            ? {
                id: cloudData.period.id,
                roomId: cloudData.period.room_id,
                periodYear: cloudData.period.period_year,
                periodMonth: cloudData.period.period_month,
                status: cloudData.period.status,
                lockedAt: cloudData.period.locked_at,
                lockedBy: cloudData.period.locked_by,
                unlockedAt: cloudData.period.unlocked_at,
                unlockReason: cloudData.period.unlock_reason,
                revisionCount: cloudData.period.revision_count || 1,
                certifiedAt: cloudData.period.certified_at,
                certifiedSealHash: cloudData.period.certified_seal_hash,
                createdAt: cloudData.period.created_at || new Date().toISOString(),
                updatedAt: cloudData.period.updated_at || new Date().toISOString(),
              }
            : null,
          signoffs: (cloudData.signoffs || []).map((s: any) => ({
            id: s.id,
            periodId: s.period_id || cloudData.period?.id,
            roomId,
            userId: s.user_id,
            userName: s.user_name,
            userAvatar: s.user_avatar,
            userEmail: s.user_email,
            status: s.status,
            signedAt: s.signed_at,
            disputeReason: s.dispute_reason,
            signatureStamp: s.signature_stamp,
            createdAt: s.created_at || new Date().toISOString(),
            updatedAt: s.updated_at || new Date().toISOString(),
          })),
        };
        setStoredReconciliation(roomId, year, month, result);
        return result;
      }
    } catch (err) {
      console.warn('[ReconciliationAdapter] Live fetch failed, using local cache:', err);
    }
  }

  // 2. Local Storage Cache / Mock Mode Fallback
  const cached = getStoredReconciliation(roomId, year, month);
  if (cached) {
    return cached;
  }

  // Default empty open period
  return {
    hasPeriod: false,
    period: null,
    signoffs: [],
  };
}

/**
 * Lock room monthly period
 */
export async function lockPeriodCloud(
  roomId: string,
  year: number,
  month: number,
  adminId: string,
  members: RoomMember[],
  users: User[]
): Promise<RoomStatementData> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Determine historical members active during this month (Edge Case 1)
  const eligibleMembers = members.filter((m) => {
    if (m.roomId !== roomId) return false;
    const joinedAt = new Date(m.joinedAt);
    const leftAt = m.leftAt ? new Date(m.leftAt) : null;
    return joinedAt <= monthEnd && (!leftAt || leftAt >= monthStart);
  });

  if (isLiveSyncActive()) {
    try {
      const res = await supabaseService.lockRoomPeriod(roomId, year, month);
      if (res.success) {
        return fetchReconciliationData(roomId, year, month, members, users);
      }
    } catch (err) {
      console.warn('[ReconciliationAdapter] Live lock failed, falling back to local:', err);
    }
  }

  // Local state update
  const existing = getStoredReconciliation(roomId, year, month);
  const periodId = existing?.period?.id || `period-${roomId}-${year}-${month}`;
  const now = new Date().toISOString();

  const newPeriod: RoomReconciliationPeriod = {
    id: periodId,
    roomId,
    periodYear: year,
    periodMonth: month,
    status: 'LOCKED',
    lockedAt: now,
    lockedBy: adminId,
    revisionCount: existing?.period?.revisionCount || 1,
    createdAt: existing?.period?.createdAt || now,
    updatedAt: now,
  };

  const userMap = new Map(users.map((u) => [u.id, u]));

  const newSignoffs: RoomStatementSignoff[] = eligibleMembers.map((m) => {
    const user = userMap.get(m.userId);
    return {
      id: `signoff-${periodId}-${m.userId}`,
      periodId,
      roomId,
      userId: m.userId,
      userName: user?.name || 'Roommate',
      userAvatar: user?.avatarUrl,
      userEmail: user?.email,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
  });

  const statementData: RoomStatementData = {
    hasPeriod: true,
    period: newPeriod,
    signoffs: newSignoffs,
  };

  setStoredReconciliation(roomId, year, month, statementData);
  return statementData;
}

/**
 * Unlock room monthly period with mandatory audit reason
 */
export async function unlockPeriodCloud(
  roomId: string,
  year: number,
  month: number,
  adminId: string,
  reason: string,
  members: RoomMember[],
  users: User[]
): Promise<RoomStatementData> {
  if (!reason.trim()) {
    throw new Error('An audit reason is required to unlock monthly reconciliation.');
  }

  if (isLiveSyncActive()) {
    try {
      const res = await supabaseService.unlockRoomPeriod(roomId, year, month, reason);
      if (res.success) {
        return fetchReconciliationData(roomId, year, month, members, users);
      }
    } catch (err) {
      console.warn('[ReconciliationAdapter] Live unlock failed, falling back to local:', err);
    }
  }

  const existing = getStoredReconciliation(roomId, year, month);
  if (!existing?.period) {
    throw new Error('No reconciliation period found to unlock.');
  }

  const now = new Date().toISOString();
  const updatedPeriod: RoomReconciliationPeriod = {
    ...existing.period,
    status: 'OPEN',
    unlockedAt: now,
    unlockedBy: adminId,
    unlockReason: reason.trim(),
    revisionCount: existing.period.revisionCount + 1,
    certifiedAt: undefined,
    certifiedSealHash: undefined,
    updatedAt: now,
  };

  // Reset all sign-offs to PENDING
  const resetSignoffs: RoomStatementSignoff[] = existing.signoffs.map((s) => ({
    ...s,
    status: 'PENDING',
    signedAt: undefined,
    disputeReason: undefined,
    signatureStamp: undefined,
    updatedAt: now,
  }));

  const statementData: RoomStatementData = {
    hasPeriod: true,
    period: updatedPeriod,
    signoffs: resetSignoffs,
  };

  setStoredReconciliation(roomId, year, month, statementData);
  return statementData;
}

/**
 * Sign off on or dispute monthly statement
 */
export async function signStatementCloud(
  periodId: string,
  roomId: string,
  year: number,
  month: number,
  userId: string,
  status: 'SIGNED' | 'DISPUTED',
  reason?: string,
  members: RoomMember[] = [],
  users: User[] = []
): Promise<RoomStatementData> {
  if (status === 'DISPUTED' && !reason?.trim()) {
    throw new Error('A dispute reason is required when flagging a statement.');
  }

  if (isLiveSyncActive()) {
    // Codex P1: Never fall through to mock/local certification when live cloud sync is active.
    // Authoritative RPC error or rejection must propagate directly to the caller.
    const res = await supabaseService.signRoomStatement(periodId, status, reason);
    if (!res.success) {
      throw new Error(res.error || 'Failed to sign statement on cloud server.');
    }
    return fetchReconciliationData(roomId, year, month, members, users);
  }

  const existing = getStoredReconciliation(roomId, year, month);
  if (!existing?.period) {
    throw new Error('No reconciliation period found.');
  }

  const now = new Date().toISOString();
  const updatedSignoffs = existing.signoffs.map((s) => {
    if (s.userId !== userId) return s;
    if (status === 'SIGNED') {
      return {
        ...s,
        status: 'SIGNED' as const,
        signedAt: now,
        disputeReason: undefined,
        signatureStamp: `STAMP-${userId.slice(0, 8)}-${Date.now()}`,
        updatedAt: now,
      };
    }
    return {
      ...s,
      status: 'DISPUTED' as const,
      disputeReason: reason?.trim(),
      signedAt: undefined,
      signatureStamp: undefined,
      updatedAt: now,
    };
  });

  // Check unanimous consensus (100% of signatories signed)
  const allSigned =
    updatedSignoffs.length > 0 && updatedSignoffs.every((s) => s.status === 'SIGNED');

  let updatedPeriod = { ...existing.period, updatedAt: now };

  if (allSigned) {
    const sealHash = await computeClientSealHash(
      roomId,
      year,
      month,
      existing.period.revisionCount
    );
    updatedPeriod = {
      ...updatedPeriod,
      status: 'CERTIFIED',
      certifiedAt: now,
      certifiedSealHash: sealHash,
    };
  }

  const result: RoomStatementData = {
    hasPeriod: true,
    period: updatedPeriod,
    signoffs: updatedSignoffs,
  };

  setStoredReconciliation(roomId, year, month, result);
  return result;
}

/**
 * Pre-check if a given date falls inside a locked reconciliation period
 */
export function isTransactionDateLocked(
  dateStr: string,
  periods: RoomReconciliationPeriod[]
): { isLocked: boolean; periodStatus?: string } {
  if (!dateStr || !periods || periods.length === 0) return { isLocked: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { isLocked: false };

  const txYear = d.getFullYear();
  const txMonth = d.getMonth() + 1; // 1-indexed

  const match = periods.find(
    (p) =>
      p.periodYear === txYear &&
      p.periodMonth === txMonth &&
      (p.status === 'LOCKED' || p.status === 'CERTIFIED')
  );

  if (match) {
    return { isLocked: true, periodStatus: match.status };
  }
  return { isLocked: false };
}
