// Supabase Edge Function: telemetry-webhook
// Ingests real-time alerts from Firebase Crashlytics velocity alerts, PostHog anomaly alerts, or synthetic uptime probes.
// Inserts alerts directly into public.system_incidents with Supabase Realtime broadcast.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface WebhookBody {
  // Generic Incident Format
  service?: string;
  error?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: 'OPERATIONAL' | 'INVESTIGATING' | 'MONITORING' | 'RESOLVED';
  occurrences?: number;
  details?: string;

  // Firebase Alert format
  incident?: {
    issueTitle?: string;
    issueId?: string;
    appId?: string;
    createTime?: string;
  };

  // PostHog Alert format
  event?: string;
  hook?: {
    event?: string;
    data?: Record<string, unknown>;
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const expectedSecret = Deno.env.get('TELEMETRY_WEBHOOK_SECRET') || '';

    // Verify webhook secret if configured
    const authHeader = req.headers.get('Authorization') || '';
    const customHeader = req.headers.get('x-webhook-secret') || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '') || customHeader;

    if (expectedSecret && providedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid telemetry webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: WebhookBody = await req.json().catch(() => ({}));

    // Normalize incident attributes
    let service = payload.service || 'Crashlytics';
    let error = payload.error || '';
    let severity = payload.severity || 'HIGH';
    const status = payload.status || 'INVESTIGATING';
    let occurrences = payload.occurrences || 1;
    let details = payload.details || '';

    // Handle Firebase Crashlytics Velocity Alert payloads
    if (payload.incident) {
      service = 'Crashlytics';
      error = payload.incident.issueTitle || 'Firebase Velocity Alert: Sudden Crash Spike';
      severity = 'CRITICAL';
      details = `Crashlytics issue ${payload.incident.issueId || 'unknown'} detected on appId ${payload.incident.appId || 'io.campusflow.app'}.`;
    }
    // Handle PostHog Anomaly Alert payloads
    else if (payload.event || payload.hook) {
      service = 'PostHog';
      error = payload.event || payload.hook?.event || 'PostHog Anomaly: Metric Threshold Exceeded';
      severity = 'MEDIUM';
      details = JSON.stringify(payload.hook?.data || payload);
    }

    if (!error) {
      error = 'Unspecified Telemetry Diagnostic Incident';
    }

    // Initialize privileged Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error: insertError } = await supabase
      .from('system_incidents')
      .insert({
        service,
        error,
        severity,
        status,
        occurrences,
        details,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Telemetry Webhook] DB Insert Error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to record incident', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Telemetry Webhook] Recorded incident successfully:', data.id);

    return new Response(
      JSON.stringify({
        success: true,
        incidentId: data.id,
        service: data.service,
        status: data.status,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    console.error('[Telemetry Webhook] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error processing telemetry webhook' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
