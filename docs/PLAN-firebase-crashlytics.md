# Project Plan: Firebase Crashlytics Integration (Phase 2)

## Overview
Hardening, privacy sanitization, controlled test crash mechanism, non-fatal diagnostics, and ProGuard verification for Firebase Crashlytics in RoomMate.

## Task Breakdown
1. **Sanitization Engine:** Filter out sensitive PII, UPI IDs, PINs, passwords, and tokens from all Crashlytics logs and breadcrumbs.
2. **User Identity Management:** Ensure only internal UUIDs (never emails or phone numbers) are passed to `setUserId`, and that `setUserId(null)` is called on sign-out.
3. **Non-Fatal Error Categorization:** Implement structured reporting for high-value failures (`VAULT_CRYPTO`, `CLOUD_SYNC_CORRUPT`, `AUTH_JWT_ANOMALY`, `NATIVE_BRIDGE_FAILURE`), while suppressing ordinary offline/transient network errors.
4. **Controlled Test Crash UI:** Embed a gated test crash action inside the 5-tap developer mode in `AboutTab.tsx` with double confirmation.
5. **ProGuard & Release Build Safety:** Verify R8 de-obfuscation mapping rules and Gradle configuration.
6. **Test Suite:** Expand unit tests in `crashService.test.ts` to cover privacy filters, user IDs, non-fatal suppression, and test crash invocation.

## Verification Checklist
- [ ] Unit tests pass: `npx vitest run src/lib/crashlytics/crashService.test.ts`
- [ ] Full suite pass: `npm run test`
- [ ] Lint pass: `npm run lint`
- [ ] Build pass: `npm run build`
- [ ] Gradle build validation: `gradlew compileDebugSources`
