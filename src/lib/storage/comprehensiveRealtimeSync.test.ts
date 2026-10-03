import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_USE_LIVE_SUPABASE', 'true');

const registeredHandlers: Record<string, Function[]> = {};

vi.mock('../supabase/client', () => {
  return {
    isSupabaseConfigured: true,
    supabase: {
      channel: vi.fn((chName: string) => {
        registeredHandlers[chName] = [];
        const ch = {
          on: vi.fn((_type: string, config: any, callback: Function) => {
            registeredHandlers[chName].push({
              table: config.table,
              filter: config.filter,
              event: config.event,
              callback,
            } as any);
            return ch;
          }),
          subscribe: vi.fn().mockReturnValue({
            unsubscribe: vi.fn().mockResolvedValue(true),
          }),
        };
        return ch;
      }),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    },
  };
});

import {
  subscribeToRoomRealtime,
  subscribeToUserRealtime,
} from './cloudStorageAdapter';
import { supabase } from '../supabase/client';

describe('Comprehensive Live Synchronization Hardening Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredHandlers).forEach((k) => delete registeredHandlers[k]);
  });

  describe('1. subscribeToRoomRealtime Channel Coverage', () => {
    it('registers real-time listeners for all 8 core room tables including splits, invites, and profiles', () => {
      const roomId = 'room-omega-123';
      const onRemoteChange = vi.fn();

      const unsubscribe = subscribeToRoomRealtime(roomId, onRemoteChange);
      expect(typeof unsubscribe).toBe('function');

      const handlers = registeredHandlers[`room-${roomId}`] || [];
      const tablesList = handlers.map((h: any) => h.table);

      expect(tablesList).toContain('rooms');
      expect(tablesList).toContain('shared_expenses');
      expect(tablesList).toContain('settlement_payments');
      expect(tablesList).toContain('room_members');
      expect(tablesList).toContain('room_join_requests');
      expect(tablesList).toContain('expense_splits');
      expect(tablesList).toContain('room_invitations');
      expect(tablesList).toContain('profiles');

      // Test that an expense_splits event triggers onRemoteChange
      const splitHandler = handlers.find((h: any) => h.table === 'expense_splits');
      expect(splitHandler).toBeDefined();
      (splitHandler as any).callback({ eventType: 'INSERT', new: { id: 'split-1' } });
      expect(onRemoteChange).toHaveBeenCalledWith('expense_splits', 'INSERT', expect.anything());

      // Test that a room_invitations event triggers onRemoteChange
      const inviteHandler = handlers.find((h: any) => h.table === 'room_invitations');
      expect(inviteHandler).toBeDefined();
      (inviteHandler as any).callback({ eventType: 'UPDATE', new: { id: 'inv-1', invite_code: 'NEWCODE' } });
      expect(onRemoteChange).toHaveBeenCalledWith('room_invitations', 'UPDATE', expect.anything());

      // Test that a profiles event triggers onRemoteChange
      const profileHandler = handlers.find((h: any) => h.table === 'profiles');
      expect(profileHandler).toBeDefined();
      (profileHandler as any).callback({ eventType: 'UPDATE', new: { id: 'u1', upi_id: 'user@upi' } });
      expect(onRemoteChange).toHaveBeenCalledWith('profiles', 'UPDATE', expect.anything());

      unsubscribe();
      expect(supabase.removeChannel).toHaveBeenCalled();
    });
  });

  describe('2. subscribeToUserRealtime Personal Expenses & Member Sync', () => {
    it('registers personal_expenses alongside notifications, profiles, requests, and memberships', () => {
      const userId = 'usr-laptop-test';
      const onRemoteChange = vi.fn();

      const unsubscribe = subscribeToUserRealtime(userId, onRemoteChange);
      expect(typeof unsubscribe).toBe('function');

      const handlers = registeredHandlers[`user-${userId}`] || [];
      const tablesList = handlers.map((h: any) => h.table);

      expect(tablesList).toContain('in_app_notifications');
      expect(tablesList).toContain('profiles');
      expect(tablesList).toContain('room_join_requests');
      expect(tablesList).toContain('room_members');
      expect(tablesList).toContain('personal_expenses');

      // Test that a personal_expenses event triggers onRemoteChange
      const expHandler = handlers.find((h: any) => h.table === 'personal_expenses');
      expect(expHandler).toBeDefined();
      expect((expHandler as any).filter).toBe(`user_id=eq.${userId}`);
      (expHandler as any).callback({ eventType: 'INSERT', new: { id: 'pexp-1', amount: 450 } });
      expect(onRemoteChange).toHaveBeenCalledWith('personal_expenses', 'INSERT', expect.anything());

      unsubscribe();
      expect(supabase.removeChannel).toHaveBeenCalled();
    });
  });
});
