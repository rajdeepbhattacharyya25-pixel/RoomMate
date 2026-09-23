# RoomMate — Phase 2C.1: Notification Authenticity + FCM/Device Security Audit

**Audit Date**: September 20, 2026  
**Status**: `REMEDIATION REQUIRED — DO NOT DEPLOY CHANGES YET`  
**Production Database Target**: `pbzaaskftrmnvocczhat.supabase.co` (**UNTOUCHED**)  
**Staging Environment**: PostgreSQL 15 (`roommate-staging-db` on port 54322)  

---

## 1. Executive Summary

A comprehensive, adversarial security audit of RoomMate's notification pipeline, FCM device token management, Edge Functions, and database policies was conducted.

The audit identified **one CRITICAL vulnerability**, **two HIGH vulnerabilities**, **two MEDIUM vulnerabilities**, and **one LOW operational issue**:
1. **CRITICAL (VULN-2C-01)**: The `send-push` Edge Function (`supabase/functions/send-push/index.ts`) fails to enforce room membership if `data.roomId` is omitted from the request body. Any authenticated user can invoke the Edge Function with arbitrary `recipientUserIds` across the entire application, forging push notifications globally. Furthermore, even when `data.roomId` is provided, the function validates only the caller's room membership, omitting any validation of the recipients.
2. **HIGH (VULN-2C-02)**: The `public.in_app_notifications` table completely lacks a `sender_id` or `created_by` column. Any active member of a room can insert notifications targeting co-roommates with arbitrary `type` (e.g., `ACCOUNT_SECURITY`, `SYSTEM_INFO`, `ADMIN_APPROVAL_REQUIRED`), arbitrary high priorities (`URGENT`, `HIGH`), and deceptive system-like metadata with zero attribution or cryptographic authenticity.
3. **HIGH (VULN-2C-03)**: The legacy `profiles.fcm_token` column is actively dual-written by `src/lib/storage/cloudStorageAdapter.ts` and queried as a fallback by `send-push`. Because the `profiles` table RLS policy allows co-roommates to view each other's full profile rows, **any roommate can harvest active FCM device tokens of other roommates**.
4. **MEDIUM (VULN-2C-04)**: The `public.user_devices` table enforces `UNIQUE (user_id, device_id)`, but does not enforce token uniqueness across users (`fcm_token`). If multiple users share a physical device or reinstall without clearing tokens, a previous user's push notifications can be routed to a subsequent user's device.
5. **MEDIUM (VULN-2C-05)**: The RLS `UPDATE` policy on `public.in_app_notifications` permits recipients to update their own rows (`USING (auth.uid() = user_id)`) without a column-restricting `WITH CHECK`. A recipient can tamper with historical notification text, titles, amounts, or audit metadata.
6. **LOW (VULN-2C-06)**: Under PostgreSQL RLS, an `INSERT ... RETURNING` checks the `SELECT` policy of the returned row. When Member A creates a notification for Member B, a client request with `returning: 'representation'` triggers an RLS violation because Member A cannot `SELECT` Member B's notification.

**Conclusion**: Production Supabase remains completely untouched. Safe remediation must be designed and staged in Phase 2C.2 prior to any production deployment.

---

## 2. Architecture & Data Flow Map

```
┌────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER                               │
│  - src/lib/firebase/pushService.ts                                     │
│  - src/lib/storage/cloudStorageAdapter.ts                              │
│  - public/firebase-messaging-sw.js                                     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
      In-App Notification INSERT                     │ FCM Device Token Registration
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────┐
│  TABLE: public.in_app_notifications  │   │  TABLE: public.user_devices │
│  - RLS: Co-roommate or self INSERT   │   │  - RLS: auth.uid() = user_id│
│  - RLS: auth.uid() = user_id SELECT  │   │  - UNIQUE(user_id,device_id)│
│  - ⚠️ MISSING: sender_id column      │   │  - ⚠️ Token collision issue │
└──────────────────────────────────────┘   └──────────────┬──────────────┘
                                                          │
                                     Push Trigger Request │ (via anon key + Bearer JWT)
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ EDGE FUNCTION: send-push    │
                                           │ - Firebase Admin SDK v1     │
                                           │ - Service-Role Admin Client │
                                           │ - ⚠️ Bypass if no roomId    │
                                           └──────────────┬──────────────┘
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ FIREBASE CLOUD MESSAGING    │
                                           │ - Apple APNs / Android FCM  │
                                           └─────────────────────────────┘
```

### Component Details
* **`public.in_app_notifications`**: Stores notification items delivered to the in-app notification center. RLS enforced via Phase 2B migration `20260920140000_phase2b_authorization_hardening.sql`.
* **`public.user_devices`**: Introduced in migration `20260914020000_in_app_notifications.sql` to manage multi-device FCM tokens per user.
* **`public.profiles.fcm_token`**: Legacy single-token column introduced in `20260910100000_add_fcm_token_to_profiles.sql`.
* **Edge Function `send-push`**: Dispatches push notifications using Google Service Account credentials via Firebase Cloud Messaging HTTP v1 API.

---

## 3. Notification Trust Model & Classification Matrix

Notifications in RoomMate have vastly different trust implications depending on whether they represent platform security actions or interpersonal room events.

| Tier | Category | Types | Originator | Permitted Sender | Trust Level |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Platform & Security** | `ACCOUNT_SECURITY`, `SYSTEM_INFO`, `ADMIN_APPROVAL_REQUIRED` | System / SuperAdmin | `internal.is_super_admin(auth.uid())` OR `service_role` ONLY | **SYSTEM ONLY** |
| **Tier 2** | **Financial Audit** | `PAYMENT_OVERDUE`, `PAYMENT_FAILED`, `PAYMENT_REMINDER`, `SETTLEMENT_RECORDED` | Room Members / System | Active room members involved in the transaction, OR System | **TRANSACTIONAL** |
| **Tier 3** | **Room Activity** | `EXPENSE_ADDED`, `EXPENSE_SETTLED`, `MEMBER_JOINED`, `ROOM_INVITE` | Room Members | Active room members in the designated `room_id` | **MEMBER-GENERATED** |
| **Tier 4** | **Personal & Reminders** | `GENERAL_ACTIVITY`, `PERSONAL_BUDGET_EXCEEDED` | Self / System | Recipient self (`user_id = auth.uid()`) OR System | **USER PRIVATE** |

### Critical Trust Flaw
Currently, the database and the Edge Function treat all notification types uniformly. An ordinary user can insert a Tier 1 `ACCOUNT_SECURITY` or `SYSTEM_INFO` notification into a roommate's inbox, with high priority and fake verification badges, making phishing and social engineering trivial.

---

## 4. Database & RLS Policy Audit

### 4.1 Table: `public.in_app_notifications`
* **Schema Definition**:
  ```sql
  CREATE TABLE public.in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'LOW',
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    action_type TEXT,
    action_target TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    event_id TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false
  );
  ```
* **Current RLS Policies** (from Phase 2B migration):
  1. **INSERT**:
     ```sql
     CREATE POLICY "Users can notify co-roommates or self"
     ON public.in_app_notifications FOR INSERT TO authenticated
     WITH CHECK (
       user_id = auth.uid()
       OR (
         room_id IS NOT NULL
         AND internal.is_room_member(room_id, auth.uid())
         AND internal.is_room_member(room_id, user_id)
       )
       OR internal.is_super_admin(auth.uid())
     );
     ```
     * **Strength**: Effectively prevents cross-room and arbitrary user targeting.
     * **Vulnerability**: Completely unconstrained regarding `type`, `title`, `message`, `priority`, or `metadata`. Lacks `sender_id`.
  2. **SELECT**:
     ```sql
     CREATE POLICY "Users can view their own notifications"
     ON public.in_app_notifications FOR SELECT TO authenticated
     USING (auth.uid() = user_id);
     ```
     * **Strength**: Guarantees recipient isolation.
     * **Side-Effect**: Causes `INSERT ... RETURNING` to fail when sender != recipient.
  3. **UPDATE**:
     ```sql
     CREATE POLICY "Users can update their own notifications"
     ON public.in_app_notifications FOR UPDATE TO authenticated
     USING (auth.uid() = user_id);
     ```
     * **Vulnerability**: Lacks `WITH CHECK` to restrict editable columns. Recipient can alter historical `title`, `message`, `type`, and `metadata` instead of just `is_read`, `read_at`, and `is_deleted`.
  4. **DELETE**:
     * No policy exists (`RESTRICTIVE` by default). Direct SQL deletion is blocked; application uses soft-delete (`is_deleted = true`).

### 4.2 Table: `public.user_devices`
* **Schema Definition**:
  ```sql
  CREATE TABLE public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL,
    app_version TEXT,
    last_active_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT user_devices_user_device_key UNIQUE (user_id, device_id)
  );
  ```
* **Current RLS Policies**:
  * `auth.uid() = user_id` strictly enforced across `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
  * `service_role` has full bypass.
* **Vulnerabilities**:
  * Uniqueness constraint is scoped to `(user_id, device_id)`. If User B signs in on a device previously used by User A, the identical `fcm_token` can exist under both User A and User B. When `send-push` queries by `user_id`, User A's notifications will be delivered to User B's device.

### 4.3 Table: `public.profiles` (`fcm_token` column)
* **Schema Definition**: Contains `fcm_token TEXT`.
* **Current RLS Policy**:
  ```sql
  CREATE POLICY "Users can view self and roommates"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_members rm1
      JOIN public.room_members rm2 ON rm1.room_id = rm2.room_id
      WHERE rm1.user_id = auth.uid()
        AND rm2.user_id = profiles.id
        AND rm1.status = 'ACTIVE'
        AND rm2.status = 'ACTIVE'
    )
  );
  ```
* **Vulnerability**: Active roommates can run `SELECT fcm_token FROM public.profiles WHERE id = :roommate_id;` and obtain the roommate's FCM token.

---

## 5. FCM & `user_devices` Architecture Audit

### 5.1 Device Registration Flow
* Implemented in `src/lib/storage/cloudStorageAdapter.ts` (`registerDevice`):
  * Generates/retrieves persistent client UUID `deviceId` from `localStorage`.
  * Upserts into `public.user_devices` on conflict `(user_id, device_id)`.
  * Also executes `updateProfile({ fcm_token: token })` (legacy fallback).
* **Finding**: `fcm_token` is never invalidated on sign-out across multiple accounts on a shared device.

### 5.2 Device Revocation & Token Deletion
* On user sign-out, `unregisterDevice(deviceId)` deletes the row from `public.user_devices`.
* However, if the user uninstalls the app or clears cache without signing out, the token remains in `user_devices` until FCM returns `UNREGISTERED` / `NOT_FOUND` during push delivery.
* In `supabase/functions/send-push/index.ts`, stale token cleanup is implemented:
  ```typescript
  if (errCode === 'messaging/registration-token-not-registered' || errCode === 'messaging/invalid-registration-token') {
    await supabaseAdmin.from('user_devices').delete().eq('fcm_token', token);
  }
  ```
* **Finding**: The cleanup mechanism in `send-push` is correct and safe, but only triggers when FCM explicitly returns an invalidation error code.

---

## 6. Legacy `profiles.fcm_token` Analysis

### 6.1 Current Classification: `DEPRECATED BUT REQUIRED`
The column cannot be immediately dropped because:
1. **Edge Function Fallback**: In `supabase/functions/send-push/index.ts`:
   ```typescript
   if (tokens.length === 0) {
     const { data: profile } = await supabaseAdmin
       .from('profiles')
       .select('fcm_token')
       .eq('id', uid)
       .maybeSingle();
     if (profile?.fcm_token) tokens.push(profile.fcm_token);
   }
   ```
   Users on older client builds who have not registered via `user_devices` rely on this fallback.
2. **Client Dual-Write**: `src/lib/storage/cloudStorageAdapter.ts` writes to both `user_devices` and `profiles.fcm_token`.

### 6.2 Remediation Strategy
1. **Step 1 (Phase 2C.2)**: Stop dual-writing in frontend client. Ensure all platforms register exclusively in `user_devices`.
2. **Step 2 (Phase 2C.2)**: Migrate existing distinct `profiles.fcm_token` entries into `user_devices` via an idempotent SQL script.
3. **Step 3 (Phase 2C.2)**: Revoke `fcm_token` visibility from `profiles` SELECT policies or nullify `profiles.fcm_token` data.
4. **Step 4 (Future Phase)**: Drop `profiles.fcm_token` column once telemetry verifies 100% device registration migration.

---

## 7. Firebase & Service-Role Boundary Audit

1. **Client Bundles (`src/` & Android Assets)**:
   * Inspected `src/lib/firebase/config.ts`, `src/lib/firebase/pushService.ts`, and capacitor assets.
   * Only public Firebase Client SDK options (`apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`) and VAPID public keys are present.
   * **Zero service-role keys or Firebase service account private keys are bundled into the client application.**
2. **Edge Function Secrets**:
   * Firebase Admin service account JSON (`FIREBASE_SERVICE_ACCOUNT`) and Supabase service-role keys are securely injected as environment variables into Supabase Edge Functions.
   * **Boundary is properly separated.**

---

## 8. RPC & Edge Function Audit (`supabase/functions/send-push`)

### Critical Vulnerability VULN-2C-01: Room Membership Bypass
In `supabase/functions/send-push/index.ts`, lines 90-118:
```typescript
// Validate authorization:
// If caller is authenticated user (not service_role), enforce room membership
if (callerUserId !== 'service_role' && data?.roomId) {
  const { data: memberRecord, error: memberErr } = await supabaseClient
    .from('room_members')
    .select('id')
    .eq('room_id', data.roomId)
    .eq('user_id', callerUserId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (memberErr || !memberRecord) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: caller is not an active member of this room' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
```

#### Flaw Mechanics:
1. **Omitted `roomId`**: If the caller submits `{ "recipientUserIds": ["any-uuid"], "title": "...", "body": "..." }` with no `roomId`, `data?.roomId` evaluates to falsy (`undefined`). The `if` block is **completely bypassed**! The function proceeds directly to fetch tokens and dispatch pushes to any user in the entire database.
2. **Unvalidated Recipients**: Even when `data.roomId` is provided and the caller is validated as a member of `data.roomId`, the function **never verifies that `recipientUserIds` are members of that room**! Caller can specify `roomId: <my_room>` and `recipientUserIds: [<foreign_user_id>]`, and the push will be dispatched.
3. **Unvalidated Notification Content**: Caller can pass arbitrary `title`, `body`, and `data` (including `type: "SYSTEM_ALERT"` or financial notices).

---

## 9. Adversarial Staging Test Matrix

All 18 scenarios were executed against isolated PostgreSQL 15 staging environment (`roommate-staging-db`):

| # | Test Scenario | Actor / Vector | Expected Behavior | Staging Execution Result | Status |
| :- | :--- | :--- | :--- | :--- | :--- |
| **1** | User A targets unrelated User C (no shared room) | `INSERT INTO in_app_notifications (user_id = C, room_id = NULL)` | RLS Policy Violation | Blocked: `violates row-level security policy` | ✅ PASS |
| **2** | User A targets User C referencing Room 2 (A is not in Room 2) | `INSERT INTO in_app_notifications (user_id = C, room_id = Room2)` | RLS Policy Violation | Blocked: `violates row-level security policy` | ✅ PASS |
| **3** | User A injects high-trust `ACCOUNT_SECURITY` to roommate B | `INSERT INTO in_app_notifications (user_id = B, room_id = Room1, type = 'ACCOUNT_SECURITY')` | System-only notification should be restricted | **Allowed**: Row successfully created in User B's inbox | ⚠️ **VULNERABLE** |
| **4** | Check for `sender_id` column on `in_app_notifications` | `SELECT column_name FROM information_schema.columns` | Should exist for accountability | **Missing**: 0 rows found | ⚠️ **VULNERABLE** |
| **5** | User A attempts to reassign `user_id` of User B's notification | `UPDATE in_app_notifications SET user_id = A WHERE id = B_notif` | Blocked by RLS | Blocked: `UPDATE 0` | ✅ PASS |
| **6** | User A attempts to edit User B's notification content | `UPDATE in_app_notifications SET message = 'Tampered' WHERE id = B_notif` | Blocked by RLS | Blocked: `UPDATE 0` | ✅ PASS |
| **7** | User A attempts to SQL DELETE User B notification | `DELETE FROM in_app_notifications WHERE id = B_notif` | Blocked by RLS | Blocked: `DELETE 0`, count = 1 | ✅ PASS |
| **8** | Recipient User B modifies own notification title/message | `UPDATE in_app_notifications SET message = 'Fraud' WHERE user_id = B` | Should be blocked (read-only content) | **Allowed**: Row updated due to unconstrained `UPDATE` policy | ⚠️ **VULNERABLE** |
| **9** | Former member User D (`status = LEFT`) targets Room 1 | `INSERT INTO in_app_notifications (user_id = B, room_id = Room1)` | RLS Policy Violation | Blocked: `violates row-level security policy` | ✅ PASS |
| **10** | Pending member User E targets Room 1 members | `INSERT INTO in_app_notifications (user_id = B, room_id = Room1)` | RLS Policy Violation | Blocked: `violates row-level security policy` | ✅ PASS |
| **11** | Anonymous user attempts notification creation | Anon role INSERT | RLS Policy Violation | Blocked: `violates row-level security policy` | ✅ PASS |
| **12** | User A registers own device in `user_devices` | `INSERT INTO user_devices (user_id = A, ...)` | Success | Succeeded: `dev_a_1` registered | ✅ PASS |
| **13** | User A attempts to register device under User B | `INSERT INTO user_devices (user_id = B, ...)` | RLS Policy Violation | Blocked: `violates row-level security policy` | ✅ PASS |
| **14** | User A attempts to select User B device records | `SELECT * FROM user_devices WHERE user_id = B` | 0 rows returned | Succeeded: 0 rows returned | ✅ PASS |
| **15** | User A attempts to update User B device token | `UPDATE user_devices SET fcm_token = '...' WHERE user_id = B` | Blocked by RLS | Blocked: `UPDATE 0`, token unchanged | ✅ PASS |
| **16** | User A attempts to delete User B device | `DELETE FROM user_devices WHERE user_id = B` | Blocked by RLS | Blocked: `DELETE 0`, count = 1 | ✅ PASS |
| **17** | User A queries `profiles.fcm_token` of Roommate B | `SELECT fcm_token FROM profiles WHERE id = B` | Should NOT reveal token | **Leaked**: Returned `token_user_b` | ⚠️ **VULNERABLE** |
| **18** | Multiple users registering duplicate FCM token | Multiple user IDs inserting identical token | Should detect or handle collision | **Allowed**: Both users hold identical token | ⚠️ **VULNERABLE** |

---

## 10. Detailed Findings & Vulnerability Breakdown

### [VULN-2C-01] CRITICAL: `send-push` Edge Function Global Notification Dispatch Bypass
* **File**: `supabase/functions/send-push/index.ts`
* **Vulnerability Type**: Broken Authorization (CWE-862) / Missing Access Control
* **Description**: The room membership authorization check is wrapped in `if (callerUserId !== 'service_role' && data?.roomId)`. An attacker simply omits `roomId` from the JSON body to bypass all authorization checks, enabling push spam and impersonation against any user on the platform. Additionally, no validation verifies that the recipients belong to `roomId`.
* **Impact**: Global push notification injection, platform phishing, push quota exhaustion.

### [VULN-2C-02] HIGH: In-App Notification System Spoofing & Missing Sender Attribution
* **File**: `public.in_app_notifications` table / RLS policies
* **Vulnerability Type**: Improper Access Control / Sender Impersonation
* **Description**: `public.in_app_notifications` has no `sender_id` column. Any active member of a room can insert notifications into a co-roommate's inbox with `type = 'ACCOUNT_SECURITY'`, `type = 'SYSTEM_INFO'`, or high priorities with zero attribution.
* **Impact**: In-app social engineering, fake security warnings, forged payment requests.

### [VULN-2C-03] HIGH: `profiles.fcm_token` Exposure to Co-Roommates
* **File**: `public.profiles` RLS policy & `cloudStorageAdapter.ts`
* **Vulnerability Type**: Information Exposure (CWE-200)
* **Description**: `profiles.fcm_token` is exposed to all roommates via the `profiles` SELECT policy (`USING (id = auth.uid() OR roommates)`).
* **Impact**: Device fingerprinting, potential FCM push interception or direct targeting if FCM credentials or relay endpoints are abused.

### [VULN-2C-04] MEDIUM: Cross-User Device Token Collision on Shared Devices
* **File**: `public.user_devices`
* **Vulnerability Type**: Cross-User Data Exposure
* **Description**: `user_devices_user_device_key` constraint is `UNIQUE (user_id, device_id)`. If User A and User B share a physical phone, the same FCM token remains linked to User A. When User A is targeted with notifications, they appear on User B's device.
* **Impact**: Privacy violation, cross-user notification leakage on shared hardware.

### [VULN-2C-05] MEDIUM: Recipient Tampering with Audit Notification Content
* **File**: `public.in_app_notifications` UPDATE policy
* **Vulnerability Type**: Integrity Violation
* **Description**: The UPDATE policy allows recipients to execute `UPDATE in_app_notifications SET message = 'Tampered', title = 'Tampered' WHERE user_id = auth.uid();`.
* **Impact**: Recipients can manipulate evidence of financial settlements, expense alerts, or audit trails.

### [VULN-2C-06] LOW: PostgreSQL RLS `RETURNING` Client Failure
* **File**: `public.in_app_notifications` SELECT policy
* **Vulnerability Type**: Operational Fault / RLS Semantic Mismatch
* **Description**: Standard Supabase SDK `insert()` defaults to `RETURNING *`. Because the sender cannot `SELECT` the recipient's notification row, the INSERT fails with an RLS check violation unless `returning: 'minimal'` is specified.

---

## 11. Severity Classification

| Finding ID | Title | CVSS v3.1 | Severity | Exploitability | Remediation Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-2C-01** | Edge Function `send-push` Authorization Bypass | 8.8 (High/Critical) | **CRITICAL** | Trivial (HTTP POST with empty `roomId`) | **P0 (Immediate)** |
| **VULN-2C-02** | In-App Notification System Spoofing & No Sender | 7.1 (High) | **HIGH** | Low complexity (SQL insert via client) | **P1 (High)** |
| **VULN-2C-03** | `profiles.fcm_token` PII/Device Token Leakage | 6.5 (Medium/High) | **HIGH** | Low complexity (`supabase.from('profiles').select()`) | **P1 (High)** |
| **VULN-2C-04** | Cross-User Device FCM Token Collision | 5.3 (Medium) | **MEDIUM** | Moderate (requires shared physical device) | **P2 (Medium)** |
| **VULN-2C-05** | Recipient Notification Content Tampering | 4.3 (Medium) | **MEDIUM** | Low complexity (`UPDATE in_app_notifications`) | **P2 (Medium)** |
| **VULN-2C-06** | `INSERT ... RETURNING` Client RLS Failure | N/A (Functional) | **LOW** | Systematic on client inserts without minimal return | **P2 (Functional)** |

---

## 12. Remediation Plan (Phase 2C.2 Roadmap)

### Phase 2C.2 Proposed Architecture Changes

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE 2C.2 REMEDIATIONS                         │
└────────────────────────────────────────────────────────────────────────┘

1. EDGE FUNCTION HARDENING (supabase/functions/send-push/index.ts)
   ├── Enforce roomId is MANDATORY for all authenticated users (non-service-role).
   ├── Verify caller is an ACTIVE member of roomId.
   ├── Verify ALL recipientUserIds are ACTIVE members of roomId.
   ├── Restrict allowed notification types (Disallow Tier 1 SYSTEM types from clients).
   └── Add payload validation & rate limiting.

2. DATABASE SCHEMA & RLS HARDENING (public.in_app_notifications)
   ├── ALTER TABLE in_app_notifications ADD COLUMN sender_id UUID REFERENCES auth.users(id);
   ├── Set DEFAULT sender_id = auth.uid().
   ├── Trigger/CHECK: Restrict Tier 1 types (ACCOUNT_SECURITY, SYSTEM_INFO) to SuperAdmins.
   ├── UPDATE Policy WITH CHECK: Restrict updates to (is_read, read_at, is_deleted) ONLY.
   └── SELECT Policy: Allow sender_id = auth.uid() to read recently created row (fixes RETURNING).

3. DEVICE TOKEN ISOLATION & PROFILES CLEANUP
   ├── Trigger on user_devices: When a new (user_id, fcm_token) is registered,
   │   deactivate or delete any conflicting rows with the same fcm_token under other users.
   ├── Client cleanup: Stop writing to profiles.fcm_token.
   └── Migrate any legacy profiles.fcm_token to user_devices, then nullify/revoke from profiles.
```

---

## 13. Production Risk Assessment

* **Production Environment State**: **100% UNTOUCHED**.
  * No migrations were pushed to `pbzaaskftrmnvocczhat.supabase.co`.
  * No RLS policies were modified on production.
  * No client-side builds or Edge Functions were deployed.
* **Risk of Delaying Remediation**:
  * The production database is running the Phase 2B authorization model, which already restricts `in_app_notifications` to co-roommates. The primary critical risk resides in the `send-push` Edge Function if deployed on production.

---

## 14. Phase 2C.1 Audit Conclusion

**Final Status**: `REMEDIATION REQUIRED — DO NOT DEPLOY CHANGES YET`

All findings, test outcomes, and architecture flows have been mapped and validated in staging. Phase 2C.1 is complete. We are ready to proceed to **Phase 2C.2: Notification Authenticity & Push Hardening Design & Implementation** upon instruction.
