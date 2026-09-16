import { PersonalExpense, User } from '../../types';
import { db } from './mockStorage';
import { getUserBudget, UserBudgetConfig } from './budgetService';
import { validateStrict4DigitPin } from '../auth/jwtService';

export interface BackupManifest {
  app: 'RoomMate';
  version: 1;
  exportedAt: string;
  userId: string;
  userName: string;
  userEmail: string;
  expenseCount: number;
  hasBudget: boolean;
}

export interface BackupDecryptedPayload {
  manifest: BackupManifest;
  personalExpenses: PersonalExpense[];
  budgetConfig: UserBudgetConfig;
  exportedAt: string;
}

export interface EncryptedBackupEnvelope {
  app: 'RoomMate';
  version: 1;
  format: 'AES-GCM-256-PBKDF2';
  exportedAt: string;
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
  summary: {
    userName: string;
    itemCount: number;
  };
}

// Hex conversion helpers
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a 4-digit PIN + random salt using PBKDF2 with 100,000 iterations.
 */
async function deriveAesKeyFromPin(pin: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const pinValidation = validateStrict4DigitPin(pin);
  if (!pinValidation.isValid) {
    throw new Error(pinValidation.error || 'A valid 4-digit PIN is required.');
  }

  const encoder = new TextEncoder();
  const rawPinBytes = encoder.encode(pinValidation.sanitized);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    rawPinBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Compiles a snapshot of the user's personal vault and encrypts it with their 4-digit PIN.
 */
export async function createEncryptedBackup(
  currentUser: User,
  rawPin: string
): Promise<EncryptedBackupEnvelope> {
  // 1. Gather all personal expenses and budget for this user
  const state = db.getState();
  const personalExpenses = state.personalExpenses.filter((e) => e.userId === currentUser.id);
  const budgetConfig = getUserBudget(currentUser.id);
  const exportedAt = new Date().toISOString();

  const manifest: BackupManifest = {
    app: 'RoomMate',
    version: 1,
    exportedAt,
    userId: currentUser.id,
    userName: currentUser.name,
    userEmail: currentUser.email,
    expenseCount: personalExpenses.length,
    hasBudget: Boolean(budgetConfig),
  };

  const payload: BackupDecryptedPayload = {
    manifest,
    personalExpenses,
    budgetConfig,
    exportedAt,
  };

  // 2. Generate random 16-byte salt and 12-byte IV for AES-GCM
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 3. Derive key and encrypt
  const key = await deriveAesKeyFromPin(rawPin, salt);
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return {
    app: 'RoomMate',
    version: 1,
    format: 'AES-GCM-256-PBKDF2',
    exportedAt,
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(new Uint8Array(ciphertextBuffer)),
    summary: {
      userName: currentUser.name,
      itemCount: personalExpenses.length,
    },
  };
}

/**
 * Decrypts an EncryptedBackupEnvelope using the provided 4-digit PIN.
 * Throws a clear error if the PIN is incorrect or the envelope is corrupted.
 */
export async function decryptBackup(
  envelope: EncryptedBackupEnvelope,
  rawPin: string
): Promise<BackupDecryptedPayload> {
  if (!envelope || envelope.app !== 'RoomMate' || envelope.format !== 'AES-GCM-256-PBKDF2') {
    throw new Error('INVALID_FORMAT: The selected file is not a valid RoomMate backup archive.');
  }

  const saltBytes = hexToBytes(envelope.saltHex);
  const ivBytes = hexToBytes(envelope.ivHex);
  const ciphertextBytes = hexToBytes(envelope.ciphertextHex);

  const key = await deriveAesKeyFromPin(rawPin, saltBytes);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as BufferSource },
      key,
      ciphertextBytes as BufferSource
    );

    const jsonStr = new TextDecoder().decode(decryptedBuffer);
    const parsed = JSON.parse(jsonStr) as BackupDecryptedPayload;

    if (!parsed || !parsed.manifest || !Array.isArray(parsed.personalExpenses)) {
      throw new Error('CORRUPTED_DATA: Decrypted backup structure is invalid.');
    }

    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('CORRUPTED_DATA')) {
      throw err;
    }
    throw new Error('INVALID_PIN: Incorrect PIN. Unable to decrypt this backup archive.');
  }
}
