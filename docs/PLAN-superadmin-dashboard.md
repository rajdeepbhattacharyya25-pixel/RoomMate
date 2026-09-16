# ROOMMATE — SUPERADMIN DESKTOP DASHBOARD
## Complete Product + UI/UX + Functional Implementation Specification

**Document:** `docs/PLAN-superadmin-dashboard.md`  
**Mode:** PLANNING ONLY  
**Target Architecture:** Desktop-First Web Application (Hosted on Vercel) + Supabase Cloud / Mock Engine Sync  
**Design Blueprint:** Stitch Project `7490169641002141903` (Screen `c2ddd0a648d24214a91a9f6de458f895`)  
**Audience:** Single Designated SuperAdmin (`role === 'SUPER_ADMIN'`)

---

## 1. Executive Summary & Philosophy

RoomMate is a student shared-expense management platform operating in PGs, hostels, flats, and messes.  
This SuperAdmin web application is **strictly desktop-first**, separated from the student mobile app, and designed to give the single platform owner complete operational control, business intelligence, support management, and security oversight.

### The SuperAdmin Philosophy
- **Control Center, Not Surveillance:** Total visibility over rooms, shared expenses, settlements, user accounts, and platform health.
- **Strict Privacy Rule:** **Personal expenses are strictly private to individual students.** The SuperAdmin console has zero visibility into personal expense titles, categories, or amounts. Only shared room expenses and aggregate system-level statistics are visible.
- **Single SuperAdmin Model:** No hierarchy (no moderator, manager, or support roles). One single master administrator account with strong credential verification and optional MFA.
- **Visual Aesthetic:** Modern, clean, calm, professional, and data-centric SaaS dashboard (slate/indigo design system, subtle borders, soft shadows, clear typography, semantic status indicators, zero cartoonish illustrations or excessive glassmorphism).

---

## 2. Global Layout & Navigation Hierarchy

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Logo  |  Search (Ctrl+K)  |  Cloud Status  |  Notifications  |  Profile │
├─────────────────┬────────────────────────────────────────────────────────────────┤
│ SIDEBAR         │ MAIN CONTENT AREA                                              │
│                 │                                                                │
│ 🏠 Dashboard    │  [Dynamic Route View]                                          │
│ 👥 Users        │  • High-performance Data Tables with Sorting & Filters         │
│ 🏘️ Rooms        │  • Detailed Slide-Over Inspection Drawers & Modals             │
│ 💰 Expenses     │  • Interactive Metric & Growth Charts with Time Selectors      │
│ 📊 Analytics    │  • Action confirmations with audit log generation              │
│ 💬 Support      │  • Indian currency (₹) compact & detailed notation             │
│ 🔔 Notifications│                                                                │
│ 🔐 Security     │                                                                │
│ 🧾 Audit Logs   │                                                                │
│ 🛠️ System Health│                                                                │
│ ⚙️ Settings     │                                                                │
│ ─────────────── │                                                                │
│ Superadmin (●)  │                                                                │
│ [Logout]        │                                                                │
└─────────────────┴────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Page Breakdown & Requirements

### Section 1: Dashboard (`/admin`)
- **Header:** "Good evening, Superadmin — Here's what's happening across Roommate today." + live date/time.
- **5 KPI Metric Cards:**
  1. *Total Users:* Total registered students + percentage growth vs previous period.
  2. *Active Users:* Users with activity in last 30 days.
  3. *Active Rooms:* Non-archived, non-frozen rooms.
  4. *Shared Expenses (Month):* Formatted in Indian compact currency (`₹18.4L`).
  5. *Outstanding Shared Balance:* Total unsettled room debt (`₹4.21L`).
- **User Growth Chart:** SVG/Canvas line & area chart with time filter controls (7D, 30D, 3M, 6M, 1Y) and interactive hover tooltips showing new vs active users.
- **Room Activity Chart:** Rooms created, active rooms, dormant rooms over time.
- **Financial Ledger Overview:** Shared Expenses total, Outstanding balance, Settled payments, with timeline trend.
- **Recent Activity Feed:** Clickable stream of events (user registered, room created, shared bill added, bug report submitted) with relative timestamps.
- **System Status Card:** Compact indicators for Application, Database, Authentication, API, Notifications.

### Section 2: Users Management (`/admin/users` & `/admin/users/[id]`)
- **Data Table:** Avatar, Name, Email, Verification badge, Rooms count, Status badge (Active/Suspended), Joined date, Last active, Actions (•••).
- **Filters:** Status (Active, Suspended, Pending), Verification (Verified, Unverified), Activity (Active recently, Dormant, Never active), Joined date.
- **Table UX:** Search query, column sorting, pagination, CSV/JSON export.
- **User Detail Drawer/Modal:**
  - Account overview (email, verification, registration date, last login, status).
  - List of rooms the user belongs to (with member count and room role).
  - Platform activity timeline (non-sensitive: login, room joined, shared bill created; NO personal expenses).
  - Administrative actions: Suspend/Restore account (with required reason dialog), Force logout / session revocation, Send direct account notification.

### Section 3: Rooms Management (`/admin/rooms` & `/admin/rooms/[id]`)
- **Data Table:** Room Name, Owner Name, Members count, Created date, Last activity, Shared expenses volume (₹), Status (Active, Frozen, Archived), Actions.
- **Filters:** Status (All, Active, Frozen, Archived), Member count range, Search.
- **Room Detail View:**
  - Overview tab: Key metrics, total shared spend, outstanding room debt, activity sparkline.
  - Members tab: Member list, roles (Owner/Member), join dates, status.
  - Shared Expenses tab: All shared bills logged in this room.
  - Activity tab: Timeline of expenses, settlements, and membership updates.
  - Settings tab: Freeze/Unfreeze room (disables new expense logging during disputes), Archive/Unarchive, Reset 6-character room invite code.

### Section 4: Shared Expenses Explorer (`/admin/expenses` & `/admin/expenses/[id]`)
- **Scope:** Strictly SHARED expenses across all rooms. Personal expenses are omitted.
- **Data Table:** Title, Amount (₹), Room Name, Paid By, Category (Rent, Electricity, Groceries, etc.), Members count, Date, Status, Actions.
- **Filters:** Category, Room, Date range, Amount range.
- **Expense Split Detail Modal:**
  - Total amount and payer details.
  - Breakdown per member: share amount, amount paid, balance (+owed / -owing).
  - Partial settlement status indicators.

### Section 5: Analytics Center (`/admin/analytics`)
- **Time Window Filter:** 7D, 30D, 3M, 6M, 1Y.
- **User Analytics:** DAU, WAU, MAU, registration velocity, retention rate, email verification percentage.
- **Room Analytics:** Total rooms created, active vs dormant rooms, average members per room.
- **Shared Expense Analytics:** Total shared volume, average expense amount, expense frequency, category breakdown, settlement completion percentage.
- **Feature Adoption:** Google Sign-In adoption, QR code joins, WhatsApp nudge triggers, report downloads.

### Section 6: Support & Feedback Desk (`/admin/support` & `/admin/support/[id]`)
- **KPI Cards:** New (18), In Review (7), Resolved (83), Total (108).
- **Tabs:** All, Bug Reports, Feature Suggestions, Contact Requests.
- **Bug Report Detail:**
  - Title, submitter name, category, submission timestamp, status workflow (`New` &rarr; `Reviewing` &rarr; `In Progress` &rarr; `Resolved` &rarr; `Closed`).
  - Detailed description and screenshot preview.
  - Attached technical context: User ID, App version, Platform, Browser/device, Error ID, Room ID.
  - Internal SuperAdmin notes and status updating.
- **Feature Suggestions:** Title, submitter, date, status (`New` &rarr; `Reviewing` &rarr; `Planned` &rarr; `In Development` &rarr; `Implemented` &rarr; `Declined`), internal notes.
- **SuperAdmin Contact Info:** Global configuration for SuperAdmin support phone number and email address.

### Section 7: Notifications & Announcements (`/admin/notifications`)
- **Create Announcement Modal:**
  - Title, Message body.
  - Target Audience: Everyone (All users), Selected users, Selected rooms.
  - Priority: Normal, Important, Critical.
  - Delivery Channels: In-app notification, Push notification, Email.
  - Live preview modal before dispatch.
- **Announcement History Table:** Title, Audience, Priority, Sent date, Recipients reached, Status.
- **Dispatch Action:** Dispatches to database and in-app notifications stream.

### Section 8: Platform & SuperAdmin Security (`/admin/security`)
- **Authentication Overview:** Google OAuth configuration, Email verification status, Session timeout policies.
- **User Security:** Suspicious login alerts, failed login attempts, active sessions, force session revocation.
- **SuperAdmin Account Security:** MFA status indicator, active admin sessions, last login timestamp, security audit log events.

### Section 9: Immutable Audit Logs (`/admin/audit-logs`)
- **Purpose:** Complete administrative activity tracking. Every action (suspension, room freeze, code reset, announcement, setting change) logs an audit event.
- **Data Table:** Timestamp, Action performed, Target entity, Admin ID, Reason/Metadata, Status (Success/Failure).
- **Filters:** Action type, Resource type, Date range, Success/failure, Entity ID search.
- **Design:** Immutable styling; no deletion functionality.

### Section 10: System Health & Error Monitoring (`/admin/system-health`)
- **Service Status Cards:** Application, PostgreSQL Database, Supabase Auth, API, Push Notifications (Operational / Degraded / Outage).
- **Health Metrics:** API response time (ms), Error rate (%), Auth failure rate, Database query latency.
- **Recent Error Logs:** Timestamp, Service, Error message, Severity (Critical, High, Medium, Low), Occurrences, Status, debug details modal (secrets redacted).

### Section 11: Global Settings & Danger Zone (`/admin/settings`)
- **General:** Application Name, Support Email, Support Phone.
- **Authentication Policies:** Google login toggle, Email verification requirement, Session timeout.
- **Room Policies:** Max members per room, Default join policy (Approval Required / Instant), QR code expiration.
- **Expense Policies:** Split methods enabled, Indian currency formatting defaults.
- **Danger Zone:** Platform Maintenance Mode switch with confirmation dialog, custom maintenance broadcast message, and immediate audit logging.

---

## 4. Technical Architecture & Security Model

### Routing Engine
- Clean path-based routing (`/admin`, `/admin/users`, `/admin/rooms`, etc.) using HTML5 History API with fallbacks so navigation, browser reload, and direct URL entry work seamlessly on Vercel (`vercel.json` rewrites all to `/index.html`).
- Mobile APK guard: Capacitor builds run in strictly mobile mode and never load the admin dashboard.

### Server-Side & Client Authorization
- Only users with `role === 'SUPER_ADMIN'` can access `/admin/*`.
- Unauthenticated visitors hitting `/admin/*` are presented with the dedicated SuperAdmin Master Login Screen (with email, master security key, and MFA challenge).
- Non-admin students are blocked from entering.
- Data fetching uses Supabase PostgreSQL RLS policies (`public.is_super_admin()`) and RPC functions (`super_admin_get_platform_metrics`), backed by an extensive in-memory / local mock database for local development and offline resilience.

### Formatting & UI Components
- **Currency:** Indian formatting helper `formatInr(amount, compact?: boolean)`:
  - Metrics: `₹18.4L`, `₹2.3Cr`, `₹4.2K`
  - Transactions: `₹1,200`, `₹18,400`, `₹1,24,500`
- **Reusability:** Modular components in `src/components/admin/`:
  - `AdminLayout.tsx`
  - `AdminSidebar.tsx`
  - `AdminTopbar.tsx`
  - `AdminCommandPalette.tsx` (Ctrl+K global search across users, rooms, expenses, tickets)
  - `AdminDashboard.tsx`
  - `AdminUsers.tsx` & `AdminUserDetailModal.tsx`
  - `AdminRooms.tsx` & `AdminRoomDetailModal.tsx`
  - `AdminExpenses.tsx` & `AdminExpenseDetailModal.tsx`
  - `AdminAnalytics.tsx`
  - `AdminSupport.tsx` & `AdminSupportDetailModal.tsx`
  - `AdminNotifications.tsx` & `AdminCreateAnnouncementModal.tsx`
  - `AdminSecurity.tsx`
  - `AdminAuditLogs.tsx`
  - `AdminSystemHealth.tsx`
  - `AdminSettings.tsx`
  - Common primitives: `DataTable.tsx`, `MetricCard.tsx`, `StatusBadge.tsx`, `ConfirmationDialog.tsx`, `Skeleton.tsx`, `Toast.tsx`

---

## 5. Verification Checklist

1. **Routing & Access Control:**
   - Navigating to `/admin` loads the SuperAdmin console when authenticated.
   - When not authenticated, displays the SuperAdmin Master Login screen.
   - Student accounts attempting `/admin` receive an Access Denied barrier.
   - Mobile APK (`isNativeApp()`) is unaffected and boots directly to mobile resident UI.
2. **Privacy Rule:**
   - Zero personal expense titles, amounts, or categories are rendered anywhere in the admin dashboard.
3. **Command Palette:**
   - Pressing `Ctrl + K` (or `Cmd + K`) opens the search palette.
   - Searching for a user, room, or bill provides instant keyboard-navigable results.
4. **All 11 Functional Pages:**
   - Each page is fully navigable from the sidebar with active indicators.
   - Sorting, filtering, searching, and pagination operate correctly.
   - Actions (Freeze room, Suspend user, Reset code, Create announcement) show confirmation dialogs and generate audit logs.
5. **Vercel & Build Compatibility:**
   - `npm run build` (`tsc -b && vite build`) passes with zero TypeScript or bundle errors.
