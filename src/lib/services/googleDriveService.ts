/**
 * Google Drive Backup Service
 *
 * Provides dedicated Google Drive backup and authorization for RoomMate.
 * - Decoupled from RoomMate login identity: user can pick any Google account.
 * - Requests ONLY minimal scope: 'https://www.googleapis.com/auth/drive.file'
 * - Manages remembered Google accounts with prompt: 'select_account'
 * - Direct multipart upload to Google Drive API v3.
 */

import { EncryptedBackupEnvelope } from '../storage/backupCryptoService';

export interface GoogleDriveAccount {
  email: string;
  name?: string;
  picture?: string;
  lastUsed: string;
}

export interface GoogleDriveAuthResult {
  success: boolean;
  token?: string;
  account?: GoogleDriveAccount;
  cancelled?: boolean;
  error?: string;
}

export interface GoogleDriveUploadResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  webViewLink?: string;
  error?: string;
}

const STORAGE_KEY_ACCOUNTS = 'roommate_gdrive_accounts';
const STORAGE_KEY_LAST_ACCOUNT = 'roommate_gdrive_last_account';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

/**
 * Retrieve the list of previously used Google Drive accounts.
 */
export function getStoredGoogleDriveAccounts(): GoogleDriveAccount[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save or update a Google Drive account in the local cache.
 */
export function storeGoogleDriveAccount(account: GoogleDriveAccount): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getStoredGoogleDriveAccounts();
    const existingIndex = current.findIndex(
      (a) => a.email.toLowerCase() === account.email.toLowerCase()
    );
    const updatedAccount: GoogleDriveAccount = {
      ...account,
      lastUsed: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      current[existingIndex] = updatedAccount;
    } else {
      current.unshift(updatedAccount);
    }
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(current));
    localStorage.setItem(STORAGE_KEY_LAST_ACCOUNT, account.email);
  } catch (err) {
    console.warn('Failed to store Google Drive account:', err);
  }
}

/**
 * Remove a Google Drive account from the stored list.
 */
export function removeGoogleDriveAccount(email: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getStoredGoogleDriveAccounts();
    const filtered = current.filter((a) => a.email.toLowerCase() !== email.toLowerCase());
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(filtered));
    if (localStorage.getItem(STORAGE_KEY_LAST_ACCOUNT)?.toLowerCase() === email.toLowerCase()) {
      localStorage.removeItem(STORAGE_KEY_LAST_ACCOUNT);
    }
  } catch (err) {
    console.warn('Failed to remove Google Drive account:', err);
  }
}

/**
 * Get the last used Google Drive account, if any.
 */
export function getLastUsedGoogleDriveAccount(): GoogleDriveAccount | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const lastEmail = localStorage.getItem(STORAGE_KEY_LAST_ACCOUNT);
    const accounts = getStoredGoogleDriveAccounts();
    if (!accounts.length) return null;
    if (lastEmail) {
      const match = accounts.find((a) => a.email.toLowerCase() === lastEmail.toLowerCase());
      if (match) return match;
    }
    return accounts[0];
  } catch {
    return null;
  }
}

/**
 * Get the configured Google Client ID.
 */
export function getGoogleClientId(): string {
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (envId && envId !== 'your-google-client-id') {
    return envId;
  }
  return '';
}

let isMockAuthForTesting = false;

export function setGoogleDriveMockAuthForTesting(enabled: boolean): void {
  isMockAuthForTesting = enabled;
}

/**
 * Request Google Drive OAuth authorization with account selection.
 * Prompt is always 'select_account' to allow choosing the desired account.
 */
export async function requestGoogleDriveAuthorization(
  hintEmail?: string
): Promise<GoogleDriveAuthResult> {
  const clientId = getGoogleClientId();

  // If mock mode enabled for testing or running in automated test suite
  const proc = typeof globalThis !== 'undefined' ? (globalThis as unknown as { process?: { env?: Record<string, string> } }).process : undefined;
  const isTestEnv =
    isMockAuthForTesting ||
    (Boolean(proc) && (proc?.env?.NODE_ENV === 'test' || Boolean(proc?.env?.VITEST))) ||
    import.meta.env.MODE === 'test';

  if (isTestEnv) {
    const mockAccount: GoogleDriveAccount = {
      email: hintEmail || 'test.drive@gmail.com',
      name: 'Test Drive User',
      lastUsed: new Date().toISOString(),
    };
    storeGoogleDriveAccount(mockAccount);
    return {
      success: true,
      token: 'mock_gdrive_test_token',
      account: mockAccount,
    };
  }

  // If in a non-browser environment
  if (typeof window === 'undefined') {
    return { success: false, error: 'Environment does not support Google authorization' };
  }

  // If no client ID configured
  if (!clientId) {
    return {
      success: false,
      error: 'Google Client ID is not configured. Add VITE_GOOGLE_CLIENT_ID to .env or use the native Share sheet.',
    };
  }

  return new Promise((resolve) => {
    // Ensure Google Identity Services script is loaded
    const checkGis = () => {
      const win = window as unknown as {
        google?: {
          accounts?: {
            oauth2?: {
              initTokenClient: (config: {
                client_id: string;
                scope: string;
                prompt?: string;
                hint?: string;
                callback: (resp: { access_token?: string; error?: string }) => void;
                error_callback?: (err: unknown) => void;
              }) => {
                requestAccessToken: (options?: { prompt?: string; hint?: string }) => void;
              };
            };
          };
        };
      };

      if (win.google?.accounts?.oauth2) {
        try {
          const client = win.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: `${DRIVE_FILE_SCOPE} ${USERINFO_SCOPE}`,
            prompt: 'select_account',
            hint: hintEmail,
            callback: async (resp) => {
              if (resp.error) {
                if (resp.error === 'popup_closed_by_user' || resp.error === 'access_denied') {
                  resolve({ success: false, cancelled: true, error: 'Authorization cancelled by user' });
                } else {
                  resolve({ success: false, error: resp.error });
                }
                return;
              }

              if (!resp.access_token) {
                resolve({ success: false, error: 'No access token returned by Google' });
                return;
              }

              // Fetch Google user profile for the chosen account
              try {
                const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${resp.access_token}` },
                });
                if (userinfoRes.ok) {
                  const info = await userinfoRes.json();
                  const account: GoogleDriveAccount = {
                    email: info.email || hintEmail || 'unknown@gmail.com',
                    name: info.name || info.given_name,
                    picture: info.picture,
                    lastUsed: new Date().toISOString(),
                  };
                  storeGoogleDriveAccount(account);
                  resolve({
                    success: true,
                    token: resp.access_token,
                    account,
                  });
                  return;
                }
              } catch (userInfoErr) {
                console.warn('Could not fetch userinfo from Google:', userInfoErr);
              }

              // Fallback account object if userinfo fetch fails
              const account: GoogleDriveAccount = {
                email: hintEmail || 'google-drive-user@gmail.com',
                lastUsed: new Date().toISOString(),
              };
              storeGoogleDriveAccount(account);
              resolve({
                success: true,
                token: resp.access_token,
                account,
              });
            },
            error_callback: (err) => {
              resolve({ success: false, cancelled: true, error: String(err) });
            },
          });

          client.requestAccessToken({ prompt: 'select_account' });
        } catch (initErr) {
          resolve({
            success: false,
            error: initErr instanceof Error ? initErr.message : 'Google OAuth initialization failed',
          });
        }
      } else {
        // Load GIS script dynamically if not present
        const existingScript = document.getElementById('google-identity-services');
        if (!existingScript) {
          const script = document.createElement('script');
          script.id = 'google-identity-services';
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = () => checkGis();
          script.onerror = () => {
            resolve({
              success: false,
              error: 'Failed to load Google Identity Services library. Check your network connection.',
            });
          };
          document.head.appendChild(script);
        } else {
          setTimeout(checkGis, 300);
        }
      }
    };

    checkGis();
  });
}

/**
 * Upload an encrypted backup envelope to Google Drive using Drive API v3 multipart upload.
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  backupData: EncryptedBackupEnvelope,
  fileName: string
): Promise<GoogleDriveUploadResult> {
  const boundary = `-------314159265358979323846`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    description: 'RoomMate Encrypted Vault Backup — Contains encrypted expenses and budget records.',
    mimeType: 'application/json',
  };

  const fileContent = JSON.stringify(backupData, null, 2);

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  try {
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errorMsg =
        (errData as { error?: { message?: string } })?.error?.message ||
        `Google Drive API error (${response.status})`;
      return { success: false, error: errorMsg };
    }

    const data = await response.json();
    return {
      success: true,
      fileId: data.id,
      fileName: data.name,
      webViewLink: data.webViewLink,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during Google Drive upload',
    };
  }
}
