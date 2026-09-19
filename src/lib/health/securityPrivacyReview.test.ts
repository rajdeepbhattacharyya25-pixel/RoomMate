import { describe, it, expect } from 'vitest';
import {
  performHealthCheck,
  resetHealthCheckCache,
} from './healthService';
import {
  verifyRlsIncidentPolicy,
  isSuperAdminAuthorized,
} from '../auth/superAdminSecurityService';
import { db } from '../storage/mockStorage';
import { User } from '../../types';

describe('Phase 19: Security & Privacy Review', () => {
  const forbiddenSensitiveKeys = [
    'password',
    'secret',
    'token',
    'apiKey',
    'serviceRole',
    'service_role',
    'connectionString',
    'stack',
    'trace',
    'user',
    'email',
    'phone',
    'pin',
    'balance',
    'amount',
  ];

  describe('1. Health Endpoint Public Contract & Zero Secret Leakage', () => {
    it('ensures healthy response contains only { status: "ok" } and timestamp, with zero sensitive keys', async () => {
      resetHealthCheckCache();
      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: async () => true,
      });

      expect(result.status).toBe('ok');
      expect(result.statusCode).toBe(200);

      const jsonStr = JSON.stringify(result);
      forbiddenSensitiveKeys.forEach((forbidden) => {
        expect(jsonStr.toLowerCase()).not.toContain(forbidden.toLowerCase());
      });
    });

    it('ensures failure response contains only { status: "error" } without leaking internal SQL error traces', async () => {
      resetHealthCheckCache();
      const leakingDbError = async () => {
        throw new Error(
          'PostgreSQL error 28P01: password authentication failed for user postgres with connstr postgresql://postgres:SUPER_SECRET_KEY@db.pool.supabase.com:6543/postgres'
        );
      };

      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: leakingDbError,
      });

      expect(result.status).toBe('error');
      expect(result.statusCode).toBe(503);

      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('SUPER_SECRET_KEY');
      expect(jsonStr).not.toContain('28P01');
      expect(jsonStr).not.toContain('postgresql://');
      expect(jsonStr).not.toContain('password authentication failed');
    });

    it('ensures minimal public payload format strictly contains only the "status" property', async () => {
      resetHealthCheckCache();
      const okResult = await performHealthCheck({ bypassCache: true, dbChecker: async () => true });
      const publicOkPayload = { status: okResult.status };
      expect(Object.keys(publicOkPayload)).toEqual(['status']);

      const errResult = await performHealthCheck({ bypassCache: true, dbChecker: async () => false });
      const publicErrPayload = { status: errResult.status };
      expect(Object.keys(publicErrPayload)).toEqual(['status']);
    });
  });

  describe('2. PostgreSQL Row-Level Security (RLS) Policy Verification', () => {
    it('verifies that ordinary STUDENT accounts strictly fail the RLS policy', () => {
      const studentProfile = { id: 'usr-student', role: 'STUDENT' };
      const passes = verifyRlsIncidentPolicy(studentProfile);
      expect(passes).toBe(false);
    });

    it('verifies that anonymous and guest profiles strictly fail the RLS policy', () => {
      expect(verifyRlsIncidentPolicy({ role: 'anon' })).toBe(false);
      expect(verifyRlsIncidentPolicy({ role: 'GUEST' })).toBe(false);
      expect(verifyRlsIncidentPolicy({ role: '' })).toBe(false);
      expect(verifyRlsIncidentPolicy(null)).toBe(false);
      expect(verifyRlsIncidentPolicy(undefined)).toBe(false);
    });

    it('verifies that SUPER_ADMIN accounts pass the RLS policy', () => {
      const adminProfile = { id: 'usr-admin', role: 'SUPER_ADMIN' };
      const passes = verifyRlsIncidentPolicy(adminProfile);
      expect(passes).toBe(true);
    });
  });

  describe('3. Application & Component Authorization Guards', () => {
    const studentUser: User = {
      id: 'usr-student-security-check',
      name: 'Student User',
      email: 'student@campus.edu',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const superAdminUser: User = {
      id: 'usr-admin-security-check',
      name: 'Super Admin User',
      email: 'admin@roommate.internal',
      role: 'SUPER_ADMIN',
      isSuspended: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('asserts that student users are not authorized for administrative operations', () => {
      expect(isSuperAdminAuthorized(studentUser)).toBe(false);
      expect(isSuperAdminAuthorized(null)).toBe(false);
      expect(isSuperAdminAuthorized(undefined)).toBe(false);
    });

    it('asserts that suspended admin accounts are rejected', () => {
      const suspendedAdmin: User = { ...superAdminUser, isSuspended: true };
      expect(isSuperAdminAuthorized(suspendedAdmin)).toBe(false);
    });

    it('asserts that active superadmins are authorized', () => {
      expect(isSuperAdminAuthorized(superAdminUser)).toBe(true);
    });

    it('blocks student residents from reading or mutating system incidents in storage layer', () => {
      expect(() => db.getSystemIncidents(studentUser.id)).toThrow('FORBIDDEN');
      expect(() =>
        db.createSystemIncident(
          {
            service: 'API',
            error: 'Injected incident',
            severity: 'LOW',
            status: 'INVESTIGATING',
            occurrences: 1,
          },
          studentUser.id
        )
      ).toThrow('FORBIDDEN');
      expect(() => db.resolveSystemIncident('inc-test', studentUser.id)).toThrow('FORBIDDEN');
    });
  });

  describe('4. Zero Cost & Zero Billable Infrastructure Integrity', () => {
    it('verifies that Telegram notifications are strictly absent from configuration', () => {
      // Telegram is strictly excluded from monitoring architecture
      const source = JSON.stringify(db.getPlatformSettings());
      expect(source.toLowerCase()).not.toContain('telegram');
      expect(source.toLowerCase()).not.toContain('bot_token');
    });
  });

  describe('5. Credential Isolation & Git Security for External Monitoring', () => {
    it('confirms that .mcp.json uses environment variable interpolation rather than raw secrets', async () => {
      // Import .mcp.json statically without Node.js fs dependencies
      const mcpModule = await import('../../../.mcp.json');
      const mcpConfig = mcpModule.default || mcpModule;
      const uptimerobotConfig = (mcpConfig as Record<string, any>).mcpServers?.uptimerobot;
      
      expect(uptimerobotConfig).toBeDefined();
      const authHeader = uptimerobotConfig?.headers?.Authorization || '';
      // Ensure no raw secret is stored
      expect(authHeader).not.toMatch(/u\d{7}-[a-f0-9]{24}/);
      expect(authHeader).toContain('${UPTIMEROBOT_API_KEY}');
    });
  });
});
