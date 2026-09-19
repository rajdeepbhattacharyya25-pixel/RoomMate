/**
 * External Uptime Monitoring Configuration for RoomMate.
 * 
 * Defines the dual-monitor architecture using UptimeRobot Free:
 * 1. Production Web Frontend (Reactivity & CDN availability)
 * 2. Production Health Endpoint (Serverless runtime & PostgreSQL connectivity)
 */

export interface ExternalMonitorConfig {
  id: string;
  name: string;
  type: 'HTTP(s)' | 'KEYWORD';
  url: string;
  intervalMinutes: number;
  timeoutSeconds: number;
  expectedStatus: number;
  keyword?: string;
  description: string;
}

/**
 * Resolves the primary production base URL for RoomMate.
 */
export function getProductionBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    const origin = window.location.origin;
    // If not running on local loopback or capacitor scheme, use actual deployed origin
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1') && !origin.startsWith('capacitor://')) {
      return origin;
    }
  }

  const globalProc = typeof globalThis !== 'undefined' ? (globalThis as unknown as { process?: { env?: Record<string, string> } }).process : undefined;
  const envUrl = globalProc?.env?.VERCEL_URL;
  if (envUrl) {
    return envUrl.startsWith('http') ? envUrl : `https://${envUrl}`;
  }

  // Canonical production Vercel deployment fallback
  return 'https://roommate26.vercel.app';
}

/**
 * Returns the exact configuration required for UptimeRobot Free monitors.
 */
export function getExternalMonitors(baseUrl = getProductionBaseUrl()): ExternalMonitorConfig[] {
  const cleanBase = baseUrl.replace(/\/+$/, '');

  return [
    {
      id: 'monitor-web',
      name: 'RoomMate - Production Web',
      type: 'HTTP(s)',
      url: `${cleanBase}/`,
      intervalMinutes: 5,
      timeoutSeconds: 30,
      expectedStatus: 200,
      description: 'Verifies production web application availability, Vercel Edge CDN, and SSL certificate validity.',
    },
    {
      id: 'monitor-health-api',
      name: 'RoomMate - Backend & Database Health',
      type: 'HTTP(s)',
      url: `${cleanBase}/api/health`,
      intervalMinutes: 5,
      timeoutSeconds: 15,
      expectedStatus: 200,
      keyword: '"status":"ok"',
      description: 'Verifies serverless execution environment and live Supabase PostgreSQL connectivity.',
    },
  ];
}
