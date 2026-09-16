import { PersonalExpense, User } from '../../types';
import { db } from './mockStorage';
import { saveUserBudget } from './budgetService';
import {
  EncryptedBackupEnvelope,
  BackupDecryptedPayload,
  decryptBackup,
} from './backupCryptoService';
import { supabase } from '../supabase/client';
import { IS_LIVE_SYNC_ENABLED } from './cloudStorageAdapter';

export interface RestoreResult {
  restoredExpenses: number;
  budgetRestored: boolean;
  backupUserName: string;
  backupDate: string;
}

/**
 * Validates and parses an uploaded file into an EncryptedBackupEnvelope.
 */
export async function parseBackupFile(file: File): Promise<EncryptedBackupEnvelope> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_FILE: The uploaded file is not a valid JSON file.');
  }

  const envelope = parsed as Partial<EncryptedBackupEnvelope>;
  if (
    !envelope ||
    envelope.app !== 'RoomMate' ||
    envelope.format !== 'AES-GCM-256-PBKDF2' ||
    !envelope.saltHex ||
    !envelope.ivHex ||
    !envelope.ciphertextHex
  ) {
    throw new Error(
      'UNRECOGNIZED_FORMAT: This file is not a valid RoomMate encrypted backup archive.'
    );
  }

  return envelope as EncryptedBackupEnvelope;
}

/**
 * Decrypts and restores the personal expense vault and budget for the current user.
 */
export async function executeRestore(
  envelope: EncryptedBackupEnvelope,
  pin: string,
  targetUser: User
): Promise<RestoreResult> {
  // 1. Decrypt using the 4-digit PIN
  const payload: BackupDecryptedPayload = await decryptBackup(envelope, pin);

  // 2. Restore Personal Expenses
  const currentState = db.getState();
  const existingIds = new Set(currentState.personalExpenses.map((e) => e.id));
  let addedCount = 0;

  for (const exp of payload.personalExpenses) {
    // If expense already exists, skip to prevent duplicates
    if (existingIds.has(exp.id)) {
      continue;
    }

    const newExpense: PersonalExpense = {
      ...exp,
      userId: targetUser.id, // Re-map ownership to active user
    };

    // Add locally
    currentState.personalExpenses.unshift(newExpense);
    existingIds.add(newExpense.id);
    addedCount++;

    // Sync to Supabase cloud if active and user ID is UUID
    if (IS_LIVE_SYNC_ENABLED && targetUser.id.length === 36) {
      try {
        await supabase.from('personal_expenses').upsert({
          id: newExpense.id.length === 36 ? newExpense.id : undefined,
          user_id: targetUser.id,
          title: newExpense.title,
          amount: newExpense.amount,
          category: newExpense.category,
          notes: newExpense.notes || null,
          expense_date: newExpense.expenseDate,
        });
      } catch (err) {
        console.warn('Restore cloud sync notice for item:', err);
      }
    }
  }

  // Save local state
  db.saveState(currentState);

  // 3. Restore User Budget if present in payload
  let budgetRestored = false;
  if (payload.budgetConfig) {
    saveUserBudget(targetUser.id, payload.budgetConfig);
    budgetRestored = true;
  }

  return {
    restoredExpenses: addedCount,
    budgetRestored,
    backupUserName: payload.manifest.userName || 'Resident',
    backupDate: payload.manifest.exportedAt || envelope.exportedAt,
  };
}
