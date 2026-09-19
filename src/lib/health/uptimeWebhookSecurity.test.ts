import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Mock Supabase client
const mockIncidents: Array<{
  id: string;
  service: string;
  status: string;
  started_at: string;
  resolved_at?: string;
  duration_minutes?: number;
  title?: string;
  description?: string;
}> = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'system_incidents') {
        let selectedService = '';
        let statusFilter = '';
        let isNotResolved = false;

        const getMatches = () => {
          return mockIncidents.filter((i) => {
            if (selectedService && i.service !== selectedService) return false;
            if (isNotResolved && i.status === 'RESOLVED') return false;
            if (statusFilter && i.status !== statusFilter) return false;
            return true;
          });
        };

        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'service') selectedService = val;
            if (col === 'status') statusFilter = val;
            return chain;
          }),
          neq: vi.fn((col: string, val: string) => {
            if (col === 'status' && val === 'RESOLVED') isNotResolved = true;
            return chain;
          }),
          limit: vi.fn().mockImplementation(() => {
            return Promise.resolve({ data: getMatches(), error: null });
          }),
          then: vi.fn((resolve: any) => resolve({ data: getMatches(), error: null })),
          insert: vi.fn((row: any) => {
            const newId = `inc-mock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const created = { id: newId, ...row };
            mockIncidents.push(created);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: created, error: null }),
              }),
            };
          }),
          update: vi.fn((updates: any) => ({
            eq: vi.fn((col: string, val: string) => {
              const item = mockIncidents.find((i) => i.id === val);
              if (item) {
                Object.assign(item, updates);
              }
              return Promise.resolve({ data: [item], error: null });
            }),
          })),
        };
        return chain;
      }
      return {};
    },
  })),
}));

// Import webhook handler
import webhookHandler from '../../../api/uptime-webhook';

function createMockReq(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const stream = new Readable({
    read() {
      if (options.body !== undefined) {
        this.push(options.body);
      }
      this.push(null);
    },
  });

  const req = stream as unknown as IncomingMessage;
  req.method = options.method || 'POST';
  req.headers = options.headers || {};
  return req;
}

function createMockRes(): {
  res: ServerResponse;
  getStatusCode: () => number;
  getBody: () => string;
  getJson: () => any;
} {
  let statusCode = 200;
  let body = '';

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader: vi.fn(),
    end: vi.fn((chunk?: string) => {
      if (chunk) body += chunk;
    }),
  } as unknown as ServerResponse;

  return {
    res,
    getStatusCode: () => statusCode,
    getBody: () => body,
    getJson: () => {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    },
  };
}

describe('PHASE 4: /api/uptime-webhook Security & E2E Test Suite', () => {
  const TEST_SECRET = 'test-secret-mock-2026-secure-token-999';

  beforeEach(() => {
    mockIncidents.length = 0;
    process.env.UPTIME_WEBHOOK_SECRET = TEST_SECRET;
  });

  it('Scenario 1: Valid secret + valid payload -> accepted (201 Created)', async () => {
    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'x-webhook-secret': TEST_SECRET,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'DOWN',
        monitorName: 'RoomMate - Backend & Database Health',
        url: 'https://roommate26.vercel.app/api/health',
        reason: 'HTTP 503 Keyword missing',
      }),
    });

    await webhookHandler(req, res);

    expect(getStatusCode()).toBe(201);
    const json = getJson();
    expect(json.ok).toBe(true);
    expect(json.action).toBe('incident_created');
    expect(mockIncidents.length).toBe(1);
    expect(mockIncidents[0].service).toBe('API');
    expect(mockIncidents[0].status).toBe('INVESTIGATING');
  });

  it('Scenario 2: Missing secret -> rejected (401 Unauthorized)', async () => {
    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'DOWN',
        monitorName: 'RoomMate - Production Web',
      }),
    });

    await webhookHandler(req, res);

    expect(getStatusCode()).toBe(401);
    const json = getJson();
    expect(json.error).toMatch(/Missing webhook secret/i);
    expect(mockIncidents.length).toBe(0);
  });

  it('Scenario 3: Wrong secret -> rejected (401 Unauthorized)', async () => {
    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'x-webhook-secret': 'completely-wrong-invalid-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'DOWN',
        monitorName: 'RoomMate - Production Web',
      }),
    });

    await webhookHandler(req, res);

    expect(getStatusCode()).toBe(401);
    const json = getJson();
    expect(json.error).toMatch(/Invalid webhook secret/i);
    expect(mockIncidents.length).toBe(0);
  });

  it('Scenario 4: Malformed payload -> rejected (400 Bad Request)', async () => {
    // 4a. Broken JSON syntax
    {
      const { res, getStatusCode, getJson } = createMockRes();
      const req = createMockReq({
        method: 'POST',
        headers: { 'x-webhook-secret': TEST_SECRET },
        body: '{ "event": "DOWN", malformed',
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getJson().error).toMatch(/Invalid JSON payload/i);
    }

    // 4b. Empty request body
    {
      const { res, getStatusCode, getJson } = createMockRes();
      const req = createMockReq({
        method: 'POST',
        headers: { 'x-webhook-secret': TEST_SECRET },
        body: '',
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getJson().error).toMatch(/Empty request body/i);
    }

    // 4c. Missing event property
    {
      const { res, getStatusCode, getJson } = createMockRes();
      const req = createMockReq({
        method: 'POST',
        headers: { 'x-webhook-secret': TEST_SECRET },
        body: JSON.stringify({ monitorName: 'RoomMate Service' }),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getJson().error).toMatch(/Missing required event property/i);
    }

    // 4d. Invalid event string
    {
      const { res, getStatusCode, getJson } = createMockRes();
      const req = createMockReq({
        method: 'POST',
        headers: { 'x-webhook-secret': TEST_SECRET },
        body: JSON.stringify({ event: 'EXPLODED', monitorName: 'RoomMate Service' }),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getJson().error).toMatch(/Event must be DOWN or UP/i);
    }
  });

  it('Scenario 5: Unexpected monitor/service -> safely handled', async () => {
    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'x-webhook-secret': TEST_SECRET,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'DOWN',
        monitorName: 'External Unexpected Third Party Service',
        url: 'https://external-service.xyz/status',
        reason: 'Connection reset by peer',
      }),
    });

    await webhookHandler(req, res);

    expect(getStatusCode()).toBe(201);
    const json = getJson();
    expect(json.ok).toBe(true);
    expect(json.action).toBe('incident_created');
    // Successfully categorized to Web default without crashing
    expect(mockIncidents[0].service).toBe('Web');
  });

  it('Scenario 6: Duplicate event -> does not create duplicate incidents', async () => {
    // 6a. First DOWN event creates incident
    {
      const { res, getStatusCode, getJson } = createMockRes();
      const req = createMockReq({
        method: 'POST',
        headers: { 'x-webhook-secret': TEST_SECRET },
        body: JSON.stringify({
          event: 'DOWN',
          monitorName: 'RoomMate - Production Web',
          url: 'https://roommate26.vercel.app/',
          reason: 'Timeout',
        }),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(201);
      expect(getJson().action).toBe('incident_created');
      expect(mockIncidents.length).toBe(1);
    }

    // 6b. Second DOWN event for the same service suppresses duplicate
    {
      const { res, getStatusCode, getJson } = createMockRes();
      const req = createMockReq({
        method: 'POST',
        headers: { 'x-webhook-secret': TEST_SECRET },
        body: JSON.stringify({
          event: 'DOWN',
          monitorName: 'RoomMate - Production Web',
          url: 'https://roommate26.vercel.app/',
          reason: 'Still Down',
        }),
      });

      await webhookHandler(req, res);
      expect(getStatusCode()).toBe(200);
      const json = getJson();
      expect(json.ok).toBe(true);
      expect(json.action).toBe('suppressed_duplicate');
      expect(mockIncidents.length).toBe(1); // No new row added
    }
  });

  it('Scenario 7: Recovery event -> resolves the correct incident', async () => {
    // Pre-populate an active incident
    mockIncidents.push({
      id: 'inc-active-api-1',
      service: 'API',
      status: 'INVESTIGATING',
      started_at: new Date(Date.now() - 5 * 60000).toISOString(), // 5 mins ago
      title: '[Uptime Alert] Backend is DOWN',
    });

    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-webhook-secret': TEST_SECRET },
      body: JSON.stringify({
        event: 'UP',
        monitorName: 'RoomMate - Backend & Database Health',
        url: 'https://roommate26.vercel.app/api/health',
      }),
    });

    await webhookHandler(req, res);

    expect(getStatusCode()).toBe(200);
    const json = getJson();
    expect(json.ok).toBe(true);
    expect(json.action).toBe('incident_resolved');
    expect(json.resolvedCount).toBe(1);

    const resolved = mockIncidents.find((i) => i.id === 'inc-active-api-1');
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.duration_minutes).toBeGreaterThanOrEqual(1);
  });
});
