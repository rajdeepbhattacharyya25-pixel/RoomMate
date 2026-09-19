import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Mock Supabase Auth and Database
let mockGetUserResult: { data: { user: { id: string } | null }; error: any } = {
  data: { user: { id: 'usr-admin-1' } },
  error: null,
};

let mockProfileRole = 'SUPER_ADMIN';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (_token: string) => mockGetUserResult),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({
            data: { role: mockProfileRole },
            error: null,
          })),
        };
      }
      if (table === 'system_incidents') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          like: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    },
  })),
}));

// Mock global fetch for UptimeRobot API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import uptime-sync handler
import syncHandler from '../../../api/uptime-sync';

function createMockReq(options: {
  method?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  const stream = new Readable({
    read() {
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

describe('PHASE 3: /api/uptime-sync Authorization & Key Security Test Suite', () => {
  const MOCK_API_KEY = 'u-mock-test-key-12345';

  beforeEach(() => {
    process.env.UPTIMEROBOT_API_KEY = MOCK_API_KEY;
    mockGetUserResult = { data: { user: { id: 'usr-admin-1' } }, error: null };
    mockProfileRole = 'SUPER_ADMIN';

    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      json: async () => ({
        stat: 'ok',
        monitors: [
          { id: 804035441, friendly_name: 'RoomMate - Production Web', url: 'https://roommate26.vercel.app/', status: 2 },
          { id: 804035777, friendly_name: 'RoomMate - Backend & Database Health', url: 'https://roommate26.vercel.app/api/health', status: 2 },
        ],
      }),
    });
  });

  it('1. Unauthenticated request without Authorization header -> rejected (401 Unauthorized)', async () => {
    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      headers: {},
    });

    await syncHandler(req, res);

    expect(getStatusCode()).toBe(401);
    const json = getJson();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Missing authorization header/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('2. Invalid or expired token -> rejected (401 Unauthorized)', async () => {
    mockGetUserResult = { data: { user: null }, error: { message: 'Invalid JWT' } };

    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      headers: {
        authorization: 'Bearer expired-or-bogus-token',
      },
    });

    await syncHandler(req, res);

    expect(getStatusCode()).toBe(401);
    const json = getJson();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Invalid or expired authentication token/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('3. Normal RoomMate resident (STUDENT role) -> rejected (403 Forbidden)', async () => {
    mockGetUserResult = { data: { user: { id: 'usr-student-42' } }, error: null };
    mockProfileRole = 'STUDENT';

    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      headers: {
        authorization: 'Bearer valid-student-token',
      },
    });

    await syncHandler(req, res);

    expect(getStatusCode()).toBe(403);
    const json = getJson();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/SuperAdmin platform authorization required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('4. Authenticated SuperAdmin -> accepted (200 OK) with live monitor sync', async () => {
    mockGetUserResult = { data: { user: { id: 'usr-admin-1' } }, error: null };
    mockProfileRole = 'SUPER_ADMIN';

    const { res, getStatusCode, getJson } = createMockRes();
    const req = createMockReq({
      headers: {
        authorization: 'Bearer valid-superadmin-token',
      },
    });

    await syncHandler(req, res);

    expect(getStatusCode()).toBe(200);
    const json = getJson();
    expect(json.success).toBe(true);
    expect(json.monitorsChecked).toBe(2);
    expect(json.downCount).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('5. Response payload strictly never exposes UptimeRobot API key', async () => {
    const { res, getBody } = createMockRes();
    const req = createMockReq({
      headers: {
        authorization: 'Bearer valid-superadmin-token',
      },
    });

    await syncHandler(req, res);

    const bodyText = getBody();
    expect(bodyText).not.toContain(MOCK_API_KEY);
    expect(bodyText).not.toContain('api_key');
    expect(bodyText).not.toContain('UPTIMEROBOT_API_KEY');
  });

  it('6. API error returns sanitized message without leaking credentials', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Sensitive network timeout to https://api.uptimerobot.com?api_key=SECRET'));

    const { res, getStatusCode, getJson, getBody } = createMockRes();
    const req = createMockReq({
      headers: {
        authorization: 'Bearer valid-superadmin-token',
      },
    });

    await syncHandler(req, res);

    expect(getStatusCode()).toBe(500);
    const json = getJson();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Internal server error during UptimeRobot synchronization');
    expect(getBody()).not.toContain('SECRET');
  });
});
