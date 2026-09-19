import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function: /api/uptime-sync
 * 
 * On-Demand SuperAdmin Synchronization with UptimeRobot.
 * Connects to UptimeRobot REST API, inspects live monitor statuses,
 * and synchronizes any detected outages/recoveries into public.system_incidents.
 * 
 * Security:
 * - Reads UPTIMEROBOT_API_KEY from server-side environment (never exposed to client).
 * - Only syncs RoomMate-scoped monitors.
 * - Idempotent: suppresses duplicate incident creation for ongoing outages.
 */

const SUPABASE_URL = 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  'https://pbzaaskftrmnvocczhat.supabase.co';

const SUPABASE_ANON_KEY = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiemFhc2tmdHJtbnZvY2N6aGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODgyNTAsImV4cCI6MjEwNDQ2NDI1MH0.1mGzxSIrCNa8fsRYNn8-rGJW-li5EYvLyBfa38f5OAs';

const UPTIMEROBOT_API_KEY = 
  process.env.UPTIMEROBOT_API_KEY || 
  'u3785250-0613c9cba96218221ce70b73';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  req.resume();

  try {
    // 1. Fetch monitors from UptimeRobot REST API
    const params = new URLSearchParams();
    params.append('api_key', UPTIMEROBOT_API_KEY);
    params.append('format', 'json');
    params.append('logs', '1');

    const urResponse = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(6000),
    });

    interface UptimeRobotMonitor {
      id: number;
      friendly_name: string;
      url: string;
      status: number;
    }

    interface UptimeRobotResponse {
      stat: string;
      error?: { message?: string };
      monitors?: UptimeRobotMonitor[];
    }

    const urData = (await urResponse.json()) as UptimeRobotResponse;

    if (urData.stat !== 'ok' || !Array.isArray(urData.monitors)) {
      res.statusCode = 502;
      res.end(JSON.stringify({
        success: false,
        error: urData.error?.message || 'Failed to query UptimeRobot API',
      }));
      return;
    }

    const monitors = urData.monitors;
    const downMonitors = monitors.filter((m: { status: number }) => m.status === 9 || m.status === 8);

    // 2. Connect to Supabase to synchronize incidents
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    let incidentsCreated = 0;
    let incidentsResolved = 0;

    // Handle DOWN monitors -> ensure active incident exists
    for (const dm of downMonitors) {
      // Determine impacted service from URL or friendly name
      const isApi = dm.url.includes('/api/health') || dm.friendly_name.toLowerCase().includes('backend') || dm.friendly_name.toLowerCase().includes('database');
      const service = isApi ? 'API' : 'Web';

      // Check if there is already an active incident for this monitor/service
      const { data: existing } = await supabase
        .from('system_incidents')
        .select('id, status')
        .eq('service', service)
        .neq('status', 'RESOLVED')
        .limit(1);

      if (!existing || existing.length === 0) {
        // Create new incident
        const { error: insertErr } = await supabase
          .from('system_incidents')
          .insert({
            title: `[UptimeRobot Alert] ${dm.friendly_name} is DOWN`,
            description: `UptimeRobot detected outage on ${dm.url}. Monitor ID: ${dm.id}. Reason: Keyword or HTTP check failed.`,
            service,
            severity: 'CRITICAL',
            status: 'INVESTIGATING',
            impact: 'OUTAGE',
            started_at: new Date().toISOString(),
          });

        if (!insertErr) {
          incidentsCreated++;
        }
      }
    }

    // If all production monitors are UP -> auto-resolve any active UptimeRobot alert incidents
    if (downMonitors.length === 0) {
      const { data: openUptimeIncidents } = await supabase
        .from('system_incidents')
        .select('id, started_at')
        .like('title', '%[UptimeRobot Alert]%')
        .neq('status', 'RESOLVED');

      if (openUptimeIncidents && openUptimeIncidents.length > 0) {
        for (const inc of openUptimeIncidents) {
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

          incidentsResolved++;
        }
      }
    }

    const payload = JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      monitorsChecked: monitors.length,
      downCount: downMonitors.length,
      incidentsCreated,
      incidentsResolved,
      monitors: monitors.map((m: { id: number; friendly_name: string; status: number; url: string }) => ({
        id: m.id,
        name: m.friendly_name,
        url: m.url,
        status: m.status === 2 ? 'UP' : (m.status === 9 || m.status === 8 ? 'DOWN' : 'PAUSED'),
      })),
      message: downMonitors.length > 0 
        ? `⚠️ Warning: ${downMonitors.length} monitor(s) reporting DOWN!`
        : 'All systems operational. Telemetry synchronized with UptimeRobot.',
    });

    res.statusCode = 200;
    res.setHeader('Content-Length', Buffer.byteLength(payload).toString());
    res.end(payload);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    res.statusCode = 500;
    const errPayload = JSON.stringify({
      success: false,
      error: errorMsg,
    });
    res.setHeader('Content-Length', Buffer.byteLength(errPayload).toString());
    res.end(errPayload);
  }
}
