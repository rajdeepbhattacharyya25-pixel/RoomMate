import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performHealthCheck, resetHealthCheckCache } from './healthService.ts';

describe('Phase 4: Health Endpoint Security & Performance', () => {
  beforeEach(() => {
    resetHealthCheckCache();
    vi.restoreAllMocks();
  });

  it('returns HTTP 200 and status: ok when database connectivity check succeeds', async () => {
    const mockDbChecker = vi.fn().mockResolvedValue(true);
    const result = await performHealthCheck({ dbChecker: mockDbChecker, bypassCache: true });

    expect(result.status).toBe('ok');
    expect(result.statusCode).toBe(200);
    expect(typeof result.timestamp).toBe('string');
    expect(mockDbChecker).toHaveBeenCalledTimes(1);
  });

  it('returns HTTP 503 and status: error when database connectivity fails (false)', async () => {
    const mockDbChecker = vi.fn().mockResolvedValue(false);
    const result = await performHealthCheck({ dbChecker: mockDbChecker, bypassCache: true });

    expect(result.status).toBe('error');
    expect(result.statusCode).toBe(503);
    expect(mockDbChecker).toHaveBeenCalledTimes(1);
  });

  it('returns HTTP 503 and status: error when database throws a connection error', async () => {
    const mockDbChecker = vi.fn().mockRejectedValue(new Error('Connection refused by remote host'));
    const result = await performHealthCheck({ dbChecker: mockDbChecker, bypassCache: true });

    expect(result.status).toBe('error');
    expect(result.statusCode).toBe(503);
    expect(mockDbChecker).toHaveBeenCalledTimes(1);
  });

  it('strictly shields all credentials, cookies, and tokens from the output payload', async () => {
    const rawDbError = 'PGRST301: JWT expired or invalid connection to postgresql://postgres:SuperSecretPassword123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    const mockDbChecker = vi.fn().mockRejectedValue(new Error(rawDbError));
    const result = await performHealthCheck({ dbChecker: mockDbChecker, bypassCache: true });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('SuperSecretPassword123');
    expect(serialized).not.toContain('supabase.com');
    expect(serialized).not.toContain('PGRST301');
    expect(serialized).not.toContain('jwt');
    expect(serialized).not.toContain('token');

    expect(result).toEqual({
      status: 'error',
      statusCode: 503,
      timestamp: expect.any(String),
    });
  });

  it('handles database probe timeouts by returning HTTP 503 within configured timeout window', async () => {
    const slowHangingQuery = vi.fn().mockImplementation(
      () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 200))
    );

    const result = await performHealthCheck({
      dbChecker: slowHangingQuery,
      timeoutMs: 40,
      bypassCache: true,
    });

    expect(result.status).toBe('error');
    expect(result.statusCode).toBe(503);
  });

  it('leverages micro-caching to protect database from rapid repetitive probe requests', async () => {
    const mockDbChecker = vi.fn().mockResolvedValue(true);

    // First check calls dbChecker
    const firstResult = await performHealthCheck({
      dbChecker: mockDbChecker,
      cacheTtlMs: 2000,
    });
    expect(mockDbChecker).toHaveBeenCalledTimes(1);
    expect(firstResult.status).toBe('ok');

    // Immediate second check should hit micro-cache and NOT invoke dbChecker again
    const secondResult = await performHealthCheck({
      dbChecker: mockDbChecker,
      cacheTtlMs: 2000,
    });
    expect(mockDbChecker).toHaveBeenCalledTimes(1);
    expect(secondResult.status).toBe('ok');
    expect(secondResult.timestamp).toBe(firstResult.timestamp);
  });

  it('deduplicates simultaneous in-flight probe requests', async () => {
    let resolvePending: (val: boolean) => void = () => {};
    const deferredCheck = vi.fn().mockImplementation(
      () => new Promise<boolean>((resolve) => {
        resolvePending = resolve;
      })
    );

    // Launch two concurrent checks before resolving
    const probePromise1 = performHealthCheck({ dbChecker: deferredCheck, bypassCache: true });
    const probePromise2 = performHealthCheck({ dbChecker: deferredCheck, bypassCache: true });

    resolvePending(true);

    const [res1, res2] = await Promise.all([probePromise1, probePromise2]);
    expect(deferredCheck).toHaveBeenCalledTimes(1);
    expect(res1.status).toBe('ok');
    expect(res2.status).toBe('ok');
  });

  it('bypasses micro-cache when bypassCache option is explicitly true', async () => {
    const mockDbChecker = vi.fn().mockResolvedValue(true);

    await performHealthCheck({ dbChecker: mockDbChecker, cacheTtlMs: 5000 });
    expect(mockDbChecker).toHaveBeenCalledTimes(1);

    await performHealthCheck({ dbChecker: mockDbChecker, bypassCache: true });
    expect(mockDbChecker).toHaveBeenCalledTimes(2);
  });
});
