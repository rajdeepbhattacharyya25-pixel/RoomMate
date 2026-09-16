# Implementation Plan: Staging APK Update & Zero-Error Verification Matrix

Comprehensive plan to compile, verify, and pass the updated RoomMate Staging APK (`v1.0.4-build5`) to the staging distribution area and Supabase OTA channel with zero errors.

---

## 🎯 Context & Pre-Flight Verification Audit

Before preparing any release, a thorough diagnostic of the workspace and build pipeline was executed:

| Verification Stage | Command / Target | Status | Diagnostics & Findings |
|---|---|---|---|
| **Unit & Integration Tests** | `npm run test` (Vitest v5) | 🟢 **PASSED (123/123)** | 13 test suites passed in 9.37s. |
| **Lint & Code Quality** | `npm run lint` (Oxlint) | 🟢 **PASSED (0 Errors)** | 0 errors across 159 files (25 unused variable warnings only). |
| **Type Integrity** | `npx tsc -b` | 🟢 **PASSED (0 Errors)** | TypeScript clean compilation. |
| **Staging Web Bundle** | `npm run build:staging` | 🟢 **PASSED** | Bundled in 3.94s with dynamic timestamp. |
| **Android Build Toolchain** | Java 21 LTS + Gradle 8.14.3 | 🟢 **READY** | SDK located at `AppData/Local/Android/Sdk`. |
| **Supabase Remote Database** | `pbzaaskftrmnvocczhat` | ⚠️ **ACTION REQUIRED** | Migrations for `upi_id`, `upi_qr_url`, `fcm_token`, `in_app_notifications`, and `bug_reports` must be applied to prevent runtime errors. |

---

## 🏗️ Technical Architecture & Version Strategy

1. **Version & Build Increment**:
   - **Version**: Bump from `1.0.3` to `1.0.4`.
   - **Native Build Number (`versionCode`)**: Bump from `4` to `5`.
   - **Canonical Staging APK**: `RoomMate-staging-v1.0.4-build5.apk` (stored in project root).
   - **Safe Retention**: Existing `RoomMate-staging-v1.0.1-build4.apk` will remain untouched for instant fallback.

2. **Double-Staging Distribution**:
   - **Physical APK File**: Newly compiled native APK placed in project root for direct physical sideloading / testing.
   - **Live OTA Staging Channel**: Packaged zip uploaded to Supabase Storage `app-updates/` and registered in `app_versions` for channel `staging`. Existing installed APKs (builds 2, 3, 4) will seamlessly receive the update over-the-air.

3. **Strict Staging Isolation**:
   - Channel isolation guarantees that staging releases are strictly invisible to production users (`channel = 'staging'`).

---

## 📋 Step-by-Step Task Breakdown

### Phase 1: Supabase Staging Database Schema Synchronization
- [ ] Apply pending migration `20260911_profiles_qr_fcm.sql` (adds `upi_qr_url`, `fcm_token` to `profiles`).
- [ ] Apply pending migration `20260915_profiles_upi_id.sql` (adds `upi_id` to `profiles`).
- [ ] Apply pending migration `20260917_profiles_onboarding_completed.sql` (adds `onboarding_completed` to `profiles`).
- [ ] Apply pending migration `20260914_bug_reports.sql` (creates `bug_reports` table & RLS policies).
- [ ] Apply pending migration `20260914_in_app_notifications.sql` (creates `in_app_notifications` table & RLS policies).
- [ ] Verify columns and tables exist in Supabase `pbzaaskftrmnvocczhat`.

### Phase 2: Version Configuration & Dynamic Build Metadata
- [ ] Update `package.json` to `"version": "1.0.4"`.
- [ ] Update `android/app/build.gradle`:
  - `versionCode 5`
  - `versionName "1.0.4"`
- [ ] Run `node scripts/generate-build-info.js --channel staging --version 1.0.4 --build-number 5`.
- [ ] Verify `src/config/buildInfo.ts` contains `version: '1.0.4'`, `buildNumber: 5`, and `channel: 'staging'`.

### Phase 3: Web Staging Asset Compilation & Capacitor Native Sync
- [ ] Execute `npm run build:staging` (`tsc -b && vite build --mode staging`).
- [ ] Execute `npx cap sync android` to sync web assets and native plugin bridges into `android/app/src/main/assets/public/`.

### Phase 4: Native Android APK Assembly & Artifact Retention
- [ ] Run `./gradlew assembleDebug` in `./android`.
- [ ] Validate output APK `android/app/build/outputs/apk/debug/app-debug.apk`:
  - Confirm file size exceeds 12 MB.
  - Confirm build exit code 0.
- [ ] Copy output to project root as `RoomMate-staging-v1.0.4-build5.apk`.
- [ ] Retain existing `RoomMate-staging-v1.0.1-build4.apk` for rollback safety.

### Phase 5: Live OTA Staging Release Deployment
- [ ] Publish the OTA release to Supabase Staging channel:
  ```bash
  node scripts/ota-publish.js --version 1.0.4 --build-number 5 --channel staging --min-native 1.0.1 -m "Staging release v1.0.4 build 5: Notification center, bug reporting, SuperAdmin security, UPI extraction, and onboarding"
  ```
- [ ] Confirm zip upload to Supabase Storage bucket `app-updates`.
- [ ] Confirm row insertion in `app_versions` with `is_active = true` and `channel = 'staging'`.

### Phase 6: Post-Release Verification Matrix
- [ ] Execute `node scripts/verify-ota-matrix.js`:
  - **Test A**: Upgrade detection from earlier APKs & idempotency check.
  - **Test B**: Supabase release metadata and public storage URL accessibility (HTTP 200).
  - **Test C**: Semver compatibility & state machine recovery.
  - **Test D**: Graceful fallback on offline / null release.
  - **Test E**: Channel isolation (production apps cannot see staging releases).
- [ ] Re-run `npm run test` to guarantee no regressions were introduced.

---

## 🛡️ Verification & Rollback Strategy

1. **Automated Rollback**:
   - If any step in Gradle assembly or OTA publish fails, the staging APK file in the root is NOT replaced, and the previous release `1.0.3` in `app_versions` remains `is_active = true`.
2. **Server-Side Rollback**:
   - If an issue is observed on physical devices after release, instant rollback is available via `npm run ota:rollback -- --to 1.0.3`.
3. **Native Crash Protection**:
   - The app incorporates `@capgo/capacitor-updater` with `notifyAppReady()`. Any uncaught JavaScript boot crash automatically falls back to the stable built-in bundle.
