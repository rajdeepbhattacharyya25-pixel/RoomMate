import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_USE_LIVE_SUPABASE', 'true');

vi.mock('../supabase/client', () => {
  const mockChannels: Record<string, any> = {};
  return {
    isSupabaseConfigured: true,
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
      channel: vi.fn((name: string) => {
        const channelObj = {
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn().mockReturnValue({
            unsubscribe: vi.fn().mockResolvedValue(true),
          }),
        };
        mockChannels[name] = channelObj;
        return channelObj;
      }),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    },
  };
});

import {
  requestJoinRoomCloud,
  checkJoinRequestStatusCloud,
  subscribeToAdminRoomsRealtime,
} from './cloudStorageAdapter';
import { supabase } from '../supabase/client';

describe('Realtime Join Request & Multi-Device Sync Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. subscribeToAdminRoomsRealtime', () => {
    it('creates a combined channel for monitored admin rooms and returns an unsubscribe function', () => {
      const roomIds = ['room-alpha', 'room-beta'];
      const onRemoteChange = vi.fn();

      const unsubscribe = subscribeToAdminRoomsRealtime(roomIds, onRemoteChange);
      expect(typeof unsubscribe).toBe('function');
      expect(supabase.channel).toHaveBeenCalledWith(
        expect.stringContaining('admin-room-')
      );

      unsubscribe();
      expect(supabase.removeChannel).toHaveBeenCalled();
    });

    it('returns a no-op cleanup when roomIds array is empty', () => {
      const unsubscribe = subscribeToAdminRoomsRealtime([], vi.fn());
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(supabase.removeChannel).not.toHaveBeenCalled();
    });
  });

  describe('2. requestJoinRoomCloud Request ID extraction', () => {
    it('captures request_id from RPC response and returns it to caller', async () => {
      const mockRpcResponse = {
        data: {
          status: 'PENDING',
          room_id: 'room-101',
          room_name: 'Campus Suite 101',
          request_id: 'a0000000-0000-0000-0000-000000000001',
        },
        error: null,
      };

      (supabase.rpc as any).mockResolvedValueOnce(mockRpcResponse);
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'room-101',
                name: 'Campus Suite 101',
                created_by: 'admin-user-1',
                is_archived: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const res = await requestJoinRoomCloud('user-roommate-9', 'FLAT01');
      expect(res.status).toBe('PENDING');
      expect(res.requestId).toBe('a0000000-0000-0000-0000-000000000001');
      expect(res.room.id).toBe('room-101');
    });
  });

  describe('3. checkJoinRequestStatusCloud dual-layer fallback', () => {
    it('resolves approved status directly by UUID', async () => {
      const validUuid = 'a1234567-89ab-cdef-0123-456789abcdef';
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: validUuid,
                room_id: 'room-202',
                user_id: 'user-roommate-9',
                status: 'APPROVED',
              },
              error: null,
            }),
          };
        }
        if (table === 'rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'room-202',
                name: 'Room 202',
                created_by: 'admin-1',
                is_archived: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const res = await checkJoinRequestStatusCloud(validUuid);
      expect(res.status).toBe('APPROVED');
      expect(res.room?.id).toBe('room-202');
    });

    it('falls back to (roomId, userId) query when requestId is a temporary client string', async () => {
      const tempRequestId = 'req-temporary-client-id';
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'real-db-uuid-303',
                room_id: 'room-303',
                user_id: 'user-roommate-3',
                status: 'APPROVED',
              },
              error: null,
            }),
          };
        }
        if (table === 'rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'room-303',
                name: 'Room 303',
                created_by: 'admin-3',
                is_archived: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const res = await checkJoinRequestStatusCloud(tempRequestId, {
        roomId: 'room-303',
        userId: 'user-roommate-3',
      });

      expect(res.status).toBe('APPROVED');
      expect(res.room?.id).toBe('room-303');
    });

    it('detects active membership in room_members as approved even if request table lookup is empty', async () => {
      const tempRequestId = 'req-temp-unknown';
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'room_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { room_id: 'room-404', status: 'ACTIVE' },
              error: null,
            }),
          };
        }
        if (table === 'rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'room-404',
                name: 'Room 404',
                created_by: 'admin-4',
                is_archived: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const res = await checkJoinRequestStatusCloud(tempRequestId, {
        roomId: 'room-404',
        userId: 'user-roommate-4',
      });

      expect(res.status).toBe('APPROVED');
      expect(res.room?.id).toBe('room-404');
    });
  });
});
