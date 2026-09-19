import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function: /api/health
 * 
 * Production-hardened, self-contained health check endpoint for RoomMate.
 * Designed for external monitoring by UptimeRobot Free.
 * 
 * Security & Reliability Specifications:
 * - Fully self-contained to avoid ESM/TypeScript cross-directory resolution issues on Vercel.
 * - Minimal response contract: {"status":"ok"} (200) or {"status":"error"} (503).
 * - Zero exposure of credentials, database connection strings, or stack traces.
 * - In-memory micro-cache (5s TTL) & in-flight deduplication to protect free-tier quotas.
 * - Strict 3.5s timeout on database probes.
 * - Strict HTTP security headers: CSP, Frame-Options, Sniffing protection, no-store caching.
 */

const SUPABASE_URL = 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  'https://pbzaaskftrmnvocczhat.supabase.co';

const SUPABASE_ANON_KEY = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiemFhc2tmdHJtbnZvY2N6aGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODgyNTAsImV4cCI6MjEwNDQ2NDI1MH0.1mGzxSIrCNa8fsRYNn8-rGJW-li5EYvLyBfa38f5OAs';

// Micro-cache state to protect database quotas against probe floods
let cachedResult: { status: 'ok' | 'error'; statusCode: 200 | 503 } | null = null;
let lastCheckTime = 0;
let inFlightProbe: Promise<{ status: 'ok' | 'error'; statusCode: 200 | 503 }> | null = null;

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

  try {
    const now = Date.now();

    // Return cached result if within 5-second TTL window
    if (cachedResult && now - lastCheckTime < 5000) {
      res.statusCode = cachedResult.statusCode;
      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', '0');
        res.end();
        return;
      }
      const cachedPayload = JSON.stringify({ status: cachedResult.status });
      res.setHeader('Content-Length', Buffer.byteLength(cachedPayload).toString());
      res.end(cachedPayload);
      return;
    }

    // Deduplicate concurrent in-flight probes
    if (!inFlightProbe) {
      inFlightProbe = (async () => {
        try {
          const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });

          const timeoutPromise = new Promise<{ ok: boolean }>((_, reject) =>
            setTimeout(() => reject(new Error('Database probe timeout')), 3500)
          );

          const queryPromise = (async () => {
            const { error } = await client
              .from('profiles')
              .select('id', { head: true, count: 'exact' })
              .limit(1);
            return { ok: !error };
          })();

          const outcome = await Promise.race([queryPromise, timeoutPromise]);
          return {
            status: (outcome.ok ? 'ok' : 'error') as 'ok' | 'error',
            statusCode: (outcome.ok ? 200 : 503) as 200 | 503,
          };
        } catch {
          return {
            status: 'error' as const,
            statusCode: 503 as const,
          };
        } finally {
          inFlightProbe = null;
        }
      })();
    }

    const result = await inFlightProbe;
    cachedResult = result;
    lastCheckTime = Date.now();

    res.statusCode = result.statusCode;

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }

    const payload = JSON.stringify({ status: result.status });
    res.setHeader('Content-Length', Buffer.byteLength(payload).toString());
    res.end(payload);
  } catch {
    res.statusCode = 503;
    const fallbackPayload = JSON.stringify({ status: 'error' });
    res.setHeader('Content-Length', Buffer.byteLength(fallbackPayload).toString());
    res.end(fallbackPayload);
  }
}

