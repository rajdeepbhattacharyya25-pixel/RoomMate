# RoomMate Over-The-Air (OTA) Live In-App Update Guide

This guide explains how to release bug fixes, UI improvements, and new features to RoomMate users **over the internet without requiring them to reinstall the APK or download files from an app store**.

---

## 🏗️ 1. Architecture Overview

```
                          Developer Machine
                                  │
                    1. npm run ota:publish -- -v 1.0.1
                                  │
                                  ▼
                         Supabase Cloud Storage
                      (Bucket: app-updates / Public)
                                  │
             ┌────────────────────┴────────────────────┐
             │                                         │
      STAGING Channel                           PRODUCTION Channel
 (Channel: 'staging' APK)                  (Channel: 'production' APK)
             │                                         │
   2. Your Physical Phone                              │
   - Silent background download                        │
   - SHA-256 checksum verified                         │
   - Applied on next launch                            │
   - You test thoroughly!                              │
             │                                         │
    3. npm run ota:promote                             │
             │                                         │
             └───────────────────► 4. Promoted to Users Fleet
                                      - Zero rebuild (exact zip reused)
                                      - Applied silently on next restart
```

---

## 📋 2. What OTA is Allowed to Update (Critical Boundaries)

Because RoomMate is a Capacitor app, the webview layer (React, CSS, JS, assets) can be updated live over the air. However, changes to the native Android shell **cannot** be updated via OTA.

### ✅ Allowed via Live OTA (No APK Reinstall Needed)
- React UI components, styling, themes, colors, and layout
- Business logic (expense splitting, debt simplification calculations)
- Copy, text, translations, and labels
- API calls, Supabase queries, and client-side validation
- Image assets, icons, and fonts inside `src/` or `public/`
- Bug fixes in JavaScript/TypeScript

### ❌ Prohibited via Live OTA (Requires New APK Release)
- Adding or removing `@capacitor/*` plugins
- Android permissions in `AndroidManifest.xml` (e.g. camera, contacts)
- Android native code (`android/app/src/main/java/...`)
- Gradle dependencies or Gradle plugins
- Native app icons or Android adaptive launcher icons
- Native splash screen background XML files

> [!WARNING]
> **Native Version Guard (`min_native_version`):**
> If an OTA update ever relies on a newly added native plugin that requires APK `1.1.0`, publish the OTA release with `--min-native 1.1.0`. Older installed APKs (`1.0.0`) will automatically skip this OTA update and continue working safely without crashing.

---

## 📱 3. Step-by-Step Release Workflow

### Step 1: Build the Staging APK for Your Phone
Your physical phone should run the **Staging APK** so you can test all live updates before normal users receive them.

In your terminal:
```bash
# 1. Build the web layer with staging mode
npm run build:staging

# 2. Sync into Android project
npx cap sync

# 3. Open in Android Studio & install on your phone
npx cap open android
```
*(In Android Studio, select your connected phone and click "Run").*

---

### Step 2: Make Your Code Changes & Publish to Staging
When you fix a bug or add a new feature:

```bash
npm run ota:publish -- -v 1.0.1 -m "Fixed bill splitting calculation for uneven shares"
```
*What this does automatically:*
1. Compiles your latest React code in staging mode.
2. Compresses `dist/` into a versioned `.zip` file.
3. Computes the cryptographic **SHA-256 Checksum**.
4. Uploads the zip file to Supabase Storage (`app-updates` bucket).
5. Registers the release in the `app_versions` database table marked `is_active = true` for the **staging** channel.

---

### Step 3: Test Thoroughly on Your Physical Phone
1. Open the RoomMate app on your phone.
2. The app will detect the new staging update and quietly download it in the background.
3. Close the app and reopen it (or tap "Restart" on the notification toast).
4. Verify your changes on your phone!

---

### Step 4: Promote to Production (Exact Same Tested Artifact)
Once you are 100% satisfied that your phone tests passed:

```bash
npm run ota:promote
```
*Why this is safe:*
- **Zero rebuilds**: It reuses the exact same uploaded zip file and checksum that you already tested on your phone.
- It prompts for confirmation: `👉 Are you sure you want to promote this release to ALL PRODUCTION users? (y/N)`.
- Upon typing `y`, all production student apps will automatically receive the update on their next launch.

---

## 🚨 4. Emergency Server-Side Rollback

If a serious bug is discovered after promoting to production, you do not need to push a new build. You can instantly revert everyone to a previous version:

```bash
# 1. View recent releases and choose a rollback target
npm run ota:rollback

# Or roll back directly to a specific known version:
npm run ota:rollback -- --to 1.0.0
```
This immediately sets the target release `is_active = true` in Supabase. All apps will seamlessly revert on their next update check.

---

## 🛡️ 5. Automated Crash Rollback

RoomMate includes native crash protection via `@capgo/capacitor-updater`:
- On app launch, `liveUpdater.init()` calls `CapacitorUpdater.notifyAppReady()`.
- If an update has a fatal JavaScript bug that causes the app to crash before React mounts, the native plugin detects that `notifyAppReady()` was never called.
- The plugin **automatically discards the bad bundle** and rolls the phone back to the previously working stable bundle!
