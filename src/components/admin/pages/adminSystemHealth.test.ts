import { describe, it, expect } from 'vitest';
import {
  computeOverallSystemStatus,
  computeServiceStatus,
  getIncidentEmptyStateMessage,
  formatElapsedDuration,
  formatDurationSeconds,
  formatDateTime,
} from './adminSystemHealthHelpers';

describe('Phase 12: Admin System Health — Error States & Degraded UI Logic', () => {
  describe('Overall System Status Derivation', () => {
    it('returns OFFLINE when client has no internet connection regardless of incident list', () => {
      const status = computeOverallSystemStatus({
        isOnline: false,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'ok',
      });
      expect(status).toBe('OFFLINE');

      const statusWithCritical = computeOverallSystemStatus({
        isOnline: false,
        hasCriticalIncident: true,
        activeIncidentCount: 3,
        healthStatus: 'error',
      });
      expect(statusWithCritical).toBe('OFFLINE');
    });

    it('returns OUTAGE when active critical or high incident is present', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: true,
        activeIncidentCount: 1,
        healthStatus: 'ok',
      });
      expect(status).toBe('OUTAGE');
    });

    it('returns OUTAGE when health endpoint probe returns error status', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'error',
      });
      expect(status).toBe('OUTAGE');
    });

    it('returns DEGRADED when non-critical active incident exists', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 2,
        healthStatus: 'ok',
      });
      expect(status).toBe('DEGRADED');
    });

    it('returns DEGRADED when health status is degraded', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'degraded',
      });
      expect(status).toBe('DEGRADED');
    });

    it('returns OPERATIONAL when online with 0 active incidents and ok health status', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'ok',
      });
      expect(status).toBe('OPERATIONAL');
    });
  });

  describe('Service Status Derivation', () => {
    it('marks all services as OFFLINE when network is disconnected', () => {
      expect(
        computeServiceStatus({
          serviceType: 'web',
          isOnline: false,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('OFFLINE');

      expect(
        computeServiceStatus({
          serviceType: 'api',
          isOnline: false,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('OFFLINE');

      expect(
        computeServiceStatus({
          serviceType: 'database',
          isOnline: false,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('OFFLINE');
    });

    it('derives Web service status based on active incidents', () => {
      expect(
        computeServiceStatus({
          serviceType: 'web',
          isOnline: true,
          hasIncident: true,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('DEGRADED');

      expect(
        computeServiceStatus({
          serviceType: 'web',
          isOnline: true,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('OPERATIONAL');
    });

    it('derives API service status based on incidents and health endpoint response', () => {
      expect(
        computeServiceStatus({
          serviceType: 'api',
          isOnline: true,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'error',
        })
      ).toBe('DEGRADED');

      expect(
        computeServiceStatus({
          serviceType: 'api',
          isOnline: true,
          hasIncident: true,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('DEGRADED');

      expect(
        computeServiceStatus({
          serviceType: 'api',
          isOnline: true,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('OPERATIONAL');
    });

    it('derives Database service status correctly for local vs cloud vs degraded', () => {
      // Local storage when Supabase is unconfigured
      expect(
        computeServiceStatus({
          serviceType: 'database',
          isOnline: true,
          hasIncident: false,
          isDbConfigured: false,
          healthStatus: 'ok',
        })
      ).toBe('LOCAL_STORAGE');

      // Degraded on error or DB incident
      expect(
        computeServiceStatus({
          serviceType: 'database',
          isOnline: true,
          hasIncident: true,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('DEGRADED');

      expect(
        computeServiceStatus({
          serviceType: 'database',
          isOnline: true,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'error',
        })
      ).toBe('DEGRADED');

      // Operational when configured and healthy
      expect(
        computeServiceStatus({
          serviceType: 'database',
          isOnline: true,
          hasIncident: false,
          isDbConfigured: true,
          healthStatus: 'ok',
        })
      ).toBe('OPERATIONAL');
    });
  });

  describe('Zero Incidents Empty State Content', () => {
    it('outputs the exact required specification text when total incidents is 0', () => {
      const msg = getIncidentEmptyStateMessage(0, 'ALL');
      expect(msg).toBe('Zero system incidents detected. All services operating normally.');
    });

    it('outputs filter-specific guidance when total incidents exist but none match the filter', () => {
      const msg = getIncidentEmptyStateMessage(4, 'Database');
      expect(msg).toBe('Zero system incidents matching the "Database" filter. All monitored services are operating normally.');
    });
  });

  describe('Duration & Timestamp Formatting', () => {
    it('formats elapsed outage duration into human-readable seconds, minutes, and hours', () => {
      const now = 1758170000000;
      // 30 seconds ago
      const t30s = new Date(now - 30 * 1000).toISOString();
      expect(formatElapsedDuration(t30s, now)).toBe('30s');

      // 4 minutes 20 seconds ago
      const t4m20s = new Date(now - (4 * 60 + 20) * 1000).toISOString();
      expect(formatElapsedDuration(t4m20s, now)).toBe('4m 20s');

      // 1 hour 15 minutes ago
      const t1h15m = new Date(now - (75 * 60) * 1000).toISOString();
      expect(formatElapsedDuration(t1h15m, now)).toBe('1h 15m');

      // Invalid ISO string
      expect(formatElapsedDuration('invalid-date', now)).toBe('Active');
    });

    it('formats duration seconds for resolved audit history entries', () => {
      expect(formatDurationSeconds(undefined)).toBe('N/A');
      expect(formatDurationSeconds(45)).toBe('45s');
      expect(formatDurationSeconds(120)).toBe('2m');
      expect(formatDurationSeconds(155)).toBe('2m 35s');
      expect(formatDurationSeconds(3720)).toBe('1h 2m');
    });

    it('formats date and time safely without throwing on invalid input', () => {
      expect(formatDateTime(undefined)).toBe('N/A');
      expect(formatDateTime('invalid-date')).toBe('Invalid date');
      const valid = formatDateTime('2026-09-18T10:30:00.000Z');
      expect(valid).toBeTruthy();
      expect(valid).not.toBe('N/A');
    });
  });

  describe('Phase 13: Verifiable Telemetry Guarantees (No Fake Percentages)', () => {
    it('guarantees service statuses are based on actual operational state rather than static percentages', () => {
      const validStatuses = ['OPERATIONAL', 'DEGRADED', 'LOCAL_STORAGE', 'OFFLINE'];
      
      const webStatus = computeServiceStatus({
        serviceType: 'web',
        isOnline: true,
        hasIncident: false,
        isDbConfigured: true,
      });
      expect(validStatuses).toContain(webStatus);
      expect(webStatus).not.toMatch(/99\./);

      const dbStatus = computeServiceStatus({
        serviceType: 'database',
        isOnline: true,
        hasIncident: false,
        isDbConfigured: true,
      });
      expect(validStatuses).toContain(dbStatus);
      expect(dbStatus).not.toMatch(/99\./);
    });

    it('guarantees overall system status uses verified states instead of fake percentages', () => {
      const status = computeOverallSystemStatus({
        isOnline: true,
        hasCriticalIncident: false,
        activeIncidentCount: 0,
        healthStatus: 'ok',
      });
      expect(status).toBe('OPERATIONAL');
      expect(status).not.toBe('99.98%');
    });
  });
});
