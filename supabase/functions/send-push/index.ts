// Supabase Edge Function: send-push
// Dispatches Firebase Cloud Messaging (FCM) push notifications using FCM HTTP v1 API.
// Hardened in Phase 2C.2 for Notification Authenticity, Recipient Authorization & Payload Validation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface PushPayload {
  roomId?: string;
  userIds?: string[];
  recipientUserIds?: string[];
  title: string;
  body: string;
  channelId?: string;
  type?: string;
  priority?: string;
  data?: Record<string, unknown>;
}

interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(uuid: string): boolean {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid.trim());
}

// Forbidden notification types for non-system/regular client callers
const FORBIDDEN_CLIENT_TYPES = new Set([
  'ACCOUNT_SECURITY',
  'SYSTEM_INFO',
  'ADMIN_APPROVAL_REQUIRED',
]);

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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Caller Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerUserId = userData.user.id;
    }

    // 2. Parse & Validate Payload
    let payload: PushPayload;
    try {
      payload = (await req.json()) as PushPayload;
    } catch {
      return new Response(JSON.stringify({ error: 'Bad Request: Malformed JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUserIds = payload.recipientUserIds || payload.userIds || [];
    const { title, body, channelId = 'roommate_expenses_channel', data } = payload;
    const effectiveRoomId = payload.roomId || (data?.roomId as string | undefined);

    // Common Payload Validation:
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Validation Error: recipientUserIds must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: title must be a non-empty string of max 100 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0 || body.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: body must be a non-empty string of max 500 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate recipient UUID formats
    for (const uid of targetUserIds) {
      if (!isValidUUID(uid)) {
        return new Response(
          JSON.stringify({ error: `Validation Error: Invalid recipient UUID format: ${uid}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Strict Authorization Boundaries
    if (callerUserId !== 'service_role') {
      // Rule 1: roomId is MANDATORY for regular users
      if (!effectiveRoomId || !isValidUUID(effectiveRoomId)) {
        return new Response(
          JSON.stringify({ error: 'Validation Error: roomId is mandatory and must be a valid UUID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Rule 2: Limit recipient count for client requests (anti-spam)
      if (targetUserIds.length > 50) {
        return new Response(
          JSON.stringify({ error: 'Validation Error: Recipient count exceeds maximum limit of 50' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Rule 3: Reject forbidden system notification types
      const notifType = ((data?.type as string) || payload.type || '').toUpperCase();
      if (FORBIDDEN_CLIENT_TYPES.has(notifType)) {
        return new Response(
          JSON.stringify({ error: `Forbidden: Client cannot dispatch system-level notification type '${notifType}'` }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Rule 4: Data payload size limit
      if (data) {
        const dataBytes = new TextEncoder().encode(JSON.stringify(data)).length;
        if (dataBytes > 4096) {
          return new Response(
            JSON.stringify({ error: 'Validation Error: data payload exceeds 4KB limit' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Rule 5: Verify Caller is an ACTIVE member of effectiveRoomId
      const { data: callerMember, error: callerMemErr } = await supabase
        .from('room_members')
        .select('id')
        .eq('room_id', effectiveRoomId)
        .eq('user_id', callerUserId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (callerMemErr || !callerMember) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Caller is not an active member of this room' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Rule 6: Verify EVERY recipient is an ACTIVE member of effectiveRoomId
      const distinctRecipients = Array.from(new Set(targetUserIds));
      const { data: recipientMembers, error: recMemErr } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', effectiveRoomId)
        .eq('status', 'ACTIVE')
        .in('user_id', distinctRecipients);

      if (recMemErr || !recipientMembers) {
        return new Response(
          JSON.stringify({ error: 'Internal Error: Failed to verify recipient room memberships' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const activeMemberSet = new Set(recipientMembers.map((m) => m.user_id));
      const foreignRecipients = distinctRecipients.filter((uid) => !activeMemberSet.has(uid));

      if (foreignRecipients.length > 0) {
        return new Response(
          JSON.stringify({
            error: 'Forbidden: One or more recipients are not active members of this room',
            unauthorizedUserIds: foreignRecipients,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Rule 7: Enforce authentic caller sender identity in data; strip spoofed claims
      if (data) {
        delete (data as Record<string, unknown>).is_system_verified;
        delete (data as Record<string, unknown>).verified_by;
        delete (data as Record<string, unknown>).system_source;
        (data as Record<string, unknown>).senderId = callerUserId;
        (data as Record<string, unknown>).roomId = effectiveRoomId;
      }
    } else {
      // Service Role caller: Validate max limit
      if (targetUserIds.length > 500) {
        return new Response(
          JSON.stringify({ error: 'Validation Error: Service role recipient count exceeds 500' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Query active FCM tokens for recipient users
    const allTokens = new Set<string>();

    // A. Query multi-device user_devices table (canonical token store)
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
      console.warn('user_devices table query warning:', devErr);
    }

    // B. Query profiles table (backward compatibility fallback for un-migrated users)
    if (allTokens.size === 0) {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, fcm_token')
        .in('id', targetUserIds)
        .not('fcm_token', 'is', null);

      if (!profErr && profiles) {
        for (const p of profiles) {
          if (p.fcm_token) allTokens.add(p.fcm_token);
        }
      }
    }

    const tokens = Array.from(allTokens);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No registered active FCM tokens found for recipients' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Resolve FCM Credentials (HTTP v1 with Service Account or OAuth Token)
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

    if (!accessToken) {
      accessToken = Deno.env.get('FCM_ACCESS_TOKEN') || null;
    }
    if (!projectId) {
      projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'roommate-eb1d3';
    }

    if (!accessToken) {
      console.warn(
        '[FCM v1] No Google Service Account key or access token configured in Supabase secrets. Payload logged.'
      );
      return new Response(
        JSON.stringify({
          message: 'Notification recorded (FIREBASE_SERVICE_ACCOUNT_KEY not yet configured in Supabase secrets)',
          tokenCount: tokens.length,
          title,
          body,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Dispatch notifications using FCM HTTP v1 API
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
          // Stale token cleanup: If FCM returns unregistered or invalid token, clean up database
          if (
            res.status === 404 ||
            errText.includes('UNREGISTERED') ||
            errText.includes('INVALID_ARGUMENT') ||
            errText.includes('registration-token-not-registered')
          ) {
            try {
              await supabase.from('user_devices').delete().eq('fcm_token', token);
            } catch (cleanErr) {
              console.warn('Failed to clean up stale token:', cleanErr);
            }
          }
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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
