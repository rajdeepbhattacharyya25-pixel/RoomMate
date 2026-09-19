import { describe, it, expect } from 'vitest';
import { getProductionBaseUrl, getExternalMonitors } from './monitoringConfig.ts';

describe('Phase 5: UptimeRobot Integration Design & Configuration', () => {
  it('resolves a valid production base URL without trailing slash', () => {
    const url = getProductionBaseUrl();
    expect(url).toMatch(/^https?:\/\//);
    expect(url.endsWith('/')).toBe(false);
  });

  it('defines exactly two primary monitors for UptimeRobot Free', () => {
    const monitors = getExternalMonitors('https://roommate.app');
    expect(monitors).toHaveLength(2);

    const [webMonitor, healthMonitor] = monitors;

    // Monitor 1: Production Web
    expect(webMonitor.id).toBe('monitor-web');
    expect(webMonitor.name).toBe('RoomMate - Production Web');
    expect(webMonitor.url).toBe('https://roommate.app/');
    expect(webMonitor.intervalMinutes).toBe(5);
    expect(webMonitor.timeoutSeconds).toBe(30);
    expect(webMonitor.expectedStatus).toBe(200);

    // Monitor 2: Backend & Database Health API
    expect(healthMonitor.id).toBe('monitor-health-api');
    expect(healthMonitor.name).toBe('RoomMate - Backend & Database Health');
    expect(healthMonitor.url).toBe('https://roommate.app/api/health');
    expect(healthMonitor.intervalMinutes).toBe(5);
    expect(healthMonitor.timeoutSeconds).toBe(15);
    expect(healthMonitor.expectedStatus).toBe(200);
    expect(healthMonitor.keyword).toBe('"status":"ok"');
  });

  it('normalizes custom base URLs with trailing slashes safely', () => {
    const monitors = getExternalMonitors('https://custom-domain.vercel.app///');
    expect(monitors[0].url).toBe('https://custom-domain.vercel.app/');
    expect(monitors[1].url).toBe('https://custom-domain.vercel.app/api/health');
  });
});
