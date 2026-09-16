# Project Plan: Smart In-App Notification Center for RoomMate

**File:** `docs/PLAN-notification-center.md`  
**Mode:** PLANNING ONLY (No Code)  
**Task Slug:** `notification-center`  
**Target:** Native, lightweight, financially intelligent In-App Notification Center on the Home Page for student room and flatmate expense sharing.

---

## 1. Context & Problem Statement

In student shared apartments and hostels, financial awareness and group coordination rely on timely, non-intrusive notifications:
1. **Missing In-App Notification Feed**: Currently, RoomMate dispatches native local device notifications (Capacitor/web push), but lacks an **in-app notification center**. If a student misses a push notification, they have no central place inside the app to review who added a bill, who settled, or if a roommate requested to join their flat.
2. **Generic Feeds vs. Financial Urgency**: Generic notification lists sort strictly chronologically and treat a ₹1,200 electricity bill the same as a minor profile update. Students need **intelligent priority ranking**: overdue debts and required actions must stay prominent until addressed.
3. **Notification Flooding & Noise**: If multiple roommates update or discuss an expense, creating five separate notification cards clutters the UI. Intelligent grouping and deduplication are required.
4. **Privacy & Vault Isolation**: RoomMate guarantees that personal expenses are private. The notification engine must enforce absolute data isolation at the schema and query level—personal expenses must never generate room-visible notifications.

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **UX & Motion Designer** | `ui-ux-pro-max`, `a11y`, Framer-motion/CSS | Notification Bell with dynamic badge (`0`, `1–9`, `9+`), micro-animations (bell wiggle, high-priority pulse, badge scale 0.8→1.0), swipe gestures (left to delete, right to read/unread), and accessible priority cards. |
| **Frontend Component Architect** | `react-components`, Touch/Mobile UX | Build `NotificationBell.tsx`, `NotificationPanel.tsx`, `NotificationCard.tsx`, `NotificationHistoryModal.tsx`, and `NotificationSettingsModal.tsx`. Respect `prefers-reduced-motion` and mobile safe areas. |
| **Ledger & Business Logic Specialist** | `notificationService.ts`, Financial rules | Event evaluation engine: generates notifications only for material user-facing financial events (payer change, share assigned, settlement, admin approval). Implements deduplication (`eventId`) and intelligent grouping. |
| **Cloud & Storage Engineer** | `supabase-postgres`, RLS, Realtime | Migration `20260914_in_app_notifications.sql` with table `in_app_notifications`, RLS policies, index optimizations, real-time publication, and local storage fallback. |
| **QA & Verification Engineer** | `oxlint`, `tsc`, E2E test scenarios | Validate badge counts (`0`, `1–9`, `9+`), priority sorting (High > Med > Low), unread persistence, swipe thresholds, and personal expense zero-leakage guarantee. |

---

## 3. Architecture & User Journey

```
                                  [ Material Event Occurs ]
                    (Shared Bill Added, Debt Settled, Join Request)
                                             │
                                             ▼
                             [ Notification Service Evaluator ]
                              - Is this a private expense? ──> (DROP IMMEDIATELY)
                              - Does it materially affect user?
                              - Deduplication check via `eventId`
                                             │
                                             ▼
                             [ Supabase / Local Storage DB ]
                                 `in_app_notifications`
                                             │
                                             ▼
                             [ Realtime Stream & App State ]
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
            [ Notification Bell ]                         [ In-App Sound / Haptic ]
             - Wiggle / Pulse micro-anim                   - Notification chime
             - Badge scales 0.8 → 1.0                      - Light impact haptic
             - Shows `1-9` or `9+`
                      │
                      ▼ (User taps Bell)
            [ Notification Panel Drawer ]
             - Header: "Notifications" & [Mark all as read]
             - Smart Order: Unread HIGH ➔ Unread MED ➔ Unread LOW ➔ Read/Recent
             - Accessible Cards: Icon + Color + Text Tag + Timestamp
             - Action Buttons: [Pay Now], [View Expense], [Review]
             - Swipe Actions: [Swipe Left ➔ Delete] | [Swipe Right ➔ Toggle Read]
             - Overflow Menu: Clear Read, History, Settings
                      │
                      ▼ (Tap "View History")
            [ Notification History View ]
             - Categorized by: Today, Yesterday, Earlier this week, Older
             - Paginated & Lazy loaded
```

---

## 4. Technical Specifications & Data Model

### A. Notification Data Model (`src/types/index.ts`)

```typescript
export type NotificationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type NotificationType =
  // HIGH Priority (Urgent financial / security / admin actions)
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_DUE_TO_YOU'
  | 'ADMIN_APPROVAL_REQUIRED'
  | 'ROOM_JOIN_REQUEST'
  | 'ACCOUNT_SECURITY'
  | 'PAYMENT_FAILED'
  | 'EXPENSE_DISPUTE'
  | 'ROOM_POLICY_CHANGED'
  // MEDIUM Priority (Shared bills & active room changes)
  | 'EXPENSE_ADDED'
  | 'BILL_ADDED'
  | 'PARTIAL_PAYMENT_RECEIVED'
  | 'MEMBER_JOINED'
  | 'EXPENSE_MODIFIED'
  | 'SETTLEMENT_REMINDER'
  | 'BUDGET_THRESHOLD_REACHED'
  // LOW / CASUAL Priority (Informational & settled state)
  | 'EXPENSE_SETTLED'
  | 'MONTHLY_REPORT_GENERATED'
  | 'HISTORY_UPDATED'
  | 'GENERAL_ACTIVITY'
  | 'SYSTEM_INFO';

export type NotificationActionType =
  | 'PAY_NOW'
  | 'VIEW_EXPENSE'
  | 'VIEW_INVITATION'
  | 'REVIEW'
  | 'VIEW_DETAILS'
  | 'VIEW_BALANCE'
  | 'NONE';

export interface InAppNotification {
  id: string;
  userId: string;
  roomId?: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  actionType?: NotificationActionType;
  actionTarget?: string; // ID of expense, settlement, room, or join request
  metadata?: {
    amount?: number;
    currency?: string;
    payerName?: string;
    payerId?: string;
    roomName?: string;
    category?: string;
    groupCount?: number;
    groupedEventIds?: string[];
  };
  eventId?: string; // Strict idempotency key
  isDeleted?: boolean;
}
```

---

### B. Database Schema & Migration (`supabase/migrations/20260914_in_app_notifications.sql`)

```sql
-- Create in_app_notifications table
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_type TEXT,
    action_target TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    event_id TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes for lightning-fast queries & badge calculations
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
    ON public.in_app_notifications(user_id, is_read, is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_priority 
    ON public.in_app_notifications(user_id, priority, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event 
    ON public.in_app_notifications(user_id, event_id) 
    WHERE event_id IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see and manage their own notifications
CREATE POLICY "Users view own notifications"
    ON public.in_app_notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
    ON public.in_app_notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users or members can insert targeted notifications"
    ON public.in_app_notifications FOR INSERT
    WITH CHECK (true);

-- Enable Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
```

---

## 5. Intelligent Ranking, Grouping, & Deduplication Engine

### A. Strict Priority Ranking Algorithm
Notifications in the active panel are sorted using a multi-factor comparator:
1. **Unread Status**: All unread notifications precede read notifications.
2. **Priority Tiers**: Within the unread pool:
   - Tier 1: `HIGH` (🔴 Red indicator, urgency badge)
   - Tier 2: `MEDIUM` (🟠 Orange indicator)
   - Tier 3: `LOW` (🟢 Green indicator)
3. **Decay Window for Old Read Items**: Read notifications are sorted strictly chronologically (newest first). A read `HIGH` priority item decays down the list naturally according to its timestamp.
4. **Tie-Breaker**: `new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()`.

### B. Event Deduplication
- Every notification generated by a system trigger contains a deterministic `eventId`:
  - New Bill: `expense_${expense.id}_${recipientUserId}`
  - Settlement: `settlement_${payment.id}_${recipientUserId}`
  - Join Request: `joinreq_${requestId}_${adminUserId}`
- If a database reconnect, page refresh, or retry fires the trigger, the duplicate insertion is ignored via `ON CONFLICT (user_id, event_id) DO NOTHING`.

### C. Repetitive Notification Grouping
- If multiple roommates add or update expenses in the same room within a 2-hour window:
  - The notification service combines them into a grouped summary card:
    *"Room Activity: 3 expenses added in Flat 302 Ledger (₹2,450 total)"*.
  - Prevents notification fatigue during monthly bill splitting days.

---

## 6. Detailed Component Implementation Plan

### 1. `NotificationBell.tsx` (`src/components/mobile/NotificationBell.tsx`)
- **Placement**: Top header of `MobileDashboard.tsx` alongside the Cloud Sync pill and User Avatar.
- **Badge Rules**:
  - `count === 0`: Badge hidden.
  - `1 <= count <= 9`: Renders exact count (`1` through `9`).
  - `count >= 10`: Renders `'9+'` (never `'10'`, `'11'`, or `'25'`).
- **Micro-Animations**:
  - Keyframe CSS/Tailwind animation for smooth scale: `animate-badge-pop` (0.8 → 1.0).
  - Subtle bell wiggle: `animate-bell-shake` (5-degree tilt back and forth for 400ms).
  - High-priority pulse: Red glow ring and amplified double-shake when an unread `HIGH` notification arrives.
  - Reduced Motion query: `@media (prefers-reduced-motion: reduce)` disables keyframe wiggles.

### 2. `NotificationCenterDrawer.tsx` (`src/components/mobile/NotificationCenterDrawer.tsx`)
- **Structure**: Mobile bottom sheet / slide-over drawer with backdrop blur (`bg-slate-900/60`).
- **Header Section**:
  - Title: **"Notifications"** with unread count pill.
  - Action: **"Mark all as read"** (active only when unread count > 0).
  - Overflow Menu (`...`):
    - `Clear read notifications`
    - `View notification history`
    - `Notification settings`
- **List Section**:
  - Virtualized or smooth animated list of `NotificationCard` items.
  - Empty State: Clean illustration with 🔔 *"You're all caught up! No unread notifications."*
- **Footer**:
  - **"View History"** link button opening the full historical archive.

### 3. `NotificationCard.tsx` (`src/components/mobile/NotificationCard.tsx`)
- **Color & Icon Multi-Modality** (Accessible, never relying on color alone):
  - 🔴 `HIGH`: Red border accent, `AlertTriangle` icon, bold badge tag `URGENT` / `HIGH`.
  - 🟠 `MEDIUM`: Amber border accent, `Receipt` / `Users` icon, badge tag `BILL` / `UPDATE`.
  - 🟢 `LOW`: Emerald border accent, `CheckCircle2` icon, badge tag `SETTLED` / `INFO`.
- **Content Hierarchy**:
  - Title with unread indicator dot (`●`).
  - Description with highlighted monetary amounts (e.g. `₹1,200`, `₹300`).
  - Humanized relative timestamp: "2m ago", "1h ago", "Yesterday".
  - Contextual Action Button (e.g., `[Pay Now]`, `[View Expense]`, `[Review]`).
- **Interactive Swipe Actions**:
  - **Swipe Left**: Reveals red trash can (`Delete`). Reaching threshold deletes with undo toast.
  - **Swipe Right**: Reveals indigo envelope (`Mark Read` / `Mark Unread`).
  - Minimum 60px gesture threshold to prevent accidental swipes.

### 4. `NotificationHistoryModal.tsx` (`src/components/mobile/NotificationHistoryModal.tsx`)
- Displays all historical, read, and archived notifications.
- Organized into clear chronological sections:
  - **Today**
  - **Yesterday**
  - **Earlier this week**
  - **Older**
- Search & filter by category (Payments, Bills, Room).
- History items do not contribute to the unread badge count.

### 5. `NotificationSettingsModal.tsx` (`src/components/mobile/NotificationSettingsModal.tsx`)
- User preferences saved in `localStorage` under `roommate_notification_preferences`:
  - Shared Bills & Expenses (Toggle)
  - UPI & Cash Settlements (Toggle)
  - Roommate Reminders & Nudges (Toggle)
  - Sound Effects (Syncs with `roommate_notification_sound_enabled`)
  - **High Priority Safeguard**: Urgent financial alerts (overdue debts, security) cannot be disabled.

---

## 7. Zero-Leakage Privacy & Security Verification

| Privacy Boundary | Enforcement Mechanism |
| :--- | :--- |
| **Personal Vault Expenses** | `notificationService.ts` explicitly drops any personal expense event. Under no circumstances is a notification generated or dispatched to any user. |
| **Room Shared Expenses** | Notifications are only addressed to members with `status === 'ACTIVE'` in the specific `roomId`. |
| **Payer Exclusion** | Payer who created the bill never receives a "You added a bill" notification; only the other split participants receive it. |
| **Database RLS** | Supabase Row Level Security policy `auth.uid() = user_id` ensures no client can query another user's notifications. |

---

## 8. Verification & Test Plan

### Phase 1: Automated Lint & Type Checks
```powershell
npm run lint
npm run build
```
- Verify zero TypeScript compiler errors.
- Verify zero ESLint / Oxlint errors.

### Phase 2: Manual Feature Verification Checklist
- [ ] **Badge Display**: Verify `0` hides badge, `1–9` shows exact number, `10+` displays `9+`.
- [ ] **Micro-Animations**: Verify bell wiggle on new item, high-priority pulse, and badge scale.
- [ ] **Priority Ordering**: Verify unread High appear first, followed by Medium, Low, then Read.
- [ ] **Accessibility**: Verify all priorities have distinct icons and text tags (not just colors).
- [ ] **Swipe Gestures**: Verify left swipe to delete and right swipe to toggle read state.
- [ ] **Action Redirection**: Verify `[Pay Now]` launches settlement; `[Review]` opens join request review.
- [ ] **History Archive**: Verify "View History" displays date-bucketed records (Today, Yesterday, Earlier).
- [ ] **Deduplication**: Verify duplicate events with the same `eventId` are ignored.
- [ ] **Zero Leakage**: Verify personal vault expenses generate zero notifications.

---

## 9. Next Steps

1. Review and approve this plan file (`docs/PLAN-notification-center.md`).
2. Run `/create` to begin implementation.
