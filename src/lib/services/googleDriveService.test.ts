import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  getStoredGoogleDriveAccounts,
  storeGoogleDriveAccount,
  removeGoogleDriveAccount,
  getLastUsedGoogleDriveAccount,
  requestGoogleDriveAuthorization,
  uploadBackupToGoogleDrive,
  setGoogleDriveMockAuthForTesting,
  GoogleDriveAccount,
} from './googleDriveService';
import { EncryptedBackupEnvelope } from '../storage/backupCryptoService';

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

describe('Google Drive Backup Service Test Suite (Problem 4)', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    setGoogleDriveMockAuthForTesting(true);
    vi.restoreAllMocks();
  });

  describe('1. Account Storage & Switching Management', () => {
    it('returns empty list when no Google accounts have been stored', () => {
      const accounts = getStoredGoogleDriveAccounts();
      expect(accounts).toEqual([]);
      expect(getLastUsedGoogleDriveAccount()).toBeNull();
    });

    it('stores and updates multiple Google accounts independently from app login', () => {
      const account1: GoogleDriveAccount = {
        email: 'student.backup@gmail.com',
        name: 'Student Personal',
        picture: 'https://lh3.googleusercontent.com/a/1',
        lastUsed: new Date().toISOString(),
      };
      const account2: GoogleDriveAccount = {
        email: 'roommate.vault@gmail.com',
        name: 'RoomMate Shared Drive',
        picture: 'https://lh3.googleusercontent.com/a/2',
        lastUsed: new Date().toISOString(),
      };

      storeGoogleDriveAccount(account1);
      storeGoogleDriveAccount(account2);

      const accounts = getStoredGoogleDriveAccounts();
      expect(accounts.length).toBe(2);
      expect(accounts.some((a) => a.email === account1.email)).toBe(true);
      expect(accounts.some((a) => a.email === account2.email)).toBe(true);

      // Last stored account should be the last used
      const lastUsed = getLastUsedGoogleDriveAccount();
      expect(lastUsed?.email).toBe(account2.email);
    });

    it('removes a Google account cleanly from stored list', () => {
      const account: GoogleDriveAccount = {
        email: 'to-remove@gmail.com',
        name: 'Old Account',
        lastUsed: new Date().toISOString(),
      };
      storeGoogleDriveAccount(account);
      expect(getStoredGoogleDriveAccounts().length).toBe(1);

      removeGoogleDriveAccount(account.email);
      expect(getStoredGoogleDriveAccounts().length).toBe(0);
      expect(getLastUsedGoogleDriveAccount()).toBeNull();
    });
  });

  describe('2. Authorization Flow with Account Selection', () => {
    it('requests authorization and stores hint account in test mode', async () => {
      const chosenEmail = 'chosen.personal@gmail.com';
      const result = await requestGoogleDriveAuthorization(chosenEmail);

      expect(result.success).toBe(true);
      expect(result.account?.email).toBe(chosenEmail);
      expect(result.token).toBeDefined();

      // Ensure it was cached in stored accounts
      const stored = getStoredGoogleDriveAccounts();
      expect(stored.some((a) => a.email === chosenEmail)).toBe(true);
    });
  });

  describe('3. Multipart Google Drive API v3 Upload', () => {
    it('constructs correct multipart request and parses file response', async () => {
      const mockEnvelope: EncryptedBackupEnvelope = {
        app: 'RoomMate',
        version: 1,
        format: 'AES-GCM-256-PBKDF2',
        exportedAt: new Date().toISOString(),
        saltHex: 'aabbcc',
        ivHex: 'ddeeff',
        ciphertextHex: 'mock_encrypted_ciphertext_data',
        summary: {
          userName: 'Test User',
          itemCount: 5,
        },
      };

      // Mock fetch for Google Drive upload API
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'gdrive-file-id-12345',
          name: 'roommate-backup-test.json',
          webViewLink: 'https://drive.google.com/file/d/gdrive-file-id-12345/view',
        }),
      });
      globalThis.fetch = fakeFetch as any;

      const uploadResult = await uploadBackupToGoogleDrive(
        'mock_bearer_token',
        mockEnvelope,
        'roommate-backup-test.json'
      );

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.fileId).toBe('gdrive-file-id-12345');
      expect(uploadResult.fileName).toBe('roommate-backup-test.json');

      // Verify the fetch call arguments
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      const [url, options] = fakeFetch.mock.calls[0];
      expect(url).toContain('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer mock_bearer_token');
      expect(options.headers['Content-Type']).toContain('multipart/related');
      expect(options.body).toContain('roommate-backup-test.json');
      expect(options.body).toContain('mock_encrypted_ciphertext_data');
    });

    it('handles Google Drive API errors gracefully without throwing unhandled exceptions', async () => {
      const mockEnvelope: EncryptedBackupEnvelope = {
        app: 'RoomMate',
        version: 1,
        format: 'AES-GCM-256-PBKDF2',
        exportedAt: new Date().toISOString(),
        saltHex: 'aabbcc',
        ivHex: 'ddeeff',
        ciphertextHex: 'data',
        summary: {
          userName: 'Test User',
          itemCount: 1,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'The user has not granted write access to drive.file',
          },
        }),
      }) as any;

      const result = await uploadBackupToGoogleDrive('token', mockEnvelope, 'test.json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('drive.file');
    });
  });
});
