# Project Plan: Encrypted Data Backup, Native OS Share & Restore Engine

**Task Slug**: `data-backup-restore`  
**Target File**: `docs/PLAN-data-backup-restore.md`  
**Status**: Ready for Review / Pending Approval  

---

## 1. Phase -1: Context & Problem Statement

Currently, [DataBackupTab.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/settings/tabs/DataBackupTab.tsx) provides **Supabase Live Cloud Sync** and **Statement Exports (PDF/Excel/CSV)**, but lacks a complete **disaster recovery & offline data portability** solution. 

Students need the ability to:
1. Create a secure, portable snapshot of their personal expense vault, budgets, category preferences, and offline queues.
2. Choose where to store the backup—either downloading locally to their device's storage OR saving directly to **Google Drive**, WhatsApp, or cloud storage.
3. Restore from a backup file if they switch devices, reinstall the app, or operate purely offline.
4. Ensure data privacy by encrypting the backup file using their secret **4-digit PIN**.

By adopting **Option C (Native OS Share Sheet + Universal File Handler)**, RoomMate achieves Google Drive integration natively through Android and iOS system share sheets without requiring sensitive Google Drive OAuth scopes (`drive.file`/`drive.appdata`) or verification reviews.

---

## 2. Phase 0: Socratic Gate & Design Consensus

| Architectural Dimension | Approved Decision | Rationale |
| :--- | :--- | :--- |
| **Transport & Storage** | **Native OS Share Sheet + Web Fallback** | Native Share Sheet (`navigator.share` / `@capacitor/share`) exposes **"Save to Google Drive"**, **Files**, **WhatsApp**, and **Email** in 1 tap without requiring Google Drive API client keys. Direct download fallback for standard browsers. |
| **Encryption & Security** | **AES-GCM (256-bit) via Web Crypto** | Derives encryption key from the user's 4-digit PIN + unique random salt via PBKDF2 (100,000 iterations). Plaintext personal expenses are never exposed in unencrypted JSON. |
| **File Format & Metadata** | **`.roommate-backup` / `.json`** | Standard JSON envelope with metadata header (`version: "1.0"`, `timestamp`, `salt`, `iv`, `app: "RoomMate"`) wrapping the ciphertext. |
| **Restore Strategy** | **Preview & Confirm Modal** | Prompts for the 4-digit PIN, decrypts, previews the contents (number of expenses, date range, budgets), and safely merges or restores records into local state and cloud. |

---

## 3. Phase 1: Cryptographic Backup Engine (`backupCryptoService.ts`)

Create a dedicated cryptographic service for generating and decrypting backup archives:

1. **Payload Gathering**:
   - Collects user's `personalExpenses`, `budgetConfig`, `userSettings`, `offlineQueue`, and relevant profile metadata.
   - Attaches backup manifest: `{ app: "RoomMate", version: 1, exportedAt: string, recordCount: number, checksum: string }`.
2. **Key Derivation (PBKDF2)**:
   - Uses Web Crypto API (`crypto.subtle`).
   - Generates cryptographically secure 16-byte random `salt` and 12-byte `iv`.
   - Derives AES-GCM 256-bit key from user's sanitized 4-digit PIN + salt.
3. **Decryption & Verification**:
   - Decrypts payload using provided 4-digit PIN.
   - Throws clear errors for invalid PIN, corrupted payload, or mismatched schema versions.

---

## 4. Phase 2: Share Sheet & File Download Dispatcher (`shareBackupService.ts`)

Create a universal file sharing and saving bridge:

1. **Native Mobile Path (`isNativeApp()` / Capacitor & Web Share API)**:
   - Constructs a temporary `File` object (`roommate_backup_YYYY-MM-DD.json`).
   - Invokes `navigator.share({ title: 'RoomMate Backup', files: [file] })` or `@capacitor/share`.
   - Native OS displays the system bottom sheet containing:
     - **Google Drive** ("Save to Drive")
     - **Local Files** ("Save to device / Downloads")
     - **WhatsApp / Telegram / Messages**
     - **Email to self**
2. **Desktop / Web Fallback**:
   - Triggers direct browser blob download (`URL.createObjectURL(blob)`) saving `roommate_backup_YYYY-MM-DD.json` into the user's Downloads folder.

---

## 5. Phase 3: Restore Engine & Safety Gateway (`restoreService.ts`)

Provide a foolproof recovery pipeline:

1. **File Ingestion**:
   - Reads `.json` or `.roommate-backup` files via browser `<input type="file">`.
   - Parses the unencrypted outer envelope to check version and salt.
2. **PIN Challenge**:
   - Prompts the user to enter the 4-digit PIN that encrypted the backup file using `StrictPinInput`.
3. **Decryption & Dry-Run Inspection**:
   - Verifies cryptographic signature.
   - Inspects dataset and counts items:
     - E.g., *"Found 18 personal expenses and 2 monthly budgets from Aug–Sept 2026."*
4. **Application & Cloud Sync**:
   - Merges recovered personal records into `mockStorage` / local state.
   - If Supabase Cloud live sync is active, safely synchronizes records to `personal_expenses` under `currentUser.id`.

---

## 6. Phase 4: Settings UI Elevation (`DataBackupTab.tsx`)

Redesign the **Data & Backup** screen in [DataBackupTab.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/settings/tabs/DataBackupTab.tsx):

```
DATA & BACKUP (📊)
│
├── ☁️ 1. Live Cloud Vault (Supabase PostgreSQL)
│   ├── Realtime Sync Status (Connected / Synced badge)
│   ├── Last Ping & Offline Queue count
│   └── "Force Sync with Cloud Vault" Button
│
├── 🛡️ 2. Encrypted Vault Backup (NEW)
│   ├── Status pill: "AES-256 PIN Protected"
│   ├── Description: "Download to device or save directly to Google Drive"
│   ├── [Backup & Share] Button (Triggers Share Sheet / Save to Drive)
│   └── [Direct Download .json] Secondary Action
│
├── 📥 3. Restore Vault from Backup (NEW)
│   ├── Description: "Restore your private expense vault from a previous backup file"
│   └── [Restore from File] Button (Opens RestoreBackupModal)
│
└── 📄 4. Financial Statements & Reports
    ├── Monthly PDF statements with verification vouchers
    ├── CSV / Excel spreadsheet exports
    └── [Export Monthly Expense Report] Button
```

### New UI Components to Build:
1. **`RestoreBackupModal.tsx`**:
   - Step 1: File selector (dropzone / browse).
   - Step 2: 4-digit PIN entry with `StrictPinInput`.
   - Step 3: Confirmation preview showing backup timestamp and item breakdown.
   - Step 4: Success confirmation and instant local refresh.

---

## 7. Phase 5: Verification & Quality Assurance (Phase X)

### Automated Test Suite:
- `src/lib/storage/backupCryptoService.test.ts`:
  - Validates payload compilation.
  - Tests PBKDF2 key derivation and AES-GCM encryption.
  - Tests successful decryption with correct 4-digit PIN.
  - Rejects incorrect PIN with `INVALID_PIN` error.
  - Rejects malformed / corrupted payloads.
  - Verifies restore engine schema validation and database insertion.

### Static Code Health:
- `oxlint src`: Ensure 0 warnings and 0 errors.
- `npx tsc -b`: Ensure 0 type errors.
- `npm run test`: All test suites passing.

### Manual Device Verification:
1. **Share Sheet on Android/Capacitor**:
   - Tap "Backup & Share" &rarr; confirm native sheet opens displaying "Save to Drive" and local storage.
2. **Web Browser Fallback**:
   - Tap "Download Backup" &rarr; verify file downloads as `roommate_backup_YYYY-MM-DD.json`.
3. **Restore Cycle**:
   - Add sample expenses &rarr; Create backup &rarr; Clear or change records &rarr; Tap "Restore from File" &rarr; Enter PIN &rarr; Confirm restored records match exactly.
