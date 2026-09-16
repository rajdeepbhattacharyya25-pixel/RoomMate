import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { User } from '../../types';
import { db } from './mockStorage';
import { saveUserBudget, getUserBudget } from './budgetService';
import {
  createEncryptedBackup,
  decryptBackup,
  EncryptedBackupEnvelope,
} from './backupCryptoService';
import { executeRestore, parseBackupFile } from './restoreService';
import { generateBackupFileName } from './shareBackupService';

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

describe('Encrypted Backup, Share & Restore Test Suite', () => {
  const testUser: User = {
    id: 'usr-backup-tester',
    name: 'Priya Sharma',
    email: 'priya@roommate.app',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        localStorage: mockLocalStorage,
      };
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    // Seed some test personal expenses
    const state = db.getState();
    state.personalExpenses = [
      {
        id: 'pe-test-1',
        userId: testUser.id,
        title: 'Organic Groceries',
        amount: 850,
        category: 'Food',
        expenseDate: '2026-09-10',
        createdAt: '2026-09-10T10:00:00.000Z',
        updatedAt: '2026-09-10T10:00:00.000Z',
      },
      {
        id: 'pe-test-2',
        userId: testUser.id,
        title: 'Metro Smart Card Recharge',
        amount: 500,
        category: 'Travel',
        expenseDate: '2026-09-12',
        createdAt: '2026-09-12T11:00:00.000Z',
        updatedAt: '2026-09-12T11:00:00.000Z',
      },
    ];
    db.saveState(state);

    saveUserBudget(testUser.id, {
      monthlyAllowance: 9500,
      categoryCaps: { Food: 4000, Travel: 1500 },
      updatedAt: new Date().toISOString(),
    });
  });

  it('creates a PIN-encrypted backup envelope adhering to RoomMate standards', async () => {
    const pin = '4821';
    const envelope = await createEncryptedBackup(testUser, pin);

    expect(envelope).toBeDefined();
    expect(envelope.app).toBe('RoomMate');
    expect(envelope.version).toBe(1);
    expect(envelope.format).toBe('AES-GCM-256-PBKDF2');
    expect(envelope.saltHex).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(envelope.ivHex).toHaveLength(24);   // 12 bytes = 24 hex chars
    expect(envelope.ciphertextHex.length).toBeGreaterThan(64);
    expect(envelope.summary.userName).toBe('Priya Sharma');
    expect(envelope.summary.itemCount).toBe(2);
  });

  it('successfully decrypts backup using the correct 4-digit PIN', async () => {
    const pin = '4821';
    const envelope = await createEncryptedBackup(testUser, pin);

    const decrypted = await decryptBackup(envelope, pin);
    expect(decrypted).toBeDefined();
    expect(decrypted.manifest.userId).toBe(testUser.id);
    expect(decrypted.manifest.userName).toBe('Priya Sharma');
    expect(decrypted.personalExpenses).toHaveLength(2);
    expect(decrypted.personalExpenses[0].title).toBe('Organic Groceries');
    expect(decrypted.budgetConfig.monthlyAllowance).toBe(9500);
  });

  it('rejects decryption when an incorrect 4-digit PIN is provided', async () => {
    const correctPin = '4821';
    const wrongPin = '9999';
    const envelope = await createEncryptedBackup(testUser, correctPin);

    await expect(decryptBackup(envelope, wrongPin)).rejects.toThrow(/INVALID_PIN/);
  });

  it('rejects invalid or corrupted envelopes', async () => {
    const invalidEnvelope = {
      app: 'MaliciousApp',
      version: 1,
      format: 'AES-GCM-256-PBKDF2',
      saltHex: 'abc',
      ivHex: '123',
      ciphertextHex: 'deadbeef',
      summary: { userName: 'Hacker', itemCount: 0 },
    } as unknown as EncryptedBackupEnvelope;

    await expect(decryptBackup(invalidEnvelope, '1234')).rejects.toThrow(/INVALID_FORMAT/);
  });

  it('restores personal expenses and budget safely without duplicating existing items', async () => {
    const pin = '4821';
    const envelope = await createEncryptedBackup(testUser, pin);

    // Simulate switching devices or wiping local storage
    const state = db.getState();
    state.personalExpenses = []; // Cleared
    db.saveState(state);

    const restoreResult = await executeRestore(envelope, pin, testUser);

    expect(restoreResult.restoredExpenses).toBe(2);
    expect(restoreResult.budgetRestored).toBe(true);

    const restoredExpenses = db.getState().personalExpenses.filter((e) => e.userId === testUser.id);
    expect(restoredExpenses).toHaveLength(2);

    const restoredBudget = getUserBudget(testUser.id);
    expect(restoredBudget.monthlyAllowance).toBe(9500);

    // Running restore again should skip duplicate expense IDs
    const secondRestore = await executeRestore(envelope, pin, testUser);
    expect(secondRestore.restoredExpenses).toBe(0);
    expect(db.getState().personalExpenses.filter((e) => e.userId === testUser.id)).toHaveLength(2);
  });

  it('parses valid backup file from browser File instance', async () => {
    const pin = '1234';
    const envelope = await createEncryptedBackup(testUser, pin);
    const jsonStr = JSON.stringify(envelope);

    const file = new File([jsonStr], 'test-backup.json', { type: 'application/json' });
    const parsed = await parseBackupFile(file);

    expect(parsed.app).toBe('RoomMate');
    expect(parsed.ciphertextHex).toBe(envelope.ciphertextHex);
  });

  it('generates a clean timestamped backup filename', () => {
    const filename = generateBackupFileName('Priya Sharma');
    expect(filename).toMatch(/^roommate-backup-priya-sharma-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
