import posthog from 'posthog-js';
import { Capacitor } from '@capacitor/core';
import { BUILD_INFO } from '../../config/buildInfo';

// Prohibited keywords in analytics property keys to guarantee zero financial or credential leakage
const FORBIDDEN_PROPERTY_KEYWORDS = [
  'amount',
  'totalamount',
  'total_amount',
  'balance',
  'debt',
  'upi',
  'upiid',
  'upi_id',
  'qr',
  'pin',
  'pincode',
  'password',
  'passwd',
  'passcode',
  'secret',
  'token',
  'jwt',
  'note',
  'usernotes',
  'description',
  'title',
  'credential',
  'phone',
  'phonenumber',
  'email',
  'vpa',
];

// Sensitive value patterns that must be redacted even if placed under benign keys
const SENSITIVE_VALUE_REGEXES = [
  /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/, // Email address or UPI VPA (e.g. user@okaxis)
  /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/, // Indian phone number
  /eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/, // JWT token
  /Bearer\s+[A-Za-z0-9-_=.]+/i, // Bearer auth token
];

/**
 * Sanitizes an analytics payload to prevent financial PII from being logged.
 */
export function sanitizeProperties(properties?: Record<string, unknown>): Record<string, unknown> {
  if (!properties) return {};

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const lowerKey = key.toLowerCase();
    const isForbidden = FORBIDDEN_PROPERTY_KEYWORDS.some((kw) => lowerKey.includes(kw));

    if (isForbidden) {
      console.warn(`[Analytics Guard] Scrubbed forbidden property "${key}" from analytics payload.`);
      continue;
    }

    if (typeof value === 'string') {
      const hasSensitivePattern = SENSITIVE_VALUE_REGEXES.some((regex) => regex.test(value));
      clean[key] = hasSensitivePattern ? '[REDACTED]' : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeProperties(value as Record<string, unknown>);
    } else {
      clean[key] = String(value);
    }
  }

  return clean;
}

class PostHogAnalyticsService {
  private isInitialized = false;

  // Deduplication cache to prevent duplicate events from React re-renders or rapid remounts
  private recentEvents = new Map<string, number>();
  private lastScreenName: string | null = null;
  private lastScreenTime = 0;
  private readonly DEDUPE_WINDOW_MS = 300;
  private readonly SCREEN_DEDUPE_WINDOW_MS = 500;

  public init(): void {
    if (this.isInitialized) return;

    const apiKey = import.meta.env.VITE_POSTHOG_KEY;
    const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!apiKey || apiKey === 'your-posthog-api-key') {
      console.log('[PostHog] PostHog API key not configured. Analytics running in fallback/mock mode.');
      return;
    }

    try {
      posthog.init(apiKey, {
        api_host: apiHost,
        autocapture: false, // Strict: Do not scrape DOM/UI elements automatically
        capture_pageview: false, // Manual SPA screen tracking
        capture_pageleave: false,
        disable_session_recording: true, // Disabled to protect student privacy and financial screens
        mask_all_text: true, // Safeguard: mask all text
        mask_all_element_attributes: true, // Safeguard: mask all attributes
        persistence: 'localStorage',
        loaded: (ph) => {
          // Register non-sensitive global super properties
          ph.register({
            app_name: 'RoomMate',
            app_version: BUILD_INFO.version || '1.0.4',
            app_channel: BUILD_INFO.channel || 'staging',
            platform: Capacitor.getPlatform(),
          });
          console.log('[PostHog] Initialized privacy-compliant analytics.');
        },
      });

      this.isInitialized = true;
    } catch (err) {
      console.warn('[PostHog] Initialization error:', err);
    }
  }

  public identify(userId: string, traits?: { role?: string; is_verified?: boolean }): void {
    if (!this.isInitialized) return;
    try {
      // Validate that userId is not an email or phone number
      if (userId.includes('@') || /^\+?\d{10,13}$/.test(userId.trim())) {
        console.warn('[Analytics Guard] Refused to identify with PII identifier. Use internal UUID only.');
        return;
      }
      posthog.identify(userId, sanitizeProperties(traits));
    } catch (err) {
      console.warn('[PostHog] identify error:', err);
    }
  }

  public reset(): void {
    if (!this.isInitialized) return;
    try {
      this.recentEvents.clear();
      this.lastScreenName = null;
      posthog.reset();
    } catch (err) {
      console.warn('[PostHog] reset error:', err);
    }
  }

  public trackScreen(screenName: string): void {
    if (!this.isInitialized) return;
    const now = Date.now();
    if (this.lastScreenName === screenName && now - this.lastScreenTime < this.SCREEN_DEDUPE_WINDOW_MS) {
      // Suppress duplicate screen events from rapid re-renders
      return;
    }

    this.lastScreenName = screenName;
    this.lastScreenTime = now;

    try {
      posthog.capture('$screen', { screen_name: screenName });
    } catch (err) {
      console.warn('[PostHog] trackScreen error:', err);
    }
  }

  public trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.isInitialized) return;

    const sanitized = sanitizeProperties(properties);
    const now = Date.now();
    const eventFingerprint = `${eventName}:${JSON.stringify(sanitized)}`;

    // Deduplication check
    const lastTimestamp = this.recentEvents.get(eventFingerprint);
    if (lastTimestamp && now - lastTimestamp < this.DEDUPE_WINDOW_MS) {
      return;
    }

    this.recentEvents.set(eventFingerprint, now);
    if (this.recentEvents.size > 100) {
      // Prune old fingerprints
      for (const [key, ts] of this.recentEvents.entries()) {
        if (now - ts > this.DEDUPE_WINDOW_MS * 4) {
          this.recentEvents.delete(key);
        }
      }
    }

    try {
      posthog.capture(eventName, sanitized);
    } catch (err) {
      console.warn(`[PostHog] trackEvent (${eventName}) error:`, err);
    }
  }

  // ==========================================
  // 1. AUTH TAXONOMY
  // ==========================================
  public trackSignupStarted(method: 'email' | 'google' = 'email'): void {
    this.trackEvent('signup_started', { auth_method: method });
  }

  public trackSignupCompleted(method: 'email' | 'google' = 'email'): void {
    this.trackEvent('signup_completed', { auth_method: method });
  }

  public trackLoginCompleted(method: 'email' | 'google' | 'pin' = 'email'): void {
    this.trackEvent('login_completed', { auth_method: method });
  }

  public trackLogoutCompleted(): void {
    this.trackEvent('logout_completed');
  }

  // ==========================================
  // 2. ONBOARDING TAXONOMY
  // ==========================================
  public trackOnboardingStarted(): void {
    this.trackEvent('onboarding_started');
  }

  public trackOnboardingCompleted(): void {
    this.trackEvent('onboarding_completed');
  }

  public trackProfileSetupCompleted(): void {
    this.trackEvent('profile_setup_completed');
  }

  // ==========================================
  // 3. ROOM TAXONOMY
  // ==========================================
  public trackRoomCreationStarted(): void {
    this.trackEvent('room_creation_started');
  }

  public trackRoomCreated(params: { initialMembers: number }): void {
    this.trackEvent('room_created', { initial_member_count: params.initialMembers });
  }

  public trackRoomJoinStarted(): void {
    this.trackEvent('room_join_started');
  }

  public trackRoomJoined(params: { joinMethod: 'code' | 'deep_link' | 'qr' }): void {
    this.trackEvent('room_joined', { join_method: params.joinMethod });
  }

  public trackRoomInvitationSent(): void {
    this.trackEvent('room_invitation_sent');
  }

  // ==========================================
  // 4. EXPENSE TAXONOMY
  // ==========================================
  public trackPersonalExpenseCreated(params: { category: string }): void {
    this.trackEvent('personal_expense_created', {
      category: params.category,
      expense_type: 'personal',
    });
  }

  public trackSharedExpenseCreated(params: {
    category: string;
    splitType: string;
    participantCount?: number;
  }): void {
    this.trackEvent('shared_expense_created', {
      category: params.category,
      split_type: params.splitType,
      participant_count: params.participantCount || 2,
      expense_type: 'shared',
    });
  }

  public trackExpenseUpdated(params: { isShared: boolean; category?: string }): void {
    this.trackEvent('expense_updated', {
      is_shared: params.isShared,
      category: params.category || 'unknown',
    });
  }

  public trackExpenseDeleted(params: { isShared: boolean }): void {
    this.trackEvent('expense_deleted', { is_shared: params.isShared });
  }

  // Backward compatibility alias
  public trackExpenseAdded(params: {
    category: string;
    splitType: string;
    currency?: string;
    isShared: boolean;
  }): void {
    if (params.isShared) {
      this.trackSharedExpenseCreated({
        category: params.category,
        splitType: params.splitType,
      });
    } else {
      this.trackPersonalExpenseCreated({
        category: params.category,
      });
    }
  }

  // ==========================================
  // 5. SETTLEMENT TAXONOMY
  // ==========================================
  public trackSettlementStarted(): void {
    this.trackEvent('settlement_started');
  }

  public trackSettlementRecorded(params: { paymentMethod: string; isOffline?: boolean }): void {
    this.trackEvent('settlement_recorded', {
      payment_method: params.paymentMethod,
      is_offline: !!params.isOffline,
    });
  }

  public trackSettlementCompleted(params: { paymentMethod: string }): void {
    this.trackEvent('settlement_completed', {
      payment_method: params.paymentMethod,
    });
  }

  // ==========================================
  // 6. PAYMENT TAXONOMY
  // ==========================================
  public trackPaymentFlowStarted(params: { appTarget: string; isFallback: boolean }): void {
    this.trackEvent('payment_flow_started', {
      app_target: params.appTarget,
      is_fallback: params.isFallback,
    });
  }

  public trackPaymentFlowCompleted(params?: { appTarget?: string }): void {
    this.trackEvent('payment_flow_completed', {
      app_target: params?.appTarget || 'generic',
    });
  }

  public trackPaymentFlowFailed(params?: { reason?: string }): void {
    this.trackEvent('payment_flow_failed', {
      reason: params?.reason || 'unspecified',
    });
  }

  // ==========================================
  // 7. SETTINGS TAXONOMY
  // ==========================================
  public trackProfileUpdated(): void {
    this.trackEvent('profile_updated');
  }

  public trackNotificationSettingsChanged(params: { enabled: boolean; soundEnabled?: boolean }): void {
    this.trackEvent('notification_settings_changed', {
      push_enabled: params.enabled,
      sound_enabled: params.soundEnabled ?? true,
    });
  }

  // ==========================================
  // 8. OFFLINE SYNC TAXONOMY
  // ==========================================
  public trackOfflineSync(mutationCount: number): void {
    this.trackEvent('offline_sync_completed', { mutation_count: mutationCount });
  }
}

export const analytics = new PostHogAnalyticsService();
