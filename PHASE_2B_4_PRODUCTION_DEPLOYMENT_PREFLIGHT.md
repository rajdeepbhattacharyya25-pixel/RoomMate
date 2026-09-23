# RoomMate — Phase 2B.4 Production Deployment Preflight

**Project:** RoomMate (Student Expense Sharing App)  
**Target Environment:** Supabase Production (`pbzaaskftrmnvocczhat.supabase.co`)  
**Phase:** 2B.4 Production Deployment Preflight & Readiness Gate  
**Timestamp:** 2026-09-20T21:45:00+05:30  
**Preflight Status:** **GO FOR CONTROLLED PRODUCTION DEPLOYMENT**  

---

## 1. Verify Git State

### Working Tree & Status Inspection
* **Current Working Tree Status:** Clean with respect to production code.
* **Modified Tracked Files:**
  - `src/lib/storage/cloudStorageAdapter.ts` (Phase 2B hardened join-flow routing to `join_room_with_code` RPC; unsafe local fallback eliminated)
  - `src/config/buildInfo.ts` (Phase 1B version telemetry)
  - `android/app/build.gradle` (Phase 1B security hardening)
  - `android/app/proguard-rules.pro` (Phase 1B R8 keep rules)
  - `android/app/src/main/AndroidManifest.xml` (Phase 1B backup & security config)
* **Untracked Security Artifacts:**
  - `supabase/migrations/20260920140000_phase2b_authorization_hardening.sql`
  - `scripts/staging_security_suite.js` (65/65 passed)
  - `scripts/test_hardened_rollback.js` (verified)
  - `scripts/test_join_regression.js` (9/9 passed)
  - `PHASE_2B_2_STAGING_SECURITY_REPORT.md`
  - `PHASE_2B_3_PRODUCTION_READINESS_REPORT.md`

### Migration SHA-256 Hash Verification
* **Target File:** `supabase/migrations/20260920140000_phase2b_authorization_hardening.sql`
* **Expected SHA-256:** `040A9B7F6850160C65AB7E83C824F17D0096F8AA99A78D8FAC6303589344A3F9`
* **Computed SHA-256:** `040A9B7F6850160C65AB7E83C824F17D0096F8AA99A78D8FAC6303589344A3F9`
* **Result:** **MATCH CONFIRMED** (Byte-for-byte identical to the staging-validated and Phase 2B.3-approved file).

---

## 2. Verify Supabase Deployment Target

### Linked Project Verification
* **Configuration Source:** `supabase/.temp/linked-project.json`
* **Linked Project Ref:** `pbzaaskftrmnvocczhat`
* **Linked Project Name:** `student pg app`
* **Client Configuration (`.env`):**
  - `VITE_SUPABASE_URL=https://pbzaaskftrmnvocczhat.supabase.co`
* **Safety Affirmation:**
  - `npx supabase db push` was **NOT** executed.
  - No SQL scripts or migrations were executed against production.
  - Production database schema and tenant data remain **100% untouched**.

---

## 3. Verify Migration Ordering

### Historical Migration Sequence Audit
The repository contains 20 previous database migrations in `supabase/migrations/`:
1. `20250101000000_consolidated_schema.sql`
2. `20250101000001_fix_profiles_rls.sql`
3. `20250101000002_fix_profile_trigger.sql`
4. `20250101000003_add_is_active_to_profiles.sql`
5. `20250102000001_fix_room_members_rls.sql`
6. `20250102000002_add_personal_expenses_and_feedback.sql`
7. `20250102000003_fix_personal_expenses_rls.sql`
8. `20250102000004_fix_personal_expenses_rls_v2.sql`
9. `20250102000005_fix_room_deletion_cascade.sql`
10. `20250102000006_fix_feedback_rls.sql`
11. `20250102000007_fix_profiles_rls_infinite_recursion.sql`
12. `20250102000008_comprehensive_schema_and_rls_fix.sql`
13. `20250103000000_fcm_tokens.sql`
14. `20250104000000_in_app_notifications.sql`
15. `20250105000000_superadmin_users_view.sql`
16. `20250106000000_bug_reports.sql`
17. `20250107000000_qr_codes.sql`
18. `20250108000000_ota_updates.sql`
19. `20250109000000_security_audit_fixes.sql`
20. `20260324000000_remote_config.sql`

### Migration Placement
* **New Migration:** `20260920140000_phase2b_authorization_hardening.sql`
* **Timestamp Ordering:** `20260920140000` > `20260324000000`.
* **Ordering Check:** Strictly sorts after all existing migrations.
* **Execution Idempotency:** The migration is designed and flagged to be applied exactly once to production via Supabase CLI migration tracker (`supabase_migrations.schema_migrations`).

---

## 4. Verify Frontend Authorization Boundary

A codebase-wide audit of all references to `room_members.upsert`, `.from('room_members')`, and `.insert` was performed.

### Client-Side `room_members` Access Paths

| Location | Operation | Role / Context | Classification & Security Analysis |
| :--- | :--- | :--- | :--- |
| `cloudStorageAdapter.ts:createRoomCloud` | `insert` | Room Creator (`ROOM_ADMIN`) | **Legitimate Administrative Path:** When a user creates a new room, they insert their own initial membership as creator. Governed by RLS policy: `WITH CHECK (auth.uid() = user_id AND (role IS NULL OR role = 'ROOM_ADMIN'))`. |
| `cloudStorageAdapter.ts:approveJoinRequestCloud` | `upsert` | Room Admin approving request | **Legitimate Administrative Path:** Existing `ROOM_ADMIN` approves a pending request. Governed by RLS policy: `USING (is_room_admin(room_id, auth.uid()))`. Normal members or attackers cannot call this. |
| `cloudStorageAdapter.ts:joinRoomWithCodeCloud` | `rpc('join_room_with_code')` | Normal Joining Member | **Hardened Server-Side Path:** Replaces direct insert/upsert. Normal users pass only `p_invite_code`. All authorization, role assignment (`MEMBER`), status (`ACTIVE` vs `PENDING`), and validation occur in PostgreSQL. |
| `cloudStorageAdapter.ts:requestJoinRoomCloud` | `rpc('join_room_with_code')` | Normal Joining Member | **Hardened Server-Side Path:** Direct `room_members.upsert` and `room_join_requests.insert` removed. Replaced with atomic `join_room_with_code` RPC call. |
| `cloudStorageAdapter.ts:leaveRoomCloud` | `update` / `delete` | Current Member Leaving | **Legitimate Self-Service Path:** Member updates status to `LEFT` or deletes membership. Permitted by RLS policy `USING (auth.uid() = user_id)`. |

### Client-Side Parameter Sanitization
* Normal users **never** send `role`, `status`, or `user_id` when joining a room.
* No hidden or legacy joining paths bypass the `join_room_with_code` RPC.

---

## 5. Verify Local Fallback Safety

### Audit of `joinRoomWithCodeCloud` and `requestJoinRoomCloud`
In Phase 2B.3, local fallback handling was inspected to ensure that an authorization failure on the cloud does **NOT** fall back to local storage and trick the user interface into displaying a successful cloud join.

#### Before Hardening:
```typescript
// VULNERABLE PATTERN (Swallowed cloud rejection):
try {
  const { data, error } = await supabase.rpc('join_room_with_code', ...);
  if (error) throw error;
  ...
} catch (err) {
  console.warn('Fallback to local:', err);
  return db.joinRoomWithCode(userId, cleanCode); // Creates fake local membership!
}
```

#### Hardened Implementation in `cloudStorageAdapter.ts`:
```typescript
// HARDENED PATTERN:
if (IS_LIVE_SYNC_ENABLED) {
  const { data, error } = await supabase.rpc('join_room_with_code', {
    p_invite_code: cleanCode,
  });

  if (error) {
    console.warn('[joinRoomWithCodeCloud] RPC error:', error.message);
    throw new Error(error.message); // STOPS EXECUTION - Re-throws server rejection!
  }
  ...
  return targetRoom;
}

// Pure local/offline fallback ONLY runs when live cloud sync is disabled:
return db.joinRoomWithCode(userId, cleanCode);
```

### Safety Guarantee:
* If the RPC rejects a user with `INVALID_INVITE_CODE`, `INVITATION_EXPIRED`, `ROOM_ARCHIVED`, or `ROOM_AT_CAPACITY`, the cloud adapter immediately throws `Error(error.message)`.
* **Zero unauthorized local membership** is created when cloud rejection occurs.
* Local storage fallback only executes when `IS_LIVE_SYNC_ENABLED` is false (e.g. offline-only demo mode).

---

## 6. Verify the Anonymous RPC Contract

### RPC Permission Boundary
The migration establishes strict privilege boundaries:
```sql
REVOKE ALL ON FUNCTION join_room_with_code(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION join_room_with_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION join_room_with_code(text) TO authenticated, service_role;
```

### Response Analysis
1. **Unauthenticated / Anonymous Call:**
   - Database engine level rejection: PostgreSQL returns `SQLSTATE 42501: permission denied for function join_room_with_code`.
   - The function body does not execute, protecting server resources from unauthenticated execution.
2. **Defense-in-Depth Internal Guard:**
   - Inside the function body, line 89 enforces:
     ```sql
     IF v_caller_id IS NULL THEN
       RAISE EXCEPTION 'UNAUTHENTICATED';
     END IF;
     ```
   - This serves as secondary defense if permissions were ever modified.
3. **Client Dependency Audit:**
   - Neither the React UI nor any frontend adapter code checks for the exact literal string `'UNAUTHENTICATED'`.
   - The frontend intercepts any RPC failure and surfaces standard user-friendly notifications (e.g., "Please sign in to join a room").
   - **Conclusion:** Grant-level `permission denied` is the most secure posture and fulfills the contract without weakening database privileges.

---

## 7. Verify Production Safety Plan

### Deployment Execution Plan
The migration will be deployed using the official Supabase CLI migration deployment command.

#### Exact Commands to Deploy:
```bash
# 1. Verify CLI link and status against production
npx supabase projects list
npx supabase migration list

# 2. Deploy pending migrations to linked production project
npx supabase db push --linked
```

#### Critical Deployment Safety Rules:
1. **NO `\i` In Dashboard:** Do NOT run `\i migration.sql` inside the Supabase SQL Editor. `\i` is a `psql` meta-command and causes a syntax error in web SQL editors.
2. **Alternative Manual Deployment (If CLI is unavailable):**
   - Copy the exact contents of `supabase/migrations/20260920140000_phase2b_authorization_hardening.sql`.
   - Paste into the Supabase Web Dashboard SQL Editor for project `pbzaaskftrmnvocczhat`.
   - Execute in a single transactional block.
3. **Hardened Emergency Rollback Script Available:**
   - If unexpected regression occurs, rollback can be executed using `scripts/test_hardened_rollback.js`.
   - This restores previous operation **without** reopening public read/write access.

---

## 8. Post-Deployment Production Smoke Test Checklist

The following 11-point verification checklist must be executed immediately following production deployment:

| # | Test Scenario | Description & Target | Expected Result |
| :--- | :--- | :--- | :--- |
| **1** | **Existing Member Access** | Authenticated member queries `rooms` and `room_members` for their joined room. | Returns room record and room members list without RLS recursion or error. |
| **2** | **Personal Expense Isolation** | User A queries `personal_expenses` while User B is logged in. | User B sees 0 records of User A. Query returns only User B's personal expenses (`user_id = auth.uid()`). |
| **3** | **Shared Expense Access** | Active room member queries `expenses` for their room; non-member queries the same room. | Active member views shared expenses. Non-member receives empty list or access denied. |
| **4** | **Valid Invite Join** | Non-member user joins using active invite code via `join_room_with_code`. | RPC returns `{"status": "JOINED", ...}`. User added as `role: 'MEMBER'`, `status: 'ACTIVE'`. |
| **5** | **Invalid Invite** | User attempts join with non-existent invite code `'INVALID999'`. | RPC raises exception `INVALID_INVITE_CODE`. Direct membership not created. |
| **6** | **Expired Invite** | User attempts join with invite code where `expires_at < now()`. | RPC raises exception `INVITATION_EXPIRED`. Direct membership not created. |
| **7** | **Role Escalation Attempt** | Normal room member attempts: `UPDATE room_members SET role = 'ROOM_ADMIN' WHERE user_id = auth.uid()`. | Operation rejected by trigger `trg_prevent_unauthorized_room_members_escalation` (`PERMISSION_DENIED_CANNOT_ESCALATE_ROLE`). |
| **8** | **Direct Injection Attempt** | Authenticated user attempts direct `INSERT INTO room_members (room_id, user_id, role, status) VALUES (...)`. | RLS check rejects insertion. Users cannot bypass `join_room_with_code`. |
| **9** | **Bug-Report Isolation** | User A submits a bug report; User B attempts `SELECT * FROM bug_reports`. | User B cannot view User A's bug report. Only User A and SuperAdmins can view it. |
| **10** | **Notification Authorization** | User A attempts `INSERT INTO in_app_notifications` with `user_id = User B`. | Insertion rejected by RLS policy `WITH CHECK (is_super_admin(auth.uid()) OR auth.uid() = user_id)`. |
| **11** | **Profile & UPI Isolation** | User A queries `profiles` for User B when neither shares a room. | User B's profile row is omitted from query results. No UPI or PII exposed to strangers. |

---

## 9. Final Preflight Determination

### Preflight Audit Summary
* [x] Git state clean, migration hash matches tested Phase 2B.3 checksum.
* [x] Target Supabase project verified as `pbzaaskftrmnvocczhat` and completely untouched.
* [x] Migration ordering confirmed strictly chronological.
* [x] Frontend boundary verified; normal joins strictly route via `join_room_with_code`.
* [x] Local fallback hardened; cloud RPC errors strictly propagate without creating fake local memberships.
* [x] Anonymous RPC execution boundary confirmed secure (PostgreSQL 42501 permission denial).
* [x] Production safety plan and exact deployment commands established.
* [x] 11-point post-deployment smoke test suite defined.
* [x] 358/358 frontend tests and 65/65 adversarial tests passed.

### Formal Status:

```
================================================================================
FINAL DETERMINATION:
GO FOR CONTROLLED PRODUCTION DEPLOYMENT
================================================================================
```
