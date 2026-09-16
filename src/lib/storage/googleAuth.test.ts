import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  signInWithGoogleOAuth,
  syncOAuthSessionToProfile,
  redeemOAuthUrlOrHash,
  parseOAuthTokensFromUrl,
} from './cloudStorageAdapter';
import { db } from './mockStorage';

// Polyfill localStorage in test environment
const mockStorageMap: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorageMap[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorageMap[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorageMap[key];
  },
  clear: () => {
    Object.keys(mockStorageMap).forEach((k) => delete mockStorageMap[k]);
  },
};

describe('Google OAuth & Session Synchronization Test Suite', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        localStorage: mockLocalStorage,
        location: { origin: 'http://localhost:5173' },
      };
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('attempts signInWithGoogleOAuth and handles unconfigured provider or offline state gracefully', async () => {
    const result = await signInWithGoogleOAuth();
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('syncs a new Google OAuth session user and flags needsPinSetup = true when no PIN is stored', async () => {
    const fakeOAuthUser = {
      id: 'usr-google-test-123',
      email: 'test.student@gmail.com',
      user_metadata: {
        full_name: 'Test Student',
        avatar_url: 'https://lh3.googleusercontent.com/a/test-avatar',
      },
    };

    const syncResult = await syncOAuthSessionToProfile(fakeOAuthUser);

    expect(syncResult.user).toBeDefined();
    expect(syncResult.user.id).toBe(fakeOAuthUser.id);
    expect(syncResult.user.name).toBe('Test');
    expect(syncResult.extractedFirstName).toBe('Test');
    expect(syncResult.needsProfileOnboarding).toBe(true);
    expect(syncResult.user.email).toBe('test.student@gmail.com');
    expect(syncResult.user.avatarUrl).toBe('https://lh3.googleusercontent.com/a/test-avatar');
    // Because no custom PIN was set in localStorage, it must prompt for PIN setup
    expect(syncResult.needsPinSetup).toBe(true);

    // Verify it was added to local db
    const inDb = db.getState().users.find((u) => u.id === fakeOAuthUser.id);
    expect(inDb).toBeDefined();
    expect(inDb?.name).toBe('Test');
  });

  it('recognizes existing user with configured PIN and flags needsPinSetup = false', async () => {
    const userId = 'usr-google-returning-456';
    // Configure a PIN for this user
    globalThis.localStorage.setItem(`roommate_vault_pin_${userId}`, '5678');
    globalThis.localStorage.setItem('roommate_vault_pin', '5678');

    const fakeOAuthUser = {
      id: userId,
      email: 'returning.roommate@gmail.com',
      user_metadata: {
        given_name: 'Returning',
        family_name: 'Resident',
      },
    };

    const syncResult = await syncOAuthSessionToProfile(fakeOAuthUser);
    expect(syncResult.user.id).toBe(userId);
    expect(syncResult.needsPinSetup).toBe(false);
  });

  it('extracts username from email if full_name is absent in user_metadata', async () => {
    const fakeOAuthUser = {
      id: 'usr-google-no-name-789',
      email: 'akash.patel@gmail.com',
      user_metadata: {},
    };

    const syncResult = await syncOAuthSessionToProfile(fakeOAuthUser);
    expect(syncResult.user.name).toBe('Akash');
    expect(syncResult.extractedFirstName).toBe('Akash');
    expect(syncResult.user.email).toBe('akash.patel@gmail.com');
  });

  describe('OAuth Redirect URL & Hash Parser', () => {
    it('returns error on empty or invalid input in redeemOAuthUrlOrHash', async () => {
      const res = await redeemOAuthUrlOrHash('');
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('extracts access_token and refresh_token from full localhost redirect URL', () => {
      const testUrl = 'https://localhost/#access_token=test_access_jwt&refresh_token=test_refresh_jwt&token_type=bearer';
      const parsed = parseOAuthTokensFromUrl(testUrl);
      expect(parsed.accessToken).toBe('test_access_jwt');
      expect(parsed.refreshToken).toBe('test_refresh_jwt');
    });

    it('extracts authorization code from search params', () => {
      const testUrl = 'roommate://auth-callback?code=supabase-auth-code-123';
      const parsed = parseOAuthTokensFromUrl(testUrl);
      expect(parsed.code).toBe('supabase-auth-code-123');
    });

    it('handles raw token strings without full URL', () => {
      const raw = 'access_token=direct_jwt&refresh_token=direct_refresh';
      const parsed = parseOAuthTokensFromUrl(raw);
      expect(parsed.accessToken).toBe('direct_jwt');
      expect(parsed.refreshToken).toBe('direct_refresh');
    });
  });
});
