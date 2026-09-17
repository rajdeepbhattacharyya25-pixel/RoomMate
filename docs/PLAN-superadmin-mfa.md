# PLAN: SuperAdmin MFA Login & 1st-Time Setup Fix

## Context
- Task: Fix 1st-time setup and login failure on SuperAdmin MFA screen (`/admin`).
- Symptoms: OTP entered from Google Authenticator returns "Access Denied" / "Invalid authentication code" even when code is accurate.
- Mode: PLANNING

## Root Cause Summary
1. **Unsaved Secret**: During MFA enrollment, `totpSecret` was not persisted in `superAdminSecuritySettings`.
2. **Supabase MFA Session Conflict**: Because `isSupabaseConfigured` is `true`, `verifySuperAdminTotp` invokes `supabase.auth.mfa.challenge`, which fails without an active Supabase user session and immediately errors out instead of falling through to RFC 6238 TOTP.
3. **Missing Parameter**: The challenge verification step omitted the fallback secret parameter.
4. **Orphaned Challenge Screen**: If previously marked enrolled without a secret, the user is stuck on `MFA_CHALLENGE` with no stored secret to verify against.

## Key Tasks
- **Task 1**: Update `verifySuperAdminTotp` in `src/lib/auth/superAdminSecurityService.ts` to check for active sessions and gracefully fall back to RFC 6238 TOTP.
- **Task 2**: Update `AdminLoginView.tsx` so `handleCompleteEnrollment` properly saves `totpSecret`.
- **Task 3**: In `AdminLoginView.tsx`, if `totpSecret` is missing for an enrolled account, automatically route to `MFA_ENROLLMENT` with a fresh QR code.
- **Task 4**: Add a "Re-scan QR / Reset Authenticator" button directly on the MFA Challenge screen so you can easily reset your authenticator app pairing anytime.
- **Task 5**: Verify automated unit tests with `vitest` and live `/admin` login.
