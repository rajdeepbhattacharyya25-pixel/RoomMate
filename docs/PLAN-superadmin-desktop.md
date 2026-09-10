# Project Plan: SuperAdmin Desktop Web App & Subdomain Guard with Vercel Deployment

**File:** `docs/PLAN-superadmin-desktop.md`  
**Mode:** PLANNING ONLY  
**Task Slug:** `superadmin-desktop`  
**Target:** Separate yet unified architecture where Mobile APK boots directly into Resident Mobile UI, while Desktop Web provides an App Download Landing Page and an expanded SuperAdmin SaaS Operations Portal, deployable to Vercel.

---

## 1. Objectives & Architectural Blueprint

- **User Directives:**
  > "Option A: Subdomain & Role Guard (Easiest & Fastest — Recommended)
  > Keep the codebase unified, but route users based on device and role:
  > Mobile APK: Capacitor automatically boots directly into the student mobile interface (viewMode = 'mobile'). Mobile users never see the SuperAdmin portal.
  > Desktop Web (admin.campusflow.com): When accessed on a desktop browser, require logging in with a SUPER_ADMIN email. Once logged in, the desktop dashboard opens directly to the SuperAdmin Portal.
  > If a student opens the desktop URL, they are shown a landing page with download links for the Android APK and iOS app.
  > deploy on vercel and expand superadmin portal features
  > do these phase by phase /plan"

- **Architectural Flow:**

```
                                [ Visitor / Device Enters ]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [ Capacitor Native Shell ]                   [ Desktop Web Browser ]
             (Android APK / iOS App)                    (admin.campusflow.in / Vercel)
                       │                                           │
                       ▼                                           ▼
             [ Student Mobile View ]                      [ Desktop Gatekeeper ]
             • 100% Mobile Touch UI                                │
             • Resident Login & Biometrics                         ├─────────────────────────────┐
             • Private Vault & Room Split                          ▼                             ▼
             • ZERO SuperAdmin Links                      [ Unauthenticated /           [ Authenticated ]
                                                          Resident Visitor ]             (role: SUPER_ADMIN)
                                                                   │                             │
                                                                   ▼                             ▼
                                                        [ App Landing Page ]           [ SuperAdmin Portal ]
                                                        • "Get CampusFlow"             • Global Room Control
                                                        • Direct APK Download          • Student Directory & Ban
                                                        • iOS TestFlight Badge         • MRR & Razorpay SaaS
                                                        • "Admin Login" Entry          • Global Security Logs
```

---

## 2. Phase-by-Phase Implementation Roadmap

### Phase 1: Platform & Device Detection Engine
- **Objective:** Strictly segregate Native Mobile APK vs Desktop Web Browser.
- **Files to Modify / Create:**
  - `src/lib/platform/deviceDetector.ts` [NEW]:
    - Detect Capacitor native environment (`Capacitor.isNativePlatform()`).
    - Detect screen width and user-agent (Desktop vs Mobile viewport).
    - Detect hostname (`admin.*` vs standard domain).
  - `src/App.tsx` [MODIFY]:
    - If `Capacitor.isNativePlatform()` is `true`, unconditionally enforce `viewMode = 'mobile'`. Mobile users can never see, switch to, or access the SuperAdmin desktop portal.
    - If running on Desktop Web Browser:
      - Default to Desktop mode.
      - Check authentication state:
        - If authenticated as `SUPER_ADMIN` &rarr; render expanded `SuperAdminPortal`.
        - If not authenticated or resident &rarr; render `DesktopLandingPage`.

---

### Phase 2: Desktop Landing & Mobile App Download Gatekeeper
- **Objective:** Give desktop visitors a clean SaaS landing page with direct download links for the Android APK & iOS build, with a discrete, secure Super Admin login entry.
- **Components to Create:**
  - `src/components/desktop/DesktopLandingPage.tsx` [NEW]:
    - **Hero Section:** "CampusFlow - Student Expense Sharing & Private Financial Vault".
    - **Mobile App Download Cards:**
      - **Download Android APK (Direct)**: Button with `.apk` download link (`/downloads/CampusFlow.apk` or GitHub Release link) + QR code to scan from phone.
      - **iOS App (TestFlight)**: Link / badge for TestFlight beta.
      - **Key Features Showcase:** 100% Private Vault, Smart Room Split, WhatsApp One-Tap Nudges, Offline Vault.
    - **Header & Footer Admin Access:**
      - Discrete "Admin Portal" / "Platform Login" button in top-right header and footer.
      - Opens `SuperAdminLoginModal`.
  - `src/components/desktop/SuperAdminLoginModal.tsx` [NEW]:
    - Dedicated Super Admin authentication modal.
    - Email + Secret Admin Key / Password authentication.
    - Validates `role === 'SUPER_ADMIN'` in Supabase/local vault.
    - Issues verified `SUPER_ADMIN` session token and transitions directly to the SuperAdmin Portal.

---

### Phase 3: Expanded SuperAdmin SaaS Operations Center
- **Objective:** Provide complete visibility and administrative control over all rooms, residents, subscriptions, and platform activity.
- **Components to Enhance / Create:**
  - `src/components/SuperAdminPortal.tsx` [ENHANCE] and modular subcomponents:
    1. **SaaS Revenue & MRR Intelligence**:
       - Monthly Recurring Revenue (MRR) calculation from active Razorpay tiers (Free vs Pro vs Flat Pack).
       - Total financial transaction volume processed across all rooms.
       - Visual revenue breakdown cards and paying conversion rates.
    2. **Global Room Control Center (`SuperAdminRoomManager.tsx`)**:
       - Complete searchable directory of every room across all colleges and hostels.
       - Columns: Room Name, Room Code, College/Hostel Tag, Created Date, Room Admin, Active Member Count, Total Outflow (₹), Status (Active / Frozen / Archived).
       - **Admin Controls**:
         - **Freeze/Unfreeze Room**: Instantly locks room so no new expenses can be logged during disputes.
         - **Archive / Delete Room**: Clean up abandoned or test rooms.
         - **Inspect Room Ledger**: Modal showing current room debts and expense split history without joining as a member.
         - **Reset Room Invite Code**: Invalidate leaked or spammed codes.
    3. **Resident User Directory & Moderation (`SuperAdminUserDirectory.tsx`)**:
       - Searchable by name, email, or room affiliation.
       - Status tags: `Active`, `Suspended`, `Free Tier`, `Pro Tier`.
       - **One-Click Account Suspension**: Immediately locks account across both mobile and web.
       - **Subscription Overrides**: Manually upgrade resident to Pro or extend trial period.
    4. **Platform Security & Audit Trail (`SuperAdminAuditTrail.tsx`)**:
       - Filterable event stream: Logins, room creations, member joins, suspensions, webhook events.
       - System Health Card: Supabase PostgreSQL Realtime status, latency, and database storage health.

---

### Phase 4: Supabase Security Policies (Row Level Security)
- **Objective:** Ensure PostgreSQL mathematically enforces that students can never query other rooms, while SuperAdmin has full platform oversight.
- **Database Scripts / Migrations:**
  - `supabase/migrations/20260910_superadmin_rls.sql` [NEW]:
    - Create a secure Postgres helper function: `is_super_admin()` checking `auth.jwt() ->> 'role' = 'SUPER_ADMIN'` or checking `profiles.role = 'SUPER_ADMIN'`.
    - RLS Policy on `rooms`:
      - `SELECT`: `is_super_admin() OR id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())`.
      - `UPDATE`: `is_super_admin() OR id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid() AND role = 'ROOM_ADMIN')`.
    - RLS Policy on `profiles`:
      - `SELECT`: `is_super_admin() OR id = auth.uid() OR id IN (SELECT user_id FROM room_members WHERE room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid()))`.
      - `UPDATE (is_suspended)`: Strictly `is_super_admin()`.
    - RPC Function `admin_get_platform_metrics()` for high-performance aggregate counts (MRR, total rooms, total transacted).

---

### Phase 5: Vercel Production Deployment Configuration
- **Objective:** Configure zero-friction deployment to Vercel with SPA routing, custom domain support, and build automation.
- **Files to Create / Modify:**
  - `vercel.json` [NEW]:
    - Single Page Application (SPA) rewrites rule: routes all traffic (`/(.*)`) to `/index.html`.
    - Security headers (X-Frame-Options, Content-Type-Options, Strict-Transport-Security).
    - Cache headers for static assets in `dist/assets/`.
  - `package.json` [VERIFY]:
    - Ensure `npm run build` runs clean type-checking (`tsc -b && vite build`) without lint errors.
  - Deployment Documentation:
    - Steps to deploy via `npx vercel` or GitHub Vercel Integration.
    - Instructions to bind custom domain (e.g. `admin.campusflow.in` or `campusflow.vercel.app`).
    - Supabase Environment Variables setup in Vercel project settings (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 3. Verification & Acceptance Checklist

| Phase | Milestone | Verification Method |
| :--- | :--- | :--- |
| **Phase 1** | Mobile Isolation | Launch in Capacitor / simulate mobile user-agent: confirm app boots directly to Resident Mobile login with zero admin controls. |
| **Phase 2** | Desktop Landing | Open app in desktop browser: verify hero landing page, APK download buttons, and working Admin Login modal. |
| **Phase 3** | Expanded SuperAdmin | Log in as Super Admin: verify Global Room Directory (freeze/archive/inspect), User Directory (suspend/reactivate), and MRR cards. |
| **Phase 4** | Supabase Security | Run SQL migration; verify student token cannot query other rooms while SuperAdmin token can view all rooms. |
| **Phase 5** | Vercel Deployment | Run `npm run build` locally, verify zero build errors, check `vercel.json`, and run Vercel preview deployment. |

---

## 4. Next Steps

1. Review this plan file: `docs/PLAN-superadmin-desktop.md`.
2. Approve to begin Phase 1 (Platform Detection & Desktop Landing Gatekeeper).
