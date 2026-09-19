/**
 * SuperAdmin System Health & Telemetry Helper Utilities
 * Pure functions for status derivation, service degradation, outage duration, and empty state messaging.
 */

export function formatElapsedDuration(createdAt: string, nowMs: number): string {
  const createdMs = new Date(createdAt).getTime();
  if (isNaN(createdMs)) return 'Active';
  const elapsedSec = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDurationSeconds(sec?: number): string {
  if (sec === undefined || sec === null) return 'N/A';
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  return `${hrs}h ${remM}m`;
}

export function computeOverallSystemStatus(params: {
  isOnline: boolean;
  hasCriticalIncident: boolean;
  activeIncidentCount: number;
  healthStatus?: 'ok' | 'error' | 'degraded';
}): 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'OFFLINE' {
  if (!params.isOnline) return 'OFFLINE';
  if (params.hasCriticalIncident || params.healthStatus === 'error') {
    return 'OUTAGE';
  }
  if (params.activeIncidentCount > 0 || params.healthStatus === 'degraded') {
    return 'DEGRADED';
  }
  return 'OPERATIONAL';
}

export function computeServiceStatus(params: {
  serviceType: 'web' | 'api' | 'database';
  isOnline: boolean;
  hasIncident: boolean;
  isDbConfigured: boolean;
  healthStatus?: 'ok' | 'error' | 'degraded';
}): 'OPERATIONAL' | 'DEGRADED' | 'LOCAL_STORAGE' | 'OFFLINE' {
  if (!params.isOnline) return 'OFFLINE';

  if (params.serviceType === 'web') {
    return params.hasIncident ? 'DEGRADED' : 'OPERATIONAL';
  }

  if (params.serviceType === 'api') {
    return params.healthStatus === 'error' || params.hasIncident ? 'DEGRADED' : 'OPERATIONAL';
  }

  if (params.serviceType === 'database') {
    if (!params.isDbConfigured) return 'LOCAL_STORAGE';
    return params.hasIncident || params.healthStatus === 'error' ? 'DEGRADED' : 'OPERATIONAL';
  }

  return 'OPERATIONAL';
}

export function getIncidentEmptyStateMessage(totalIncidentsCount: number, filter: string): string {
  if (totalIncidentsCount === 0) {
    return 'Zero system incidents detected. All services operating normally.';
  }
  return `Zero system incidents matching the "${filter}" filter. All monitored services are operating normally.`;
}
