import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vercel Serverless Function: /api/staging-health
 * 
 * Dedicated staging & failure simulation endpoint.
 * Isolated from production /api/health to allow safe failure testing
 * without risking live production uptime or monitors.
 */

// Toggle for outage simulation: false = 200 OK {"status":"ok"}, true = 503 {"status":"error"}
const SIMULATE_FAILURE = true;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  req.resume();

  if (SIMULATE_FAILURE) {
    res.statusCode = 503;
    const errorPayload = JSON.stringify({
      status: 'error',
      message: 'simulated_staging_outage_test'
    });
    res.setHeader('Content-Length', Buffer.byteLength(errorPayload).toString());
    res.end(errorPayload);
    return;
  }

  res.statusCode = 200;
  const okPayload = JSON.stringify({ status: 'ok' });
  res.setHeader('Content-Length', Buffer.byteLength(okPayload).toString());
  res.end(okPayload);
}
