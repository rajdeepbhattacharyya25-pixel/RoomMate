import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  extractGoogleFirstName,
  validateAndFormatPhoneNumber,
  updateProfilePhone,
  completeProfileOnboarding,
  syncOAuthSessionToProfile,
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

describe('First-Login Profile Setup & Google Onboarding Test Suite', () => {
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

  describe('1. Google First Name Extraction', () => {
    it('prefers dedicated given_name field over full name', () => {
      const metadata = {
        given_name: 'Rajdeep',
        family_name: 'Bhattacharya',
        full_name: 'Rajdeep Bhattacharya',
        name: 'Rajdeep Bhattacharya',
      };
      expect(extractGoogleFirstName(metadata, 'rajdeep@gmail.com')).toBe('Rajdeep');
    });

    it('prefers first_name field when given_name is not present', () => {
      const metadata = {
        first_name: 'Sneha',
        name: 'Sneha Roy',
      };
      expect(extractGoogleFirstName(metadata, 'sneha@gmail.com')).toBe('Sneha');
    });

    it('extracts first token when only full_name or name is provided', () => {
      expect(extractGoogleFirstName({ full_name: 'Amitabh Kumar Patel' })).toBe('Amitabh');
      expect(extractGoogleFirstName({ name: 'Pooja Hegde' })).toBe('Pooja');
    });

    it('falls back to capitalized email prefix if name metadata is absent', () => {
      expect(extractGoogleFirstName({}, 'vikram.aditya@college.edu')).toBe('Vikram');
      expect(extractGoogleFirstName(undefined, 'rohit@roommate.app')).toBe('Rohit');
    });
  });

  describe('2. Phone Number Validation & Formatting', () => {
    it('normalizes standard 10-digit Indian phone numbers to canonical +91 format', () => {
      const res = validateAndFormatPhoneNumber('9876543210');
      expect(res.isValid).toBe(true);
      expect(res.formatted).toBe('+91 98765 43210');
      expect(res.digitsOnly).toBe('9876543210');
    });

    it('handles phone numbers entered with +91 or 91 country code prefix', () => {
      const res1 = validateAndFormatPhoneNumber('+91 98765 43210');
      expect(res1.isValid).toBe(true);
      expect(res1.formatted).toBe('+91 98765 43210');

      const res2 = validateAndFormatPhoneNumber('919876543210');
      expect(res2.isValid).toBe(true);
      expect(res2.formatted).toBe('+91 98765 43210');
    });

    it('handles phone numbers with dashes and extra whitespace', () => {
      const res = validateAndFormatPhoneNumber('  +91-98765-12345  ');
      expect(res.isValid).toBe(true);
      expect(res.formatted).toBe('+91 98765 12345');
    });

    it('rejects numbers that have fewer than 10 digits', () => {
      const res = validateAndFormatPhoneNumber('98765');
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('rejects numbers with invalid mobile prefixes', () => {
      const res = validateAndFormatPhoneNumber('1234567890');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('starting with 6, 7, 8, or 9');
    });

    it('rejects empty or whitespace-only input', () => {
      const res = validateAndFormatPhoneNumber('   ');
      expect(res.isValid).toBe(false);
    });
  });

  describe('3. Profile Onboarding Backend Persistence', () => {
    it('completes onboarding by saving confirmed name, phone, and setting onboardingCompleted = true', async () => {
      const testUserId = 'usr-onboard-test-1';
      // Seed user in local db
      db.upsertUser({
        id: testUserId,
        email: 'newbie@roommate.app',
        name: 'Temporary',
        role: 'STUDENT',
        isSuspended: false,
        onboardingCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await completeProfileOnboarding(testUserId, {
        name: 'Rajdeep',
        phone: '98765 43210',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.name).toBe('Rajdeep');
      expect(result.user?.phone).toBe('+91 98765 43210');
      expect(result.user?.onboardingCompleted).toBe(true);

      // Verify updated in database state
      const dbUser = db.getState().users.find((u) => u.id === testUserId);
      expect(dbUser?.name).toBe('Rajdeep');
      expect(dbUser?.phone).toBe('+91 98765 43210');
      expect(dbUser?.onboardingCompleted).toBe(true);
    });

    it('rejects onboarding completion if name is empty or less than 2 characters', async () => {
      const res = await completeProfileOnboarding('usr-test', {
        name: 'A',
        phone: '9876543210',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('at least 2 characters');
    });

    it('rejects onboarding completion if phone number is invalid', async () => {
      const res = await completeProfileOnboarding('usr-test', {
        name: 'Rajdeep',
        phone: '12345',
      });
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('4. Settings -> Account Phone Update', () => {
    it('updates phone number independently from Settings -> Account and preserves existing user name', async () => {
      const testUserId = 'usr-settings-phone-1';
      db.upsertUser({
        id: testUserId,
        email: 'resident@roommate.app',
        name: 'Existing Resident',
        phone: '+91 98765 11111',
        role: 'STUDENT',
        isSuspended: false,
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await updateProfilePhone(testUserId, '98765 99999');
      expect(result.success).toBe(true);
      expect(result.formattedPhone).toBe('+91 98765 99999');

      const updated = db.getState().users.find((u) => u.id === testUserId);
      expect(updated?.phone).toBe('+91 98765 99999');
      expect(updated?.name).toBe('Existing Resident');
    });
  });

  describe('5. OAuth Session Sync & Existing User Protection', () => {
    it('flags needsProfileOnboarding = true for new Google user with extracted first name', async () => {
      const newOAuthUser = {
        id: 'usr-new-google-999',
        email: 'fresh.student@gmail.com',
        user_metadata: {
          given_name: 'Rajdeep',
          family_name: 'Bhattacharya',
          full_name: 'Rajdeep Bhattacharya',
        },
      };

      const syncResult = await syncOAuthSessionToProfile(newOAuthUser);
      expect(syncResult.extractedFirstName).toBe('Rajdeep');
      expect(syncResult.user.name).toBe('Rajdeep');
      expect(syncResult.needsProfileOnboarding).toBe(true);
    });

    it('does NOT overwrite an existing manually entered name with Google full name', async () => {
      const existingUserId = 'usr-custom-name-555';
      // User has manually configured their name as 'Raj' in their profile
      db.upsertUser({
        id: existingUserId,
        email: 'raj@gmail.com',
        name: 'Raj',
        phone: '+91 98765 43210',
        role: 'STUDENT',
        isSuspended: false,
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Google OAuth returns 'Rajdeep Bhattacharya'
      const returningUser = {
        id: existingUserId,
        email: 'raj@gmail.com',
        user_metadata: {
          full_name: 'Rajdeep Bhattacharya',
        },
      };

      const syncResult = await syncOAuthSessionToProfile(returningUser);
      // The existing custom name must remain 'Raj'
      const inDb = db.getState().users.find((u) => u.id === existingUserId);
      expect(inDb?.name).toBe('Raj');
      expect(syncResult.user.name).toBe('Raj');
      expect(syncResult.needsProfileOnboarding).toBe(false);
    });
  });
});
