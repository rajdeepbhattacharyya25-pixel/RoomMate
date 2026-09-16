import { EncryptedBackupEnvelope } from './backupCryptoService';

export interface ShareBackupResult {
  action: 'shared' | 'downloaded' | 'cancelled';
  fileName: string;
  error?: string;
}

/**
 * Generates a clean timestamped filename for the backup archive.
 */
export function generateBackupFileName(userName: string): string {
  const safeName = userName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 15);
  const dateStr = new Date().toISOString().split('T')[0];
  return `roommate-backup-${safeName}-${dateStr}.json`;
}

/**
 * Triggers a direct file download of the backup envelope in the browser.
 */
export function downloadBackupFile(
  envelope: EncryptedBackupEnvelope,
  fileName: string
): void {
  const jsonString = JSON.stringify(envelope, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Dispatches the backup file to the Native OS Share Sheet (Google Drive, Files, WhatsApp, etc.)
 * Falls back to direct browser download if file sharing is unsupported or fails.
 */
export async function shareOrDownloadBackup(
  envelope: EncryptedBackupEnvelope,
  userName: string,
  preferDirectDownload = false
): Promise<ShareBackupResult> {
  const fileName = generateBackupFileName(userName);
  const jsonString = JSON.stringify(envelope, null, 2);

  // If direct download is explicitly requested or window/navigator is missing:
  if (preferDirectDownload || typeof navigator === 'undefined') {
    downloadBackupFile(envelope, fileName);
    return { action: 'downloaded', fileName };
  }

  // Attempt Native Web Share API with file support
  if (navigator.share) {
    try {
      const file = new File([jsonString], fileName, { type: 'application/json' });

      // Check if file sharing is supported on this browser/device
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'RoomMate Vault Backup',
          text: `Encrypted personal expense vault backup for ${userName}.`,
          files: [file],
        });
        return { action: 'shared', fileName };
      }
    } catch (err: unknown) {
      // User cancelled the share dialog
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('cancel'))) {
        return { action: 'cancelled', fileName };
      }
      console.warn('Native share error, falling back to download:', err);
    }
  }

  // Fallback to direct download
  downloadBackupFile(envelope, fileName);
  return { action: 'downloaded', fileName };
}
