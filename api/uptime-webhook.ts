import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function: /api/uptime-webhook
 * 
 * Inbound Webhook Receiver for Email-to-Webhook & External Monitoring Relays.
 * Receives authenticated DOWN / UP event notifications and synchronizes them
 * in real-time into RoomMate's public.system_incidents table.
 * 
 * Compatible with:
 * - Cloudflare Email Routing Workers (scripts/email-to-webhook-worker.js)
 * - Inbound Webhook forwarders
 * - Automated disaster recovery triggers
 */

const SUPABASE_URL = 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  'https://pbzaaskftrmnvocczhat.supabase.co';

const SUPABASE_ANON_KEY = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiemFhc2tmdHJtbnZvY2N6aGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODgyNTAsImV4cCI6MjEwNDQ2NDI1MH0.1mGzxSIrCNa8fsRYNn8-rGJW-li5EYvLyBfa38f5OAs';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const WEBHOOK_SECRET = process.env.UPTIME_WEBHOOK_SECRET;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-secret');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 1. Server Configuration Guard: Require secret to be set
  if (!WEBHOOK_SECRET) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Server configuration error: Webhook secret not configured' }));
    return;
  }

  // 2. Security Check: Validate Secret Header or Bearer Token
  const authHeader = req.headers['authorization'] || '';
  const secretHeader = req.headers['x-webhook-secret'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!secretHeader && !token) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized: Missing webhook secret' }));
    return;
  }

  const providedSecret = (secretHeader || token) as string;
  if (providedSecret !== WEBHOOK_SECRET) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized: Invalid webhook secret' }));
    return;
  }

  // 3. Parse and Validate Body Stream
  let rawBody = '';
  for await (const chunk of req) {
    rawBody += chunk;
  }

  if (!rawBody || !rawBody.trim()) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Bad Request: Empty request body' }));
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.event) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Bad Request: Missing required event property' }));
    return;
  }

  const event = String(body.event).trim().toUpperCase();
  if (event !== 'DOWN' && event !== 'UP') {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Bad Request: Event must be DOWN or UP' }));
    return;
  }

  const monitorName = String(body.monitorName || 'RoomMate Service');
  const url = String(body.url || 'https://roommate26.vercel.app');
  const reason = String(body.reason || 'Reported by monitoring telemetry');
  const timestamp = body.timestamp ? String(body.timestamp) : new Date().toISOString();

  const isApi = url.includes('/api/') || monitorName.toLowerCase().includes('backend') || monitorName.toLowerCase().includes('database');
  const service = isApi ? 'API' : 'Web';

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  try {
    if (event === 'DOWN') {
      // 1. Check for ongoing active incident to suppress duplicate alerts
      const { data: existing } = await supabase
        .from('system_incidents')
        .select('id')
        .eq('service', service)
        .neq('status', 'RESOLVED')
        .limit(1);

      if (existing && existing.length > 0) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          action: 'suppressed_duplicate',
          incidentId: existing[0].id,
          message: 'Active incident already recorded for this service.'
        }));
        return;
      }

      // 2. Insert new critical incident
      const { data: inserted, error: insertError } = await supabase
        .from('system_incidents')
        .insert({
          title: `[Uptime Alert] ${monitorName} is DOWN`,
          description: reason,
          service,
          severity: 'CRITICAL',
          status: 'INVESTIGATING',
          impact: 'OUTAGE',
          started_at: timestamp,
        })
        .select('id')
        .single();

      if (insertError) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: insertError.message }));
        return;
      }

      res.statusCode = 201;
      res.end(JSON.stringify({
        ok: true,
        action: 'incident_created',
        incidentId: inserted?.id,
        message: `Incident recorded: ${monitorName} is DOWN.`
      }));
      return;
    } else if (event === 'UP') {
      // 3. Resolve existing active incident
      const { data: openIncidents } = await supabase
        .from('system_incidents')
        .select('id, started_at')
        .eq('service', service)
        .neq('status', 'RESOLVED');

      let resolvedCount = 0;
      if (openIncidents && openIncidents.length > 0) {
        for (const inc of openIncidents) {
          const startTime = new Date(inc.started_at).getTime();
          const durationMins = Math.max(1, Math.round((Date.now() - startTime) / 60000));

          await supabase
            .from('system_incidents')
            .update({
              status: 'RESOLVED',
              resolved_at: new Date().toISOString(),
              duration_minutes: durationMins,
            })
            .eq('id', inc.id);

          resolvedCount++;
        }
      }

      res.statusCode = 200;
      res.end(JSON.stringify({
        ok: true,
        action: 'incident_resolved',
        resolvedCount,
        message: `Resolved ${resolvedCount} incident(s) for ${service}.`
      }));
      return;
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: 'Unknown event type. Use DOWN or UP.' }));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}
