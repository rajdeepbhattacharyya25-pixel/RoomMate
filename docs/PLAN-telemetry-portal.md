# Project Plan: Hybrid Telemetry Integration (Option A + Option C)

## Overview
Bridge PostHog product analytics and Firebase Crashlytics crash telemetry directly into the RoomMate SuperAdmin portal. Deliver immediate deep-link navigation and embedded telemetry (Option A), followed by real-time incident alerting via a Supabase webhook ingestion pipeline (Option C).

---

## Architecture Flow

```
+------------------------------------------------------------------------------------+
|                               RoomMate User Clients                                |
|  Web Browsers & Android Native APK (Capacitor)                                     |
|  - PostHog SDK: captures events, screen views, funnel transitions                  |
|  - Crashlytics SDK: captures unhandled exceptions, non-fatal anomalies, crumbs     |
+-------------------------+--------------------------------+-------------------------+
                          |                                |
                          v                                v
        +----------------------------------+ +----------------------------------+
        |          PostHog Cloud           | |        Firebase / GCP            |
        |  - Ingestion (us.i.posthog.com)  | |  - Native Crash Dumps            |
        |  - Session Replays & Funnels     | |  - Non-Fatal Exceptions          |
        |  - Retention & Feature Trends    | |  - Crash-Free User %             |
        +-----------------+----------------+ +-----------------+----------------+
                          |                                    |
                          | (Option A: Direct Links & Embeds)  |
                          v                                    v
+------------------------------------------------------------------------------------+
|                         RoomMate SuperAdmin Portal                                 |
|                                                                                    |
|  1. AdminAnalytics.tsx                                                             |
|     - Telemetry status & host connectivity check                                  |
|     - Deep-link launchers: "Open PostHog Insights", "View Session Replays"         |
|     - Event taxonomy monitor (Auth, Rooms, Shared Ledger, UPI)                     |
|     - Optional embedded dashboard iframe toggle                                    |
|                                                                                    |
|  2. AdminSystemHealth.tsx                                                          |
|     - Native App Stability card (Crash-Free %, Android OS breakdown)               |
|     - Firebase Crashlytics console quick launcher                                 |
|     - Live System Incidents table with filter & resolution controls                |
+------------------------------------------------------------------------------------+
                                          ^
                                          | Realtime Sync
                                          |
                      +---------------------------------------+
                      |         Supabase Database             |
                      |  Table: system_incidents (Migrated)   |
                      +-------------------+-------------------+
                                          ^
                                          | (Option C: Webhook Alert Sync)
                      +---------------------------------------+
                      |    Supabase Edge Function             |
                      |    /telemetry-webhook                 |
                      |    - Verifies webhook signatures      |
                      |    - Ingests Crashlytics velocity     |
                      |    - Upserts high-severity incidents  |
                      +-------------------+-------------------+
                                          |
                        [Firebase Alert / PostHog Alert]
```

---

## Phase Breakdown

### Phase 1: Telemetry Configuration & Deep-Link Utility
- **Deliverable:** `src/lib/analytics/telemetryConfig.ts`
- **Objective:** Provide a single source of truth for PostHog and Firebase project references, console deep links, and fallback behavior.
- **Key Tasks:**
  - Read `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_PROJECT_ID`, and `VITE_FIREBASE_PROJECT_ID` from `import.meta.env`.
  - Export structured URL generators:
    - `getPostHogDashboardUrl()`
    - `getPostHogSessionReplaysUrl()`
    - `getPostHogEventsUrl(filter?: string)`
    - `getFirebaseCrashlyticsUrl()`
  - Export connection status inspector (`isPostHogConfigured()`, `isCrashlyticsConfigured()`).

### Phase 2: Immediate Win (Option A) — Superadmin Analytics Portal
- **File:** `src/components/admin/pages/AdminAnalytics.tsx`
- **Key Tasks:**
  - Add a **Product Analytics & Telemetry Hub** section:
    - Header quick action buttons: "Launch PostHog Insights", "View Session Recordings", "Live Events Stream".
    - Telemetry status badge: Displays whether client analytics is running in live cloud mode or mock fallback mode.
    - Privacy compliance confirmation: Confirms financial amounts, UPI IDs, and passwords are sanitized before dispatch.
    - Event Taxonomy monitor: Interactive checklist displaying the 5 core tracking categories (`AUTH`, `ROOM`, `EXPENSE`, `SETTLEMENT`, `PAYMENT`) with 1-click deep links to PostHog queries.
  - Embedded Dashboard toggle:
    - Allows the superadmin to toggle between the internal ledger charts and an embedded PostHog shared dashboard iframe (when configured via `VITE_POSTHOG_EMBED_DASHBOARD_URL`).
    - Graceful empty state with setup instructions if the embed URL is not yet configured.

### Phase 3: Immediate Win (Option A) — Superadmin System Health Portal
- **File:** `src/components/admin/pages/AdminSystemHealth.tsx`
- **Key Tasks:**
  - Add native telemetry services to the **Infrastructure Services Grid**:
    - Add **Firebase Crashlytics (Capacitor Android)**: Uptime, operational status, target 99.5%+ crash-free benchmark, latency, and deep-link to Google Console.
    - Add **PostHog Ingestion Engine**: Status, host URL, telemetry latency.
  - Add a dedicated **Native Mobile App Stability & Diagnostics** card:
    - Crash-Free Users KPI (target: >99.5%).
    - Crash-Free Sessions KPI (target: >99.9%).
    - Non-fatal exception monitor (vault crypto anomalies, sync timeouts, auth errors captured by `crashService.ts`).
    - Handset OS distribution breakdown (Android 12 / 13 / 14 / 15).
    - Quick Action: "Open Firebase Crashlytics Console" button.

### Phase 4: Follow-up (Option C) — Supabase System Incidents Table & Webhook Ingestion
- **Database Migration:** `supabase/migrations/20260918_system_incidents.sql`
  - Create table `public.system_incidents`:
    - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
    - `service TEXT NOT NULL` ('Application', 'Database', 'Authentication', 'API', 'Notifications', 'Crashlytics', 'PostHog')
    - `error TEXT NOT NULL`
    - `severity TEXT NOT NULL` ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    - `status TEXT NOT NULL` ('OPERATIONAL', 'INVESTIGATING', 'MONITORING', 'RESOLVED')
    - `occurrences INT DEFAULT 1`
    - `details JSONB`
    - `created_at TIMESTAMPTZ DEFAULT now()`
    - `resolved_at TIMESTAMPTZ`
  - Set up Row-Level Security (RLS) policies allowing `superadmin` to read and update, and service role to insert.
  - Enable Realtime publication on `system_incidents`.
- **Supabase Cloud Adapter:** `src/lib/storage/cloudStorageAdapter.ts`
  - Implement `fetchSystemIncidentsCloud()`, `resolveSystemIncidentCloud(id)`, and Realtime channel subscription so new webhook-pushed incidents display dynamically without reloading.
- **Supabase Edge Function:** `supabase/functions/telemetry-webhook/index.ts`
  - Receives alerts from Firebase Crashlytics velocity alerts or PostHog webhooks.
  - Verifies `Authorization: Bearer <TELEMETRY_WEBHOOK_SECRET>`.
  - Normalizes and upserts incidents into `public.system_incidents`.

### Phase 5: Testing, Linting & Build Verification
- Unit test coverage in `src/lib/analytics/telemetryConfig.test.ts`.
- Verify TypeScript compilation: `npx tsc --noEmit`.
- Run full test suite: `npm run test`.
- Verify production build bundle: `npm run build`.

---

## Verification Checklist
- [ ] `src/lib/analytics/telemetryConfig.ts` provides robust URL generation and fallback modes.
- [ ] `AdminAnalytics.tsx` contains direct launcher buttons, event taxonomy drill-downs, and embed toggle.
- [ ] `AdminSystemHealth.tsx` contains Native App Stability metrics and Crashlytics console launch button.
- [ ] Database migration file created for `system_incidents` with proper RLS policies.
- [ ] Edge function webhook receiver drafted with signature authentication.
- [ ] All unit tests pass: `npm run test`.
- [ ] Lint pass: `npm run lint`.
- [ ] Build pass: `npm run build`.
