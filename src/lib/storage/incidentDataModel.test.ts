import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './mockStorage.ts';
import type { SystemIncident } from '../../types';

describe('Phase 6: SuperAdmin System Health Data Model', () => {
  beforeEach(() => {
    // Reset systemIncidents array
    (db as any).state.systemIncidents = [];
    db.saveState((db as any).state);
  });

  it('creates an incident with required lifecycle fields and defaults', () => {
    const newInc = db.createSystemIncident({
      service: 'API',
      error: 'HTTP 503 Backend Gateway Timeout',
      severity: 'HIGH',
      status: 'INVESTIGATING',
      occurrences: 1,
      details: 'Probe failed 2 consecutive checks',
    });

    expect(newInc.id).toBeDefined();
    expect(newInc.id.startsWith('inc-')).toBe(true);
    expect(newInc.service).toBe('API');
    expect(newInc.error).toBe('HTTP 503 Backend Gateway Timeout');
    expect(newInc.severity).toBe('HIGH');
    expect(newInc.status).toBe('INVESTIGATING');
    expect(newInc.occurrences).toBe(1);
    expect(newInc.createdAt).toBeDefined();
    expect(newInc.resolvedAt).toBeUndefined();
    expect(newInc.durationSeconds).toBeUndefined();

    const stored = db.getSystemIncidents();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(newInc.id);
  });

  it('resolves an incident and calculates durationSeconds automatically', async () => {
    const newInc = db.createSystemIncident({
      service: 'Database',
      error: 'PostgreSQL connection refused',
      severity: 'CRITICAL',
      status: 'INVESTIGATING',
      occurrences: 3,
    });

    // Artificially simulate 120 seconds elapsed
    const createdDate = new Date(Date.now() - 120 * 1000).toISOString();
    newInc.createdAt = createdDate;
    db.saveState((db as any).state);

    const success = db.resolveSystemIncident(newInc.id);
    expect(success).toBe(true);

    const stored = db.getSystemIncidents();
    const resolved = stored.find((i) => i.id === newInc.id)!;

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedAt).toBeDefined();
    expect(typeof resolved.durationSeconds).toBe('number');
    expect(resolved.durationSeconds).toBeGreaterThanOrEqual(119);
  });

  it('supports multiple service categories without breaking schema constraints', () => {
    const services: Array<SystemIncident['service']> = ['Web', 'API', 'Database', 'Authentication'];

    services.forEach((service) => {
      db.createSystemIncident({
        service,
        error: `${service} outage probe test`,
        severity: 'MEDIUM',
        status: 'MONITORING',
        occurrences: 1,
      });
    });

    const stored = db.getSystemIncidents();
    expect(stored).toHaveLength(4);
    const mappedServices = stored.map((i) => i.service);
    expect(mappedServices).toContain('Web');
    expect(mappedServices).toContain('API');
    expect(mappedServices).toContain('Database');
    expect(mappedServices).toContain('Authentication');
  });

  it('safely handles attempts to resolve non-existent incidents', () => {
    const result = db.resolveSystemIncident('non-existent-id-999');
    expect(result).toBe(false);
  });
});

describe('Phase 7: Incident Lifecycle Management', () => {
  beforeEach(() => {
    (db as any).state.systemIncidents = [];
    db.saveState((db as any).state);
  });

  it('suppresses duplicates by incrementing occurrences when an active incident exists for the same service', () => {
    const firstInc = db.createSystemIncident({
      service: 'Database',
      error: 'Query timeout 5000ms',
      severity: 'HIGH',
      status: 'INVESTIGATING',
      occurrences: 1,
      details: 'Check 1 failed',
    });

    expect(firstInc.occurrences).toBe(1);
    expect(db.getSystemIncidents()).toHaveLength(1);

    // Second failure for the same service while first is still active
    const secondCall = db.createSystemIncident({
      service: 'Database',
      error: 'Query timeout 10000ms (escalated)',
      severity: 'CRITICAL',
      status: 'INVESTIGATING',
      occurrences: 1,
      details: 'Check 2 failed',
    });

    // Should return the updated existing incident rather than a new duplicate
    expect(secondCall.id).toBe(firstInc.id);
    expect(secondCall.occurrences).toBe(2);
    expect(secondCall.error).toBe('Query timeout 10000ms (escalated)');
    expect(secondCall.severity).toBe('CRITICAL');
    expect(secondCall.details).toBe('Check 2 failed');

    // Total incidents array must still have exactly 1 record
    const stored = db.getSystemIncidents();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(firstInc.id);
    expect(stored[0].occurrences).toBe(2);
  });

  it('creates a new incident once the prior incident for that service has been resolved', () => {
    const firstInc = db.createSystemIncident({
      service: 'API',
      error: 'Initial outage',
      severity: 'HIGH',
      status: 'INVESTIGATING',
      occurrences: 1,
    });

    // Resolve the first incident
    const resolved = db.resolveSystemIncident(firstInc.id);
    expect(resolved).toBe(true);

    // Third failure occurs after resolution
    const secondInc = db.createSystemIncident({
      service: 'API',
      error: 'New subsequent outage',
      severity: 'MEDIUM',
      status: 'INVESTIGATING',
      occurrences: 1,
    });

    // Must create a distinct new incident
    expect(secondInc.id).not.toBe(firstInc.id);
    expect(secondInc.status).toBe('INVESTIGATING');
    expect(secondInc.occurrences).toBe(1);

    const stored = db.getSystemIncidents();
    expect(stored).toHaveLength(2);
    expect(stored.find((i) => i.id === firstInc.id)?.status).toBe('RESOLVED');
    expect(stored.find((i) => i.id === secondInc.id)?.status).toBe('INVESTIGATING');
  });

  it('transitions status from INVESTIGATING to MONITORING', () => {
    const incident = db.createSystemIncident({
      service: 'Web',
      error: 'High TTFB detected',
      severity: 'LOW',
      status: 'INVESTIGATING',
      occurrences: 1,
    });

    const transitioned = db.updateSystemIncidentStatus(incident.id, 'MONITORING');
    expect(transitioned).toBe(true);

    const updated = db.getSystemIncidents().find((i) => i.id === incident.id)!;
    expect(updated.status).toBe('MONITORING');
    expect(updated.resolvedAt).toBeUndefined();
    expect(updated.durationSeconds).toBeUndefined();
  });

  it('transitions status to RESOLVED and calculates durationSeconds', () => {
    const incident = db.createSystemIncident({
      service: 'Web',
      error: 'CDN outage',
      severity: 'CRITICAL',
      status: 'INVESTIGATING',
      occurrences: 1,
    });

    // Simulate 60s elapsed
    incident.createdAt = new Date(Date.now() - 60 * 1000).toISOString();
    db.saveState((db as any).state);

    const transitioned = db.updateSystemIncidentStatus(incident.id, 'RESOLVED');
    expect(transitioned).toBe(true);

    const updated = db.getSystemIncidents().find((i) => i.id === incident.id)!;
    expect(updated.status).toBe('RESOLVED');
    expect(updated.resolvedAt).toBeDefined();
    expect(typeof updated.durationSeconds).toBe('number');
    expect(updated.durationSeconds).toBeGreaterThanOrEqual(59);
  });

  it('returns false when updating status of non-existent incident', () => {
    const result = db.updateSystemIncidentStatus('fake-id-404', 'MONITORING');
    expect(result).toBe(false);
  });
});
