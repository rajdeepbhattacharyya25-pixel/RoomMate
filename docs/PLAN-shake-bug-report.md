# Project Plan: Instagram-Style Shake-to-Report & SuperAdmin Bug Triage Desk

**File:** `docs/PLAN-shake-bug-report.md`  
**Mode:** PLANNING ONLY  
**Task Slug:** `shake-bug-report`  
**Architecture:** Cross-platform Native Shake Listener + Telemetry Collector + Instagram-Style Bottom Sheet + Supabase Cloud Sync + SuperAdmin Operations Desk

---

## 1. Executive Summary & Goals

### Problem Statement
When mobile residents encounter UI anomalies, calculation mismatches, or payment glitches, reporting them requires high cognitive friction (navigating deeply into settings, sending screenshots manually, or typing repetitive device details). Furthermore, administrators lack a centralized command center to triage, inspect device diagnostics, and resolve reported defects.

### Solution Overview
Implement an **Instagram-style "Shake to Report"** experience across the mobile application:
1. **Device Shake Detection:** Global accelerometer listener (`devicemotion`) tuned with thresholding, debounce cooldown, and haptic feedback.
2. **Context-Aware Telemetry:** Automatically captures the active screen, current resident account details, active room ID, app version/build, network connection status, and device metadata.
3. **Dual Dispatch Channels:**
   - **In-App Cloud Ticket:** Inserts directly into a new Supabase `bug_reports` table (with offline local fallback).
   - **Direct Email Dispatch:** 1-tap "Prefer Email?" button opening the resident's native mail client with a pre-populated subject, admin destination, and diagnostic payload.
4. **SuperAdmin Triage Hub:** Dedicated "Bug Reports" tab in the SuperAdmin Operations Portal with status tracking, severity filters, full telemetry viewer, and email follow-up shortcuts.
5. **Resident Control:** Preference toggle in Settings + modal footer switch to disable shake detection for users who jog or walk with their devices.

---

## 2. Architecture & Data Flow

```
                                [ Physical Mobile Device ]
                                            │
                                  (User Shakes Phone)
                                            │
                                            ▼
                           [ shakeDetector.ts (Accelerometer) ]
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      ▼                                           ▼
          [ Shake Disabled in Settings ]              [ Shake Enabled & Cooled Down ]
                      │                                           │
                  (Ignored)                              (Haptic Impact Buzz)
                                                                  │
                                                                  ▼
                                                  [ captureDiagnosticReport() ]
                                                  • Active Route / Tab
                                                  • Current Resident Info
                                                  • Active Room ID
                                                  • OS / Device / Screen
                                                  • Network & Build Version
                                                                  │
                                                                  ▼
                                                  [ ShakeBugReportModal.tsx ]
                                                  (Instagram-Style Bottom Sheet)
                                                                  │
                                ┌─────────────────────────────────┴─────────────────────────────────┐
                                ▼                                                                   ▼
                     [ 1. In-App Direct Submit ]                                           [ 2. Send via Email ]
                                │                                                                   │
                                ▼                                                                   ▼
                     [ Supabase bug_reports ]                                             [ Native Mail App ]
                    (Offline Local Storage Fallback)                                      (mailto: with diagnostics)
                                │
                                ▼
                   [ SuperAdminPortal: Bug Desk ]
                   • Filter by Severity / Status
                   • Inspect Device & Route Specs
                   • Mark Resolved & Add Admin Notes
                   • One-Click Email Reply to Resident
```

---

## 3. Phase-by-Phase Implementation Roadmap

### Phase 1: Native Shake Detection & Diagnostic Engine
- **Files to Create:**
  - `src/lib/native/shakeDetector.ts` [NEW]:
    - Uses HTML5 `devicemotion` / Capacitor accelerometer events.
    - Calculates linear acceleration vector changes:
      $$\Delta = \frac{|\Delta x| + |\Delta y| + |\Delta z|}{\Delta t} \times 10000$$
    - Threshold sensitivity calibrated to prevent false triggers during walking.
    - 2.5-second debounce cooldown between successive triggers.
    - Safe iOS permission handler (`DeviceMotionEvent.requestPermission`).
    - Respects `localStorage.getItem('roommate_shake_to_report') !== 'false'`.
    - Fires `hapticImpact('heavy')` upon valid shake.
  - `src/lib/services/diagnosticService.ts` [NEW]:
    - Collects runtime environment:
      - `currentRoute`: Active tab ('dashboard' | 'personal' | 'rooms' | 'profile' | 'admin')
      - `resident`: Logged-in resident's ID, Name, Email, Role
      - `activeRoom`: Current active room name & ID
      - `appVersion`: Build version (e.g. `1.0.3-staging`)
      - `network`: Online/offline status, connection type
      - `screen`: Resolution, pixel ratio, viewport dimensions
      - `userAgent`: Browser / WebView platform details
      - `timestamp`: ISO timestamp

---

### Phase 2: Database Schema & Cloud Storage Adapter
- **Files to Create / Modify:**
  - `supabase/migrations/20260914_bug_reports.sql` [NEW]:
    - Table: `public.bug_reports`
      - `id` (uuid, primary key)
      - `user_id` (uuid references profiles or text)
      - `user_name` (text)
      - `user_email` (text)
      - `category` (text: 'EXPENSE_SPLIT' | 'PAYMENT_UPI' | 'ROOM_MANAGEMENT' | 'UI_GLITCH' | 'SYNC_OFFLINE' | 'OTHER')
      - `severity` (text: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
      - `status` (text: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED')
      - `description` (text)
      - `screenshot_url` (text nullable)
      - `diagnostics` (jsonb)
      - `admin_notes` (text nullable)
      - `resolved_at` (timestamptz nullable)
      - `created_at` (timestamptz default now())
      - `updated_at` (timestamptz default now())
    - Indexes on `status`, `severity`, `user_id`, and `created_at`.
    - RLS Policies: Residents can insert; SuperAdmins have full CRUD.
  - `src/types/index.ts` [MODIFY]:
    - Add `BugReport`, `BugCategory`, `BugSeverity`, and `BugStatus` interfaces.
  - `src/lib/storage/cloudStorageAdapter.ts` [MODIFY]:
    - Add `submitBugReportCloud(report: Omit<BugReport, 'id' | 'createdAt' | 'updatedAt'>)`
    - Add `fetchBugReportsCloud(): Promise<BugReport[]>`
    - Add `updateBugReportStatusCloud(id: string, status: BugStatus, notes?: string)`
    - Real-time subscription helper: `subscribeToBugReportsRealtime(callback)`
    - Offline fallback: persists to `roommate_issue_reports` in `localStorage`.

---

### Phase 3: Instagram-Style Bottom Sheet Modal & Settings Integration
- **Files to Create / Modify:**
  - `src/components/mobile/ShakeBugReportModal.tsx` [NEW]:
    - Built using `MobileBottomSheet` with touch-drag dismiss, back button interception, and smooth spring-in animation.
    - **Header:** "Did something go wrong?" with warning badge and quick close.
    - **Form Elements:**
      - Category pill selectors (Expense Split, Payment, UI Glitch, Sync, Other).
      - Severity selector (Low, Medium, High, Critical).
      - Description text area with character counter.
      - Optional screenshot uploader with image preview.
      - Collapsible "Diagnostics Collected" accordion (displays route, OS, app version, connection state).
    - **Dual Action Controls:**
      - **Primary CTA:** "Submit Report" &rarr; sends to Supabase cloud table & shows success checkmark.
      - **Secondary CTA:** "Prefer Email? Open Mail Client" &rarr; generates pre-formatted `mailto:` link with admin recipient and structured diagnostic text.
    - **Footer Switch:** "Shake phone to report bugs" toggle switch.
  - `src/components/mobile/settings/tabs/AppPreferencesTab.tsx` [MODIFY]:
    - Add "Shake to Report" toggle in General Settings.
  - `src/components/mobile/settings/tabs/HelpSupportTab.tsx` [MODIFY]:
    - Add "Report a Bug or Problem" button that opens the same modal manually for users who prefer tapping over shaking.

---

### Phase 4: SuperAdmin Portal — Bug Triage Desk
- **Files to Modify:**
  - `src/components/SuperAdminPortal.tsx` [MODIFY]:
    - Add `Bug Reports` navigation tab with an unread badge indicator: `Bugs (${openBugsCount})`.
    - **Metrics Bar:**
      - Total Reports Received
      - Open Tickets (Awaiting Review)
      - High / Critical Severity Items
      - Resolution Rate (%)
    - **Search & Filters:**
      - Text search by resident name, email, or keywords.
      - Status filter: `All` | `Open` | `Investigating` | `Resolved` | `Closed`.
      - Severity filter: `All` | `Critical` | `High` | `Medium` | `Low`.
    - **Report Inspection Drawer:**
      - Expandable card showing user details (Name, Email, Role, Room).
      - Full JSON diagnostics inspector (Route, App Version, Platform, Screen).
      - Screenshot viewer with full-screen expansion.
      - Status workflow selector: change status with audit timestamp.
      - Internal admin notes field.
      - "Reply to Resident" button opening `mailto:${report.userEmail}` with ticket reference in the subject line.

---

### Phase 5: Global App Integration & Preview Testing
- **Files to Modify:**
  - `src/App.tsx` & `src/components/mobile/MobileLayout.tsx` [MODIFY]:
    - Initialize shake detector on mount when in mobile view.
    - Provide a hidden/developer trigger button in Mobile Preview mode so developers can test the modal on a desktop browser without physical accelerometer hardware.
    - Wire Supabase real-time sync into SuperAdmin portal state.

---

## 4. Verification & Testing Checklist

- [ ] **Physical & Simulated Shake:** Verify accelerometer shake fires in mobile browser and native Android APK.
- [ ] **Accidental Shake Guard:** Verify that small walking motions do not trigger the modal; ensure 2.5-second cooldown prevents spam.
- [ ] **Telemetry Accuracy:** Verify that the modal auto-fills the correct active tab/screen, logged-in resident ID, active room ID, and build version.
- [ ] **In-App Submission:** Verify bug report writes successfully to Supabase `bug_reports` table.
- [ ] **Offline Fallback:** Disable network; verify report saves locally to `localStorage` and alerts the resident.
- [ ] **Direct Mailto Flow:** Tap "Prefer Email?"; verify default email client launches with pre-filled subject, body, and diagnostics.
- [ ] **Disable Setting:** Toggle "Shake to Report" off in modal or settings; verify shaking no longer opens the modal.
- [ ] **SuperAdmin Triage:** Log in as SuperAdmin; verify new report appears in real-time, can be filtered, status can be changed, and "Reply" button opens mailto.
- [ ] **Lint & Build:** Run `npm run lint` (`oxlint`) and `npm run build` to verify zero TypeScript or syntax errors.
