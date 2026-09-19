import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/storage/mockStorage';
import {
  isSuperAdminAuthorized,
  verifyRlsIncidentPolicy,
} from '../../lib/auth/superAdminSecurityService';
import { User, SystemIncident } from '../../types';

describe('Phase 15: Admin Security & Authorization', () => {
  const superAdminUser: User = {
    id: 'usr-superadmin-test',
    name: 'Super Admin Test',
    email: 'admin@roommate.internal',
    role: 'SUPER_ADMIN',
    isSuspended: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const studentUser: User = {
    id: 'usr-student-test',
    name: 'Normal Student Resident',
    email: 'student@campus.edu',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const suspendedAdminUser: User = {
    id: 'usr-suspended-admin-test',
    name: 'Suspended Admin',
    email: 'suspended@roommate.internal',
    role: 'SUPER_ADMIN',
    isSuspended: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // Seed users into db.state
    const state = db.getState();
    state.users = [
      ...state.users.filter(
        (u) =>
          u.id !== superAdminUser.id &&
          u.id !== studentUser.id &&
          u.id !== suspendedAdminUser.id
      ),
      superAdminUser,
      studentUser,
      suspendedAdminUser,
    ];
    state.systemIncidents = [];
  });

  describe('1. Role & Authorization Helpers (isSuperAdminAuthorized)', () => {
    it('grants authorization for active SUPER_ADMIN users', () => {
      expect(isSuperAdminAuthorized(superAdminUser)).toBe(true);
    });

    it('denies authorization for STUDENT users', () => {
      expect(isSuperAdminAuthorized(studentUser)).toBe(false);
    });

    it('denies authorization for suspended SUPER_ADMIN users', () => {
      expect(isSuperAdminAuthorized(suspendedAdminUser)).toBe(false);
    });

    it('denies authorization when user is null or undefined', () => {
      expect(isSuperAdminAuthorized(null)).toBe(false);
      expect(isSuperAdminAuthorized(undefined)).toBe(false);
    });

    it('denies authorization for malformed user objects', () => {
      expect(isSuperAdminAuthorized({ role: 'GUEST' } as any)).toBe(false);
      expect(isSuperAdminAuthorized({} as any)).toBe(false);
    });
  });

  describe('2. Supabase RLS System Incidents Policy Simulation (verifyRlsIncidentPolicy)', () => {
    it('grants access to SUPER_ADMIN profile role', () => {
      expect(verifyRlsIncidentPolicy({ role: 'SUPER_ADMIN' })).toBe(true);
    });

    it('grants access to canonical SUPERADMIN alias', () => {
      expect(verifyRlsIncidentPolicy({ role: 'SUPERADMIN' })).toBe(true);
    });

    it('strictly blocks ordinary STUDENT profile role at the database RLS level', () => {
      expect(verifyRlsIncidentPolicy({ role: 'STUDENT' })).toBe(false);
    });

    it('strictly blocks anonymous, guest, or empty profile roles', () => {
      expect(verifyRlsIncidentPolicy({ role: 'GUEST' })).toBe(false);
      expect(verifyRlsIncidentPolicy({ role: 'anon' })).toBe(false);
      expect(verifyRlsIncidentPolicy({ role: '' })).toBe(false);
      expect(verifyRlsIncidentPolicy(null)).toBe(false);
      expect(verifyRlsIncidentPolicy(undefined)).toBe(false);
    });
  });

  describe('3. Database assertSuperAdminAccess Core Assertions', () => {
    it('throws UNAUTHORIZED when no callerId is provided', () => {
      expect(() => db.assertSuperAdminAccess('')).toThrow(
        'UNAUTHORIZED: Valid authentication session required'
      );
    });

    it('throws FORBIDDEN when a STUDENT caller attempts access', () => {
      expect(() => db.assertSuperAdminAccess(studentUser.id)).toThrow(
        'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization'
      );
    });

    it('throws FORBIDDEN when a suspended administrator attempts access', () => {
      expect(() => db.assertSuperAdminAccess(suspendedAdminUser.id)).toThrow(
        'FORBIDDEN: This administrator account is suspended'
      );
    });

    it('succeeds and returns user when active SUPER_ADMIN calls', () => {
      const admin = db.assertSuperAdminAccess(superAdminUser.id);
      expect(admin).toBeDefined();
      expect(admin.id).toBe(superAdminUser.id);
      expect(admin.role).toBe('SUPER_ADMIN');
    });
  });

  describe('4. System Incident Access Control in Storage Layer', () => {
    let testIncident: SystemIncident;

    beforeEach(() => {
      testIncident = db.createSystemIncident({
        service: 'DATABASE',
        error: 'Database connection pool limit reached',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        occurrences: 1,
      });
    });

    it('blocks STUDENT callers from reading system incidents when callerId is provided', () => {
      expect(() => db.getSystemIncidents(studentUser.id)).toThrow(
        'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization'
      );
    });

    it('allows SUPER_ADMIN callers to read system incidents', () => {
      const incidents = db.getSystemIncidents(superAdminUser.id);
      expect(incidents).toBeDefined();
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      expect(incidents.some((i) => i.id === testIncident.id)).toBe(true);
    });

    it('blocks STUDENT callers from creating system incidents with caller verification', () => {
      expect(() =>
        db.createSystemIncident(
          {
            service: 'API',
            error: 'Unauthorized probe injection',
            severity: 'CRITICAL',
            status: 'INVESTIGATING',
            occurrences: 1,
          },
          studentUser.id
        )
      ).toThrow('FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization');
    });

    it('allows SUPER_ADMIN callers to create system incidents with caller verification', () => {
      const created = db.createSystemIncident(
        {
          service: 'API',
          error: 'Superadmin manual incident probe',
          severity: 'LOW',
          status: 'INVESTIGATING',
          occurrences: 1,
        },
        superAdminUser.id
      );
      expect(created).toBeDefined();
      expect(created.service).toBe('API');
    });

    it('blocks STUDENT callers from updating incident status', () => {
      expect(() =>
        db.updateSystemIncidentStatus(testIncident.id, 'MONITORING', studentUser.id)
      ).toThrow('FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization');
    });

    it('allows SUPER_ADMIN callers to update incident status', () => {
      const ok = db.updateSystemIncidentStatus(testIncident.id, 'MONITORING', superAdminUser.id);
      expect(ok).toBe(true);
      const incidents = db.getSystemIncidents(superAdminUser.id);
      const updated = incidents.find((i) => i.id === testIncident.id);
      expect(updated?.status).toBe('MONITORING');
    });

    it('blocks STUDENT callers from resolving incidents', () => {
      expect(() => db.resolveSystemIncident(testIncident.id, studentUser.id)).toThrow(
        'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization'
      );
    });

    it('allows SUPER_ADMIN callers to resolve incidents', () => {
      const ok = db.resolveSystemIncident(testIncident.id, superAdminUser.id);
      expect(ok).toBe(true);
      const incidents = db.getSystemIncidents(superAdminUser.id);
      const resolved = incidents.find((i) => i.id === testIncident.id);
      expect(resolved?.status).toBe('RESOLVED');
      expect(resolved?.resolvedAt).toBeDefined();
      expect(resolved?.durationSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
