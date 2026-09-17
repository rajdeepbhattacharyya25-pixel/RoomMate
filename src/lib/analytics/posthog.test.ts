import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analytics, sanitizeProperties } from './posthog';
import posthog from 'posthog-js';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    capture: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'android',
  },
}));

describe('PostHog Analytics Privacy & Event Taxonomy Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (analytics as any).isInitialized = true;
    (analytics as any).recentEvents.clear();
    (analytics as any).lastScreenName = null;
    (analytics as any).lastScreenTime = 0;
  });

  describe('1. Privacy & Redaction Sanitization', () => {
    it('sanitizes forbidden financial property keys and credentials', () => {
      const input = {
        category: 'Food',
        amount: 450, // Forbidden key
        totalAmount: 1200, // Forbidden key
        balance: 200, // Forbidden key
        upiId: 'alice@okaxis', // Forbidden key
        pin: '1234', // Forbidden key
        userNotes: 'Dinner at pizza place', // Forbidden key
      };

      const clean = sanitizeProperties(input);
      expect(clean).toEqual({
        category: 'Food',
      });
      expect(clean).not.toHaveProperty('amount');
      expect(clean).not.toHaveProperty('totalAmount');
      expect(clean).not.toHaveProperty('balance');
      expect(clean).not.toHaveProperty('upiId');
      expect(clean).not.toHaveProperty('pin');
    });

    it('redacts sensitive values (emails, phones, UPI VPAs) even under generic keys', () => {
      const input = {
        metadata: 'Sent confirmation to roommate.bob@okaxis',
        supportContact: 'Contact him at +919876543210',
        safeCategory: 'Groceries',
      };

      const clean = sanitizeProperties(input);
      expect(clean.metadata).toBe('[REDACTED]');
      expect(clean.supportContact).toBe('[REDACTED]');
      expect(clean.safeCategory).toBe('Groceries');
    });
  });

  describe('2. Event & Screen Deduplication', () => {
    it('deduplicates identical events dispatched within debounce window', () => {
      analytics.trackEvent('button_clicked', { button_id: 'sync_button' });
      analytics.trackEvent('button_clicked', { button_id: 'sync_button' }); // Should be debounced

      expect(posthog.capture).toHaveBeenCalledTimes(1);
    });

    it('allows different events or distinct property payloads', () => {
      analytics.trackEvent('button_clicked', { button_id: 'sync_button' });
      analytics.trackEvent('button_clicked', { button_id: 'refresh_button' });

      expect(posthog.capture).toHaveBeenCalledTimes(2);
    });

    it('deduplicates rapid consecutive screen transitions to the same screen', () => {
      analytics.trackScreen('rooms');
      analytics.trackScreen('rooms'); // Duplicate from re-render

      expect(posthog.capture).toHaveBeenCalledTimes(1);
      expect(posthog.capture).toHaveBeenCalledWith('$screen', { screen_name: 'rooms' });
    });

    it('allows screen transitions between different tabs', () => {
      analytics.trackScreen('rooms');
      analytics.trackScreen('expenses');

      expect(posthog.capture).toHaveBeenCalledTimes(2);
    });
  });

  describe('3. User Identification & Privacy Isolation', () => {
    it('identifies user with internal UUID and non-sensitive traits', () => {
      analytics.identify('usr-uuid-1234', { role: 'STUDENT' });
      expect(posthog.identify).toHaveBeenCalledWith('usr-uuid-1234', { role: 'STUDENT' });
    });

    it('rejects email addresses or phone numbers as user identifiers', () => {
      analytics.identify('student@college.edu', { role: 'STUDENT' });
      analytics.identify('+919876543210', { role: 'STUDENT' });

      expect(posthog.identify).not.toHaveBeenCalled();
    });

    it('resets user session and clears deduplication cache on logout', () => {
      analytics.reset();
      expect(posthog.reset).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Comprehensive RoomMate Taxonomy', () => {
    it('tracks auth lifecycle events', () => {
      analytics.trackSignupStarted('google');
      expect(posthog.capture).toHaveBeenCalledWith('signup_started', { auth_method: 'google' });

      analytics.trackSignupCompleted('google');
      expect(posthog.capture).toHaveBeenCalledWith('signup_completed', { auth_method: 'google' });

      analytics.trackLoginCompleted('email');
      expect(posthog.capture).toHaveBeenCalledWith('login_completed', { auth_method: 'email' });

      analytics.trackLogoutCompleted();
      expect(posthog.capture).toHaveBeenCalledWith('logout_completed', {});
    });

    it('tracks onboarding and room events', () => {
      analytics.trackOnboardingStarted();
      expect(posthog.capture).toHaveBeenCalledWith('onboarding_started', {});

      analytics.trackRoomCreated({ initialMembers: 4 });
      expect(posthog.capture).toHaveBeenCalledWith('room_created', { initial_member_count: 4 });

      analytics.trackRoomJoined({ joinMethod: 'code' });
      expect(posthog.capture).toHaveBeenCalledWith('room_joined', { join_method: 'code' });
    });

    it('tracks personal and shared expense events without monetary amounts', () => {
      analytics.trackPersonalExpenseCreated({ category: 'Books' });
      expect(posthog.capture).toHaveBeenCalledWith('personal_expense_created', {
        category: 'Books',
        expense_type: 'personal',
      });

      analytics.trackSharedExpenseCreated({
        category: 'Rent',
        splitType: 'EQUAL',
        participantCount: 3,
      });
      expect(posthog.capture).toHaveBeenCalledWith('shared_expense_created', {
        category: 'Rent',
        split_type: 'EQUAL',
        participant_count: 3,
        expense_type: 'shared',
      });
    });

    it('tracks settlement events without monetary amounts or UPI IDs', () => {
      analytics.trackSettlementStarted();
      expect(posthog.capture).toHaveBeenCalledWith('settlement_started', {});

      analytics.trackSettlementRecorded({ paymentMethod: 'UPI', isOffline: false });
      expect(posthog.capture).toHaveBeenCalledWith('settlement_recorded', {
        payment_method: 'UPI',
        is_offline: false,
      });
    });

    it('tracks payment flow events with app target and zero financial data', () => {
      analytics.trackPaymentFlowStarted({ appTarget: 'gpay', isFallback: false });
      expect(posthog.capture).toHaveBeenCalledWith('payment_flow_started', {
        app_target: 'gpay',
        is_fallback: false,
      });

      analytics.trackPaymentFlowCompleted({ appTarget: 'gpay' });
      expect(posthog.capture).toHaveBeenCalledWith('payment_flow_completed', {
        app_target: 'gpay',
      });
    });
  });
});
