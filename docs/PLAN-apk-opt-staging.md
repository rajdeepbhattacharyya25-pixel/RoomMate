# Implementation Plan: Staging APK Deep Optimization & Budget Mobile Polish

Comprehensive architectural plan to slash the RoomMate Staging APK from **28.2 MB down to ~7–9 MB** (surpassing the <20MB target), optimize WebView GPU compositing so budget/older Android smartphones run smoothly at 60 FPS without lag, and pass the verified build (`v1.0.4-build7`) to the staging channel and Supabase OTA distribution.

---

## 🎯 Context & Root Cause Analysis

### 1. APK Size Explosion Breakdown
- **Root Cause (The 14MB Leak)**: `RoomMate-latest.apk` (14.16 MB uncompressed) was placed in `public/` for web desktop download links. During `npm run build:staging`, Vite copied the APK to `dist/`, and `npx cap sync android` copied it into `android/app/src/main/assets/public/RoomMate-latest.apk`. The Android APK was packaging a complete copy of itself inside itself!
- **Unminified DEX Bytecode (~10 MB)**: `android/app/build.gradle` had `minifyEnabled false`. AndroidX, Firebase, Apache, and Capacitor plugins were bundled with full unstripped classes.
- **Uncompressed Raster Assets**: `public/logo.png` is **883 KB** (almost 1 MB for a single emblem!). On low-RAM devices (2GB RAM), uncompressed texture decoding causes memory thrashing and garbage collection spikes.

### 2. Low-End Smartphone Performance Bottlenecks
- **CSS Backdrop Blurs**: Heavy `backdrop-filter: blur(16px)` and `blur(20px)` on cards force low-end mobile GPUs (Adreno 300/500, Mali-400/T720) to allocate multiple offscreen render buffers, causing frame drops during scroll (15–20 FPS).
- **Missing Hardware Acceleration Declaration**: `AndroidManifest.xml` lacked explicit `android:hardwareAccelerated="true"` on the `<application>` and `<activity>` tags.

---

## 🏗️ Technical Architecture & Version Strategy

1. **Version & Build Increment**:
   - **Version**: `1.0.4`
   - **Native Build Number (`versionCode`)**: Bump from `6` to `7`.
   - **Target Staging APK**: `RoomMate-staging-v1.0.4-build7.apk` (retained in project root).
   - **Safety Retention**: Keep `build5` and `build6` as historical baselines.

2. **Asset Decoupling & AAPT Anti-Nesting Shield**:
   - Permanently remove `RoomMate-latest.apk` from `public/` and `android/app/src/main/assets/public/`.
   - Update `handleDownloadApk` in `DesktopLandingPage.tsx` to serve the APK via direct public Supabase Storage URL (`/storage/v1/object/public/app-updates/staging/RoomMate-staging-latest.apk`).
   - Add `:!*.apk` to `aaptOptions.ignoreAssetsPattern` in `android/app/build.gradle` to guarantee no APK can ever be bundled inside an APK.

3. **Native Code & Resource Shrinking (R8 / ProGuard)**:
   - Configure `signingConfig signingConfigs.debug` on the release/staging build type so optimized APKs can be directly installed on physical test devices without signature rejection.
   - Enable `minifyEnabled true` and `shrinkResources true`.
   - Add robust keep-rules in `android/app/proguard-rules.pro` for Capacitor Bridge, `@aparajita/capacitor-biometric-auth`, `@capacitor/push-notifications`, Firebase, and `@capgo/capacitor-updater`.

4. **Asset & Memory Optimization**:
   - Losslessly compress and resize `logo.png` (from 883 KB to ~45 KB) preserving 1:1 crisp display at all densities.
   - Add `android:hardwareAccelerated="true"` to `AndroidManifest.xml`.
   - Add mobile-optimized backdrop-filter CSS rule in `src/index.css` (reduce blur radius to 6–8px with solid fallback on low-power devices).

5. **Double-Staging Distribution**:
   - **Native APK**: Place `RoomMate-staging-v1.0.4-build7.apk` in project root.
   - **OTA Staging Channel**: Package and upload staging OTA update zip to Supabase Storage `app-updates/` and register version in `app_versions` for channel `staging`.

---

## 📋 Task Breakdown & Implementation Steps

### Phase 1: Asset Pipeline Clean-Up & Anti-Nesting Armor
- [ ] Remove `public/RoomMate-latest.apk` and `android/app/src/main/assets/public/RoomMate-latest.apk`.
- [ ] Update `android/app/build.gradle`:
  - Add `:!*.apk` to `aaptOptions.ignoreAssetsPattern`.
- [ ] Update `src/components/desktop/DesktopLandingPage.tsx`:
  - Point `handleDownloadApk` to Supabase Storage public staging release URL or dynamic resolver.

### Phase 2: ProGuard / R8 Native Optimization
- [ ] Update `android/app/proguard-rules.pro`:
  - Add keep-rules for Capacitor plugins, Biometric Auth, Local/Push Notifications, and Updater.
- [ ] Update `android/app/build.gradle`:
  - Configure `release` build type with `signingConfig signingConfigs.debug`, `minifyEnabled true`, and `shrinkResources true`.
  - Bump `versionCode` to `7`.

### Phase 3: Budget Phone Fluidity & GPU Acceleration
- [ ] Update `android/app/src/main/AndroidManifest.xml`:
  - Add `android:hardwareAccelerated="true"` to `<application>` and `<activity>`.
- [ ] Optimize `public/logo.png`:
  - Compress logo from 883 KB to high-efficiency PNG/WebP (~40–60 KB).
- [ ] Update `src/index.css`:
  - Add lightweight mobile GPU fallbacks for `glass-card` and `glass-panel` to ensure smooth 60 FPS scrolling on budget devices.

### Phase 4: Dynamic Build Metadata & Web Staging Compilation
- [ ] Bump `android/app/build.gradle` `versionCode 7` and verify `package.json` `"version": "1.0.4"`.
- [ ] Execute `node scripts/generate-build-info.js --channel staging --version 1.0.4 --build-number 7`.
- [ ] Run `npm run build:staging` and `npx cap sync android`.
- [ ] Verify `android/app/src/main/assets/public/` contains zero `.apk` files and optimized logo size.

### Phase 5: Native Compilation & Size Audit
- [ ] Compile release APK: `cd android && ./gradlew assembleRelease`.
- [ ] Audit output APK `android/app/build/outputs/apk/release/app-release.apk`:
  - Verify size is under 20 MB (target: ~7–9 MB).
- [ ] Copy output to project root as `RoomMate-staging-v1.0.4-build7.apk`.

### Phase 6: Staging Deployment & OTA Distribution
- [ ] Publish OTA release to Supabase Staging channel:
  ```bash
  node scripts/ota-publish.js --version 1.0.4 --build-number 7 --channel staging --min-native 1.0.1 -m "Staging v1.0.4 build 7: Deep size optimization (<10MB), R8 shrinking, budget device 60fps GPU acceleration"
  ```
- [ ] Run `node scripts/verify-ota-matrix.js` to verify staging channel isolation and download availability.
- [ ] Run test suite (`npm run test`) and linter (`npm run lint`) to confirm 100% test pass.

---

## 🛡️ Verification & Rollback Strategy

- **Size Gate**: If compiled APK exceeds 20 MB, build fails the staging criteria.
- **Biometric & Plugin Smoke Test**: Verify that R8 ProGuard keep-rules did not strip native Capacitor bridge interfaces.
- **Rollback**: Previous builds (`build5` at 14.8 MB and `build6` at 28.2 MB) remain available in root. Supabase OTA rollback can be executed instantly via `npm run ota:rollback -- --to 1.0.4`.
