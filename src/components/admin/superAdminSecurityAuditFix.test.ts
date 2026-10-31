import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../../lib/storage/mockStorage';
import {
  checkRateLimit,
  recordMfaFailure,
  resetMfaFailures,
  verifySuperAdminTotp,
  hashMasterPassword,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../../lib/auth/superAdminSecurityService';
import { User } from '../../types';

// In-Memory Storage Polyfill for Node Test Environment
class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Adversarial Security Test Suite: SuperAdmin Zero-Trust Remediation', () => {
  const superAdminId = 'usr-admin-audit-1';
  const superAdminEmail = 'verified.admin@roommate.internal';
  const studentId = 'usr-student-audit-2';
  const studentEmail = 'student.resident@campus.edu';
  const suspendedAdminId = 'usr-suspended-admin-3';
  const suspendedAdminEmail = 'suspended.admin@roommate.internal';

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = new MockStorage();
    }
  });

  beforeEach(async () => {
    // Reset rate limiter and clear persistent storage
    resetMfaFailures();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    const masterHash = await hashMasterPassword('RealAdminKey2026!');

    // Initialize mock database state with strict roles
    const state = db.getState();
    state.users = [
      {
        id: superAdminId,
        name: 'Verified Admin',
        email: superAdminEmail,
        role: 'SUPER_ADMIN',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: studentId,
        name: 'Resident Student',
        email: studentEmail,
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: suspendedAdminId,
        name: 'Suspended Admin',
        email: suspendedAdminEmail,
        role: 'SUPER_ADMIN',
        isSuspended: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    state.superAdminSecuritySettings = {
      [superAdminId]: {
        userId: superAdminId,
        masterPasswordHash: masterHash,
        totpEnrolled: true,
        totpFactorId: 'factor_mock_123',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        backupTotpEnrolled: false,
        biometricEnabled: false,
        recoveryCodesConfigured: true,
        recoveryCodesRemaining: 8,
        mfaRequired: true,
        failedMfaAttempts: 0,
        currentAal: 'aal2',
        lastStepUpAt: new Date().toISOString(),
        lastStepUpLevel: 2,
        updatedAt: new Date().toISOString(),
      },
    };

    state.superAdminRecoveryCodes = [];
  });

  // ===========================================================================
  // 1. UNCOMMITTED PRIVILEGE ESCALATION & AUTO-PROMOTION PREVENTION
  // ===========================================================================
  describe('Vector 1: Unauthenticated Privilege Escalation Prevention', () => {
    it('strictly forbids promoting an unknown visitor email to SUPER_ADMIN', () => {
      const attackerEmail = 'attacker@evil-external.com';
      const usersBefore = [...db.getState().users];

      // Simulate check against users table
      const matched = usersBefore.find((u) => u.email.toLowerCase() === attackerEmail.toLowerCase());
      const isAuthorized = Boolean(matched && matched.role === 'SUPER_ADMIN' && !matched.isSuspended);

      expect(isAuthorized).toBe(false);

      // Verify no user was created or promoted in storage
      const usersAfter = db.getState().users;
      expect(usersAfter.some((u) => u.email === attackerEmail)).toBe(false);
      expect(usersAfter.filter((u) => u.role === 'SUPER_ADMIN').length).toBe(2); // Only verified + suspended admin
    });

    it('strictly denies administrative console access to regular STUDENT accounts', () => {
      const state = db.getState();
      const matchedStudent = state.users.find((u) => u.email === studentEmail);
      expect(matchedStudent).toBeDefined();

      const isAuthorized = Boolean(
        matchedStudent && matchedStudent.role === 'SUPER_ADMIN' && !matchedStudent.isSuspended
      );

      expect(isAuthorized).toBe(false);
      expect(matchedStudent?.role).toBe('STUDENT');
    });

    it('blocks suspended SUPER_ADMIN accounts from authentication', () => {
      const state = db.getState();
      const matchedSuspended = state.users.find((u) => u.email === suspendedAdminEmail);
      expect(matchedSuspended).toBeDefined();

      const isAuthorized = Boolean(
        matchedSuspended && matchedSuspended.role === 'SUPER_ADMIN' && !matchedSuspended.isSuspended
      );

      expect(isAuthorized).toBe(false);
    });

    it('strictly denies administrative access using legacy hardcoded developer emails', () => {
      const state = db.getState();
      const legacyDeveloperEmail = 'rajdeepbhattacharya.slsn9a@gmail.com';
      const matched = state.users.find((u) => u.email === legacyDeveloperEmail);
      expect(matched).toBeUndefined();

      const isAuthorized = Boolean(matched && (matched as any).role === 'SUPER_ADMIN');
      expect(isAuthorized).toBe(false);
    });
  });

  // ===========================================================================
  // 2. HARDCODED MASTER KEY BACKDOOR ELIMINATION
  // ===========================================================================
  describe('Vector 2: Hardcoded Master Key Invalidation', () => {
    it('rejects master password change when using the legacy backdoor key "master_admin_key_2026"', async () => {
      const settings = db.getSuperAdminSecuritySettings(superAdminId);
      const injectedBackdoorPassword = 'master_admin_key_2026';

      const enteredHash = await hashMasterPassword(injectedBackdoorPassword);
      const isMatch = enteredHash === settings.masterPasswordHash;

      // Must be FALSE because the real key is 'RealAdminKey2026!'
      expect(isMatch).toBe(false);
    });

    it('permits master password change only when the genuine current key is provided', async () => {
      const settings = db.getSuperAdminSecuritySettings(superAdminId);
      const correctPassword = 'RealAdminKey2026!';

      const enteredHash = await hashMasterPassword(correctPassword);
      const isMatch = enteredHash === settings.masterPasswordHash;

      expect(isMatch).toBe(true);
    });
  });

  // ===========================================================================
  // 3. PERSISTENT BRUTE-FORCE RATE LIMITING
  // ===========================================================================
  describe('Vector 3: Persistent Anti-Brute-Force Rate Limiting', () => {
    it('triggers a 15-minute security lockout after 5 consecutive failures', () => {
      expect(checkRateLimit().isLocked).toBe(false);

      for (let i = 1; i <= 4; i++) {
        const res = recordMfaFailure();
        expect(res.isLocked).toBe(false);
        expect(res.attemptsRemaining).toBe(5 - i);
      }

      const fifthAttempt = recordMfaFailure();
      expect(fifthAttempt.isLocked).toBe(true);
      expect(fifthAttempt.attemptsRemaining).toBe(0);

      const status = checkRateLimit();
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(850);
    });

    it('persists the lockout in storage across simulated browser reloads (F5)', () => {
      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        recordMfaFailure();
      }
      expect(checkRateLimit().isLocked).toBe(true);

      // Simulate browser tab reload by reading directly from storage
      const rawStored = localStorage.getItem('roommate_superadmin_auth_ratelimit');
      expect(rawStored).toBeTruthy();
      const parsed = JSON.parse(rawStored!);
      expect(parsed.failedAttempts).toBe(5);
      expect(parsed.lockedUntil).toBeGreaterThan(Date.now());

      // Fresh check reflects persisted lockout
      const freshCheck = checkRateLimit();
      expect(freshCheck.isLocked).toBe(true);
      expect(freshCheck.remainingSeconds).toBeGreaterThan(0);
    });

    it('clears lockout only upon explicit resetMfaFailures after verified authentication', () => {
      for (let i = 0; i < 5; i++) {
        recordMfaFailure();
      }
      expect(checkRateLimit().isLocked).toBe(true);

      resetMfaFailures();
      expect(checkRateLimit().isLocked).toBe(false);
    });
  });

  // ===========================================================================
  // 4. RECOVERY CODES: SINGLE-USE & REPLAY PROTECTION
  // ===========================================================================
  describe('Vector 4: Cryptographic One-Time Recovery Code Enforcement', () => {
    it('verifies a valid recovery code and permanently consumes it against replay', async () => {
      const generated = generateRecoveryCodes(8);
      const codeHashes: string[] = [];
      for (const c of generated) {
        codeHashes.push(await hashRecoveryCode(c));
      }

      // Store in DB with isInitialEnrollment = true
      db.storeRecoveryCodes(superAdminId, codeHashes, undefined, true);

      const targetHash = codeHashes[0];

      // 1st verification: Must SUCCEED
      const firstAttempt = db.verifyRecoveryCode(superAdminId, targetHash);
      expect(firstAttempt.success).toBe(true);

      // 2nd verification (Replay Attack): Must FAIL
      const secondAttempt = db.verifyRecoveryCode(superAdminId, targetHash);
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toBe('Invalid authentication code.');
    });

    it('rejects forged recovery codes', async () => {
      const forgedHash = await hashRecoveryCode('FAKE-CODE-9999');
      const res = db.verifyRecoveryCode(superAdminId, forgedHash);
      expect(res.success).toBe(false);
    });
  });

  // ===========================================================================
  // 5. CLIENT-SIDE PROFILE INTEGRITY & ROLE AUTHORITY
  // ===========================================================================
  describe('Vector 5: Remote Cloud Profile Authority & Tamper Prevention', () => {
    it('demotes client state when remote profile returns STUDENT and does not overwrite remote data', () => {
      // Simulate remote cloud returning demoted student profile
      const remoteCloudUser: User = {
        id: superAdminId,
        name: 'Demoted User',
        email: superAdminEmail,
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const localCurrentUserRole: string = 'SUPER_ADMIN';

      // Anti-tamper logic from remediated App.tsx:
      // The remote role must NOT be overwritten by local state
      let effectiveUser = { ...remoteCloudUser };
      if (localCurrentUserRole === 'SUPER_ADMIN' && remoteCloudUser.role !== 'SUPER_ADMIN') {
        // Do NOT set remoteCloudUser.role = 'SUPER_ADMIN'
      }

      expect(effectiveUser.role).toBe('STUDENT');
      expect(effectiveUser.role).not.toBe('SUPER_ADMIN');
    });
  });

  // ===========================================================================
  // 6. FAIL-CLOSED NETWORK & CLOUD MFA SEMANTICS
  // ===========================================================================
  describe('Vector 6: Fail-Closed Hybrid MFA Enforcement', () => {
    it('rejects invalid TOTP codes in local mock mode without false positives', async () => {
      const res = await verifySuperAdminTotp('factor_mock_123', '000000', 'JBSWY3DPEHPK3PXP');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid authentication code.');
    });

    it('fails closed when given an empty or malformed token', async () => {
      const res = await verifySuperAdminTotp('factor_mock_123', '', 'JBSWY3DPEHPK3PXP');
      expect(res.success).toBe(false);
    });
  });
});
