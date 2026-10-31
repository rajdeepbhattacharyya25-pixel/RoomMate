// Supabase Edge Function: parse-receipt-gemini
// Secure, ephemeral AI receipt parsing powered by Gemini 1.5 Flash Vision.
// Designed with zero-retention guarantee: images are processed entirely in-memory and never stored.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface GeminiReceiptRequest {
  imageBase64: string;
  mimeType?: string;
  roomId?: string;
}

interface GeminiItemOutput {
  name: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface GeminiParsedResponse {
  vendor?: string;
  date?: string;
  items?: GeminiItemOutput[];
  subtotal?: number;
  tax?: number;
  deliveryFee?: number;
  discount?: number;
  totalAmount: number;
  overallConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

// In-memory rate limiting: 10 requests per user per rolling hour
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userTimes = rateLimitMap.get(userId) || [];
  const validTimes = userTimes.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimes.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(userId, validTimes);
    return { allowed: false, remaining: 0 };
  }

  validTimes.push(now);
  rateLimitMap.set(userId, validTimes);
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - validTimes.length };
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid authentication session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerUserId = userData.user.id;

    // 2. Enforce Rate Limiting
    const rateCheck = checkRateLimit(callerUserId);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded. Maximum 10 receipt scans per hour allowed.',
          retryAfterMinutes: 60,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // 3. Parse and Validate Request Body
    let body: GeminiReceiptRequest;
    try {
      body = (await req.json()) as GeminiReceiptRequest;
    } catch {
      return new Response(JSON.stringify({ error: 'Bad Request: Malformed JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'Bad Request: imageBase64 is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Validate Room Membership (if roomId provided)
    if (body.roomId) {
      const { data: member, error: memberErr } = await supabase
        .from('room_members')
        .select('status')
        .eq('room_id', body.roomId)
        .eq('user_id', callerUserId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (memberErr || !member) {
        return new Response(JSON.stringify({ error: 'Forbidden: You are not an active member of this room' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 5. Check Gemini API Key
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Gemini Vision API key is not configured on the server. Please use on-device OCR.',
          code: 'GEMINI_KEY_NOT_CONFIGURED',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Clean base64 string
    const cleanBase64 = body.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
    const mimeType = body.mimeType || 'image/jpeg';

    // 6. Call Google Gemini 1.5 Flash Vision API
    const systemPrompt = `You are an expert OCR and financial data extraction assistant for retail, grocery, restaurant, and supermarket receipts (including Indian receipts like Blinkit, Zepto, Swiggy Instamart, BigBasket, D-Mart, Zomato, dhabas).
Analyze the provided receipt image and extract the data strictly as JSON.
Format the output to match this JSON structure:
{
  "vendor": "Name of store/vendor (or null if unrecognizable)",
  "date": "YYYY-MM-DD (or null if unrecognizable)",
  "items": [
    {
      "name": "Item Description",
      "quantity": 1,
      "unitPrice": 50.00,
      "totalPrice": 50.00,
      "confidence": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "deliveryFee": 0.00,
  "discount": 0.00,
  "totalAmount": 0.00,
  "overallConfidence": "HIGH" | "MEDIUM" | "LOW"
}
Rules:
- Numeric values must be decimal numbers without currency symbols (e.g., 49.50 not "₹49.50").
- Taxes should be the sum of CGST, SGST, VAT, or service taxes.
- If there are discounts, express them as a positive number.
- Ensure the line items list accurately reflects items purchased.
- Do not output markdown code blocks (e.g. no triple backticks), only pure JSON.`;

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
      },
    };

    const geminiRes = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[parse-receipt-gemini] Gemini API call failed:', errText);
      return new Response(
        JSON.stringify({
          error: 'AI extraction failed. Please fallback to on-device scan.',
          upstreamStatus: geminiRes.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const geminiJson = await geminiRes.json();
    const candidateText =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed: GeminiParsedResponse;
    try {
      parsed = JSON.parse(candidateText.trim());
    } catch {
      console.error('[parse-receipt-gemini] Failed to parse JSON from candidate:', candidateText);
      return new Response(
        JSON.stringify({
          error: 'AI response was not valid JSON. Please fallback to on-device scan.',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. Normalize into paise-precision ParsedReceiptData
    const items = (parsed.items || []).map((it, idx) => {
      const qty = Math.max(1, it.quantity || 1);
      const totalPaise = Math.round((it.totalPrice || 0) * 100);
      const unitPaise = it.unitPrice ? Math.round(it.unitPrice * 100) : Math.round(totalPaise / qty);

      return {
        id: `ai_item_${idx + 1}`,
        name: it.name || `Item ${idx + 1}`,
        quantity: qty,
        unitPricePaise: unitPaise,
        totalPricePaise: totalPaise,
        confidence: it.confidence || 'HIGH',
        rawLine: `${it.name} ${it.totalPrice}`,
      };
    });

    const taxPaise = Math.round((parsed.tax || 0) * 100);
    const deliveryPaise = Math.round((parsed.deliveryFee || 0) * 100);
    const discountPaise = Math.round((parsed.discount || 0) * 100);
    const subtotalPaise = parsed.subtotal
      ? Math.round(parsed.subtotal * 100)
      : items.reduce((sum, item) => sum + item.totalPricePaise, 0);

    const calculatedTotalPaise = subtotalPaise + taxPaise + deliveryPaise - discountPaise;
    const finalTotalPaise = parsed.totalAmount
      ? Math.round(parsed.totalAmount * 100)
      : calculatedTotalPaise;

    const normalizedResult = {
      vendor: parsed.vendor || undefined,
      date: parsed.date || undefined,
      items,
      subtotalPaise,
      taxPaise,
      deliveryPaise,
      discountPaise,
      totalPaise: finalTotalPaise,
      confidence: parsed.overallConfidence || (items.length > 0 ? 'HIGH' : 'LOW'),
      rawText: candidateText,
      source: 'GEMINI_AI',
    };

    return new Response(JSON.stringify(normalizedResult), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(rateCheck.remaining),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[parse-receipt-gemini] Unexpected error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
