# Project Plan: Student Cloud Sync Sheet & Hidden Developer Hub

## Overview
Replace the technical developer-facing "Supabase Backend Hub" modal on mobile with a consumer-grade, student-friendly **"Cloud Backup & Sync"** bottom sheet (Option A), while preserving the full Supabase migration & RLS inspection hub inside a secret 5-tap **"Developer Tools"** unlock in the Settings tab (Option B).

---

## Phase -1: Context & Problem Check
- **Current State**: Tapping the sync status pill in the mobile header opens `SupabaseSyncModal`, which exposes raw PostgreSQL schemas, RLS policy counts, migration file paths (`supabase/migrations/...`), and Supabase project IDs (`pbzaaskftrmnvocczhat`).
- **Target Audience**: College students splitting rent, groceries, and chai. They find database terminology confusing or alarming.
- **Goal**:
  1. **Students**: Experience peace of mind with a clean, friendly sheet showing "All expenses backed up", "Last synced: Just now", and a simple "Sync Now" button.
  2. **Developers / Evaluators**: Retain instant access to the full Supabase SQL & RLS migration hub via a 5-tap version gesture in Settings.

---

## Phase 0: Architecture & Component Breakdown

### 1. Student-Facing "Cloud Backup & Sync" Sheet (`CloudSyncSheet.tsx`)
- **Location**: `src/components/mobile/CloudSyncSheet.tsx`
- **UI & Experience**:
  - Polished bottom sheet with smooth drag handle and glassmorphism styling.
  - **Status Card**:
    - **Online**: Green check badge, "All Records Secured", "Your expenses and room balances are safely backed up to the cloud."
    - **Offline**: Amber cloud-off badge, "Offline Vault Active", "{N} changes queued to sync when internet returns."
  - **Information Metrics**:
    - "Last Synced" timestamp (e.g. "Just now" or "11:45 AM").
    - Storage summary: "{roomCount} Rooms Secured" and "{expenseCount} Transactions Saved".
    - Connection type: "Live Cloud Connection" vs "Local Offline Storage".
  - **Action Button**:
    - Big primary "Sync Now" button with haptic feedback, triggers cloud sync, and refreshes room ledger state.
  - **Privacy Guarantee**: "🔒 Safe & Private. Room records are automatically kept in sync across all roommates."

### 2. Secret Developer Mode Unlock (`developerMode.ts` & `AboutTab.tsx`)
- **Location**: `src/lib/services/developerMode.ts` & `src/components/mobile/settings/tabs/AboutTab.tsx`
- **Unlock Mechanism**:
  - Standard Android/iOS developer gesture: Tapping the App Version card (`v1.0.4`) 5 times in succession.
  - Haptic feedback on each tap, countdown toast on 3rd & 4th tap ("2 more taps to unlock Developer Mode"), and celebratory toast ("🛠️ Developer Mode Enabled!").
  - Persisted in `localStorage` (`roommate_dev_mode_unlocked`).
- **Developer Hub Access**:
  - In `AboutTab.tsx`, the "Developer & Staging Tools" section becomes visible when unlocked.
  - Features a dedicated button: **"Supabase Backend Hub & SQL Inspector"** with database icon and "10 Tables + RLS" pill.
  - Tapping this button opens the full technical `SupabaseSyncModal` for demoing to evaluators, running migrations, or testing cloud sync seeds.

### 3. Navigation & State Wiring
- **`MobileDashboard.tsx`**: Header pill taps now open `CloudSyncSheet` instead of `SupabaseSyncModal`.
- **`MobileLayout.tsx`**: Passes sync triggers and counts (`isOnline`, `pendingSyncCount`, `onOpenCloudSyncSheet`).
- **`App.tsx`**: Hosts both modals (`CloudSyncSheet` for general users and `SupabaseSyncModal` for developer tools).

---

## Phase 1: Implementation Tasks

### Task 1: Developer Mode Service
- Create `src/lib/services/developerMode.ts` with:
  - `isDeveloperModeEnabled(): boolean`
  - `toggleDeveloperMode(): boolean`
  - `setDeveloperMode(enabled: boolean): void`
  - Tap counter tracker with 2.5-second reset window.

### Task 2: Student-Facing `CloudSyncSheet.tsx`
- Create `src/components/mobile/CloudSyncSheet.tsx`:
  - Accessible, responsive mobile bottom sheet / modal.
  - Displays real-time sync state, offline queue count, and human-readable timestamps.
  - Connects to `syncOfflineQueueToServer` and triggers `onStateSynced`.
  - Rich micro-animations (pulse indicators, spinner on sync).

### Task 3: Settings Developer Tools Integration
- Update `src/components/mobile/settings/tabs/AboutTab.tsx`:
  - Attach 5-tap gesture to the installed app version card.
  - Show "Developer & Staging Tools" when dev mode is active or `import.meta.env.DEV`.
  - Add button to trigger `onOpenSupabaseModal`.
- Update `src/components/mobile/settings/MobileSettings.tsx` to forward `onOpenSupabaseModal`.

### Task 4: Mobile Dashboard & App State Wiring
- Update `src/components/mobile/MobileDashboard.tsx`:
  - Switch sync pill click handler to open the student `CloudSyncSheet`.
- Update `src/App.tsx`:
  - Add state `showCloudSyncSheet`.
  - Render `CloudSyncSheet` with actual user counts and sync handlers.
  - Keep `SupabaseSyncModal` for developer access.

---

## Phase 2: Verification Checklist
- [ ] Tap the cloud/sync pill on mobile dashboard -> Opens `CloudSyncSheet` (no SQL or table jargon).
- [ ] Verify "Sync Now" button successfully pushes pending records and updates the "Last Synced" timestamp.
- [ ] Turn off Wi-Fi/data -> Verify sheet updates to "Offline Vault Active" and displays queued count.
- [ ] Navigate to Settings -> About tab.
- [ ] Tap the App Version card 5 times -> Toast confirms "Developer Mode Enabled".
- [ ] Inspect Developer Tools -> Tap "Supabase Backend Hub" -> Opens full technical migration & RLS modal.
- [ ] Run `npm run build` and unit tests to ensure zero regressions.
