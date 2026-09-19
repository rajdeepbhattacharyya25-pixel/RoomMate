/**
 * Core Health Check Service for RoomMate.
 * 
 * Provides hardened, lightweight health verification suitable for external uptime monitors
 * (UptimeRobot Free) and internal SuperAdmin diagnostics.
 * 
 * Guaranteed Security & Performance Contract:
 * - Minimal public payload: {"status": "ok"} or {"status": "error"}.
 * - Zero exposure of credentials, database connection strings, user records, or stack traces.
 * - Micro-cache (5s TTL) & in-flight deduplication to protect Supabase Free Tier quotas.
 * - Enforced 3.5s timeout abort to stay comfortably inside serverless execution limits.
 */

import { checkDatabaseHealth } from '../supabase/client.ts';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  statusCode: 200 | 503;
  timestamp: string;
}

export interface HealthCheckOptions {
  timeoutMs?: number;
  checkDatabase?: boolean;
  dbChecker?: () => Promise<boolean>;
  bypassCache?: boolean;
  cacheTtlMs?: number;
}

export const DEFAULT_HEALTH_TIMEOUT_MS = 3500;
export const DEFAULT_CACHE_TTL_MS = 5000;

// Micro-cache state to protect database quotas against probe floods
let cachedResult: HealthCheckResult | null = null;
let lastCheckTime = 0;
let inFlightProbe: Promise<HealthCheckResult> | null = null;

/**
 * Resets the in-memory health check cache (used primarily for unit testing).
 */
export function resetHealthCheckCache(): void {
  cachedResult = null;
  lastCheckTime = 0;
  inFlightProbe = null;
}

/**
 * Performs hardened health check and returns clean, non-leaking status.
 */
export async function performHealthCheck(options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
  const {
    timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
    checkDatabase = true,
    dbChecker = checkDatabaseHealth,
    bypassCache = false,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  } = options;

  const now = Date.now();

  // Return cached result if within TTL window to conserve free-tier DB quota
  if (!bypassCache && cachedResult && now - lastCheckTime < cacheTtlMs) {
    return cachedResult;
  }

  // Deduplicate concurrent in-flight probes
  if (inFlightProbe) {
    return inFlightProbe;
  }

  inFlightProbe = (async () => {
    const timestamp = new Date().toISOString();

    try {
      if (checkDatabase && dbChecker) {
        // Execute database connectivity check with timeout
        const checkPromise = dbChecker();
        const timeoutPromise = new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs)
        );

        const isDbHealthy = await Promise.race([checkPromise, timeoutPromise]);
        if (!isDbHealthy) {
          const failureResult: HealthCheckResult = {
            status: 'error',
            statusCode: 503,
            timestamp,
          };
          cachedResult = failureResult;
          lastCheckTime = Date.now();
          return failureResult;
        }
      }

      const successResult: HealthCheckResult = {
        status: 'ok',
        statusCode: 200,
        timestamp,
      };
      cachedResult = successResult;
      lastCheckTime = Date.now();
      return successResult;
    } catch (err) {
      // Log internally for debugging, never leak details to caller
      console.error('[HealthCheck] Health probe failed:', err instanceof Error ? err.message : 'Unknown error');
      const failureResult: HealthCheckResult = {
        status: 'error',
        statusCode: 503,
        timestamp,
      };
      cachedResult = failureResult;
      lastCheckTime = Date.now();
      return failureResult;
    } finally {
      inFlightProbe = null;
    }
  })();

  return inFlightProbe;
}
