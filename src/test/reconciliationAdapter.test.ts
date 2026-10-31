import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchReconciliationData,
  lockPeriodCloud,
  unlockPeriodCloud,
  signStatementCloud,
  isTransactionDateLocked,
  clearReconciliationStore,
} from '../lib/storage/reconciliationAdapter';
import { RoomMember, User, RoomReconciliationPeriod } from '../types';

describe('reconciliationAdapter (Track 4)', () => {
  const roomId = 'room-test-101';
  const year = 2026;
  const month = 10; // October
  const adminId = 'user-admin';

  const mockUsers: User[] = [
    {
      id: 'user-admin',
      name: 'Aditya (Admin)',
      email: 'aditya@example.com',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'user-roommate-2',
      name: 'Priya',
      email: 'priya@example.com',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'user-roommate-3',
      name: 'Rahul',
      email: 'rahul@example.com',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
  ];

  const mockMembers: RoomMember[] = [
    {
      id: 'mem-1',
      roomId,
      userId: 'user-admin',
      role: 'ROOM_ADMIN',
      status: 'ACTIVE',
      joinedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'mem-2',
      roomId,
      userId: 'user-roommate-2',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'mem-3',
      roomId,
      userId: 'user-roommate-3',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '2026-08-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    clearReconciliationStore();
  });

  it('initializes open period when no prior reconciliation exists', async () => {
    const data = await fetchReconciliationData(roomId, year, month, mockMembers, mockUsers);
    expect(data.hasPeriod).toBe(false);
    expect(data.period).toBeNull();
    expect(data.signoffs).toHaveLength(0);
  });

  it('locks period and seeds historical signatories', async () => {
    const locked = await lockPeriodCloud(roomId, year, month, adminId, mockMembers, mockUsers);
    expect(locked.hasPeriod).toBe(true);
    expect(locked.period?.status).toBe('LOCKED');
    expect(locked.period?.lockedBy).toBe(adminId);
    expect(locked.signoffs).toHaveLength(3);
    expect(locked.signoffs.every((s) => s.status === 'PENDING')).toBe(true);
  });

  it('unanimous sign-off transitions period to CERTIFIED with SHA-256 seal', async () => {
    // 1. Lock period
    const locked = await lockPeriodCloud(roomId, year, month, adminId, mockMembers, mockUsers);
    const periodId = locked.period!.id;

    // 2. Member 1 signs
    const after1 = await signStatementCloud(
      periodId,
      roomId,
      year,
      month,
      'user-admin',
      'SIGNED',
      undefined,
      mockMembers,
      mockUsers
    );
    expect(after1.period?.status).toBe('LOCKED'); // Still locked, not yet unanimous

    // 3. Member 2 signs
    const after2 = await signStatementCloud(
      periodId,
      roomId,
      year,
      month,
      'user-roommate-2',
      'SIGNED',
      undefined,
      mockMembers,
      mockUsers
    );
    expect(after2.period?.status).toBe('LOCKED');

    // 4. Member 3 signs (100% consensus reached)
    const after3 = await signStatementCloud(
      periodId,
      roomId,
      year,
      month,
      'user-roommate-3',
      'SIGNED',
      undefined,
      mockMembers,
      mockUsers
    );
    expect(after3.period?.status).toBe('CERTIFIED');
    expect(after3.period?.certifiedAt).toBeDefined();
    expect(after3.period?.certifiedSealHash).toBeDefined();
    expect(after3.period?.certifiedSealHash?.length).toBeGreaterThan(16);
  });

  it('unlocking period resets sign-offs and increments revision count', async () => {
    // 1. Lock & sign
    const locked = await lockPeriodCloud(roomId, year, month, adminId, mockMembers, mockUsers);
    const periodId = locked.period!.id;
    await signStatementCloud(
      periodId,
      roomId,
      year,
      month,
      'user-admin',
      'SIGNED',
      undefined,
      mockMembers,
      mockUsers
    );

    // 2. Admin unlocks with reason
    const unlocked = await unlockPeriodCloud(
      roomId,
      year,
      month,
      adminId,
      'Need to add missing grocery receipt',
      mockMembers,
      mockUsers
    );

    expect(unlocked.period?.status).toBe('OPEN');
    expect(unlocked.period?.revisionCount).toBe(2);
    expect(unlocked.period?.unlockReason).toBe('Need to add missing grocery receipt');
    expect(unlocked.signoffs.every((s) => s.status === 'PENDING')).toBe(true);
  });

  it('flags dispute correctly when roommate disputes statement', async () => {
    const locked = await lockPeriodCloud(roomId, year, month, adminId, mockMembers, mockUsers);
    const periodId = locked.period!.id;

    const disputed = await signStatementCloud(
      periodId,
      roomId,
      year,
      month,
      'user-roommate-2',
      'DISPUTED',
      'My share of electricity was calculated for full month but I joined on 15th',
      mockMembers,
      mockUsers
    );

    const disputedSignoff = disputed.signoffs.find((s) => s.userId === 'user-roommate-2');
    expect(disputedSignoff?.status).toBe('DISPUTED');
    expect(disputedSignoff?.disputeReason).toContain('joined on 15th');
    expect(disputed.period?.status).toBe('LOCKED'); // Not certified
  });

  it('detects locked dates with isTransactionDateLocked', () => {
    const periods: RoomReconciliationPeriod[] = [
      {
        id: 'p-1',
        roomId,
        periodYear: 2026,
        periodMonth: 9, // September 2026 is LOCKED
        status: 'LOCKED',
        revisionCount: 1,
        createdAt: '2026-09-30T00:00:00Z',
        updatedAt: '2026-09-30T00:00:00Z',
      },
      {
        id: 'p-2',
        roomId,
        periodYear: 2026,
        periodMonth: 10, // October 2026 is OPEN
        status: 'OPEN',
        revisionCount: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    expect(isTransactionDateLocked('2026-09-15', periods).isLocked).toBe(true);
    expect(isTransactionDateLocked('2026-10-15', periods).isLocked).toBe(false);
    expect(isTransactionDateLocked('2026-11-01', periods).isLocked).toBe(false);
  });
});
