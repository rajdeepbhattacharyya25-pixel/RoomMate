# Project Plan: Fix Mobile In-App Notification Center & Mark All Read

**File:** `docs/PLAN-notification-fix.md`  
**Mode:** PLANNING ONLY (No Code Modification)  
**Task Slug:** `notification-fix`  
**Target:** Fix the non-functional "Mark all read" button, optimize notification state management, fix action button interactions, and elevate the touch/swipe UX in RoomMate mobile.

---

## 1. Problem Statement & Root Cause Analysis

### 🔴 Problem 1: "Mark all read" Button Does Nothing (Primary Bug)
- **Root Cause A (User ID Mismatch in State Mapping):**  
  In `src/App.tsx`, `handleMarkAllNotificationsRead` executes:
  ```typescript
  const handleMarkAllNotificationsRead = async () => {
    await markAllNotificationsReadCloud(currentUser.id);
    setDbState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) =>
        n.userId === currentUser.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ),
    }));
  };
  ```
  When the resident signs in (via Google OAuth, phone, or custom auth), their `currentUser.id` is their authentication UUID or generated ID. However, the notifications in `dbState.notifications` may have `userId: 'usr-rajdeep-1'` (seed/staging accounts) or differ from `currentUser.id`.  
  Because `n.userId === currentUser.id` evaluates to `false`, `(prev.notifications || []).map(...)` returns every notification completely untouched! The 2 unread notifications and the blue dots remain.
- **Root Cause B (Blocking Async Await & Unhandled Rejection):**  
  `await markAllNotificationsReadCloud(currentUser.id)` executes **before** `setDbState`. If Supabase is offline, rate-limited, unauthenticated, or throws an error, the uncaught promise rejection crashes the function before `setDbState` ever runs.
- **Root Cause C (No Notification IDs Passed from Drawer):**  
  `NotificationCenterDrawer` has direct knowledge of all currently rendered unread notifications (`activeNotifications.filter(n => !n.isRead)`), but calls `onMarkAllRead()` with zero arguments, forcing the parent to guess which notifications to mark read based solely on a fragile `currentUser.id` comparison.
- **Root Cause D (Storage Adapter Filtering):**  
  Both `db.markAllNotificationsRead(userId)` and `markAllNotificationsReadCloud(userId)` only update rows where `n.userId === userId`. If `userId` differs, neither the local database nor Supabase is updated.

---

### 🔴 Problem 2: Secondary Functional Bugs in Notification Section
1. **"Clear Read Notifications" Fails Silently:**  
   In the 3-dots overflow menu, "Clear read notifications" calls `handleClearReadNotifications` in `App.tsx`, which uses the exact same failing `n.userId === currentUser.id && n.isRead` filter without optimistic updates.
2. **Action Buttons ("Settle Now", "View Expense") Do Not Mark Read:**  
   When a user taps "Settle Now" on an urgent electricity bill card or "View Expense", the drawer closes and routes them, but leaves the notification marked **unread** with a blue dot and persistent bell badge. Tapping a notification's primary action must automatically mark it as read.
3. **Overly Strict Swipe Threshold (130px):**  
   `NotificationCard.tsx` has `AUTO_TRIGGER_THRESHOLD = 130` px. On standard 360px–390px mobile screens, 130px requires dragging across ~35% of the screen. Natural thumb swipes (60–80px) snap back without triggering delete or toggle read, making users feel gestures are broken.
4. **Desktop/Simulator Mouse Swipe Unsupported:**  
   `NotificationCard.tsx` only registers `onTouchStart`/`onTouchMove`/`onTouchEnd`. Mouse drag on desktop simulator preview does not work.
5. **Notification User Scoping in App.tsx:**  
   In `App.tsx`, `notifications={dbState.notifications || []}` passes the entire database notification list without checking if they belong to `currentUser`. Scoping should ensure users only receive notifications intended for them (while preserving backwards compatibility for demo/seed data).

---

## 2. Solution Architecture & Changes

```
┌─────────────────────────────────────────────────────────────┐
│                 NotificationCenterDrawer                     │
│                                                             │
│  [Mark all read] ──► Instant Optimistic Local Read State   │
│                      + Haptic Success                        │
│                      + Passes active unread IDs to parent   │
└──────────────────────────────┬──────────────────────────────┘
                               │ onMarkAllRead(unreadIds)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                          App.tsx                            │
│                                                             │
│  1. INSTANT optimistic state update in setDbState:          │
│     - Marks all specified IDs or currentUser notifications  │
│       as isRead: true immediately (Zero UI lag!)            │
│  2. Background try/catch sync:                              │
│     - db.markAllNotificationsRead(currentUser.id, ids)      │
│     - markAllNotificationsReadCloud(currentUser.id, ids)    │
│  3. Card Action (Settle Now / View):                        │
│     - Automatically triggers onToggleRead(id, false)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Storage & Cloud Adapter Updates               │
│                                                             │
│  - mockStorage: markAllNotificationsRead(userId, ids?)      │
│  - mockStorage: clearReadNotifications(userId, ids?)        │
│  - cloudStorageAdapter: markAllNotificationsReadCloud(ids)  │
│  - cloudStorageAdapter: clearReadNotificationsCloud(ids)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed File Breakdown

### 1. `src/components/mobile/NotificationCenterDrawer.tsx`
- Update `NotificationCenterDrawerProps`:
  - `onMarkAllRead: (ids?: string[]) => void;`
  - `onClearReadNotifications: (ids?: string[]) => void;`
- In `handleMarkAllRead`:
  - Extract all unread notification IDs: `activeNotifications.filter(n => !n.isRead).map(n => n.id)`
  - Pass the explicit ID list to `onMarkAllRead(unreadIds)`
  - Trigger `hapticSuccess()` and close overflow menu
- In `handleClearRead`:
  - Extract all read notification IDs: `activeNotifications.filter(n => n.isRead).map(n => n.id)`
  - Pass `onClearReadNotifications(readIds)`
- When tapping `NotificationCard` `onAction`:
  - If notification is unread, automatically invoke `onToggleRead(notification.id, false)` so actioning an item marks it read!

### 2. `src/components/mobile/NotificationCard.tsx`
- Lower `AUTO_TRIGGER_THRESHOLD` from `130` to `75` px for smooth, effortless thumb swipe triggering on mobile devices.
- Add mouse drag compatibility alongside touch events (`onMouseDown`, `onMouseMove`, `onMouseUp`) for smooth desktop and mobile simulator testing.
- Add clear visual feedback during swipe (smoother opacity transition and colored tray reveal).

### 3. `src/App.tsx`
- **Fix `handleMarkAllNotificationsRead`:**
  - Accept optional `ids?: string[]`.
  - Update `dbState` immediately and optimistically.
  - Wrap backend cloud call in `try...catch` so UI state is never blocked.
  - If `ids` provided, mark all those IDs as `isRead: true, readAt: now`. If no `ids`, mark notifications matching `currentUser.id` or demo/active user.
- **Fix `handleClearReadNotifications`:**
  - Accept optional `ids?: string[]`.
  - Optimistically remove from `dbState.notifications` immediately.
  - Wrap backend cloud call in `try...catch`.
- **Fix `handleToggleNotificationRead` & `handleDeleteNotification`:**
  - Ensure optimistic update runs first before awaiting cloud sync.
- **Ensure Notifications Passed to Drawer are Properly Associated:**
  - Filter `userNotifications = (dbState.notifications || []).filter(n => n.userId === currentUser.id || !n.userId || n.userId === 'usr-rajdeep-1')` so notifications render reliably regardless of auth provider UUID vs seed user ID.

### 4. `src/lib/storage/mockStorage.ts`
- Enhance `markAllNotificationsRead(userId?: string, ids?: string[]): void`:
  - If `ids` array is provided, mark all notifications matching `ids.includes(n.id)` as read.
  - If `userId` provided, mark all `n.userId === userId` as read.
  - Save state and emit change.
- Enhance `clearReadNotifications(userId?: string, ids?: string[]): void`:
  - If `ids` provided, mark those `isDeleted = true`.
  - If `userId` provided, mark user's read notifications as `isDeleted = true`.

### 5. `src/lib/storage/cloudStorageAdapter.ts`
- Update `markAllNotificationsReadCloud(userId: string, ids?: string[])`:
  - If `ids` array provided, update `supabase.from('in_app_notifications').update(...).in('id', ids)`.
  - Else update by `user_id = userId`.
- Update `clearReadNotificationsCloud(userId: string, ids?: string[])`:
  - If `ids` array provided, update `.in('id', ids)`.
  - Else update by `user_id = userId`.

---

## 4. Verification & Testing Checklist

- [ ] **Verification 1: Header "Mark all read" Button**
  - Open notification drawer with 2 unread notifications ("Payment Due" and "New Shared Expense").
  - Click "Mark all read".
  - **Expected:** Badge changes from "2 new" to "All read", blue dots disappear, cards switch to read styling, and bell badge on dashboard disappears immediately.
- [ ] **Verification 2: Overflow Menu "Mark all as read"**
  - Open 3-dots overflow menu and click "Mark all as read".
  - **Expected:** All unread notifications are marked as read, menu closes, haptic feedback triggers.
- [ ] **Verification 3: Overflow Menu "Clear read notifications"**
  - Click "Clear read notifications".
  - **Expected:** All read notifications are removed from active list, leaving only unread (or empty caught-up state).
- [ ] **Verification 4: Contextual Action Auto-Read**
  - With an unread "Payment Due" card, click "Settle Now".
  - **Expected:** Notification is automatically marked read and navigation routes to Settle Up modal.
- [ ] **Verification 5: Swipe Gestures**
  - Swipe right on an unread card by >75px.
  - **Expected:** Card toggles to read.
  - Swipe left on a card by >75px.
  - **Expected:** Card is deleted.
- [ ] **Verification 6: Vitest & Build Health**
  - Run `npm test` and ensure all test suites pass.
  - Run `npm run build` or `npx tsc -b` to verify zero TypeScript errors.

---

## 5. Next Steps

- Review the plan.
- Execute changes with `/create` or approved implementation turn.
