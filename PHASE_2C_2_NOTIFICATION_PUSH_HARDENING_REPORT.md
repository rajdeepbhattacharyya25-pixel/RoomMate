# RoomMate — Phase 2C.2: Notification Authenticity + Push Hardening Report

**Execution Date**: September 20, 2026  
**Final Status**: `PHASE 2C.2 PASSED — READY FOR PRODUCTION REVIEW`  
**Production Database Target**: `pbzaaskftrmnvocczhat.supabase.co` (**100% UNTOUCHED**)  
**Staging Environment**: PostgreSQL 15 (`roommate-staging-db` on port `54322`)  
**Migration SHA-256**: `08E0E33A1BE8A2DA02D4F692AB21D7B6BABDA5CD398876EC97C4A86EAB9C7C7A`  

---

## 1. Executive Summary

Phase 2C.2 has successfully designed, implemented, and verified the complete notification authenticity and push hardening architecture for RoomMate in an isolated staging environment.

All six vulnerabilities identified in the Phase 2C.1 audit have been eliminated:
1. **CRITICAL (VULN-2C-01)**: The `send-push` Edge Function has been redesigned to enforce mandatory `roomId` validation, caller room membership verification, and **unanimous recipient room membership verification**. Push targeting outside of active shared rooms is completely prevented.
2. **HIGH (VULN-2C-02)**: Added the `sender_id` column to `public.in_app_notifications`. Implemented a `BEFORE INSERT` trigger (`enforce_notification_integrity`) that forces `sender_id` to resolve to the caller's verified `auth.uid()`, strictly blocks non-superadmin clients from creating Tier 1 system/security alerts (`ACCOUNT_SECURITY`, `SYSTEM_INFO`, `ADMIN_APPROVAL_REQUIRED`), and strips spoofed verification metadata.
3. **HIGH (VULN-2C-03)**: Secured `profiles.fcm_token` by establishing an automatic trigger (`sync_and_redact_profile_fcm_token`) that routes any incoming token writes into `public.user_devices` and redacts `profiles.fcm_token` to `NULL`. Roommates querying each other's profiles receive `NULL` for `fcm_token`, restoring token privacy without breaking legitimate profile columns.
4. **MEDIUM (VULN-2C-04)**: Implemented token collision protection on `public.user_devices` via trigger (`handle_user_device_token_collision`). When an active token is registered, any prior stale association of that same token under another user ID is immediately deleted, preventing cross-user push leakage on shared physical devices.
5. **MEDIUM (VULN-2C-05)**: Enforced notification content immutability via trigger (`prevent_notification_tampering`). Recipients can update status fields (`is_read`, `read_at`, `is_deleted`), but any attempt to alter `title`, `message`, `type`, `priority`, `metadata`, `sender_id`, or `user_id` is rejected at the engine level with error `42501`.
6. **LOW (VULN-2C-06)**: Resolved the PostgreSQL RLS `INSERT ... RETURNING` issue by extending the SELECT policy to allow senders to view newly created rows within a tightly scoped 30-second window, without granting access to arbitrary recipient inboxes.

### Verification Highlights
- **Adversarial Security Test Suite**: **43/43 PASSED (100% SUCCESS, 0 FAILED)** across send-push, in-app notifications, FCM devices, and profiles isolation.
- **Frontend Regression Suite**: **34/34 test files passed, 358/358 tests passed**.
- **TypeScript & Production Build**: `npx tsc -b` and `npm run build` completed with zero errors.
- **Production Supabase Target**: **100% UNTOUCHED**.

---

## 2. Files Changed

1. `supabase/migrations/20260920233000_phase2c_notification_push_hardening.sql` (NEW migration)
2. `supabase/functions/send-push/index.ts` (Edge Function hardening)
3. `src/lib/storage/cloudStorageAdapter.ts` (Stopped dual-write to `profiles.fcm_token`, canonical `user_devices` routing, RPC type casts)
4. `scripts/run_staging_migrations.js` (Added Phase 2C migration to sequential staging runner)
5. `scripts/staging_phase2c_suite.js` (Dedicated 43-scenario adversarial test harness)

---

## 3. Migration Identity & Integrity Checksums

| Migration File | Timestamp | SHA-256 Checksum |
| :--- | :--- | :--- |
| `supabase/migrations/20260920140000_phase2b_authorization_hardening.sql` | 2026-09-20 14:00:00 | `040A9B7F6850160C65AB7E83C824F17D0096F8AA99A78D8FAC6303589344A3F9` (UNMODIFIED) |
| `supabase/migrations/20260920233000_phase2c_notification_push_hardening.sql` | 2026-09-20 23:30:00 | `08E0E33A1BE8A2DA02D4F692AB21D7B6BABDA5CD398876EC97C4A86EAB9C7C7A` (NEW) |

---

## 4. `send-push` Authorization Model

The Edge Function (`supabase/functions/send-push/index.ts`) enforces two distinct trust tiers:

```
                              REQUEST ARRIVES
                                     │
                        Extract Authorization Header
                                     ▼
                     Is Bearer Token == Service Key?
                                ┌────┴────┐
                               YES        NO
                                │          │
                       [Service Role]   Validate JWT with Supabase Auth
                                │          │
                                │       Invalid / Missing? ──► Return 401
                                │          │
                                │       Caller = Verified user.id
                                │          │
                                │       1. roomId Mandatory? ──► Missing? ──► Return 400
                                │       2. Recipient Count <= 50? ──► Exceeded? ──► Return 400
                                │       3. Recipient UUIDs valid? ──► Invalid? ──► Return 400
                                │       4. Title <= 100, Body <= 500? ──► Exceeded? ──► Return 400
                                │       5. Type in Forbidden List? ──► Forbidden? ──► Return 403
                                │       6. Payload Data <= 4KB? ──► Exceeded? ──► Return 400
                                │       7. Caller Active in roomId? ──► No? ──► Return 403
                                │       8. ALL Recipients Active in roomId? ──► No? ──► Return 403
                                │       9. Sanitize metadata (strip spoofed claims)
                                │       10. Force data.senderId = callerUserId
                                │          │
                                └──────────┬─────────────────────────────┘
                                           │
                                Query active FCM tokens
                                (user_devices primary, profiles fallback)
                                           │
                                Dispatch via FCM HTTP v1
                                           │
                                On invalid token error:
                                Auto-delete stale token from user_devices
```

### Key Security Invariants in `send-push`:
1. `roomId` is **mandatory** for all non-service-role requests.
2. Caller membership in `roomId` is strictly checked against `public.room_members (status = 'ACTIVE')`.
3. **Every single recipient** in `recipientUserIds` is queried against `public.room_members`. If any recipient does not belong to `roomId` with `status = 'ACTIVE'`, the entire request is rejected with `403 Forbidden`.
4. Client attempts to pass `ACCOUNT_SECURITY`, `SYSTEM_INFO`, or `ADMIN_APPROVAL_REQUIRED` are rejected with `403 Forbidden`.
5. Client-supplied `senderId`, `is_system_verified`, or `verified_by` values in `data` are deleted and overwritten with the caller's authenticated `auth.uid()`.

---

## 5. Notification Trust Model & Classification Matrix

| Tier | Category | Types | Originator | Permitted Channel | Database Restriction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Platform & Security** | `ACCOUNT_SECURITY`, `SYSTEM_INFO`, `ADMIN_APPROVAL_REQUIRED` | SuperAdmin / System | Backend / Service-Role only | Trigger raises `42501` for regular users on INSERT |
| **Tier 2** | **Financial Audit** | `PAYMENT_OVERDUE`, `PAYMENT_REQUIRED`, `PAYMENT_DUE_TO_YOU`, `PAYMENT_FAILED`, `PARTIAL_PAYMENT_RECEIVED`, `SETTLEMENT_REMINDER`, `EXPENSE_DISPUTE` | Transaction Participants | In-app / Push | Allowed for active room members; immutable once created |
| **Tier 3** | **Room Activity** | `EXPENSE_ADDED`, `BILL_ADDED`, `MEMBER_JOINED`, `EXPENSE_MODIFIED`, `EXPENSE_SETTLED`, `ROOM_JOIN_REQUEST`, `ROOM_POLICY_CHANGED` | Room Members | In-app / Push | Allowed only between active room members of the same room |
| **Tier 4** | **Personal & Reminders** | `BUDGET_THRESHOLD_REACHED`, `MONTHLY_REPORT_GENERATED`, `HISTORY_UPDATED`, `GENERAL_ACTIVITY` | User Self / System | In-app | Recipient must equal sender (`user_id = auth.uid()`) |

---

## 6. `in_app_notifications` Schema & RLS Changes

```sql
-- Schema addition
ALTER TABLE public.in_app_notifications 
ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_sender 
ON public.in_app_notifications(sender_id);
```

### Policies Applied:
1. **INSERT**:
   ```sql
   CREATE POLICY "Users can notify co-roommates or self"
   ON public.in_app_notifications FOR INSERT TO authenticated
   WITH CHECK (
     (
       user_id = (SELECT auth.uid())
       OR (
         room_id IS NOT NULL
         AND internal.is_room_member(room_id, (SELECT auth.uid()))
         AND internal.is_room_member(room_id, user_id)
       )
     )
     AND (
       sender_id IS NULL 
       OR sender_id = (SELECT auth.uid())
     )
     OR internal.is_super_admin((SELECT auth.uid()))
   );
   ```
2. **SELECT**:
   ```sql
   CREATE POLICY "Users can view their own notifications"
   ON public.in_app_notifications FOR SELECT TO authenticated
   USING (
     user_id = (SELECT auth.uid())
     OR (
       sender_id = (SELECT auth.uid())
       AND created_at >= (now() - interval '30 seconds')
     )
     OR internal.is_super_admin((SELECT auth.uid()))
   );
   ```
3. **UPDATE**:
   ```sql
   CREATE POLICY "Users can update their own notifications"
   ON public.in_app_notifications FOR UPDATE TO authenticated
   USING (auth.uid() = user_id)
   WITH CHECK (auth.uid() = user_id);
   ```

---

## 7. `sender_id` Design & Audit Attribution

- **Nullability**: `sender_id` is nullable. A `NULL` value is strictly reserved for system/backend-generated alerts and historical rows.
- **Client Forgery Prevention**: The `enforce_notification_integrity` trigger sets `NEW.sender_id := auth.uid()` for all non-superadmin authenticated callers. Any client-provided `sender_id` parameter is ignored/overwritten with the verified JWT subject.

---

## 8. Notification Immutability Design

Trigger `prevent_notification_tampering` intercepts all `BEFORE UPDATE` events on `public.in_app_notifications`:
- If the caller is `service_role` or `SuperAdmin`, the update proceeds.
- For all other authenticated users (recipients):
  - Modifying `id`, `user_id`, `sender_id`, `room_id`, `type`, `title`, `message`, `priority`, `action_type`, `action_target`, `metadata`, `event_id`, or `created_at` raises exception:
    `SECURITY_VIOLATION: Notification content is immutable. Only status fields (is_read, read_at, is_deleted) may be modified.` (Error `42501`).
  - Legitimate updates modifying only `is_read`, `read_at`, or `is_deleted` succeed without error.

---

## 9. `INSERT ... RETURNING` Resolution

- **The Problem**: In PostgreSQL RLS, returning data from `INSERT ... RETURNING` evaluates the table's SELECT policy. Because the sender could previously not `SELECT` a notification addressed to another user, `INSERT ... RETURNING` failed with `42501`.
- **The Solution**: The SELECT policy was extended with:
  `OR (sender_id = (SELECT auth.uid()) AND created_at >= (now() - interval '30 seconds'))`
- **Security Verification**:
  - Senders can retrieve their newly dispatched notification record during insertion.
  - Senders cannot query the recipient's notification inbox or read historical notifications sent to the recipient (confirmed in adversarial scenario 30).

---

## 10. `profiles.fcm_token` Remediation & Auto-Redaction

- **Trigger `sync_and_redact_profile_fcm_token`**:
  Whenever a write to `profiles.fcm_token` occurs (e.g. by legacy clients or direct updates):
  1. The token is upserted into `public.user_devices` under `(user_id, device_id = 'migrated_' || md5(token))`.
  2. `NEW.fcm_token := NULL` is set immediately before writing to `public.profiles`.
- **Outcome**: The stored value in `profiles.fcm_token` is permanently `NULL`. Active roommates querying `SELECT * FROM profiles` or `SELECT fcm_token FROM profiles` receive `NULL`. All legitimate fields (`name`, `email`, `upi_id`, `upi_qr_url`, `avatar_url`) remain 100% accessible.

---

## 11. `user_devices` Remediation & Multi-Device Support

- Primary canonical table for FCM device tokens.
- Secured with RLS: `auth.uid() = user_id` across `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Clients track multiple simultaneous devices per account (phone, tablet, web).

---

## 12. Token Collision Strategy on Shared Devices

- **Trigger `handle_user_device_token_collision`**:
  Executes `BEFORE INSERT OR UPDATE OF fcm_token, is_active ON public.user_devices`.
  When a device registers an active `fcm_token`:
  ```sql
  DELETE FROM public.user_devices
  WHERE fcm_token = NEW.fcm_token
    AND user_id <> NEW.user_id;
  ```
- **Guaranteed Invariant**: An active FCM token can belong to at most one user account at any time. When User B logs in on a physical device previously used by User A, User A's stale device row is automatically purged, preventing cross-user push delivery.

---

## 13. Firebase & Service Role Boundary Audit

- **Client Bundles**: Re-verified that no service role key, Firebase service account credentials, or admin secrets exist in `src/`, `public/`, or Android assets.
- **Edge Function Secrets**: `FIREBASE_SERVICE_ACCOUNT_KEY` and `SUPABASE_SERVICE_ROLE_KEY` reside exclusively in Supabase server-side environment secrets.

---

## 14. Adversarial Test Results (All 43 Scenarios)

The comprehensive test suite `scripts/staging_phase2c_suite.js` was executed against local PostgreSQL 15 staging:

```
================================================================================
ROOMMATE PHASE 2C.2 — ADVERSARIAL NOTIFICATION & PUSH HARDENING TEST SUITE
================================================================================

--- SECTION 1: send-push Edge Function Authorization Tests ---
✅ PASS [1. authenticated user without roomId]
✅ PASS [2. authenticated user with unauthorized roomId]
✅ PASS [3. authenticated user with valid roomId]
✅ PASS [4. valid caller + foreign recipient]
✅ PASS [5. valid caller + mixed valid/foreign recipients]
✅ PASS [6. valid caller + all valid recipients]
✅ PASS [7. anonymous caller]
✅ PASS [8. service_role caller]
✅ PASS [9. forged sender identity sanitized]
✅ PASS [10. forged system notification type]
✅ PASS [11. oversized payload]
✅ PASS [12. invalid recipient UUID]
✅ PASS [13. empty recipients]

--- SECTION 2: in_app_notifications Database & RLS Tests ---
✅ PASS [14. normal user creates allowed room notification]
✅ PASS [15. normal user creates ACCOUNT_SECURITY] (Expected error caught)
✅ PASS [16. normal user creates SYSTEM_INFO] (Expected error caught)
✅ PASS [17. normal user creates ADMIN_APPROVAL_REQUIRED] (Expected error caught)
✅ PASS [18. user targets unrelated user] (Expected error caught)
✅ PASS [19. user targets former roommate] (Expected error caught)
✅ PASS [20. user targets pending member] (Expected error caught)
✅ PASS [21. user modifies message] (Expected error caught)
✅ PASS [22. user modifies title] (Expected error caught)
✅ PASS [23. user modifies type] (Expected error caught)
✅ PASS [24. user modifies priority] (Expected error caught)
✅ PASS [25. user modifies metadata] (Expected error caught)
✅ PASS [26. user modifies sender_id] (Expected error caught)
✅ PASS [27. user modifies user_id] (Expected error caught)
✅ PASS [28. user marks own notification read]
✅ PASS [29. user soft-deletes own notification]
✅ PASS [30. sender cannot read recipient inbox]
✅ PASS [31. INSERT RETURNING behavior]

--- SECTION 3: FCM & user_devices Security Tests ---
✅ PASS [32. user registers own device]
✅ PASS [33. user registers another user device] (Expected error caught)
✅ PASS [34. user reads another user device]
✅ PASS [35. user updates another user token]
✅ PASS [36. user deletes another user device]
✅ PASS [37. duplicate token scenario (collision cleanup)]
✅ PASS [38. account switching scenario]
✅ PASS [39. logout scenario (device deactivation)]
✅ PASS [40. stale token cleanup]

--- SECTION 4: profiles Privacy & Isolation Tests ---
✅ PASS [41. roommate attempts to read fcm_token]
✅ PASS [42. own profile access]
✅ PASS [43. legitimate roommate profile fields remain accessible]

================================================================================
TEST RUN COMPLETE: Summary of All 43 Scenarios
================================================================================
Total Scenarios Tested: 43
Passed Assertions: 43/43

🎉 ALL 43 ADVERSARIAL & HARDENING TESTS PASSED!
```

---

## 15. Frontend Regression Results

- **Vitest Test Suite**:
  ```
  Test Files  34 passed (34)
       Tests  358 passed (358)
    Duration  8.42s
  ```
- **TypeScript Compilation (`npx tsc -b`)**: Exited with code 0 (zero errors).
- **Vite Production Build (`npm run build`)**: Exited with code 0; generated clean production bundle in `dist/`.

---

## 16. Bypass Search Results

1. **Push Dispatch Bypass**: Exhaustive grep confirmed that `send-push` is the sole Edge Function handling push dispatch, and `pushService.ts` is the sole client dispatch utility. There is no alternative path to trigger FCM pushes.
2. **Direct Notification Insertion Bypass**: All in-app notifications originate from `createInAppNotificationCloud`, which inserts into `public.in_app_notifications`. The PostgreSQL engine triggers and RLS policies intercept all direct SQL and REST API calls.
3. **Admin Credential Search**: Zero service-role or Firebase private keys found in client bundles.

---

## 17. Remaining Risks

- **FCM Server Key Configuration**: In production, push notifications require valid Google Cloud Service Account credentials injected into Supabase Edge Function secrets (`FIREBASE_SERVICE_ACCOUNT_KEY`). If unconfigured, pushes fall back to logging without crashing.
- **Client Version Transition**: Older client APKs will continue to function without error because `profiles.fcm_token` writes are automatically routed to `user_devices` by the database trigger.

---

## 18. Production Deployment Plan (Controlled Pre-conditions)

1. **Step 1**: Final code review of `supabase/functions/send-push/index.ts` and `supabase/migrations/20260920233000_phase2c_notification_push_hardening.sql`.
2. **Step 2**: Ensure owner authorization before connecting to production `pbzaaskftrmnvocczhat`.
3. **Step 3**: Apply migration `20260920233000_phase2c_notification_push_hardening.sql` using Supabase CLI or Dashboard SQL Editor.
4. **Step 4**: Deploy Edge Function `supabase functions deploy send-push`.
5. **Step 5**: Execute production smoke tests (verify room notifications, mark-as-read, device registration).

---

## 19. Rollback Plan

If an unforeseen incompatibility occurs:
```sql
-- Revert Phase 2C policies to Phase 2B state
DROP TRIGGER IF EXISTS trg_enforce_notification_integrity ON public.in_app_notifications;
DROP FUNCTION IF EXISTS public.enforce_notification_integrity();

DROP TRIGGER IF EXISTS trg_prevent_notification_tampering ON public.in_app_notifications;
DROP FUNCTION IF EXISTS public.prevent_notification_tampering();

DROP TRIGGER IF EXISTS trg_user_device_token_collision ON public.user_devices;
DROP FUNCTION IF EXISTS public.handle_user_device_token_collision();

DROP TRIGGER IF EXISTS trg_sync_and_redact_profile_fcm_token ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_and_redact_profile_fcm_token();
```

---

## 20. Exact Production Migration Preconditions

Before deploying Phase 2C to production:
1. `20260920140000_phase2b_authorization_hardening.sql` must already be applied on production.
2. Production database schema must have tables `public.in_app_notifications`, `public.user_devices`, and `public.profiles`.
3. Edge Function secret `FIREBASE_SERVICE_ACCOUNT_KEY` should be verified in Supabase Dashboard.
4. Migration SHA-256 must match `08E0E33A1BE8A2DA02D4F692AB21D7B6BABDA5CD398876EC97C4A86EAB9C7C7A`.

---

## Final Status

`PHASE 2C.2 PASSED — READY FOR PRODUCTION REVIEW`
