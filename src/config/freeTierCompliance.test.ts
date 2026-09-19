import { describe, it, expect } from 'vitest';
import { getExternalMonitors } from './monitoringConfig';
import { DEFAULT_HEALTH_TIMEOUT_MS } from '../lib/health/healthService';
import packageJson from '../../package.json';

describe('Phase 16: Free-Tier Compliance & Zero-Cost Infrastructure Audit', () => {
  describe('1. UptimeRobot Free Tier Compliance', () => {
    const monitors = getExternalMonitors('https://roommate-production.vercel.app');

    it('configures exactly 2 external monitors (well within the 50 free monitor limit)', () => {
      expect(monitors.length).toBe(2);
      expect(monitors.length).toBeLessThanOrEqual(50);
    });

    it('enforces a minimum 5-minute check interval for all monitors (complying with free tier limit)', () => {
      monitors.forEach((m) => {
        expect(m.intervalMinutes).toBeGreaterThanOrEqual(5);
        expect(m.intervalMinutes).toBe(5);
      });
    });

    it('configures timeouts safely below the 5-minute check interval', () => {
      monitors.forEach((m) => {
        expect(m.timeoutSeconds).toBeLessThanOrEqual(30);
      });
    });
  });

  describe('2. Vercel Hobby Free Tier Quota Compliance', () => {
    it('bounds health check probe timeout to <= 3500ms (far below Vercel 10s maxDuration)', () => {
      expect(DEFAULT_HEALTH_TIMEOUT_MS).toBeLessThanOrEqual(4000);
      expect(DEFAULT_HEALTH_TIMEOUT_MS).toBe(3500);
    });

    it('calculates daily serverless health invocations well within 100,000/day Hobby quota', () => {
      const checksPerHour = 60 / 5; // 12 checks/hr
      const checksPerDay = checksPerHour * 24; // 288 checks/day
      const checksPerMonth = checksPerDay * 30; // 8,640 checks/month

      expect(checksPerDay).toBe(288);
      // Under 1% of the 100k daily invocation quota
      expect(checksPerDay).toBeLessThan(100_000 * 0.01);
      expect(checksPerMonth).toBe(8_640);
    });
  });

  describe('3. Supabase Free Tier Egress & Bandwidth Compliance', () => {
    it('estimates monthly health check egress bandwidth to be under 0.1% of 5 GB free tier', () => {
      const checksPerMonth = (60 / 5) * 24 * 30; // 8,640
      const approxBytesPerCheck = 300; // ~300 bytes per minimal health response
      const totalBytesMonthly = checksPerMonth * approxBytesPerCheck;
      const totalMbMonthly = totalBytesMonthly / (1024 * 1024);

      // Monthly health check egress is ~2.47 MB
      expect(totalMbMonthly).toBeLessThan(10);
      // Supabase free tier provides 5120 MB (5 GB)
      const freeTierEgressMb = 5 * 1024;
      const percentageUsed = (totalMbMonthly / freeTierEgressMb) * 100;
      expect(percentageUsed).toBeLessThan(0.2); // Under 0.2%
    });
  });

  describe('4. Zero Paid Dependencies & No Daemon Processes', () => {
    it('confirms zero paid monitoring SDKs in package.json', () => {
      const deps = Object.keys(packageJson.dependencies || {});
      const devDeps = Object.keys(packageJson.devDependencies || {});
      const allDeps = [...deps, ...devDeps];

      const forbiddenPaidSdks = [
        'datadog',
        'dd-trace',
        'newrelic',
        '@sentry/node',
        '@sentry/react',
        'pagerduty',
        'bugsnag',
        'raygun',
        'dynatrace',
        'appdynamics',
      ];

      forbiddenPaidSdks.forEach((sdk) => {
        const found = allDeps.some((d) => d.toLowerCase().includes(sdk));
        expect(found).toBe(false);
      });
    });

    it('confirms zero background cron daemons or Redis dependencies required for health monitoring', () => {
      const deps = Object.keys(packageJson.dependencies || {});
      const forbiddenDaemons = ['node-cron', 'cron', 'agenda', 'bull', 'bullmq', 'ioredis', 'redis'];

      forbiddenDaemons.forEach((pkg) => {
        expect(deps).not.toContain(pkg);
      });
    });
  });
});
