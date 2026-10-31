# Architecture & Implementation Plan: Real-Time Room Ledger Synchronization & FCM Push Integration

**Document ID:** `PLAN-realtime-fcm-sync.md`  
**Status:** Under Socratic Review & Architectural Planning  
**Target Environment:** Isolated Staging (`ycredqiiwdbrjzqeczio`)  
**Production Gate:** `pbzaaskftrmnvocczhat.supabase.co` remains **LOCKED & STRICTLY UNTOUCHED**  
**Estimated Scope:** Multi-client Realtime Synchronization, FCM Push Dispatch, Foreground Audio/Haptics, Delta Ledger Reconciliation  

---

## 1. Executive Summary & Problem Context

In Track 1, we implemented the two-sided **Recipient Settlement Confirmation Workflow & Dispute State Machine** (Pending $\to$ Confirmed / Disputed / Cancelled / Auto-Confirmed). However:
1. **Unilateral UI Staleness:** If Roommate A records, confirms, or disputes a settlement on Phone A, Roommate B's screen on Phone B does not automatically update its authoritative V2 balance or direct payment history unless they manually refresh or re-enter the room.
2. **Missing Push Event Dispatching:** The application possesses an enterprise-grade FCM HTTP v1 dispatch pipeline (`supabase/functions/send-push` & `src/lib/firebase/pushService.ts`), but it is not triggered when bills are added/deleted, settlements are logged, settlements are confirmed/disputed, or members leave.
3. **Double-Counting & Cache Invalidation:** Realtime payloads currently trigger a blanket `fetchCloudDatabaseState()` which re-renders tables, but fails to recompute or invalidate the authoritative V2 financial summary cache (`get_room_financial_summary_v2`), causing a momentary discrepancy between legacy lists and canonical net balances.

Track 2 resolves this by creating a **bidirectional realtime broadcast & push notification engine** that synchronizes state within sub-second latencies and delivers native background notifications.

---

## 2. Architectural Blueprint

```
+---------------------------------------------------------------------------------------+
|                                    ACTOR CLIENT (A)                                   |
|   (Logs Expense / Settles Up / Disputes / Confirms Receipt / Submits Evidence UTR)    |
+---------------------------------------------------------------------------------------+
                                           |
                                           | 1. Executes Secure V2 RPC / Mutation
                                           v
+---------------------------------------------------------------------------------------+
|                                  SUPABASE POSTGRESQL                                  |
|   - Inserts row in shared_expenses / settlement_payments / in_app_notifications       |
|   - Recomputes Authoritative V2 Zero-Sum Net Positions                                |
+---------------------------------------------------------------------------------------+
            |                                                      |
            | 2. Supabase Realtime (CDC Postgres Changes)          | 3. FCM Push Trigger
            |    (Table: shared_expenses, settlements, etc.)       |    (Edge Function: send-push)
            v                                                      v
+-------------------------------------+             +----------------------------------+
|      RECEIVER CLIENT (B)            |             |      FIREBASE CLOUD MESSAGING    |
|  - Realtime Channel Broadcast       |             |  - HTTP v1 Google OAuth2 Auth    |
|  - Delta state patch                |             |  - Native Android/iOS Channels   |
|  - Authoritative V2 re-query        |             |  - Background Push Delivery      |
|  - Haptic feedback & Audio ping     |             |  - Tap Handlers (Deep Links)     |
+-------------------------------------+             +----------------------------------+
```

---

## 3. Global Socratic Gate: Strategic Design Decisions & Trade-Offs

Before writing implementation code, the following **3 strategic architectural choices** must be aligned:

### Question 1: Push Notification Trigger Source — Dual Path vs. Client Dispatch vs. Database Webhook
* **Option A: Dual Dispatch from App Actions (Recommended)**  
  When an action succeeds (e.g. `recordRoomSettlementV2`, `confirmRoomSettlement`, `disputeRoomSettlement`, `addSharedExpense`), the acting client calls `sendRoommatePushEvent()` directly.  
  *Pros:* Reuses the tested `supabase.functions.invoke('send-push')` pipeline; requires zero extra database webhooks; adheres to caller identity checks in `send-push`.  
  *Trade-off:* If client loses connectivity right after the database write, push might be skipped (though in-app notification is already committed in DB).
* **Option B: Database pg_net Webhook Trigger**  
  Postgres triggers automatically call `send-push` via `pg_net.http_post` on row changes.  
  *Pros:* Guaranteed push delivery even if client disconnects abruptly.  
  *Trade-off:* Requires `pg_net` extension enabled on Supabase; service role authentication handling inside SQL triggers; complex debugging.

### Question 2: Realtime Invalidation Strategy — Delta State Patch vs. Selective V2 Re-Query
* **Option A: Coordinated Delta Patch with V2 Re-Query (Recommended)**  
  When a realtime event fires for `settlement_payments` or `shared_expenses`:
  1. Immediately patch the local array in `mockStorage` / `cloudStorageAdapter` with the payload's `new` row.
  2. Invalidate and re-query `financialIntegrationService.fetchRoomFinancialSummaryV2(roomId)`.
  3. Show a subtle top toast: *"Alice confirmed ₹300 settlement"* without freezing or flickering the screen.  
  *Pros:* Instant UI update without blank loading states; zero race conditions with stale cached debts.
* **Option B: Blanket State Reload (`fetchCloudDatabaseState`)**  
  Reload the entire room database state on every event.  
  *Trade-off:* Heavy network payload, flickering scroll position, and re-renders on active input forms.

### Question 3: Foreground Notification UX — Audio/Haptics vs. In-App Banner
* **Option A: Context-Aware In-App Banner + Sound/Haptics (Recommended)**  
  - If user is currently looking at the active room: show a sleek top floating pill (*"New expense: ₹400 for Chai added by Bob"*), play `playNotificationSound()`, and trigger light haptic without a modal interruption.
  - If user is outside the room or app is backgrounded: deliver system tray FCM push notification.
* **Option B: System Push Only**  
  Rely purely on OS notifications. (Suppressed in browser foreground unless customized).

---

## 4. Detailed Component Breakdown

### 4.1 Real-Time Subscriptions Expansion (`src/lib/storage/cloudStorageAdapter.ts`)
* Extend `subscribeToRoomRealtime`:
  - Listen to `UPDATE` and `DELETE` on `settlement_payments` (currently only listens to wildcard, but handlers in `App.tsx` only process `INSERT`).
  - Extract status transitions (`PENDING_CONFIRMATION` $\to$ `CONFIRMED` / `DISPUTED`).
  - Listen to `in_app_notifications` on active room channel for instant badge decrement/increment.

### 4.2 Push Service Taxonomy Expansion (`src/lib/firebase/pushService.ts`)
* Extend `RoommatePushEventType`:
  ```typescript
  export type RoommatePushEventType =
    | 'NEW_SHARED_EXPENSE'
    | 'EXPENSE_UPDATED'
    | 'EXPENSE_DELETED'
    | 'SETTLEMENT_RECORDED'
    | 'SETTLEMENT_CONFIRMED'
    | 'SETTLEMENT_DISPUTED'
    | 'SETTLEMENT_CANCELLED'
    | 'SETTLEMENT_AUTO_CONFIRMED'
    | 'EVIDENCE_SUBMITTED'
    | 'PAYMENT_REMINDER'
    | 'ROOM_INVITATION'
    | 'JOIN_REQUEST'
    | 'JOIN_APPROVED'
    | 'MEMBER_LEFT'
    | 'MEMBER_REMOVED';
  ```
* Map channel IDs appropriately:
  - `SETTLEMENT_CONFIRMED`, `SETTLEMENT_DISPUTED`, `SETTLEMENT_RECORDED`, `EVIDENCE_SUBMITTED` $\to$ `SETTLEMENTS_CHANNEL_ID` (`roommate_settlements_channel`).
  - `NEW_SHARED_EXPENSE`, `EXPENSE_UPDATED`, `EXPENSE_DELETED` $\to$ `EXPENSES_CHANNEL_ID`.
  - `MEMBER_LEFT`, `MEMBER_REMOVED`, `JOIN_APPROVED` $\to$ `REQUESTS_CHANNEL_ID`.

### 4.3 App Event Listeners & State Dispatch (`src/App.tsx`, `RoommateSyncContext.tsx`)
* Wire `App.tsx` realtime room listener to:
  - Detect settlement status updates (e.g. dispute or confirmation) and dispatch `sendLocalSettlementNotification`.
  - Re-trigger `fetchRoomFinancialSummaryV2` and update `dbFinancialSummary`.
  - Pass down realtime confirmation events to mobile and desktop ledger feeds.

### 4.4 Automated Test Suite Plan (`src/test/realtime-fcm/realtimeRoomSync.test.ts`)
* Cover 8 comprehensive test scenarios:
  1. **RT-1: Live Expense Insertion:** Verifies payload triggers subscriber callback and updates member balances.
  2. **RT-2: Settlement Confirmation Sync:** Verifies payee confirming on Client A updates Client B from `PENDING_CONFIRMATION` to `CONFIRMED` without page reload.
  3. **RT-3: Dispute Realtime Reversal:** Verifies payee dispute event restores payer debt in live UI on remote device.
  4. **RT-4: Member Removal / Leave Room Realtime:** Verifies former member status updates immediately on active member screens.
  5. **RT-5: FCM Push Payload Formatting:** Validates payload conforms to FCM HTTP v1 specs (max 100 char title, 500 char body, valid channel IDs).
  6. **RT-6: Push Authorization Scoping:** Ensures push notifications can only be dispatched to co-members of the specified `roomId`.
  7. **RT-7: Foreground Notification Suppression & Audio Haptic Feedback:** Proves foreground sound/toast fires when app is active.
  8. **RT-8: Offline Disconnect & Reconnect Catch-up:** Proves client catches up missing state upon reconnecting to realtime channel.

---

## 5. Security, Privacy & Free-Tier Invariants

1. **Zero Secret / Key Exposure:** Firebase service account credentials remain strictly inside Supabase Edge Function secrets (`FIREBASE_SERVICE_ACCOUNT_KEY`).
2. **PII Scrubbing in Push:** Push payloads never include bank account numbers, passwords, UPI PINs, or private personal vault items. Only display names, sanitized bill titles, and rupee amounts.
3. **Supabase Realtime Free Tier Guard:** Channel subscriptions are cleanly cleaned up on unmount (`channel.unsubscribe()`, `supabase.removeChannel()`) to prevent leaking concurrent WebSocket connections against Supabase's free tier limits.

---

## 6. Implementation Task Matrix

| Step | Component | Action | Verification |
| :--- | :--- | :--- | :--- |
| **2.1** | `src/lib/firebase/pushService.ts` | Add new settlement & room member event types to `RoommatePushEventType` + channel routing | Linter & unit tests |
| **2.2** | `src/lib/storage/cloudStorageAdapter.ts` | Wire push dispatches into `confirmSettlementCloud`, `disputeSettlementCloud`, `cancelSettlementCloud`, `submitSettlementEvidenceCloud`, and `onAddSharedExpense` | Vitest mock asserts |
| **2.3** | `src/App.tsx` | Upgrade `subscribeToRoomRealtime` handler to process settlement updates, dispute pings, and trigger V2 summary re-query | Multi-client simulation |
| **2.4** | `src/context/RoommateSyncContext.tsx` | Add dynamic banner & haptic dispatch for incoming remote room changes | Component mount tests |
| **2.5** | `src/test/realtime-fcm/realtimeRoomSync.test.ts` | Build full 8-scenario test suite | `vitest run` 100% pass |
| **2.6** | Quality Gates & Build Verification | Run `npm run lint`, full `npm test`, and `npm run build:prod` | Zero errors/warnings |

---

## 7. Approval Gate

Please review the proposed plan and answer the **3 Socratic Gate questions** above (or confirm the recommended options):
1. **Push Dispatch:** Dual Dispatch from App Actions (Recommended) vs Database Webhook?
2. **State Sync:** Coordinated Delta Patch with V2 Re-Query (Recommended) vs Blanket Reload?
3. **Foreground UX:** Context-Aware In-App Banner + Sound/Haptics (Recommended) vs System Push Only?

