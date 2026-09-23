# ROOMMATE — PHASE 2C.3
# FINANCIAL, PAYMENT & SUBSCRIPTION AUTHORIZATION AUDIT REPORT

**Date**: September 21, 2026  
**Auditor**: Antigravity Autonomous Security Subagent  
**Scope**: All financial, payment, settlement, billing, subscription, monetization tables, RPCs, Edge Functions, and client adapters.  
**Target Environment**: Isolated Staging Database (`roommate-staging-db`, PostgreSQL 15, Port 54322).  
**Production Status**: **100% UNTOUCHED** (`pbzaaskftrmnvocczhat.supabase.co` was not contacted).  

---

## 1. EXECUTIVE SUMMARY

An exhaustive authorization, IDOR/BOLA, integrity, and cryptographic audit was performed across all monetization, expense sharing, settlement, billing, and subscription components of RoomMate.

### Authoritative Finding Summary:
* **CRITICAL**: 1
* **HIGH**: 4
* **MEDIUM**: 1
* **LOW**: 1
* **INFO**: 1

### Key Vulnerabilities Discovered:
1. **VULN-2C3-01 (CRITICAL)**: Ambiguous variable reference in `public.get_room_balances` causing runtime crash on every query by legitimate room members.
2. **VULN-2C3-02 (HIGH)**: Unrestricted `paid_by` attribution and mutable `total_amount` / `paid_by` in `public.shared_expenses` allowing credit theft and balance distortion.
3. **VULN-2C3-03 (HIGH)**: Arbitrary non-member split assignment and duplicate split inflation in `public.expense_splits` without total sum validation.
4. **VULN-2C3-04 (HIGH)**: Unverified settlement creation, non-member `payee_id`, and self-settlement debt-wiping in `public.settlement_payments`.
5. **VULN-2C3-05 (HIGH)**: Purely client-side Razorpay webhook simulation without server-side verification or backend webhook ingestion.
6. **VULN-2C3-06 (MEDIUM)**: Broken column name reference (`amount` instead of `total_amount`) in `public.super_admin_get_platform_metrics`.
7. **VULN-2C3-07 (LOW)**: Unsafe `onConflict: 'shared_expense_id,user_id'` in `offlineQueue.ts` against an unconstrained table.

---

## 2. FINANCIAL ARCHITECTURE INVENTORY

The RoomMate financial architecture spans four operational layers:

### A. Database Tables (`public`)
1. `personal_expenses`: Private financial ledger strictly isolated to individual users.
2. `shared_expenses`: Shared bills created within room boundaries.
3. `expense_splits`: Breakdown of shared expense liabilities per roommate.
4. `settlement_payments`: Peer-to-peer debt settlement records between roommates.
5. `user_subscriptions`: SaaS monetization subscription records (plans: `FREE`, `PRO`, `CAMPUS_MAX`).
6. `subscription_events`: Ingested payment gateway event audit log.
7. `audit_logs`: System audit trail recording security, room, and financial operations.

### B. Database Functions & RPCs
1. `public.get_room_balances(p_room_id UUID)`: Calculates net debtor/creditor ledger for room members.
2. `public.super_admin_get_platform_metrics()`: Aggregates MRR, active subscriptions, and gross transaction volume.
3. `public.check_room_not_frozen()`: Trigger blocking inserts into `shared_expenses` if room is frozen.
4. `public.delete_user_account()`: Account deletion RPC handling anonymization and cleanup of financial references.

### C. Edge Functions
- `send-push`: Handles FCM notifications (hardened in Phase 2C.2).
- `telemetry-webhook`: Ingests operational alerts and crash metrics.
- *(Note: No backend Edge Function exists for payment gateway or Razorpay webhook ingestion).*

### D. Frontend Adapters & Queues
- `src/lib/storage/cloudStorageAdapter.ts`: Manages cloud synchronization for expenses and settlements.
- `src/lib/storage/offlineQueue.ts`: Queues offline expense and settlement mutations with optimistic replay.
- `src/lib/storage/mockStorage.ts`: Houses local in-memory fallback state and client-side Razorpay webhook simulation.
- `src/lib/supabase/supabaseService.ts`: Secondary API service providing full state synchronization.

---

## 3. FINANCIAL TRUST MODEL

| Object | Owner | Reader | Creator | Modifier | Sensitive Fields | Required Authorization |
|---|---|---|---|---|---|---|
| `personal_expenses` | `user_id` (Creator) | Owner only | Owner only | Owner only | `amount`, `category`, `notes` | `auth.uid() = user_id` |
| `shared_expenses` | Room (`room_id`) | Active Room Members | Active Room Members | Creator or Room Admin | `total_amount`, `paid_by`, `split_method` | Active member of `room_id` |
| `expense_splits` | Expense (`shared_expense_id`) | Active Room Members | Active Room Members | None (Immutable) | `user_id`, `share_amount` | Active member of expense's room |
| `settlement_payments` | Room (`room_id`) | Active Room Members, Payer, Payee | Payer only | None (Immutable) | `amount`, `payer_id`, `payee_id` | Active member of `room_id` & `payer_id = auth.uid()` |
| `user_subscriptions` | User (`user_id`) | Owner & SuperAdmin | System / Service Role | System / Service Role | `plan_code`, `status`, `current_period_end` | Read: `auth.uid() = user_id`; Write: `service_role` |
| `subscription_events` | System / Gateway | SuperAdmin & Service Role | Gateway / Service Role | None (Append-only) | `razorpay_event_id`, `event_type`, `payload` | `service_role` only |
| `audit_logs` | System | SuperAdmin | System / Authenticated | None (Immutable) | `action`, `resource_type`, `metadata` | Read: SuperAdmin; Insert: Authenticated |

---

## 4. TABLES & RLS AUDIT

### 4.1 `public.personal_expenses`
- **Policies**: Single policy `Personal expenses are strictly isolated to owner` for `ALL` operations (`USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`).
- **Audit Finding**: **SECURE**. Isolation holds across SELECT, INSERT, UPDATE, and DELETE. No cross-user leakage detected.

### 4.2 `public.shared_expenses`
- **Policies**:
  - `SELECT`: `is_room_member(room_id, auth.uid())`
  - `INSERT`: `is_room_member(room_id, auth.uid()) AND (created_by = auth.uid())`
  - `UPDATE`: `((created_by = auth.uid() OR is_room_admin(room_id, auth.uid())) AND is_room_member(room_id, auth.uid()))`
  - `DELETE`: No policy (hard delete disallowed).
- **Vulnerabilities**:
  - **VULN-2C3-02A**: `INSERT` does not check that `paid_by` is an active room member. An outsider UUID can be inserted.
  - **VULN-2C3-02B**: `UPDATE` has no `WITH CHECK` and no column restrictions. The creator or room admin can arbitrarily modify `paid_by` (transferring credit) or `total_amount` without updating associated `expense_splits`.

### 4.3 `public.expense_splits`
- **Policies**:
  - `SELECT`: `EXISTS (SELECT 1 FROM shared_expenses se WHERE se.id = shared_expense_id AND is_room_member(se.room_id, auth.uid()))`
  - `INSERT`: Same check as SELECT.
  - `UPDATE` & `DELETE`: No policy.
- **Vulnerabilities**:
  - **VULN-2C3-03A**: `INSERT` does not validate that `expense_splits.user_id` belongs to the room.
  - **VULN-2C3-03B**: No unique constraint on `(shared_expense_id, user_id)` allows inserting duplicate splits for the same user, multiplying their debt.
  - **VULN-2C3-03C**: No trigger or constraint ensures $\sum \text{share\_amount} = \text{total\_amount}$.

### 4.4 `public.settlement_payments`
- **Policies**:
  - `SELECT`: `is_room_member(room_id, auth.uid()) OR payer_id = auth.uid() OR payee_id = auth.uid()`
  - `INSERT`: `payer_id = auth.uid() AND is_room_member(room_id, auth.uid())`
  - `UPDATE` & `DELETE`: No policy.
- **Vulnerabilities**:
  - **VULN-2C3-04A**: `INSERT` does not check that `payee_id` is an active room member.
  - **VULN-2C3-04B**: Self-settlement (`payee_id = payer_id`) is accepted, allowing users to wipe their debt without paying anyone.
  - **VULN-2C3-04C**: Settlements immediately affect room balances without payee confirmation or receipt verification.

### 4.5 `public.user_subscriptions`
- **Policies**:
  - `SELECT`: `user_id = auth.uid()`
  - `INSERT`, `UPDATE`, `DELETE`: No policy for `authenticated`.
- **Audit Finding**: Direct manipulation of subscription status via PostgREST is blocked by default RLS denial.

### 4.6 `public.subscription_events`
- **Policies**:
  - `ALL`: `service_role` only (`USING (true) WITH CHECK (true)`).
- **Audit Finding**: **SECURE**. Normal authenticated users cannot insert or view webhook events.

---

## 5. RPC & DATABASE FUNCTION INVENTORY

### 5.1 `public.get_room_balances(p_room_id UUID)`
- **Security Type**: `SECURITY INVOKER`
- **Vulnerability (VULN-2C3-01 - CRITICAL)**:
  Line 4 contains an ambiguous column reference:
  ```sql
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  ) THEN
  ```
  Because the return table defines `user_id UUID`, PL/pgSQL cannot distinguish between the return parameter `user_id` and `public.room_members.user_id`. Every invocation by an active room member crashes with:
  `ERROR: column reference "user_id" is ambiguous`

### 5.2 `public.super_admin_get_platform_metrics()`
- **Security Type**: `SECURITY DEFINER`
- **Vulnerability (VULN-2C3-06 - MEDIUM)**:
  Line 112 executes:
  ```sql
  SELECT COALESCE(SUM(amount), 0.00) INTO v_gross_volume FROM public.shared_expenses;
  ```
  `shared_expenses` has column `total_amount`, not `amount`. Calling this function produces:
  `ERROR: column "amount" does not exist`

---

## 6. PAYMENT GATEWAY & RAZORPAY INVENTORY

An exhaustive search of the codebase was conducted for payment gateway integration:
1. **SDK / Dependencies**: No official Razorpay SDK (`razorpay` npm package) is installed.
2. **Backend Gateway Integration**: **NON-EXISTENT**. No Edge Function, Supabase function, or backend server endpoint exists to create orders (`orders.create`), capture payments (`payments.capture`), or verify cryptographic signatures.
3. **Frontend Implementation**:
   - In `src/components/UserSubscription.tsx`, the payment checkout flow generates a random event ID (`evt_rzp_` + random string) and simulates an upgrade.
   - In `src/lib/storage/mockStorage.ts`, `processRazorpayWebhook` runs entirely in the browser, accepting client-supplied `eventType`, `eventId`, and `payload`, and sets `sub.status = 'ACTIVE'`, `sub.planCode = 'PRO'`.
4. **Security Finding (VULN-2C3-05 - HIGH)**: The current monetization implementation is purely a client-side simulation. If deployed in production without backend signature verification, any user can escalate their account to premium for free.

---

## 7. WEBHOOK SECURITY AUDIT

| Webhook Metric | Telemetry Webhook (`telemetry-webhook`) | Razorpay Webhook (Simulated) |
|---|---|---|
| Ingestion Endpoint | `supabase/functions/telemetry-webhook` | None (Client-side mock only) |
| Secret Validation | Checked against `TELEMETRY_WEBHOOK_SECRET` | None |
| Signature Algorithm | None (Bearer token / header secret) | None |
| Replay Protection | None | Client-side idempotency in `mockStorage.ts` |
| Database Target | `public.system_incidents` | `public.subscription_events` (via `service_role` in schema, unused) |

---

## 8. SUBSCRIPTION & ENTITLEMENT SECURITY

- **Database Layer**: `user_subscriptions` is read-only for `authenticated` users via PostgREST. Direct SQL tampering via client JWT is denied.
- **Client Sync Vulnerability**: In `src/lib/supabase/supabaseService.ts`, `syncFullStateToCloud` attempts to execute:
  `await supabase.from('user_subscriptions').upsert(subRows, { onConflict: 'id' });`
  Because `authenticated` users have no `INSERT` or `UPDATE` policy on `user_subscriptions`, this sync call fails silently or throws an RLS error.
- **Entitlement Boundary**: Client-side entitlement checks (`subscription.planCode === 'PRO'`) rely on local state which can be forged via browser devtools or local storage.

---

## 9. SUPERADMIN FINANCIAL BOUNDARY

- SuperAdmin role check uses `internal.is_super_admin(auth.uid())` which queries `profiles.role = 'SUPER_ADMIN'`.
- Normal students cannot invoke SuperAdmin platform RPCs (`super_admin_get_platform_metrics` throws `ACCESS_DENIED: Caller lacks SUPER_ADMIN privileges`).
- `audit_logs` table is strictly protected:
  - `SELECT`: SuperAdmin only (`public.is_super_admin(auth.uid())`). Normal users receive 0 rows.
  - `UPDATE` & `DELETE`: Denied (no policies exist).
  - `INSERT`: Allowed for `authenticated` to record activity events.

---

## 10. ADVERSARIAL STAGING TEST RESULTS (60 SCENARIOS)

The dedicated test suite `scripts/staging_financial_suite.js` was executed in staging against `roommate-staging-db`.

### Results Matrix:

```text
============================================================
ROOMMATE PHASE 2C.3: FINANCIAL ADVERSARIAL STAGING SUITE
============================================================

--- DOMAIN 1: PERSONAL EXPENSE ISOLATION ---
[TEST 1] PASS: User A creates personal expense for User A -> Created expense 86e08dd1-c8ca-429f-8ea7-b3fffa5673ec
[TEST 2] PASS: User A reads own personal expense -> 1 row returned
[TEST 3] PASS: User A updates own personal expense -> Updated 1 row
[TEST 4] PASS: User B attempts to read User A personal expense -> 0 rows visible (isolated)
[TEST 5] PASS: User B attempts to update User A personal expense -> 0 rows updated (blocked by RLS)
[TEST 6] PASS: User B attempts to delete User A personal expense -> 0 rows deleted (blocked by RLS)
[TEST 7] PASS: User B attempts to forge personal expense owned by User A -> Rejected by RLS WITH CHECK
[TEST 8] PASS: User A deletes own personal expense -> Deleted 1 row

--- DOMAIN 2: SHARED ROOM EXPENSE AUTHORIZATION & CROSS-ROOM ISOLATION ---
[TEST 9] PASS: Room A member (User A) creates shared expense in Room A -> Created shared expense fcdf467c-cbdd-4823-a5e8-47ddfd398fa0
[TEST 10] PASS: Room A member (User B) reads Room A shared expense -> 1 row visible
[TEST 11] PASS: Unrelated user (User C in Room B) attempts to read Room A shared expense -> 0 rows visible (cross-room isolated)
[TEST 12] PASS: Unrelated user (User C) attempts to insert shared expense into Room A -> Rejected by RLS WITH CHECK
[TEST 13] PASS: Creator (User A) updates Room A shared expense title -> Updated 1 row
[TEST 14] PASS: Non-admin, non-creator Room A member (User B) attempts to update expense -> 0 rows updated (blocked by USING)
[TEST 15] PASS: Creator (User A) attempts to move Room A expense to Room B -> Denied by RLS (0 rows updated)
[TEST 16] PASS: Former member attempts to read Room A shared expenses -> 0 rows visible
[TEST 17] PASS: Pending member attempts to read Room A shared expenses -> 0 rows visible
[TEST 18] PASS: User A attempts hard DELETE on shared_expenses -> 0 rows deleted (no DELETE policy exists)

--- DOMAIN 3: FINANCIAL AMOUNT TAMPERING & INTEGRITY ---
[TEST 19] PASS: Shared expense with negative total_amount (-100) -> Rejected by check constraint
[TEST 20] PASS: Shared expense with zero total_amount (0.00) -> Rejected by check constraint
[TEST 21] PASS: User A creates shared expense forging created_by = User B -> Rejected by RLS WITH CHECK
[TEST 22] PASS: AUDIT: User A creates expense assigning paid_by = User C (User C is NOT in Room A) -> VULNERABILITY CONFIRMED: Database accepts paid_by belonging to an outsider not in the room!
[TEST 23] PASS: Shared expense with extreme large numeric overflow (10^12 vs NUMERIC(12,2)) -> Rejected by NUMERIC(12,2) overflow check
[TEST 24] PASS: AUDIT: Creator updates total_amount after splits exist -> VULNERABILITY CONFIRMED: Creator can modify total_amount arbitrarily after creation without split sync
[TEST 25] PASS: AUDIT: Creator changes paid_by to User B via UPDATE -> VULNERABILITY CONFIRMED: Creator can transfer paid_by credit to another user via UPDATE
[TEST 26] PASS: Attempt to insert shared expense in frozen room -> Rejected by check_room_not_frozen trigger

--- DOMAIN 4: EXPENSE SPLITS AUTHORIZATION & INTEGRITY ---
[TEST 27] PASS: Room A member inserts valid split for Room A expense -> Inserted split 900928cf-a22d-4af5-a0f8-6010b2cc0931
[TEST 28] PASS: Unrelated user (User C) attempts to read Room A expense splits -> 0 rows visible (isolated)
[TEST 29] PASS: Unrelated user (User C) attempts to insert split for Room A expense -> Rejected by RLS WITH CHECK
[TEST 30] PASS: AUDIT: Member inserts split assigning debt to User C (NOT in Room A) -> VULNERABILITY CONFIRMED: Database allows assigning expense split debt to an outsider not in the room!
[TEST 31] PASS: AUDIT: Member inserts duplicate split for same user on same expense -> VULNERABILITY CONFIRMED: Database allows duplicate splits for same user (no unique constraint on shared_expense_id, user_id)
[TEST 32] PASS: AUDIT: Mismatched split sum vs expense total_amount -> VULNERABILITY CONFIRMED: Database does not enforce sum(share_amount) == total_amount
[TEST 33] PASS: Expense split with negative share_amount (-50) -> Rejected by check constraint
[TEST 34] PASS: Attempt to UPDATE an expense_split -> 0 rows updated (no UPDATE policy)
[TEST 35] PASS: Attempt to DELETE an expense_split -> 0 rows deleted (no DELETE policy)

--- DOMAIN 5: SETTLEMENT AUTHORIZATION & DEBT WIPING ---
[TEST 36] PASS: Room A member (User A) records settlement paying User B -> Recorded settlement 08581890-0736-46bf-98e1-d4d615db5d4f
[TEST 37] PASS: Room A member (User B) views Room A settlement -> 1 row visible
[TEST 38] PASS: Unrelated user (User C) attempts to view Room A settlement -> 0 rows visible (isolated)
[TEST 39] PASS: Unrelated user (User C) attempts to insert settlement into Room A -> Rejected by RLS WITH CHECK
[TEST 40] PASS: User A attempts to record settlement forging payer_id = User B -> Rejected by RLS WITH CHECK
[TEST 41] PASS: AUDIT: User A records settlement with payee_id = User C (NOT in Room A) -> VULNERABILITY CONFIRMED: Database allows payee_id belonging to an outsider not in the room!
[TEST 42] PASS: AUDIT: User A records self-settlement (payer_id = User A, payee_id = User A) -> VULNERABILITY CONFIRMED: User can pay themselves, inflating settlements_paid in balance calculation!
[TEST 43] PASS: User A attempts to UPDATE recorded settlement -> 0 rows updated (no UPDATE policy)
[TEST 44] PASS: User A attempts to DELETE recorded settlement -> 0 rows deleted (no DELETE policy)

--- DOMAIN 6: ROOM BALANCES RPC (get_room_balances) IDOR & AUTHORIZATION ---
[TEST 45] FAIL / VULNERABILITY: Active Room A member calls get_room_balances(Room A) -> SQL Failed (exit code 3): ERROR: column reference "user_id" is ambiguous (VULN-2C3-01)
[TEST 46] PASS: Unrelated user (User C) calls get_room_balances(Room A) -> Denied with UNAUTHORIZED exception
[TEST 47] PASS: Former member calls get_room_balances(Room A) -> Denied with UNAUTHORIZED exception
[TEST 48] PASS: Anonymous user calls get_room_balances(Room A) -> Denied with UNAUTHORIZED exception

--- DOMAIN 7: SUBSCRIPTIONS & BILLING STATE TAMPERING ---
[TEST 49] PASS: User A reads own user_subscriptions -> 1 row returned
[TEST 50] PASS: User B attempts to read User A user_subscriptions -> 0 rows visible (isolated)
[TEST 51] PASS: User A attempts to directly INSERT a user_subscriptions row -> Rejected by RLS (no INSERT policy for authenticated)
[TEST 52] PASS: User A attempts to directly UPDATE subscription to ACTIVE CAMPUS_MAX -> 0 rows updated (no UPDATE policy for authenticated)
[TEST 53] PASS: User A attempts to DELETE own user_subscriptions -> 0 rows deleted (no DELETE policy)
[TEST 54] PASS: Authenticated user attempts to insert fake subscription_events -> Rejected by RLS (service_role only)
[TEST 55] PASS: AUDIT: Client-side entitlement bypass in mock mode / cloud disconnect -> VULNERABILITY CONFIRMED: mockStorage.processRazorpayWebhook operates client-side with no cryptographic signature verification or webhook secret, allowing arbitrary subscription tampering in local/mock mode

--- DOMAIN 8: SUPERADMIN FINANCIAL OPERATIONS & AUDIT LOGS ---
[TEST 56] PASS: Normal user attempts to call super_admin_get_platform_metrics() -> Denied (Caller lacks SUPER_ADMIN privileges)
[TEST 57] PASS: AUDIT: SuperAdmin calls super_admin_get_platform_metrics() -> BROKEN RPC / BUG CONFIRMED: column "amount" does not exist (VULN-2C3-06)
[TEST 58] PASS: Normal user attempts to SELECT from audit_logs -> 0 rows visible (superadmin only)
[TEST 59] PASS: AUDIT: Normal user attempts to INSERT fake audit_logs entry -> Rejected: SQL Failed (exit code 3)
[TEST 60] PASS: Normal user attempts to UPDATE or DELETE audit_logs -> 0 rows updated/deleted (immutable)

============================================================
COMPLETED 60 ADVERSARIAL FINANCIAL SCENARIOS
============================================================
```

---

## 11. DETAILED VULNERABILITY FINDINGS

### Finding 1: VULN-2C3-01
- **Severity**: **CRITICAL**
- **Affected Component**: `public.get_room_balances(p_room_id UUID)`
- **Attack Scenario**: Any legitimate room member calls `get_room_balances(p_room_id)` to view who owes whom.
- **Current Behavior**: PostgreSQL throws `ERROR: column reference "user_id" is ambiguous` because `RETURNS TABLE (user_id UUID, ...)` collides with `room_members.user_id` inside the membership check.
- **Expected Behavior**: Successfully returns the member balance table for active roommates.
- **Security Impact**: Complete Denial of Service on financial calculations; breaks dashboard financial balance view for all users.
- **Recommended Remediation**: Qualify column reference as `room_members.user_id = auth.uid()` in the function definition.

---

### Finding 2: VULN-2C3-02
- **Severity**: **HIGH**
- **Affected Component**: `public.shared_expenses` RLS Policies
- **Attack Scenario**:
  1. Attacker creates an expense in Room A with `paid_by = User C` (who belongs to Room B or is an innocent outsider).
  2. Attacker modifies an existing shared expense to change `paid_by` to themselves, claiming credit for a bill paid by someone else.
- **Current Behavior**: RLS allows any UUID in `paid_by` during insert, and allows creator/admin to update `paid_by` and `total_amount` arbitrarily.
- **Expected Behavior**: `paid_by` MUST be an ACTIVE member of `room_id`. `paid_by` and `total_amount` must be immutable once split records are attached, or updates must trigger recalculation triggers.
- **Security Impact**: Financial fraud, false attribution of payments, and corruption of roommate balance ledgers.
- **Recommended Remediation**: Add BEFORE INSERT/UPDATE trigger validating that `paid_by` is an active room member. Restrict UPDATE modifications on financial columns when splits exist.

---

### Finding 3: VULN-2C3-03
- **Severity**: **HIGH**
- **Affected Component**: `public.expense_splits` Schema & RLS
- **Attack Scenario**:
  1. Room A member inserts a split assigning debt of ₹5,000 to User C (who is NOT in Room A).
  2. Room A member inserts 10 duplicate split rows of ₹1,000 for User B on a single expense of ₹1,000, inflating User B's debt to ₹10,000.
- **Current Behavior**: RLS policy only checks that the caller is in the room of `shared_expense_id`. It does not check that `expense_splits.user_id` is in the room, and there is no unique constraint on `(shared_expense_id, user_id)`.
- **Expected Behavior**: Splits may only be assigned to active members of the room. Exactly one split per user per expense. $\sum \text{share\_amount}$ must equal `shared_expenses.total_amount`.
- **Security Impact**: Arbitrary cross-user debt assignment, debt multiplication, and financial balance distortion.
- **Recommended Remediation**: Add `CONSTRAINT unique_expense_split_user UNIQUE (shared_expense_id, user_id)`. Add trigger enforcing room membership of split recipient and sum validation.

---

### Finding 4: VULN-2C3-04
- **Severity**: **HIGH**
- **Affected Component**: `public.settlement_payments` RLS
- **Attack Scenario**:
  1. User A owes ₹1,000 to User B. User A inserts a settlement record with `payer_id = User A` and `payee_id = User A` (self-settlement) or `payee_id = User C` (foreign user).
  2. The function `get_room_balances` sums `settlements_sent` by `payer_id`, increasing User A's net balance and erasing User A's debt to User B.
- **Current Behavior**: Database permits self-settlements and non-member payees.
- **Expected Behavior**: `payee_id` MUST be an active member of `room_id`, and `payee_id <> payer_id`.
- **Security Impact**: Debtors can forge fake settlement payments to wipe their debt without sending any money.
- **Recommended Remediation**: Add check constraint `CHECK (payer_id <> payee_id)`. Add trigger verifying `payee_id` is an active member of `room_id`.

---

### Finding 5: VULN-2C3-05
- **Severity**: **HIGH**
- **Affected Component**: Razorpay Payment & Subscription Architecture
- **Attack Scenario**: Malicious student modifies client state or calls `processRazorpayWebhook` with `eventType = 'subscription.charged'` and payload `{ plan: 'CAMPUS_MAX' }`.
- **Current Behavior**: Operates entirely in client memory; no server-side signature verification or backend webhook endpoint.
- **Expected Behavior**: Razorpay webhooks must be verified by a backend Edge Function using `crypto.createHmac('sha256', secret)` against the raw request body before writing to `public.user_subscriptions` via `service_role`.
- **Security Impact**: Free bypass of paywalled features and unlimited premium tier unlocking.
- **Recommended Remediation**: Build dedicated Supabase Edge Function `razorpay-webhook` with HMAC-SHA256 signature verification and strict event idempotency.

---

### Finding 6: VULN-2C3-06
- **Severity**: **MEDIUM**
- **Affected Component**: `public.super_admin_get_platform_metrics()`
- **Attack Scenario**: SuperAdmin accesses platform metrics portal.
- **Current Behavior**: RPC crashes with `ERROR: column "amount" does not exist`.
- **Expected Behavior**: Aggregates `total_amount` from `public.shared_expenses`.
- **Security Impact**: Denial of Service on SuperAdmin financial dashboard.
- **Recommended Remediation**: Update query to `SELECT COALESCE(SUM(total_amount), 0.00) FROM public.shared_expenses`.

---

### Finding 7: VULN-2C3-07
- **Severity**: **LOW**
- **Affected Component**: `src/lib/storage/offlineQueue.ts`
- **Attack Scenario**: Offline split synchronization executes `upsert(..., { onConflict: 'shared_expense_id,user_id' })`.
- **Current Behavior**: PostgreSQL throws error because no unique constraint exists on `(shared_expense_id, user_id)`.
- **Expected Behavior**: Upsert succeeds cleanly with an underlying database constraint.
- **Security Impact**: Offline queue stalls or fails on split sync replay.
- **Recommended Remediation**: Add unique constraint on `public.expense_splits (shared_expense_id, user_id)`.

---

## 12. RECOMMENDED REMEDIATION PLAN (FOR PHASE 2C.4)

### Phase A: Database Schema & RLS Hardening Migration
1. **Fix `get_room_balances`**:
   Disambiguate `user_id` as `rm.user_id = auth.uid()`.
2. **Harden `shared_expenses`**:
   - Add trigger `enforce_shared_expense_integrity`:
     - Verify `NEW.paid_by` is an ACTIVE member of `NEW.room_id`.
     - In UPDATE: Disallow changing `paid_by`, `room_id`, or `created_by`. Disallow modifying `total_amount` if splits already exist, unless explicitly reconciled.
3. **Harden `expense_splits`**:
   - Add constraint `UNIQUE (shared_expense_id, user_id)`.
   - Add trigger `enforce_expense_split_integrity`:
     - Verify `NEW.user_id` is an ACTIVE member of the expense's room.
4. **Harden `settlement_payments`**:
   - Add constraint `CHECK (payer_id <> payee_id)`.
   - Add trigger `enforce_settlement_integrity`:
     - Verify `NEW.payee_id` is an ACTIVE member of `NEW.room_id`.
5. **Fix `super_admin_get_platform_metrics`**:
   - Replace `SUM(amount)` with `SUM(total_amount)`.

### Phase B: Razorpay Backend Gateway Architecture
1. Implement Supabase Edge Function `razorpay-webhook`:
   - Compute HMAC-SHA256 signature using `Deno.env.get('RAZORPAY_WEBHOOK_SECRET')`.
   - Reject unverified or missing signatures with HTTP 401.
   - Idempotently insert into `public.subscription_events`.
   - Update `public.user_subscriptions` using `service_role`.
2. Remove client-side webhook simulation from production bundle.

---

## 13. PRODUCTION SAFETY ASSURANCE

- Target production Supabase project **`pbzaaskftrmnvocczhat.supabase.co`** was **NOT contacted**.
- No migrations were executed against production.
- No Edge Functions were deployed to production.
- All 60 adversarial test scenarios were executed strictly in the local Docker PostgreSQL staging environment (`roommate-staging-db` on port 54322).
- Zero production data, RLS policies, triggers, or functions were modified.

---

## FINAL STATUS

# PHASE 2C.3 AUDIT FAILED — REMEDIATION REQUIRED
