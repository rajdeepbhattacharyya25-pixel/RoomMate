// Supabase Edge Function: send-push
// Dispatches Firebase Cloud Messaging (FCM) push notifications using FCM HTTP v1 API.
// Triggered on shared expense creation, debt settlements, and room join events.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface PushPayload {
  userIds?: string[];
  recipientUserIds?: string[];
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, string>;
}

interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

// Convert PEM string to ArrayBuffer for Web Crypto
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/[\r\n\s]/g, '');
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

// Generates Google OAuth 2.0 Access Token from Service Account Key using Web Crypto RS256
async function getGoogleAccessToken(sa: ServiceAccountKey): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat,
  };

  const b64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const b64Claim = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedJwt = `${b64Header}.${b64Claim}`;

  const keyBuffer = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedJwt)
  );

  let binarySig = '';
  const bytes = new Uint8Array(signature);
  for (let i = 0; i < bytes.byteLength; i++) {
    binarySig += String.fromCharCode(bytes[i]);
  }
  const b64Sig = btoa(binarySig).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signedJwt = `${unsignedJwt}.${b64Sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to exchange service account JWT for access token: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
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

    // Enforce caller authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    let callerUserId: string | null = null;

    if (token === supabaseKey) {
      callerUserId = 'service_role';
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid authentication session' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      callerUserId = userData.user.id;
    }

    const payload = (await req.json()) as PushPayload;
    const targetUserIds = payload.recipientUserIds || payload.userIds || [];
    const { title, body, channelId = 'roommate_expenses_channel', data } = payload;

    if (!targetUserIds || targetUserIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No recipient userIds provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Destination authorization check: if roomId is provided and caller is not service_role,
    // verify caller is an authorized member of that room
    if (callerUserId !== 'service_role' && data?.roomId) {
      const { data: membership, error: memErr } = await supabase
        .from('room_members')
        .select('id')
        .eq('room_id', data.roomId)
        .eq('user_id', callerUserId)
        .maybeSingle();

      if (memErr || !membership) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Caller is not an authorized member of this room' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 1. Query active FCM tokens across multiple devices for recipient users
    const allTokens = new Set<string>();

    // A. Query multi-device user_devices table
    try {
      const { data: devices } = await supabase
        .from('user_devices')
        .select('user_id, fcm_token')
        .in('user_id', targetUserIds)
        .eq('is_active', true);

      if (devices && devices.length > 0) {
        for (const d of devices) {
          if (d.fcm_token) allTokens.add(d.fcm_token);
        }
      }
    } catch (devErr) {
      console.warn('user_devices table query warning (falling back to profiles):', devErr);
    }

    // B. Query profiles table (backward compatibility fallback)
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, fcm_token')
      .in('id', targetUserIds)
      .not('fcm_token', 'is', null);

    if (profErr) {
      console.warn('profiles table query error:', profErr.message);
    } else if (profiles) {
      for (const p of profiles) {
        if (p.fcm_token) allTokens.add(p.fcm_token);
      }
    }

    const tokens = Array.from(allTokens);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No registered FCM tokens found for recipients' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Resolve FCM Credentials (HTTP v1 with Service Account or OAuth Token)
    const rawSaKey = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY') || Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    let accessToken: string | null = null;
    let projectId: string | null = null;

    if (rawSaKey) {
      try {
        const sa: ServiceAccountKey = JSON.parse(rawSaKey);
        projectId = sa.project_id;
        accessToken = await getGoogleAccessToken(sa);
      } catch (saErr) {
        console.warn('Failed to parse or authenticate FIREBASE_SERVICE_ACCOUNT_KEY:', saErr);
      }
    }

    // Fallback direct access token or project ID
    if (!accessToken) {
      accessToken = Deno.env.get('FCM_ACCESS_TOKEN') || null;
    }
    if (!projectId) {
      projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'roommate-eb1d3';
    }

    // Check if credentials are present
    if (!accessToken) {
      console.warn(
        '[FCM v1] No Google Service Account key or access token configured in Supabase secrets. Logged payload only.'
      );
      return new Response(
        JSON.stringify({
          message: 'Notification recorded (FIREBASE_SERVICE_ACCOUNT_KEY not yet configured in Supabase secrets)',
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

    // 3. Dispatch notifications using modern FCM HTTP v1 API
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        stringData[k] = String(v);
      }
    }

    const results = await Promise.allSettled(
      tokens.map(async (token: string) => {
        const fcmV1Url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
        const res = await fetch(fcmV1Url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title,
                body,
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: channelId,
                  sound: 'notification.mp3',
                  icon: 'ic_launcher',
                },
              },
              data: stringData,
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`FCM v1 send error (${res.status}): ${errText}`);
        }

        return res.json();
      })
    );

    const successfulDispatches = results.filter((r) => r.status === 'fulfilled').length;
    const failedDispatches = results.filter((r) => r.status === 'rejected').length;

    return new Response(
      JSON.stringify({
        success: true,
        protocol: 'FCM_HTTP_V1',
        dispatched: successfulDispatches,
        failed: failedDispatches,
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
