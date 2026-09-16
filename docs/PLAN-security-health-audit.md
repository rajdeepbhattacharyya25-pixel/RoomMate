# Comprehensive Project Plan: Full App Deep Audit, Security Remediation & Health Optimization

**Task Slug**: `security-health-audit`  
**Target Plan File**: `docs/PLAN-security-health-audit.md`  
**Status**: Ready for User Review  
**Date**: 2026-09-14  
**Workspace**: RoomMate (formerly CampusFlow) – Student Expense & Shared Living Management App  

---

## 1. Executive Summary & Audit Overview

A comprehensive, multi-dimensional audit of the entire codebase, database security layer, native mobile build configuration, and testing infrastructure was performed:
1. **Database & Cloud Security (Supabase Advisory)**:
   - Evaluated all 25 active Supabase security and performance advisory warnings directly via live MCP advisors.
   - Identified **2 Critical vulnerabilities** (unrestricted OTA bundle uploads and unauthenticated OTA release management), **1 High vulnerability** (IDOR data leakage on `get_room_balances`), and multiple medium/low advisories (search path mutability, RLS bypass on audit logs, broad bucket listing).
2. **Penetration Testing & Cryptographic Review**:
   - Discovered that `src/lib/auth/jwtService.ts` was utilizing a pseudo-HMAC 32-bit integer string hash (`generateHmacSha256Signature`) instead of genuine cryptographic HMAC-SHA256, allowing trivial token forgery.
3. **Static Code Health & Linter (Oxlint & TypeScript)**:
   - TypeScript compiler (`tsc -b --noEmit`) passes cleanly with **0 errors**.
   - `oxlint src` identified **110 warnings** across 104 files (unused imports, cascading `setState` inside `useEffect`, unmemoized hooks, and impure render calls).
4. **Automated Testing Suite**:
   - 3 test suites currently running under Vitest: `engine.test.ts`, `network.test.ts`, and `settings.test.ts` (31 passing tests).
   - Test coverage gaps identified: Authentication/JWT crypto, UPI intent generation, offline queue synchronization, and room member authorization.
5. **CodeRabbit MCP Capabilities**:
   - Successfully executed CodeRabbit static analysis, dependency analysis, security scan, health check, refactor suggestions, test planner, and deployment checklist.
6. **Mobile (Android & iOS) Readiness**:
   - Target SDK 36 (Android 15/16 ready, meets Google Play API 35+ requirement).
   - Version mismatch identified: `android/app/build.gradle` is on `versionCode 2` and `versionName "1.0.1"`, while `package.json` is on `1.0.3`.
   - Release build currently has `minifyEnabled false` (ProGuard/R8 disabled), increasing APK/AAB size and leaving bytecode un-obfuscated.

---

## 2. Deep Audit Findings & Security Vulnerability Matrix

| ID | Category | Vulnerability / Issue | Severity | Impact | Remediation |
|---|---|---|---|---|---|
| **SEC-01** | Database / Storage | `app-updates` storage bucket allows public upload & update | 🔴 **CRITICAL** | Any anonymous user could overwrite or upload malicious OTA update bundles | Restrict INSERT/UPDATE to `service_role`, drop public policies |
| **SEC-02** | Database / RPC | `manage_ota_release` executable by `anon` role with mutable search path | 🔴 **CRITICAL** | Anonymous attacker could call RPC to publish or rollback mobile releases | Set `search_path`, revoke execute from `PUBLIC`/`anon`/`authenticated`, restrict to `service_role` |
| **SEC-03** | Auth / Crypto | Pseudo-HMAC in `jwtService.ts` | 🔴 **CRITICAL** | 32-bit non-cryptographic hash allows resident session JWT forgery | Replace with Web Crypto API (`crypto.subtle`) HMAC-SHA256 |
| **SEC-04** | Database / IDOR | `get_room_balances` executable by `anon` with no room membership verification | 🟠 **HIGH** | Anonymous users can query financial balances, names, and emails of any room | Enforce `is_room_member(p_room_id, auth.uid())` check; revoke from `anon` |
| **SEC-05** | Database / RLS | `public.audit_logs` has `WITH CHECK (true)` policy for `authenticated` | 🟠 **HIGH** | Authenticated users can insert arbitrary/forged audit logs | Restrict check: `WITH CHECK (user_id = (SELECT auth.uid()))` |
| **SEC-06** | Database / Auth | `handle_new_user()` executable by `anon` and `authenticated` | 🟡 **MEDIUM** | Auth trigger function can be invoked directly via PostgREST RPC | Revoke execute from `PUBLIC`, `anon`, `authenticated`; grant to `postgres`, `supabase_auth_admin` |
| **SEC-07** | Database / Admin | `leave_room`, `remove_room_member` executable by `anon` | 🟡 **MEDIUM** | Functions are callable without login (though guarded by internal check) | Revoke execute from `PUBLIC` and `anon`; grant to `authenticated` only |
| **SEC-08** | Database / RLS | `is_room_member`, `is_room_admin`, `is_super_admin` exposed to `anon` | 🟡 **MEDIUM** | Anonymous users can probe membership and admin status via RPC | Revoke execute from `PUBLIC` and `anon`; grant to `authenticated` |
| **SEC-09** | Database / Linter | `trigger_set_updated_at` has mutable search path | 🔵 **LOW** | Potential search path hijacking in trigger | Set `SET search_path = ''` |
| **SEC-10** | Database / Storage | `app-updates` bucket has broad SELECT policy on `storage.objects` | 🔵 **LOW** | Allows clients to enumerate/list all objects in bucket | Drop broad SELECT policy; public download URL remains direct |
| **SEC-11** | Database / Perf | Unindexed foreign keys on `room_invitations.created_by` & `shared_expenses.created_by` | 🔵 **LOW** | Suboptimal JOIN and foreign key cascading query performance | Add covering indexes `idx_room_invitations_created_by` & `idx_shared_expenses_created_by` |
| **SEC-12** | Database / Auth | Leaked Password Protection disabled in Supabase Auth | 🔵 **LOW** | Users can choose compromised passwords | Enable HaveIBeenPwned check in Supabase Auth dashboard |
| **CODE-01** | Code Health | 110 Oxlint warnings (unused imports, setState in useEffect) | 🟡 **MEDIUM** | Cascading re-renders, bundle bloat, code maintainability | Clean up unused symbols, refactor effects to derived state or callbacks |
| **MOB-01** | Mobile / Android | Version mismatch between `build.gradle` (1.0.1) and `package.json` (1.0.3) | 🔵 **LOW** | Confusing build versions in QA and release tracking | Bump `versionCode` to 4 and `versionName` to "1.0.3" |
| **MOB-02** | Mobile / Android | ProGuard/R8 `minifyEnabled false` in release build | 🔵 **LOW** | Larger APK size, exposed bytecode | Enable ProGuard/R8 with Capacitor keep rules for production |

---

## 3. Detailed Remediation Plan by Phases

### Phase 1: Supabase Security Advisory & Database Hardening (Migration SQL)
Create and apply a comprehensive migration: `supabase/migrations/20260914_security_advisory_remediation.sql`.

#### 1.1 Fix Mutable Search Paths
- `public.trigger_set_updated_at`: alter function to `SET search_path = ''`.
- `public.manage_ota_release`: alter function to `SET search_path = public, pg_temp`.
- `public.get_latest_release`: alter function to `SET search_path = public, pg_temp` and change to `SECURITY INVOKER`.

#### 1.2 Restrict RPC Function Executions (Anon & Authenticated Protection)
- **Revoke from `PUBLIC`, `anon`, `authenticated`**:
  - `public.handle_new_user()` (grant only to `postgres`, `supabase_auth_admin`, `service_role`)
  - `public.manage_ota_release(...)` (grant only to `service_role`)
  - `public.rls_auto_enable()` (grant only to `postgres`, `service_role`)
- **Revoke from `PUBLIC` and `anon`, Grant to `authenticated`**:
  - `public.get_room_balances(UUID)` (with internal membership check `public.is_room_member(p_room_id, auth.uid())`)
  - `public.leave_room(UUID)`
  - `public.remove_room_member(UUID, UUID)`
  - `public.is_room_member(UUID, UUID)`
  - `public.is_room_admin(UUID, UUID)`
  - `public.is_super_admin(UUID)`

#### 1.3 Audit Logs RLS Policy Hardening
- Drop policy `"System can insert audit logs"` on `public.audit_logs`.
- Re-create with strict ownership check:
  ```sql
  CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
  ```

#### 1.4 Storage Bucket Security (`app-updates`)
- Drop `"Allow upload to app-updates"` and `"Allow update to app-updates"` granted to `anon, authenticated`.
- Drop `"Allow public download of app-updates"` broad SELECT policy (prevents listing all bucket contents).
- Create `"Allow service role manage app-updates"` on `storage.objects` for `service_role`.

#### 1.5 Performance Index Additions
- `CREATE INDEX IF NOT EXISTS idx_room_invitations_created_by ON public.room_invitations(created_by);`
- `CREATE INDEX IF NOT EXISTS idx_shared_expenses_created_by ON public.shared_expenses(created_by);`

---

### Phase 2: Client-Side Security & Cryptographic Hardening
Refactor `src/lib/auth/jwtService.ts`:
- Replace the 32-bit djb2 pseudo-hash with the native **Web Crypto API** (`window.crypto.subtle` / `globalThis.crypto.subtle`).
- Implement asynchronous HMAC-SHA256 signature generation and verification.
- Provide secure fallback for environments without subtle crypto using standard SHA-256 binary hashing.
- Add tamper resistance tests ensuring that modified payloads or signatures fail verification.
- Enforce secret key derivation from environment variables (`VITE_RESIDENT_JWT_SECRET`).

---

### Phase 3: Code Health, Linter & React 19 Optimization
Eliminate the 110 Oxlint warnings:
1. **Batch Unused Imports Cleanup**:
   - `src/components/mobile/MobileLogin.tsx` (remove `hashPin`, `Eye`, `EyeOff`, `CameraOff`, `ShieldAlert`)
   - `src/components/mobile/RoomExportBottomSheet.tsx` (remove `Share2`, `X`)
   - `src/components/Navbar.tsx` (prefix unused params with `_`)
   - `src/components/PersonalVault.tsx` (remove `Tag`, `Calendar`, `Sparkles`, `Filter`)
   - `src/components/SuperAdminPortal.tsx` (remove unused Lucide icons)
   - `src/lib/native/biometrics.ts` (remove unused `LEGACY_BIOMETRIC_DEVICE_KEY`)
2. **React 19 Effect Optimization**:
   - Eliminate synchronous `setState` inside `useEffect` by deriving state or utilizing trigger handlers in `MobileLogin.tsx`, `MobileBottomSheet.tsx`, `UpiQrScannerModal.tsx`, and `EditUsernameModal.tsx`.
   - Replace impure `Math.random()` during render with deterministic ID generation.
   - Add missing hook dependencies to `useEffect` and `useCallback` dependency arrays.

---

### Phase 4: Test Suite Expansion & Penetration Verifications
Expand the automated test suite from 31 tests to 50+ tests covering:
1. `src/lib/auth/jwtService.test.ts`:
   - Token creation with valid payload.
   - Signature validation with correct secret.
   - Rejection of tampered signatures.
   - Rejection of expired tokens.
   - Role and issuer validation.
2. `src/lib/payments/upiIntentService.test.ts`:
   - UPI deep link URI formation (`upi://pay?pa=...&pn=...&am=...&cu=INR`).
   - App-specific URI schemes (`tez://`, `phonepe://`, `paytmmp://`).
   - Input validation (valid amount > 0, alphanumeric VPA check).
3. `src/lib/storage/offlineQueue.test.ts`:
   - Queue enqueue and FIFO ordering.
   - Deduplication of identical offline mutations.
   - Persistence and recovery from `localStorage`.
4. Run `npm test` to verify 100% test pass rate.

---

### Phase 5: Android & Mobile Release Configuration
1. Synchronize `android/app/build.gradle`:
   - Update `versionCode 4`
   - Update `versionName "1.0.3"`
2. Verify Android permissions in `AndroidManifest.xml` with runtime permission checks.
3. Verify TalkBack accessibility labels on mobile icon buttons (`RoomMembersModal`, `RoomInviteModal`, `UpiQrScannerModal`).
4. Execute CodeRabbit deployment checklist for mobile production release.

---

## 4. Verification & Testing Matrix

| Test Suite | Command | Target Pass Rate |
|---|---|---|
| Vitest Unit Tests | `npm test` | 100% (50+ tests across 6 suites) |
| TypeScript Compiler | `npx tsc -b --noEmit` | 0 errors |
| Oxlint Static Analysis | `npx oxlint src` | 0 errors, <10 benign warnings |
| Supabase Security Advisor | `get_advisors(type="security")` via MCP | 0 WARN findings |
| Supabase Performance Advisor | `get_advisors(type="performance")` via MCP | 0 unindexed foreign keys |
| Vite Production Bundle | `npm run build` | Clean build in <4s |

---

## 5. Next Steps

1. Review and approve this plan.
2. We will apply the database security migration directly to Supabase via MCP `apply_migration` or `execute_sql`.
3. We will implement the cryptographic upgrade, clean up all linter warnings, add the expanded test suites, and re-verify everything with CodeRabbit and Vitest.
