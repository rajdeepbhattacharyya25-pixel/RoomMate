import type { IncomingMessage, ServerResponse } from 'node:http';
import { performHealthCheck } from '../src/lib/health/healthService.ts';

/**
 * Vercel Serverless Function: /api/health
 * 
 * Production-hardened health check endpoint for RoomMate.
 * Designed for external monitoring by UptimeRobot Free.
 * 
 * Security & Reliability Specifications:
 * - Publicly accessible to external probes without requiring user authentication.
 * - Minimal response contract: {"status":"ok"} or {"status":"error"}.
 * - Zero exposure of credentials, database strings, cookies, or internal errors.
 * - Strict HTTP security headers: CSP, Frame-Options, Sniffing protection, no-store caching.
 * - Rejects all non-GET/HEAD/OPTIONS methods with HTTP 405.
 * - Bounded execution well within Vercel free-tier serverless limits.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // 1. Comprehensive Security & Anti-Caching Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 2. Handle CORS Pre-flight Options
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Content-Length', '0');
    res.end();
    return;
  }

  // 3. Strict Method Validation (only GET and HEAD permitted)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    const methodNotAllowedBody = JSON.stringify({ status: 'error' });
    res.setHeader('Content-Length', Buffer.byteLength(methodNotAllowedBody).toString());
    res.end(methodNotAllowedBody);
    return;
  }

  // Drain any unexpected request body stream to prevent hung connections
  req.resume();

  // 4. Perform Hardened Health Verification
  const result = await performHealthCheck();

  res.statusCode = result.statusCode;

  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', '0');
    res.end();
    return;
  }

  const payload = JSON.stringify({ status: result.status });
  res.setHeader('Content-Length', Buffer.byteLength(payload).toString());
  res.end(payload);
}
