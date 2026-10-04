import { describe, it, expect, beforeEach } from 'vitest';
import { isGoogleDefaultAvatar, isGoogleDefaultAvatarSync } from './avatarUtils';

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

describe('avatarUtils Test Suite', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
    globalThis.localStorage.clear();
  });

  it('returns false for non-Google URLs and empty values', async () => {
    expect(await isGoogleDefaultAvatar(null)).toBe(false);
    expect(await isGoogleDefaultAvatar(undefined)).toBe(false);
    expect(await isGoogleDefaultAvatar('')).toBe(false);
    expect(await isGoogleDefaultAvatar('https://example.com/photo.png')).toBe(false);
    expect(await isGoogleDefaultAvatar('https://res.cloudinary.com/avatar.jpg')).toBe(false);
  });

  it('detects known static Google default patterns', async () => {
    expect(await isGoogleDefaultAvatar('https://lh3.googleusercontent.com/a/default-user=s96-c')).toBe(true);
    expect(await isGoogleDefaultAvatar('https://lh3.googleusercontent.com/default_avatar/photo.jpg')).toBe(true);
  });

  it('returns cached result synchronously when available', async () => {
    const testUrl = 'https://lh3.googleusercontent.com/a/test-sync-avatar';
    localStorage.setItem(`roommate_is_default_avatar_${testUrl}`, 'true');

    expect(isGoogleDefaultAvatarSync(testUrl)).toBe(true);
    expect(await isGoogleDefaultAvatar(testUrl)).toBe(true);

    const nonDefaultUrl = 'https://lh3.googleusercontent.com/a/test-non-default';
    localStorage.setItem(`roommate_is_default_avatar_${nonDefaultUrl}`, 'false');
    expect(isGoogleDefaultAvatarSync(nonDefaultUrl)).toBe(false);
    expect(await isGoogleDefaultAvatar(nonDefaultUrl)).toBe(false);
  });
});
