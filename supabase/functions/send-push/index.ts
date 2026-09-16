// Supabase Edge Function: send-push
// Dispatches Firebase Cloud Messaging (FCM) push notifications to target user devices.
// Triggered on shared expense creation, debt settlements, and WhatsApp nudges.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface PushPayload {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userIds, title, body, data } = (await req.json()) as PushPayload;

    if (!userIds || userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No recipient userIds provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Query active FCM tokens for the specified recipient users
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, fcm_token')
      .in('id', userIds)
      .not('fcm_token', 'is', null);

    if (profErr) {
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokens = (profiles || []).map((p: { fcm_token: string }) => p.fcm_token).filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No registered FCM tokens found for recipients' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // FCM Server Key or OAuth 2.0 Access Token
    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY');
    if (!fcmServerKey) {
      console.warn('FCM_SERVER_KEY not set in Edge Function secrets. Notification logged but not dispatched.');
      return new Response(
        JSON.stringify({
          message: 'Notification recorded (FCM_SERVER_KEY not configured)',
          tokenCount: tokens.length,
          title,
          body,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Dispatch legacy or HTTP v1 notifications to each token
    const results = await Promise.allSettled(
      tokens.map((token: string) =>
        fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmServerKey}`,
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title,
              body,
              icon: '/icons/icon-192.png',
              sound: 'default',
            },
            data: data || {},
          }),
        })
      )
    );

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: results.length,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
