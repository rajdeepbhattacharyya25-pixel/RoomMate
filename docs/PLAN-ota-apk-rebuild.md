# Implementation Plan: Staging APK Rebuild, Dynamic Build Metadata & OTA Verification Suite

Refined plan incorporating all critical architectural controls: dynamic automated build timestamps, strict backend channel isolation, native vs OTA version separation, staging developer diagnostics, a 5-part OTA test suite (including rollback and failure recovery), and safe artifact retention.

---

## 🎯 Architectural Principles & Decisions

### 1. Dynamic Build Metadata Generation (Zero Hardcoding)
- Build date, time, and timestamp will **never** be manually edited.
- A dedicated pre-build script `scripts/generate-build-info.js` runs automatically on `npm run build:staging` and `npm run build:prod`.
- Generates `src/config/buildInfo.ts` before Vite bundles the app:
  ```ts
  export const BUILD_INFO = {
    appName: 'RoomMate',
    version: '1.0.1',
    buildNumber: 2,
    channel: 'staging', // or 'production'
    buildTimestamp: '2026-09-12T15:05:00.000Z',
    buildDate: '12 Sep 2026',
    buildTime: '20:35 IST',
  };
  ```

### 2. Explicit `build_time` vs `published_at` in Supabase Backend
- **`build_time`**: Exact timestamp when the web assets were compiled. Read from `BUILD_INFO.buildTimestamp` by `ota-publish.js` and submitted to Supabase.
- **`published_at`**: Timestamp when the release was registered/activated in Supabase.
- Prevents database time drift between compilation and OTA distribution.

### 3. Clear Canonical APK Naming
- Canonical staging artifact: **`RoomMate-staging-v1.0.1-build2.apk`** in project root.
- Clear identification of channel (`staging`), version (`v1.0.1`), and native build code (`build2`).

### 4. Safe Artifact Retention Sequence
- **Do not delete** the old `RoomMate-debug.apk` immediately.
- Build sequence:
  1. Generate dynamic build metadata
  2. Compile staging web assets (`npm run build:staging`)
  3. Sync Capacitor (`npx cap sync android`)
  4. Compile native APK (`gradlew assembleDebug`)
  5. Validate new APK existence, file size (>10MB), and package structure
  6. Copy to `RoomMate-staging-v1.0.1-build2.apk`
  7. **Only after verification succeeds**, remove legacy `RoomMate-debug.apk`.

### 5. Strict Backend Channel Isolation
- Explicit channel filtering at both database query and RPC level:
  `WHERE channel = :currentAppChannel AND is_active = true`
- Database RPC `public.get_latest_release(p_channel, p_native_version)` guarantees Staging APKs only ever see Staging bundles, and Production APKs only ever see Production bundles.

### 6. Clear Native vs OTA Version Terminology in UI
- In App Settings (`MobileProfile.tsx`):
  - **Installed App**:
    - Native APK: `v1.0.1`
    - Build: `2`
  - **Live Bundle**:
    - Version: `v1.0.1 (Built-in)` or `v1.0.2 (Live OTA)`
    - Status: `Up to date` / `Downloading...` / `Restart ready`
    - Build Date & Time: `12 Sep 2026, 20:35 IST`

### 7. Staging Developer Diagnostic Panel
- When `APP_CHANNEL === 'staging'`, render a dedicated diagnostic panel in `MobileProfile.tsx`:
  - Channel badge: `STAGING` (amber)
  - Native Version & Build: `1.0.1 (Build 2)`
  - Active Bundle Version: `v1.0.1` (`builtin` or bundle ID)
  - Built-in Bundle Date/Time: Formatted timestamp
  - OTA Backend Endpoint: `Connected (Supabase app-updates)`
  - Last Checked: Formatted timestamp
  - Latest Channel Release: Version from backend
  - Live Update Status: Real-time progress / status
  - Controls: `[Check for Updates Now]` and `[Restart Webview]`

---

## 🏗️ Proposed File Changes

### Component 1: Build Automation & Metadata Generation

#### [NEW] [generate-build-info.js](file:///c:/Users/ASUS/Downloads/student%20expense%20app/scripts/generate-build-info.js)
- Reads `package.json` version (`1.0.1`) and `android/app/build.gradle` `versionCode` (`2`).
- Accepts `--channel staging|production` flag.
- Captures current system time (`new Date()`) and formats IST / UTC date strings.
- Writes `src/config/buildInfo.ts` and `dist/build-meta.json`.

#### [NEW] [buildInfo.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/config/buildInfo.ts)
- Generated file exporting typed `BUILD_INFO` constant with app name, version, build number, channel, build timestamp, date, and time.

#### [MODIFY] [package.json](file:///c:/Users/ASUS/Downloads/student%20expense%20app/package.json)
- Update version: `"version": "1.0.1"`.
- Wire automated prebuild scripts:
  - `"prebuild:staging": "node scripts/generate-build-info.js --channel staging"`
  - `"build:staging": "npm run prebuild:staging && tsc -b && vite build --mode staging"`
  - `"cap:build:staging": "npm run build:staging && npx cap sync android"`

#### [MODIFY] [build.gradle](file:///c:/Users/ASUS/Downloads/student%20expense%20app/android/app/build.gradle)
- Update `versionCode 2` and `versionName "1.0.1"`.

---

### Component 2: Mobile UI & Settings Screen

#### [MODIFY] [MobileProfile.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/MobileProfile.tsx)
- Add **"App Information & Live Updates"** card:
  - Header: App Name ("RoomMate") with Channel Tag (`STAGING` / `PRODUCTION`).
  - Native APK section: `v1.0.1 (Build 2)`.
  - Live Bundle section: `v1.0.1 (Built-in)` or `v1.0.x (Live OTA)`.
  - Actual Build Date & Time from `BUILD_INFO`.
  - Staging Diagnostic Box (visible in staging builds):
    - Supabase OTA endpoint health
    - Last check timestamp
    - Current vs remote release
    - Live updater state (idle, checking, downloading %, ready)
  - Action buttons: "Check for Updates" (with spinner & haptics) and "Restart App" when staged.

#### [MODIFY] [updater.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/services/updater.ts)
- Import `BUILD_INFO`.
- Add `lastCheckedAt: string | null` to `UpdateState`.
- Update bundle version matching:
  ```ts
  const activeVersion = current?.bundle?.version || current?.bundle?.id || 'builtin';
  const isAlreadyCurrent = activeVersion === release.version || 
    (activeVersion === 'builtin' && BUILD_INFO.version === release.version);
  ```
- Strictly query by channel:
  `.eq('channel', this.state.channel).eq('is_active', true)`.

---

### Component 3: Supabase Backend & Release Script

#### [NEW] [20260912_app_versions_add_name_metadata.sql](file:///c:/Users/ASUS/Downloads/student%20expense%20app/supabase/migrations/20260912_app_versions_add_name_metadata.sql)
- Add `app_name text not null default 'RoomMate'`.
- Add `build_time timestamptz default now()`.
- Update `public.manage_ota_release` RPC to accept `p_app_name` and `p_build_time`.
- Add secure function `public.get_latest_release(p_channel text, p_min_native text)`.

#### [MODIFY] [supabase.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/types/supabase.ts)
- Update TypeScript types for `app_versions` with `app_name` and `build_time`.

#### [MODIFY] [ota-publish.js](file:///c:/Users/ASUS/Downloads/student%20expense%20app/scripts/ota-publish.js)
- Read `buildTimestamp` from `BUILD_INFO` or `dist/build-meta.json`.
- Pass `p_app_name: 'RoomMate'` and `p_build_time: buildInfo.buildTimestamp` to `manage_ota_release`.

---

### Component 4: Build Execution & Artifact Management

1. Run `npm run cap:build:staging` (generates fresh metadata + compiles staging web bundle + syncs Capacitor).
2. Run `.\gradlew assembleDebug` inside `./android`.
3. Verify `android/app/build/outputs/apk/debug/app-debug.apk` exists and exceeds 10MB.
4. Copy to `RoomMate-staging-v1.0.1-build2.apk` in project root.
5. Register baseline release `1.0.1` in Supabase `app_versions` with `app_name: 'RoomMate'`, `version: '1.0.1'`, `channel: 'staging'`, and actual `build_time`.
6. Safely remove old `RoomMate-debug.apk`.

---

## 🧪 Comprehensive Verification Suite

### Phase 1: Compilation & Artifact Safety
- [ ] Verify `scripts/generate-build-info.js` outputs dynamic timestamp.
- [ ] Verify `tsc -b && vite build --mode staging` succeeds with zero errors.
- [ ] Verify `npx cap sync android` syncs bundle into Android assets.
- [ ] Verify Gradle build generates `app-debug.apk`.
- [ ] Verify output file `RoomMate-staging-v1.0.1-build2.apk` exists and has valid size.
- [ ] Verify old APK is only deleted after new APK is validated.

### Phase 2: Supabase Backend Verification
- [ ] Run migration via Supabase MCP to add `app_name` and `build_time`.
- [ ] Query `app_versions` to confirm `app_name: 'RoomMate'`, `build_time`, `version: '1.0.1'`, and `channel: 'staging'`.

### Phase 3: 5-Part Real OTA Test Matrix
- [ ] **Test A — No Update / Idempotency**:
  App with v1.0.1 checks OTA against backend v1.0.1. Verifies that `isAlreadyCurrent` evaluates to true and **no download** is triggered.
- [ ] **Test B — Live Staging OTA Update**:
  Publish v1.0.2 to staging (`npm run ota:publish -- -v 1.0.2`). App detects update, downloads zip, verifies SHA-256, stages next bundle, and upon restart displays `v1.0.2 (Live OTA)`.
- [ ] **Test C — Interrupted Download Recovery**:
  Simulate app termination during download. Verify that on next launch, updater state resets cleanly to idle without corrupted bundle states.
- [ ] **Test D — Backend Offline / Unavailable Fallback**:
  Simulate network failure or missing release record. Verify the app boots cleanly and continues running the local bundle without disruption.
- [ ] **Test E — Channel Isolation Guarantee**:
  Query backend with `channel = 'production'`. Verify staging release `1.0.2` is never returned to a production query.
