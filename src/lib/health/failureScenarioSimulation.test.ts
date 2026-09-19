import { describe, it, expect, beforeEach } from 'vitest';
import {
  performHealthCheck,
  resetHealthCheckCache,
  DEFAULT_CACHE_TTL_MS,
} from './healthService';
import { db } from '../storage/mockStorage';
import {
  computeOverallSystemStatus,
  computeServiceStatus,
  getIncidentEmptyStateMessage,
} from '../../components/admin/pages/adminSystemHealthHelpers';
import {
  isSuperAdminAuthorized,
  verifyRlsIncidentPolicy,
} from '../auth/superAdminSecurityService';
import { User } from '../../types';

describe('Phase 17: End-to-End Failure Scenario Simulation Suite', () => {
  const superAdminUser: User = {
    id: 'usr-admin-sim',
    name: 'Super Admin Sim',
    email: 'admin-sim@roommate.internal',
    role: 'SUPER_ADMIN',
    isSuspended: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const studentUser: User = {
    id: 'usr-student-sim',
    name: 'Student Resident Sim',
    email: 'student-sim@campus.edu',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    resetHealthCheckCache();
    const state = db.getState();
    state.users = [
      ...state.users.filter((u) => u.id !== superAdminUser.id && u.id !== studentUser.id),
      superAdminUser,
      studentUser,
    ];
    state.systemIncidents = [];
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Normal Operational Health (/api/health -> 200)
  // ---------------------------------------------------------------------------
  describe('Scenario 1: Normal Operational Health Probe', () => {
    it('returns HTTP 200 and status "ok" when database is healthy', async () => {
      const mockHealthyDb = async () => true;
      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: mockHealthyDb,
      });

      expect(result.statusCode).toBe(200);
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    it('leverages 5000ms micro-cache to prevent downstream DB probe exhaustion', async () => {
      let queryCount = 0;
      const countingDbChecker = async () => {
        queryCount++;
        return true;
      };

      const res1 = await performHealthCheck({
        bypassCache: false,
        dbChecker: countingDbChecker,
        cacheTtlMs: DEFAULT_CACHE_TTL_MS,
      });
      const res2 = await performHealthCheck({
        bypassCache: false,
        dbChecker: countingDbChecker,
        cacheTtlMs: DEFAULT_CACHE_TTL_MS,
      });

      expect(res1.status).toBe('ok');
      expect(res2.status).toBe('ok');
      expect(queryCount).toBe(1); // Cached probe avoided second database hit
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Database Outage Simulation (/api/health -> 503)
  // ---------------------------------------------------------------------------
  describe('Scenario 2: Database Failure & Degraded Response', () => {
    it('returns HTTP 503 and status "error" when database connection drops', async () => {
      const mockBrokenDb = async () => {
        throw new Error('Connection refused: 5432 postgresql pool exhausted');
      };

      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: mockBrokenDb,
      });

      expect(result.statusCode).toBe(503);
      expect(result.status).toBe('error');
    });

    it('returns HTTP 503 when database returns false without throwing', async () => {
      const mockUnhealthyDb = async () => false;

      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: mockUnhealthyDb,
      });

      expect(result.statusCode).toBe(503);
      expect(result.status).toBe('error');
    });

    it('strictly redacts credentials, passwords, and tokens from error responses', async () => {
      const leakingDbError = async () => {
        throw new Error(
          'FATAL: password authentication failed for user "postgres://admin:SUPER_SECRET_PW@db.pool.supabase.com:6543"'
        );
      };

      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: leakingDbError,
      });

      // The external contract must never contain the leak
      expect(result.status).toBe('error');
      expect(JSON.stringify(result)).not.toContain('SUPER_SECRET_PW');
      expect(JSON.stringify(result)).not.toContain('postgres://');
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: API & Network Timeout Simulation
  // ---------------------------------------------------------------------------
  describe('Scenario 3: API & Network Timeout Simulation', () => {
    it('aborts hung database probes within configured timeout window', async () => {
      const hungDbChecker = async () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), 2000);
        });
      };

      const startTime = Date.now();
      const result = await performHealthCheck({
        bypassCache: true,
        dbChecker: hungDbChecker,
        timeoutMs: 100, // Short timeout for test
      });
      const elapsed = Date.now() - startTime;

      expect(result.statusCode).toBe(503);
      expect(result.status).toBe('error');
      expect(elapsed).toBeLessThan(1500);
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Incident Lifecycle & Recovery Duration Calculation
  // ---------------------------------------------------------------------------
  describe('Scenario 4: Incident Lifecycle, Status Transitions & Duration', () => {
    it('creates an incident in INVESTIGATING status with initial occurrences = 1', () => {
      const incident = db.createSystemIncident({
        service: 'DATABASE',
        error: 'High replication lag detected on primary replica',
        severity: 'MEDIUM',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      expect(incident.id).toBeDefined();
      expect(incident.status).toBe('INVESTIGATING');
      expect(incident.occurrences).toBe(1);
      expect(incident.resolvedAt).toBeUndefined();
      expect(incident.durationSeconds).toBeUndefined();
    });

    it('transitions incident to MONITORING status', () => {
      const incident = db.createSystemIncident({
        service: 'API',
        error: 'Rate limit threshold reached on external bank gateway',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      const updated = db.updateSystemIncidentStatus(incident.id, 'MONITORING', superAdminUser.id);
      expect(updated).toBe(true);

      const incidents = db.getSystemIncidents(superAdminUser.id);
      const target = incidents.find((i) => i.id === incident.id);
      expect(target?.status).toBe('MONITORING');
      expect(target?.resolvedAt).toBeUndefined();
    });

    it('resolves incident, populating resolvedAt and calculating durationSeconds automatically', () => {
      const incident = db.createSystemIncident({
        service: 'DATABASE',
        error: 'Cold start connection spike',
        severity: 'LOW',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      const resolved = db.resolveSystemIncident(incident.id, superAdminUser.id);
      expect(resolved).toBe(true);

      const incidents = db.getSystemIncidents(superAdminUser.id);
      const target = incidents.find((i) => i.id === incident.id);
      expect(target?.status).toBe('RESOLVED');
      expect(target?.resolvedAt).toBeDefined();
      expect(typeof target?.durationSeconds).toBe('number');
      expect(target?.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('clears resolvedAt and durationSeconds if an incident is re-opened to INVESTIGATING', () => {
      const incident = db.createSystemIncident({
        service: 'DATABASE',
        error: 'Intermittent failover',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      db.resolveSystemIncident(incident.id, superAdminUser.id);
      // Re-open
      db.updateSystemIncidentStatus(incident.id, 'INVESTIGATING', superAdminUser.id);

      const incidents = db.getSystemIncidents(superAdminUser.id);
      const target = incidents.find((i) => i.id === incident.id);
      expect(target?.status).toBe('INVESTIGATING');
      expect(target?.resolvedAt).toBeUndefined();
      expect(target?.durationSeconds).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Duplicate Incident Suppression (Idempotency)
  // ---------------------------------------------------------------------------
  describe('Scenario 5: Duplicate Incident Suppression & Occurrences Counter', () => {
    it('suppresses duplicate incidents for the same service when an active incident exists', () => {
      const first = db.createSystemIncident({
        service: 'DATABASE',
        error: 'Initial pool connection timeout',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      // Second probe fails for the same service
      const second = db.createSystemIncident({
        service: 'DATABASE',
        error: 'Subsequent pool timeout',
        severity: 'CRITICAL',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      const incidents = db.getSystemIncidents();
      const dbIncidents = incidents.filter((i) => i.service === 'DATABASE');

      expect(dbIncidents.length).toBe(1); // Did NOT create a duplicate row!
      expect(second.id).toBe(first.id);
      expect(second.occurrences).toBe(2); // Incremented occurrence count
      expect(second.severity).toBe('CRITICAL'); // Updated to latest severity
      expect(second.error).toBe('Subsequent pool timeout');
    });

    it('creates a new incident row if the previous incident for that service was already RESOLVED', () => {
      const first = db.createSystemIncident({
        service: 'WEB',
        error: 'TLS handshake failure',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        occurrences: 1,
      });
      db.resolveSystemIncident(first.id, superAdminUser.id);

      // New incident occurs after resolution
      const second = db.createSystemIncident({
        service: 'WEB',
        error: 'CDN origin timeout',
        severity: 'MEDIUM',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      const incidents = db.getSystemIncidents();
      const webIncidents = incidents.filter((i) => i.service === 'WEB');

      expect(webIncidents.length).toBe(2);
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('INVESTIGATING');
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Unauthorized Access Prevention & RLS Verification
  // ---------------------------------------------------------------------------
  describe('Scenario 6: Unauthorized Access Prevention & Role Guards', () => {
    it('strictly blocks STUDENT callers from reading incidents', () => {
      expect(() => db.getSystemIncidents(studentUser.id)).toThrow(
        'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization'
      );
    });

    it('strictly blocks STUDENT callers from updating or resolving incidents', () => {
      const incident = db.createSystemIncident({
        service: 'API',
        error: 'Gateway 504',
        severity: 'MEDIUM',
        status: 'INVESTIGATING',
        occurrences: 1,
      });

      expect(() =>
        db.updateSystemIncidentStatus(incident.id, 'RESOLVED', studentUser.id)
      ).toThrow('FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization');

      expect(() => db.resolveSystemIncident(incident.id, studentUser.id)).toThrow(
        'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization'
      );
    });

    it('validates RLS policy simulation: denies STUDENT and accepts SUPER_ADMIN', () => {
      expect(verifyRlsIncidentPolicy({ role: 'STUDENT' })).toBe(false);
      expect(verifyRlsIncidentPolicy({ role: 'SUPER_ADMIN' })).toBe(true);
      expect(verifyRlsIncidentPolicy({ role: 'SUPERADMIN' })).toBe(true);
      expect(verifyRlsIncidentPolicy(null)).toBe(false);
    });

    it('denies authorization for suspended superadmins', () => {
      const suspended: User = { ...superAdminUser, id: 'usr-susp', isSuspended: true };
      expect(isSuperAdminAuthorized(suspended)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Dashboard UI Degradation & Health State Derivation
  // ---------------------------------------------------------------------------
  describe('Scenario 7: Dashboard Degradation & Error State Derivation', () => {
    it('derives OFFLINE status when network is disconnected', () => {
      const status = computeOverallSystemStatus({
        isOnline: false,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'ok',
      });
      expect(status).toBe('OFFLINE');
    });

    it('derives OUTAGE status when health probe returns error', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'error',
      });
      expect(status).toBe('OUTAGE');
    });

    it('derives OUTAGE status when an active CRITICAL or HIGH incident is present', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: true,
        activeIncidentCount: 1,
        healthStatus: 'ok',
      });
      expect(status).toBe('OUTAGE');
    });

    it('derives DEGRADED status when non-critical active incidents exist', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 2,
        healthStatus: 'ok',
      });
      expect(status).toBe('DEGRADED');
    });

    it('derives OPERATIONAL status when all services are healthy and no active incidents exist', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'ok',
      });
      expect(status).toBe('OPERATIONAL');
    });

    it('returns verifiable empty state message when incident log is clear', () => {
      const msg = getIncidentEmptyStateMessage(0, 'ALL');
      expect(msg).toBe('Zero system incidents detected. All services operating normally.');

      const filteredMsg = getIncidentEmptyStateMessage(5, 'RESOLVED');
      expect(filteredMsg).toBe(
        'Zero system incidents matching the "RESOLVED" filter. All monitored services are operating normally.'
      );
    });

    it('computes service status accurately based on active incidents', () => {
      const dbStatus = computeServiceStatus({
        serviceType: 'database',
        isOnline: true,
        hasIncident: true,
        isDbConfigured: true,
        healthStatus: 'error',
      });
      const webStatus = computeServiceStatus({
        serviceType: 'web',
        isOnline: true,
        hasIncident: false,
        isDbConfigured: true,
        healthStatus: 'ok',
      });

      expect(dbStatus).toBe('DEGRADED');
      expect(webStatus).toBe('OPERATIONAL');
    });
  });
});
