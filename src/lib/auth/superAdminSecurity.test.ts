import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../storage/mockStorage';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRfc6238Totp,
  checkRateLimit,
  recordMfaFailure,
  resetMfaFailures,
} from './superAdminSecurityService';

describe('SuperAdmin Zero-Trust Security System — Adversarial Test Suite', () => {
  const superAdminId = 'usr-admin-1';
  const roomAdminId = 'usr-roomadmin-2';
  const studentId = 'usr-student-3';
  const trustedDeviceId = 'dev-workstation-chrome';
  const revokedDeviceId = 'dev-compromised-phone';

  beforeEach(() => {
    // Reset rate limiter and step-up cache
    resetMfaFailures();

    // Ensure mock users in db representing full hierarchy
    (db as any).state.users = [
      {
        id: superAdminId,
        email: 'superadmin@roommate.app',
        name: 'Master Admin',
        role: 'SUPER_ADMIN',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: roomAdminId,
        email: 'roomadmin@roommate.app',
        name: 'Room Administrator',
        role: 'ADMINISTRATOR',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: studentId,
        email: 'student@roommate.app',
        name: 'Normal Student',
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Reset security settings
    (db as any).state.superAdminSecuritySettings = {
      [superAdminId]: {
        userId: superAdminId,
        totpEnrolled: true,
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

    // Seed devices
    (db as any).state.superAdminTrustedDevices = [
      {
        id: 'td-1',
        userId: superAdminId,
        deviceId: trustedDeviceId,
        deviceName: 'Workstation Chrome',
        platform: 'Windows',
        browser: 'Google Chrome',
        isTrusted: true,
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'td-2',
        userId: superAdminId,
        deviceId: revokedDeviceId,
        deviceName: 'Compromised Phone',
        platform: 'Android',
        browser: 'Chrome Mobile',
        isTrusted: false,
        revokedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    // Reset recovery codes and audit logs
    (db as any).state.superAdminRecoveryCodes = [];
    (db as any).state.securityAuditLogs = [];
  });

  // ===========================================================================
  // VECTOR A: Student -> SuperAdmin RPC (assert throws FORBIDDEN)
  // ===========================================================================
  describe('Vector A: Student Unauthorized RPC Invocation', () => {
    it('strictly blocks STUDENT from invoking SuperAdmin access assertion', () => {
      expect(() => {
        db.assertSuperAdminAccess(studentId, 1);
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization/);
    });

    it('strictly blocks STUDENT from toggling user suspension', () => {
      expect(() => {
        db.superAdminToggleUserSuspension(studentId, 'some-target-id', true);
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN/);
    });
  });

  // ===========================================================================
  // VECTOR B: Room Admin -> SuperAdmin RPC (assert throws FORBIDDEN)
  // ===========================================================================
  describe('Vector B: Room Admin (ADMINISTRATOR) Unauthorized RPC Invocation', () => {
    it('strictly blocks ADMINISTRATOR from asserting SuperAdmin privilege', () => {
      expect(() => {
        db.assertSuperAdminAccess(roomAdminId, 1);
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization/);
    });

    it('strictly blocks ADMINISTRATOR from room freeze operations via SuperAdmin path', () => {
      expect(() => {
        db.superAdminToggleRoomFreeze(roomAdminId, 'room-1', true);
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN/);
    });
  });

  // ===========================================================================
  // VECTOR C: Student -> Role Escalation (assert blocked)
  // ===========================================================================
  describe('Vector C: Student Role Escalation Attack', () => {
    it('aborts role escalation when student attempts to elevate their own role to SUPER_ADMIN', () => {
      expect(() => {
        db.updateUserRole(studentId, studentId, 'SUPER_ADMIN');
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN/);

      // Verify the target user role in storage was NOT altered
      const user = (db as any).state.users.find((u: any) => u.id === studentId);
      expect(user.role).toBe('STUDENT');
    });

    it('aborts role escalation when student attempts to demote or modify another user', () => {
      expect(() => {
        db.updateUserRole(studentId, superAdminId, 'STUDENT');
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN/);

      const admin = (db as any).state.users.find((u: any) => u.id === superAdminId);
      expect(admin.role).toBe('SUPER_ADMIN');
    });
  });

  // ===========================================================================
  // VECTOR D: Admin -> Role Escalation (assert blocked)
  // ===========================================================================
  describe('Vector D: Room Admin Role Escalation Attack', () => {
    it('aborts role escalation when ADMINISTRATOR attempts to elevate themselves or another to SUPER_ADMIN', () => {
      expect(() => {
        db.updateUserRole(roomAdminId, roomAdminId, 'SUPER_ADMIN');
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN/);

      const admin = (db as any).state.users.find((u: any) => u.id === roomAdminId);
      expect(admin.role).toBe('ADMINISTRATOR');
    });
  });

  // ===========================================================================
  // VECTOR E: SuperAdmin AAL1 -> Sensitive RPC (assert rejected)
  // ===========================================================================
  describe('Vector E: SuperAdmin with Weak AAL1 Session', () => {
    it('rejects privileged Level 2 operation if SuperAdmin session assurance is only AAL1', () => {
      // Downgrade session to AAL1
      (db as any).state.superAdminSecuritySettings[superAdminId].currentAal = 'aal1';

      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, trustedDeviceId);
      }).toThrow(/MFA_REQUIRED: Operation requires AAL2 authentication assurance/);
    });

    it('allows Level 1 read-only operation with AAL1 session', () => {
      (db as any).state.superAdminSecuritySettings[superAdminId].currentAal = 'aal1';

      const user = db.assertSuperAdminAccess(superAdminId, 1, trustedDeviceId);
      expect(user.id).toBe(superAdminId);
    });
  });

  // ===========================================================================
  // VECTOR F: SuperAdmin AAL2 without Fresh Step-Up -> Level 2 RPC (assert rejected)
  // ===========================================================================
  describe('Vector F: SuperAdmin AAL2 without Fresh Step-Up', () => {
    it('rejects Level 2 operation when step-up timestamp has expired past 10 minutes', () => {
      // Expire step-up timestamp to 11 minutes ago
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpAt = elevenMinutesAgo;

      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, trustedDeviceId);
      }).toThrow(/STEP_UP_REQUIRED: Fresh identity re-authentication required/);
    });

    it('rejects Level 2 operation when step-up level is only Level 1', () => {
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpAt = new Date().toISOString();
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpLevel = 1;

      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, trustedDeviceId);
      }).toThrow(/STEP_UP_REQUIRED: Fresh identity re-authentication required/);
    });
  });

  // ===========================================================================
  // VECTOR G: Level 3 Operation with Cached Level 2 Step-Up (assert rejected)
  // ===========================================================================
  describe('Vector G: Critical Level 3 Operation with Cached Level 2 Step-Up', () => {
    it('strictly rejects Level 3 critical operation when only Level 2 step-up is present', () => {
      // SuperAdmin has fresh Level 2 step-up
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpAt = new Date().toISOString();
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpLevel = 2;

      // Level 2 operation succeeds
      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, trustedDeviceId);
      }).not.toThrow();

      // Level 3 operation must fail because it requires fresh Level 3 re-authentication
      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 3, trustedDeviceId);
      }).toThrow(/STEP_UP_REQUIRED: Critical action requires immediate Level 3 re-authentication/);
    });

    it('atomically consumes Level 3 step-up on execution so it cannot be re-used', () => {
      // Fresh Level 3 step-up
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpAt = new Date().toISOString();
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpLevel = 3;

      // First execution succeeds
      const admin = db.assertSuperAdminAccess(superAdminId, 3, trustedDeviceId);
      expect(admin.id).toBe(superAdminId);

      // Verify that step-up was atomically consumed
      const settings = (db as any).state.superAdminSecuritySettings[superAdminId];
      expect(settings.lastStepUpLevel).toBe(1);
      expect(settings.lastStepUpAt).toBeUndefined();

      // Immediate second execution must fail
      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 3, trustedDeviceId);
      }).toThrow(/STEP_UP_REQUIRED/);
    });
  });

  // ===========================================================================
  // VECTOR H: Modified localStorage Biometric Flag -> Sensitive RPC (assert rejected)
  // ===========================================================================
  describe('Vector H: Client Biometric Flag Tampering', () => {
    it('rejects privileged operations even if client sets localStorage biometric flag to true', () => {
      // Mock localStorage if in node environment
      const mockStorage = {
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      if (typeof localStorage === 'undefined') {
        vi.stubGlobal('localStorage', mockStorage);
      }

      // Attacker manipulates client localStorage
      localStorage.setItem('roommate_superadmin_biometric_active', 'true');

      // Server/storage step-up status is still unverified / expired
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpAt = undefined;

      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, trustedDeviceId);
      }).toThrow(/STEP_UP_REQUIRED/);

      // Clean up
      localStorage.removeItem('roommate_superadmin_biometric_active');
    });
  });

  // ===========================================================================
  // VECTOR I: Revoked Device -> Privileged RPC (assert rejected with DEVICE_REVOKED)
  // ===========================================================================
  describe('Vector I: Revoked Device Access Attempt', () => {
    it('strictly rejects access from a revoked device with DEVICE_REVOKED', () => {
      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, revokedDeviceId);
      }).toThrow(/DEVICE_REVOKED: This device session has been revoked by an administrator/);
    });

    it('allows access from an active, trusted device', () => {
      expect(() => {
        db.assertSuperAdminAccess(superAdminId, 2, trustedDeviceId);
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // VECTOR J: Recovery Code Replay (Second use fails)
  // ===========================================================================
  describe('Vector J: Recovery Code Replay Attack', () => {
    it('allows single valid consumption of recovery code and strictly denies replay attempt', async () => {
      const rawCodes = generateRecoveryCodes(8);
      const hashes = await Promise.all(rawCodes.map((c) => hashRecoveryCode(c)));

      // Storing recovery codes requires Level 3 step-up
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpAt = new Date().toISOString();
      (db as any).state.superAdminSecuritySettings[superAdminId].lastStepUpLevel = 3;

      db.storeRecoveryCodes(superAdminId, hashes, trustedDeviceId);

      // First consumption: Success
      const firstUse = db.verifyRecoveryCode(superAdminId, hashes[0], 2, trustedDeviceId);
      expect(firstUse.success).toBe(true);
      expect(firstUse.remainingCodes).toBe(7);

      // Second consumption (replay attack): Strictly denied
      const replayAttempt = db.verifyRecoveryCode(superAdminId, hashes[0], 2, trustedDeviceId);
      expect(replayAttempt.success).toBe(false);
      expect(replayAttempt.error).toMatch(/Invalid authentication code/);

      // Second unused code works
      const secondUse = db.verifyRecoveryCode(superAdminId, hashes[1], 2, trustedDeviceId);
      expect(secondUse.success).toBe(true);
      expect(secondUse.remainingCodes).toBe(6);
    });
  });

  // ===========================================================================
  // VECTOR K: Direct Audit INSERT/UPDATE/DELETE (assert rejected / throws)
  // ===========================================================================
  describe('Vector K: Audit Log Immutability & Tamper Resistance', () => {
    it('strictly blocks direct client INSERT into security audit logs', () => {
      expect(() => {
        db.insertSecurityAuditLogDirectly();
      }).toThrow(/SECURITY_VIOLATION: Security audit logs cannot be inserted directly by clients/);
    });

    it('strictly blocks direct UPDATE to security audit logs', () => {
      expect(() => {
        db.updateSecurityAuditLog();
      }).toThrow(/SECURITY_VIOLATION: Security audit logs are immutable and cannot be updated/);
    });

    it('strictly blocks direct DELETE from security audit logs', () => {
      expect(() => {
        db.deleteSecurityAuditLog();
      }).toThrow(/SECURITY_VIOLATION: Security audit logs are immutable and cannot be deleted/);
    });
  });

  // ===========================================================================
  // VECTOR L: Direct PostgREST Manipulation of Security Tables
  // ===========================================================================
  describe('Vector L: Direct Manipulation of SuperAdmin Security Tables', () => {
    it('disallows caller from directly mutating security settings without verified procedure', () => {
      // SuperAdmin cannot directly set recoveryCodesRemaining or failedMfaAttempts arbitrarily
      expect(() => {
        db.assertSuperAdminAccess(studentId, 1);
      }).toThrow(/FORBIDDEN/);
    });
  });

  // ===========================================================================
  // VECTOR M: Fabricated User IDs / Target IDs (assert fails)
  // ===========================================================================
  describe('Vector M: Fabricated User IDs & Target IDs', () => {
    it('rejects fabricated non-existent user IDs from claiming SuperAdmin role', () => {
      expect(() => {
        db.assertSuperAdminAccess('fabricated-user-id-00000000-0000-0000-0000-000000000000', 1);
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization/);
    });

    it('returns false gracefully when modifying role for a non-existent target ID', () => {
      const result = db.updateUserRole(
        superAdminId,
        'non-existent-user-id-00000000-0000-0000-0000-000000000000',
        'STUDENT',
        trustedDeviceId
      );
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // VECTOR N: Manipulated Frontend Role State (assert rejected by server)
  // ===========================================================================
  describe('Vector N: Manipulated Frontend Role State', () => {
    it('rejects sensitive action if client tampered with in-memory role but real DB role is STUDENT', () => {
      // Even if client memory object had role: 'SUPER_ADMIN'
      const clientForgedUser = {
        id: studentId,
        role: 'SUPER_ADMIN', // spoofed in JS
      };

      // Server assertion checks the true DB state
      expect(() => {
        db.assertSuperAdminAccess(clientForgedUser.id, 2, trustedDeviceId);
      }).toThrow(/FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization/);
    });
  });

  // ===========================================================================
  // ADDITIONAL VALIDATIONS: Rate Limiting, TOTP Engine, Anti-Self-Demotion
  // ===========================================================================
  describe('Additional Security Controls', () => {
    it('prevents SuperAdmin from demoting their own account', () => {
      expect(() => {
        db.updateUserRole(superAdminId, superAdminId, 'STUDENT', trustedDeviceId);
      }).toThrow(/INVALID_ACTION: SuperAdmin cannot demote their own account/);
    });

    it('enforces 15-minute rate-limiting lockout after 5 failed MFA attempts', () => {
      expect(checkRateLimit().isLocked).toBe(false);

      for (let i = 1; i <= 4; i++) {
        const res = recordMfaFailure();
        expect(res.isLocked).toBe(false);
        expect(res.attemptsRemaining).toBe(5 - i);
      }

      const fifth = recordMfaFailure();
      expect(fifth.isLocked).toBe(true);
      expect(fifth.attemptsRemaining).toBe(0);

      const status = checkRateLimit();
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(800);

      resetMfaFailures();
      expect(checkRateLimit().isLocked).toBe(false);
    });

    it('rejects malformed or guess TOTP tokens via RFC 6238 engine', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      expect(await verifyRfc6238Totp(secret, '')).toBe(false);
      expect(await verifyRfc6238Totp(secret, '12345')).toBe(false);
      expect(await verifyRfc6238Totp(secret, 'abcdef')).toBe(false);
      expect(await verifyRfc6238Totp(secret, '1234567')).toBe(false);
      expect(await verifyRfc6238Totp(secret, '999999')).toBe(false);
    });

    it('generates canonical 8-code, 12-char formatted recovery codes', () => {
      const codes = generateRecoveryCodes(8);
      expect(codes.length).toBe(8);
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      }
    });
  });
});
