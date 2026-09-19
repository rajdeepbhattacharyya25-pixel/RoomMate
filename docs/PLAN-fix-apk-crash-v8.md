# Implementation Plan: Fix APK v7 Crashes & Stabilize Build 8 (<20 MB)

Comprehensive diagnostic inspection and architectural plan to resolve the crash epidemic introduced in APK `v1.0.4-build7`, restore 100% native stability across all application sections, and generate a verified, rock-solid APK `v1.0.4-build8` comfortably under the 20 MB ceiling.

---

## 🎯 Diagnostic Findings & Root Cause Analysis

### 1. What Happened to Version 7?
In Build 7, the previous optimization attempted to compress the APK below 10 MB (down from 28.2 MB to 6.3 MB).
Our deep-dive inspection revealed three fatal root causes:

| Root Cause | Mechanism in Build 7 | Resulting Failure / Crash |
| :--- | :--- | :--- |
| **1. R8 Optimizer & ProGuard Stripping** | Enabled `minifyEnabled true` with `proguard-android-optimize.txt`. | Capacitor Android relies entirely on reflection (`PluginHandle.invoke(methodName, call)`). R8 treats methods not invoked directly from Java as dead code and stripped or inlined them. When JavaScript calls Biometrics, Notifications, Haptics, Status Bar, Updater, or File Export, the native bridge throws `NoSuchMethodException` or crashes. |
| **2. Aggressive Resource Shrinking** | Enabled `shrinkResources true`. | R8 renamed/shrunk drawables and audio files to two-letter stubs (`res/YH.png`, `res/mP.mp3`). Dynamic lookups (`getResources().getIdentifier("notification", "raw", ...)`) return `0`, throwing fatal `Resources$NotFoundException` when triggering sound/visual alerts. |
| **3. TypeScript & Compilation Regressions** | Recent commits added code with type errors in `AdminExpenseDetailModal.tsx`, duplicate methods in `mockStorage.ts`, and untyped tables in `cloudStorageAdapter.ts`. | Vite / TypeScript build fails during standard staging compilation, preventing clean web bundle generation. |

### 2. The Truth About APK Size: Why <10MB Was a Trap
- **Build 5 Baseline**: Size was **14.8 MB** and operated stably.
- **Build 6 Bloat Origin**: Size jumped to **28.2 MB** because `RoomMate-latest.apk` (14.16 MB) was accidentally copied into `public/` and got packaged inside the assets (the APK was carrying a duplicate copy of itself!).
- **True Uncompressed Size**: Once the nested `.apk` is excluded from assets and `logo.png` is optimized, the natural unminified APK size is only **~13.5 - 14.2 MB**.
- **User's Requirement**: App size is allowed up to **20 MB**. 14 MB is comfortably under 20 MB!
- By turning off aggressive R8 bytecode minification and resource shrinking, we eliminate 100% of the native bridge crashes while keeping the APK comfortably at ~13-14 MB.

---

## 🏗️ Technical Architecture & Proposed Changes

### Component 1: Native Android Configuration (`android/app/build.gradle`)
- Revert `minifyEnabled true` to `false`.
- Revert `shrinkResources true` to `false` (or remove).
- Use standard `proguard-android.txt` if needed, with `minifyEnabled false`.
- Keep `aaptOptions.ignoreAssetsPattern` with `:!*.apk` (this maintains the anti-nesting protection that prevents the 14MB duplicate APK leak).
- Keep `android:hardwareAccelerated="true"` in `AndroidManifest.xml` (ensures 60 FPS smooth rendering on budget phones).
- Bump `versionCode` from `7` to `8`.
- Target output: `RoomMate-staging-v1.0.4-build8.apk`.

### Component 2: TypeScript & Web Code Fixes
- **`src/components/admin/pages/AdminExpenseDetailModal.tsx`**:
  - Add missing `RoomMember` type import from `../../../types`.
- **`src/lib/storage/mockStorage.ts`**:
  - Remove duplicate `updateUserRole` method declaration on line 1930.
- **`src/lib/storage/cloudStorageAdapter.ts`**:
  - Cast `supabase.from('platform_settings' as any)` and `supabase.from('support_tickets' as any)` or update Supabase database types to eliminate TypeScript compilation failures.

### Component 3: Build Pipeline & Staging Verification
- Run `npm run prebuild:staging` with dynamic build metadata (`version: 1.0.4`, `build: 8`, `channel: staging`).
- Run `tsc -b` and `vite build --mode staging` to generate verified web assets.
- Run `npx cap sync android` to sync web assets and plugin configurations.
- Build release APK via Gradle: `cd android && ./gradlew assembleRelease`.
- Audit compiled APK size (target: 13.5 – 14.5 MB, strictly < 20 MB).
- Copy verified APK to root as `RoomMate-staging-v1.0.4-build8.apk`.
- Publish corresponding OTA update for channel `staging` so existing installed devices also receive the fixed bundle.

---

## 📋 Task Breakdown & Step-by-Step Plan

### Phase 1: Fix Web TypeScript Errors
- [ ] Fix `RoomMember` import in `src/components/admin/pages/AdminExpenseDetailModal.tsx`.
- [ ] Remove duplicate `updateUserRole` in `src/lib/storage/mockStorage.ts`.
- [ ] Fix Postgrest table type mismatches in `src/lib/storage/cloudStorageAdapter.ts`.
- [ ] Run `npm run build:staging` to verify 0 TypeScript and bundling errors.

### Phase 2: Native Android Gradle Optimization Adjustment
- [ ] Update `android/app/build.gradle`:
  - Bump `versionCode` to `8`.
  - Set `minifyEnabled false` and `shrinkResources false`.
  - Preserve `ignoreAssetsPattern` anti-nesting rule.
- [ ] Synchronize Capacitor: `npx cap sync android`.

### Phase 3: Compilation, Native Audit & Release
- [ ] Compile Release APK: `cd android && ./gradlew assembleRelease`.
- [ ] Verify output APK size: Confirm it is ~13–14 MB (well under 20 MB).
- [ ] Copy `app-release.apk` to project root as `RoomMate-staging-v1.0.4-build8.apk`.
- [ ] Clean up any temporary extracted files in `scratch/`.

### Phase 4: Staging OTA Distribution
- [ ] Publish OTA staging bundle: `node scripts/ota-publish.js --version 1.0.4 --build-number 8 --channel staging`.
- [ ] Verify test suite: `npm run test` and `npm run lint`.

---

## 🛡️ Verification & Test Checklist
1. **Zero TypeScript Errors**: `tsc -b` passes cleanly without type errors.
2. **APK Size**: `RoomMate-staging-v1.0.4-build8.apk` is between 13 MB and 15 MB (< 20 MB target).
3. **No Mangle/Obfuscation of Resources**: Verify `classes.dex` and `res/` preserve valid resource IDs and sounds (`res/raw/notification.mp3` or asset sound).
4. **Capacitor Bridge Integrity**: All native plugins (BiometricAuth, PushNotifications, LocalNotifications, StatusBar, Haptics) retain intact reflection signatures.
