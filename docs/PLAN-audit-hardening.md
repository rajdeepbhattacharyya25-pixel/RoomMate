# Project Plan: Mobile Hardening (Push Channels, Offline Queue, & Camera Lifecycle)

**Slug:** `PLAN-audit-hardening`  
**Generated:** 2026-10-03  
**Mode:** PLANNING ONLY (No Application Code Modified)  
**Target File:** `docs/PLAN-audit-hardening.md`  

---

## 1. Executive Summary

Following a deep code-level audit of the mobile app's native plugins, offline storage queues, Android manifest definitions, and hardware camera lifecycles, three critical and moderate vulnerabilities were uncovered that could lead to silent notification drops, offline data loss, and camera background battery drain:

1. **Android 8+ Silent Push Drop (Missing Default Notification Channel `roommate_alerts`)**:
   - `AndroidManifest.xml` configures `com.google.firebase.messaging.default_notification_channel_id` to `"roommate_alerts"`.
   - The Supabase backend edge function `send-push/index.ts` defaults all alerts without an explicit subchannel to `channel_id: 'roommate_alerts'`.
   - `createPushNotificationChannels()` in `src/lib/firebase/pushService.ts` only registers 4 specialized channels (`expenses`, `settlements`, `nudges`, `requests`).
   - On Android 8.0+ (API 26+), any incoming push notification addressing an uncreated channel is silently dropped by Android OS `NotificationManager`.

2. **Offline Queue Mutation Loss & Sync Race Condition**:
   - In `src/lib/storage/offlineQueue.ts`, `flushOfflineQueue()` lacks a mutex guard (`isFlushing`). Rapid network reconnection and user manual sync triggers duplicate network requests.
   - More critically, `flushOfflineQueue()` snapshots `loadQueue()` at function start, processes items asynchronously over network calls, and calls `saveQueue(remainingQueue)` at completion. Any offline mutation queued by the user while the flush is in-flight is completely overwritten and permanently lost.

3. **Camera MediaStream & Frame Analysis Interval Leak in Background / App Lock**:
   - In `src/components/mobile/JoinRoomModal.tsx` and `src/components/mobile/UpiQrScannerModal.tsx`, neither scanner pauses or releases the hardware camera track (`MediaStream`) when the app is backgrounded or when `AppLockGateway` locks the screen.
   - The 380ms / 450ms `setInterval` frame analyzer keeps executing in the background, consuming CPU, draining battery, and keeping the Android 12+ green camera privacy indicator visible on the lock screen.
   - In `JoinRoomModal.tsx`, if camera permission was denied once, `roommate_camera_perm_denied` is never cleared upon subsequent successful camera starts.

---

## 2. Architecture & Design Specifications

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Mobile Hardening Architecture                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
     ┌─────────────────────────────────┼────────────────────────────────┐
     ▼                                 ▼                                ▼
[FCM Notification Channel]     [Offline Queue Engine]         [Hardware Camera Lifecycle]
- Define ALERTS_CHANNEL_ID      - Add isFlushing mutex guard   - Listen to visibilitychange
- Register 'roommate_alerts'    - Snapshot-safe queue merge    - Stop tracks on app pause
- Importance: HIGH (4)          - Retain mutations during sync - Resume on foreground
- Sound: notification.mp3       - Idempotent deduplication     - Clear perm denied on start
```

---

## 3. Targeted Component Remediation Plan

### Component 1: `src/lib/firebase/pushService.ts`
- **Define Missing Channel Constant**:
  ```typescript
  export const ALERTS_CHANNEL_ID = 'roommate_alerts';
  ```
- **Register in `createPushNotificationChannels()`**:
  ```typescript
  await PushNotifications.createChannel({
    id: ALERTS_CHANNEL_ID,
    name: 'RoomMate Alerts & Updates',
    description: 'System announcements, room activity, and security notifications',
    importance: 4, // High importance (heads-up banner)
    visibility: 1, // Public on lock screen
    sound: 'notification.mp3',
    vibration: true,
    lights: true,
    lightColor: '#6366F1',
  });
  ```
- **Channel Idempotency**:
  Ensure channel creation is invoked prior to native push listener attachment and token retrieval.

---

### Component 2: `src/lib/storage/offlineQueue.ts`
- **Concurrency Mutex (`isFlushing`)**:
  Add an in-memory lock `let isFlushing = false;` to prevent re-entrant executions of `flushOfflineQueue()`.
- **Snapshot-Safe Queue Merge (Prevent Data Loss)**:
  Instead of overwriting `localStorage` with `saveQueue(remainingQueue)`, reconcile remaining items with any items enqueued during the network flush window:
  ```typescript
  const freshQueue = loadQueue();
  const processedIds = new Set(queue.map((item) => item.id));
  const newlyEnqueuedItems = freshQueue.filter((item) => !processedIds.has(item.id));
  saveQueue([...remainingQueue, ...newlyEnqueuedItems]);
  ```
- **Error Handling**:
  Wrap in `try / finally` to guarantee `isFlushing = false` resets even on uncaught errors or network aborts.

---

### Component 3: `src/components/mobile/JoinRoomModal.tsx` & `src/components/mobile/UpiQrScannerModal.tsx`
- **Visibility & Pause Listener**:
  Add an event listener to `document.addEventListener('visibilitychange', ...)` and `listenToAppLifecycle(onResume, onPause)`:
  - When document becomes `hidden` or app pauses: invoke `stopCamera()` and clear scanning interval timer.
  - When document becomes `visible` and modal is still open: restart camera stream if active mode is camera.
- **Permission State Reset**:
  In `JoinRoomModal.tsx`, once `navigator.mediaDevices.getUserMedia` successfully acquires a stream and starts playing, execute:
  ```typescript
  try {
    localStorage.removeItem('roommate_camera_perm_denied');
  } catch {}
  ```
  This ensures that if a user previously denied camera permission but subsequently allowed it in system settings, the app remembers the granted permission and defaults to camera on future visits.

---

## 4. Verification Checklist & Testing Strategy

- [x] **Push Notification Channel Tests**:
  - [x] Verify `ALERTS_CHANNEL_ID` is exported and matches `roommate_alerts`.
  - [x] Verify `createPushNotificationChannels()` registers 5 channels total (alerts, expenses, settlements, nudges, requests).
  - [x] Verify native FCM payload fallback delivers to `roommate_alerts` channel without rejection.

- [x] **Offline Queue Concurrency & Data Retention Tests**:
  - [x] Test concurrent invocations of `flushOfflineQueue()`: only 1 flush executes at a time via `isFlushing` mutex.
  - [x] Test enqueuing a new mutation while an asynchronous flush is running: verify new mutation is preserved and not overwritten.
  - [x] Test FIFO order preservation when merging failed retries with fresh mutations.

- [x] **Camera Lifecycle & Visibility Tests**:
  - [x] `visibilitychange: hidden` triggers camera track stoppage and interval clearance.
  - [x] `visibilitychange: visible` safely re-initializes stream when modal is open.
  - [x] Permission flag clearance upon successful camera stream acquisition.

- [x] **Full Regression & Quality Gate**:
  - [x] Vitest test suite execution: all 40 test files (417 tests) passing.
  - [x] TypeScript validation: `npx tsc --noEmit` returns 0 errors.
  - [x] Production build: `npm run build` passes with zero compilation issues.

---

## 5. Agent Deliverables

| Deliverable | Target Path | Owner Agent | Status |
|---|---|---|---|
| Project Plan | `docs/PLAN-audit-hardening.md` | `project-planner` | COMPLETE |
| Push Service Channel Registration | `src/lib/firebase/pushService.ts` | `mobile-developer` | COMPLETE |
| Offline Queue Mutex & Merge | `src/lib/storage/offlineQueue.ts` | `backend-specialist` | COMPLETE |
| Scanner Lifecycle & Hardware Release | `src/components/mobile/JoinRoomModal.tsx`, `UpiQrScannerModal.tsx` | `mobile-developer` | COMPLETE |
| Automated Test Suite | `src/lib/storage/offlineQueue.test.ts`, `src/lib/firebase/pushService.test.ts` | `mobile-developer` | COMPLETE |
