# Project Plan: RoomMate Critical Auth, QR & Drive Fixes

**Slug:** `PLAN-auth-fix`  
**Generated:** 2026-09-17  
**Mode:** PLANNING ONLY  
**Target File:** `docs/PLAN-auth-fix.md`

---

## 1. Executive Summary & Root Cause Analysis

### Problem 1 & 2: Incorrect Password Accepted / Duplicate Accounts Created
- **Root Cause in `MobileLogin.tsx`**: `handleSignIn` searched local `residentUsers` and, if found, completely ignored `password` and logged in. If not found in local memory (e.g. cache wiped or different device), it synthesized a fake user with `id: 'usr-' + Math.random().toString(36)...` and logged in.
- **Root Cause in `cloudStorageAdapter.ts`**: `authenticateResidentWithSupabase` attempted a hardcoded password `'CampusFlowPassword2026!'`. On startup, `App.tsx` defaulted `currentUser` to `cloudState.users[0]` when unauthenticated.
- **Root Cause in `syncOAuthSessionToProfile`**: `needsPinSetup` checked only `localStorage`. When cache was cleared, returning Google users were forced into PIN setup, leading to perceived account duplicates.

### Problem 3: Uploaded Payment QR Disappears After Restart
- **Root Cause in `syncOAuthSessionToProfile`**: `resolvedUser` and the `supabase.from('profiles').upsert(...)` call omitted `upi_qr_url` and `upi_id`, overwriting the database and local store with `undefined`/`NULL` on every Google sync or app restart.
- **Root Cause in `updateUpiQrUrl`**: Used raw string `userId`. If not a UUID or mismatched with `auth.uid()`, Postgres threw UUID errors and RLS blocked the update.

### Problem 4: Google Drive Backup Account Selection
- **Root Cause**: `DataBackupTab.tsx` only invoked `navigator.share` (the OS share sheet) or direct `.json` download. There was no Google OAuth token client or account picker for Google Drive.

---

## 2. Core Architectural Principles (Strict Constraints)

1. **Deterministic Identity Hierarchy**:
   ```text
   Google Identity / Email Credentials
                 ↓
       Supabase Auth Identity
                 ↓
       Supabase auth.users.id (UUID)
                 ↓
          RoomMate Profile
   ```
2. **Never Trust Frontend User IDs**: All RLS and profile modifications use the authenticated Supabase session (`auth.uid()`).
3. **No Automatic Account Creation During Login**: Sign In strictly authenticates an existing identity. Invalid credentials fail immediately.
4. **Preserve ImageBB Architecture**: Supabase Storage is NOT used for QR images. ImageBB hosts the image; Supabase stores only the permanent URL in `profiles.upi_qr_url`.
5. **Decouple Google Drive Account from RoomMate Auth**: Google Drive authorization is independent, presents an account selection UI (`prompt: 'select_account'`), and requests minimal scope (`https://www.googleapis.com/auth/drive.file`).

---

## 3. Task Breakdown

### Phase 1: Authentication & Credential Verification
- [ ] Implement `signInResidentWithCredentialsCloud(identifier, password)` in `cloudStorageAdapter.ts`.
- [ ] Connect `MobileLogin.tsx` `handleSignIn` to `signInResidentWithCredentialsCloud`.
- [ ] Remove random user synthesis (`usr-` + Math.random) from `MobileLogin.tsx`.
- [ ] Display explicit error message on wrong password/PIN or non-existent account without logging in.
- [ ] Add `isAuthInitializing` state to `App.tsx` to eliminate startup race conditions.
- [ ] Fix `handleLogout` to clean up session tokens without touching user data or QR records.

### Phase 2: Payment QR Persistence & ImageBB Integrity
- [ ] Update `syncOAuthSessionToProfile` in `cloudStorageAdapter.ts` to preserve `upi_qr_url` and `upi_id` from existing profile and include them in Supabase upsert.
- [ ] Update `updateUpiQrUrl` to use authenticated Supabase user ID (`auth.uid()`).
- [ ] Update `AccountTab.tsx` to handle ImageBB upload failures and confirm database writes before updating UI.
- [ ] Verify `profiles.upi_qr_url` is loaded and displayed after app reload.

### Phase 3: Google Drive Account Selection & Direct Upload
- [ ] Create `src/lib/services/googleDriveService.ts` with:
  - Account selection via `prompt: 'select_account'`.
  - Minimal scope: `https://www.googleapis.com/auth/drive.file`.
  - Account list storage in `localStorage.getItem('roommate_gdrive_accounts')`.
  - Direct multipart upload to Google Drive API v3.
  - Cancellation detection (no false success).
- [ ] Create `src/components/mobile/settings/modals/GoogleDriveBackupModal.tsx` matching Google OAuth UI.
- [ ] Integrate Google Drive backup modal into `DataBackupTab.tsx`.

### Phase 4: Testing & Verification
- [ ] Unit & Integration Tests:
  - `googleAuth.test.ts` (1:1 mapping, QR preservation).
  - `accountSecurity.test.ts` (wrong password rejection, no fake account creation).
  - `settings.test.ts` (UUID integrity for QR code updates).
  - `googleDriveService.test.ts` (account selection, cancellation handling).
- [ ] Run full test suite: `npm test`.

---

## 4. Deliverables
- [x] Detailed Implementation Plan: `implementation_plan.md`
- [x] Project Plan: `docs/PLAN-auth-fix.md`
