# ROOMMATE SHARED EXPENSE ENGINE V2
## PHASE 3.5B: REAL STAGING ENVIRONMENT PROVISIONING & DATABASE VERIFICATION REPORT

**Status:** PROVISIONING BLOCKED — NO VERIFIED NON-PRODUCTION DATABASE AVAILABLE  
**Date:** October 4, 2026  
**Safety Protocol Check:** Production Supabase (`pbzaaskftrmnvocczhat.supabase.co`) remains **100% UNTOUCHED**. Zero DDL statements, zero migrations, zero RPCs, and zero test records were written to production.

---

### Executive Summary

In accordance with Phase 3.5B instructions, a complete discovery and audit of all candidate databases and hosting environments was conducted.
1. **Production Safety Gate:** Identified that `.env.staging` in the local workspace erroneously contains the production Supabase URL (`pbzaaskftrmnvocczhat.supabase.co`). Any script running against `.env.staging` would have targeted production. It was strictly blocked.
2. **Remote Candidates:**
   - `pbzaaskftrmnvocczhat`: Production database (REJECTED).
   - `ycredqiiwdbrjzqeczio`: Historical staging database cited in old scripts — DNS resolution fails (`ENOTFOUND`, project deleted or paused).
   - `gqwgvhxcssooxbmwgiwt` ("e commerce"): Unrelated application database.
   - `nbnsfszhjvvygqdcooni` ("DineAR"): Unrelated application database.
3. **Local Candidates:**
   - Docker Desktop CLI is installed (`v29.1.2`), but Docker Desktop Daemon (`com.docker.service`) is stopped and cannot be started without elevated Windows Administrator permissions (`Access is denied`).
   - Local PostgreSQL daemon (`127.0.0.1:5432`) is offline (`ECONNREFUSED`).
4. **Mandated Action under Section 3 & 4:**
   > *"If no verified non-production project exists: STOP and report: 'NO VERIFIED NON-PRODUCTION DATABASE AVAILABLE. Do not improvise.'"*  
   > *"If Docker/local PostgreSQL is unavailable: STOP and report that provisioning requires user action."*

All financial invariant checks, settlement eligibility checks (Section 6 room-level net debt), race condition protections, and authorization matrices were verified via the automated simulation test harness (53/53 test files, 522/522 passing tests).

---

### 1. Discovery of Available Staging Options & Environment Classifications (Sections 1 & 2)

#### Candidate 1: Primary Production Project
- **ENVIRONMENT:** Production
- **PROJECT REF:** `pbzaaskftrmnvocczhat`
- **SUPABASE URL:** `https://pbzaaskftrmnvocczhat.supabase.co`
- **DATABASE HOST:** `db.pbzaaskftrmnvocczhat.supabase.co` / `aws-0-ap-northeast-1.pooler.supabase.com:5432`
- **CLASSIFICATION:** LIVE PRODUCTION (RoomMate Mobile & Web App)
- **SAFE FOR STAGING TESTS:** **NO**
- **REASON:** Active production database holding real tenant data, live rooms, auth records, and expenses. Target of absolute safety embargo.

#### Candidate 2: Existing `.env.staging` File Target
- **ENVIRONMENT:** Misconfigured Local Staging Target
- **PROJECT REF:** `pbzaaskftrmnvocczhat`
- **SUPABASE URL:** `https://pbzaaskftrmnvocczhat.supabase.co`
- **DATABASE HOST:** `db.pbzaaskftrmnvocczhat.supabase.co`
- **CLASSIFICATION:** PRODUCTION ALIAS
- **SAFE FOR STAGING TESTS:** **NO**
- **REASON:** Contains identical URL and anon key as production. Identified as a critical misconfiguration hazard.

#### Candidate 3: Historical Staging Cloud Project
- **ENVIRONMENT:** Staging (Deprecated)
- **PROJECT REF:** `ycredqiiwdbrjzqeczio`
- **SUPABASE URL:** `https://ycredqiiwdbrjzqeczio.supabase.co`
- **DATABASE HOST:** `aws-0-ap-northeast-1.pooler.supabase.com:5432`
- **CLASSIFICATION:** DEAD / PAUSED REMOTE INSTANCE
- **SAFE FOR STAGING TESTS:** **NO**
- **REASON:** Host resolution fails with `ENOTFOUND`. The project has expired, been paused, or deleted on the Supabase platform.

#### Candidate 4: Alternate Supabase CLI Project: "e commerce"
- **ENVIRONMENT:** Unrelated External Project
- **PROJECT REF:** `gqwgvhxcssooxbmwgiwt`
- **SUPABASE URL:** `https://gqwgvhxcssooxbmwgiwt.supabase.co`
- **DATABASE HOST:** `db.gqwgvhxcssooxbmwgiwt.supabase.co`
- **CLASSIFICATION:** FOREIGN PRODUCTION / UNRELATED
- **SAFE FOR STAGING TESTS:** **NO**
- **REASON:** Belongs to a separate project named "e commerce" in region `ap-northeast-1`. Not a RoomMate staging instance.

#### Candidate 5: Alternate Supabase CLI Project: "DineAR"
- **ENVIRONMENT:** Unrelated External Project
- **PROJECT REF:** `nbnsfszhjvvygqdcooni`
- **SUPABASE URL:** `https://nbnsfszhjvvygqdcooni.supabase.co`
- **DATABASE HOST:** `db.nbnsfszhjvvygqdcooni.supabase.co`
- **CLASSIFICATION:** FOREIGN PRODUCTION / UNRELATED
- **SAFE FOR STAGING TESTS:** **NO**
- **REASON:** Belongs to a separate project named "DineAR" in region `ap-south-1`. Not a RoomMate staging instance.

#### Candidate 6: Local Docker & Supabase CLI
- **ENVIRONMENT:** Local Developer Workstation
- **PROJECT REF:** `local`
- **SUPABASE URL:** `http://127.0.0.1:54321` (expected if active)
- **DATABASE HOST:** `127.0.0.1:5432`
- **CLASSIFICATION:** LOCAL CONTAINER ENVIRONMENT
- **SAFE FOR STAGING TESTS:** **NO (CURRENTLY OFFLINE)**
- **REASON:** Docker client is installed (`29.1.2`), but Docker Desktop Daemon is stopped. Programmatic start failed (`[SC] StartService: OpenService FAILED 5: Access is denied`). Local port 5432 is refusing connections. Requires human action to launch Docker Desktop with Administrator privileges.

---

### 2. Verdict on Staging Availability (Sections 3 & 4)

```
============================================================
NO VERIFIED NON-PRODUCTION DATABASE AVAILABLE.
============================================================
```

Per Section 3, no new remote Supabase projects will be automatically created or billed.  
Per Section 4, local Docker Desktop requires manual start by the developer.

---

### 3. Static Migration Pre-Flight (Section 5)

**File:** [`supabase/migrations/20261004120000_v2_canonical_financial_engine.sql`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/supabase/migrations/20261004120000_v2_canonical_financial_engine.sql)

| Criterion | Verification Details | Result |
|---|---|---|
| Destructive DDL | Zero `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `DELETE` statements. | PASS |
| Schema Alterations | Zero `ALTER TABLE` statements modifying existing columns or constraints. | PASS |
| Additive RPCs | Introduces `public.record_room_settlement_v2` and `public.get_room_financial_summary_v2`. | PASS |
| Security Context | Both functions defined as `SECURITY DEFINER` with `SET search_path = public, pg_temp`. | PASS |
| Permissions | `REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role;`. | PASS |
| RLS Assurances | Direct caller verification: caller must be an active room member; payer must match `auth.uid()` or caller is superadmin. | PASS |

---

### 4. Settlement Logic Review: Room-Level Net Debt Verification (Section 6)

#### Analysis of SQL Logic in `record_room_settlement_v2`:
The migration calculates payer eligibility as follows:
```sql
  -- 5. Calculate Payer's current net position
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM public.shared_expenses WHERE room_id = p_room_id AND paid_by = p_payer_id AND is_deleted = false), 0.00),
    COALESCE((SELECT SUM(es.share_amount) FROM public.expense_splits es JOIN public.shared_expenses se ON se.id = es.shared_expense_id WHERE se.room_id = p_room_id AND es.user_id = p_payer_id AND se.is_deleted = false), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payer_id = p_payer_id), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payee_id = p_payer_id), 0.00)
  INTO v_payer_paid, v_payer_share, v_payer_sent, v_payer_rcvd;

  v_payer_net := (v_payer_paid + v_payer_sent) - (v_payer_share + v_payer_rcvd);

  IF v_payer_net >= 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: Payer % is not a debtor (current net balance: %)', p_payer_id, v_payer_net;
  END IF;

  v_payer_debt_paise := ROUND(ABS(v_payer_net) * 100)::BIGINT;
  IF v_amount_paise > v_payer_debt_paise THEN
    RAISE EXCEPTION 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted % paise, but debtor only owes % paise',
      v_amount_paise, v_payer_debt_paise;
  END IF;
```

#### Mathematical Proof:
1. `v_payer_paid` captures **all** active room expenses paid by the payer across the entire room.
2. `v_payer_share` captures **all** expense splits assigned to the payer across all room expenses.
3. `v_payer_sent` and `v_payer_rcvd` capture **all** prior settlements involving the payer in this room.
4. Therefore, `v_payer_net` represents the **exact multilateral net balance** of the payer in the room, not a bilateral pairwise sub-balance.

#### Verification of Example Scenario:
- **Scenario:** Room with A, B, C.
  - Expense 1: B pays ₹100 for A. (A's share: ₹100).
  - Expense 2: A pays ₹50 for C. (A paid: ₹50).
  - A's room-level net debt: $(50 + 0) - (100 + 0) = -₹50$ (5,000 paise).
- **Settlement Attempt 1:** A attempts to settle ₹100 to B.
  - `v_amount_paise` = 10,000 paise.
  - `v_payer_debt_paise` = 5,000 paise.
  - Evaluation: $10,000 > 5,000 \implies$ Throws `OVERSETTLEMENT_EXCEEDS_DEBT`. **REJECTED**.
- **Settlement Attempt 2:** A attempts to settle ₹50 to B.
  - Evaluation: $5,000 \le 5,000 \implies$ **SUCCEEDS**.
  - A's new net balance is ₹0.
  - Any subsequent settlement attempt by A throws `INVALID_SETTLEMENT: Payer is not a debtor`.

This was formally implemented as an automated regression test in [`src/test/v2-financial-engine/stagingVerificationSimulation.test.ts`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/test/v2-financial-engine/stagingVerificationSimulation.test.ts) under:
`it('Section 6 & 12: Verifies room-level net position prevents over-settlement (A owes B ₹100, C owes A ₹50 -> A net debt ₹50)')`. **Test Status: PASS.**

---

### 5. Test Matrix: Real Database vs. Simulated Execution

| Section | Test Description | Evaluation Type | Result | Notes |
|---|---|---|---|---|
| **Sec 7** | Staging Migration Application | Real Database | **BLOCKED** | Blocked due to lack of verified non-production DB. |
| **Sec 8** | RPC Signatures & Permissions | Static Code Audit | **PASS** | Reviewed in SQL migration file. |
| **Sec 9** | Canonical ₹700 Scenario (Wi-Fi 500 + Water 200) | SIMULATED TEST | **PASS** | Zero-sum verified; Lopamudra $\to$ Raju debt eliminated. |
| **Sec 10** | ₹200 Split / 3 Members (6667, 6667, 6666 paise) | SIMULATED TEST | **PASS** | Sum = 20,000 paise exact. |
| **Sec 11** | Invalid Split Rejection (₹199.98 vs ₹200.00) | SIMULATED TEST | **PASS** | Rejected with `EXACT_SPLIT_SUM_MISMATCH`. |
| **Sec 12** | Room-Level Settlement (A owes 50, attempts 100) | SIMULATED TEST | **PASS** | ₹100 rejected (`OVERSETTLEMENT_EXCEEDS_DEBT`); ₹50 succeeds. |
| **Sec 13** | Concurrency Race Condition (2x ₹100 concurrent) | SIMULATED TEST | **PASS** | 1 succeeds, 1 fails (`INVALID_SETTLEMENT`). Final outstanding = ₹0 (never -₹100). |
| **Sec 14** | Authorization Matrix (6 Attack Vectors) | SIMULATED TEST | **PASS** | All unauthorized vectors strictly rejected. |
| **Sec 15** | RLS Cross-Room Isolation | SIMULATED TEST | **PASS** | Non-member access rejected with `ACCESS_DENIED`. |
| **Sec 16** | Historical Data Compatibility | Static / Simulation | **PASS** | Existing `NUMERIC(12,2)` columns read losslessly via $\times 100$. |
| **Sec 17** | Performance Benchmark (20 members, 100 expenses) | SIMULATED TEST | **PASS** | Executed in <50ms with 19 transfers ($N-1$). |
| **Sec 18** | Production Supabase Integrity Verification | Real Verification | **PASS** | `pbzaaskftrmnvocczhat.supabase.co` completely untouched. |

---

### 6. User Action Required to Enable Real Database Testing

To execute Sections 7–17 against a **REAL PostgreSQL/Supabase database**, the developer should perform **ONE** of the following options:

#### Option A: Local Docker (Recommended for Zero-Cost Local Testing)
1. Start the **Docker Desktop** application on Windows.
2. Ensure Docker Desktop status shows "Engine running".
3. Provide confirmation so Antigravity can start a local staging PostgreSQL container or run `npx supabase start`.

#### Option B: Provision a Dedicated Supabase Staging Project
1. In the Supabase Dashboard, create a new project (e.g. `roommate-staging`).
2. Update `.env.staging` with the new project's URL and anon key:
   ```env
   VITE_APP_CHANNEL=staging
   VITE_SUPABASE_URL=https://<new-staging-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<new-staging-anon-key>
   ```
3. Provide the connection string or project ref to execute the live database migration.

---

### 7. Production Safety Confirmation

- **Production Project Ref:** `pbzaaskftrmnvocczhat`
- **Production Supabase URL:** `https://pbzaaskftrmnvocczhat.supabase.co`
- **Status:** **UNMODIFIED**
- **DDL executed against production:** 0
- **Data rows inserted/updated in production:** 0
- **Functions modified in production:** 0

---

### Final Status Gate

```
============================================================
FINAL STATUS — PHASE 3.5B
============================================================

STAGING TARGET IDENTIFIED:
NO VERIFIED NON-PRODUCTION DATABASE AVAILABLE

PRODUCTION TOUCHED:
NO (100% UNTOUCHED & PROTECTED)

STATIC MIGRATION PRE-FLIGHT:
PASS

SETTLEMENT LOGIC (ROOM-LEVEL NET DEBT):
PASS (MATHEMATICALLY PROVEN & REGRESSION TESTED)

SIMULATED FINANCIAL TEST SUITE:
PASS (522/522 TESTS PASSING, 53 FILES)

BUILD & LINT INTEGRITY:
PASS (0 ERRORS, 0 WARNINGS, CLEAN PRODUCTION BUILD)

LIVE DATABASE EXECUTION:
BLOCKED (AWAITING USER ACTION TO START DOCKER OR SUPPLY STAGING TARGET)

============================================================
STOP CONDITION: STOPPING HERE AS DIRECTED.
DO NOT PROCEED TO PHASE 4 UNTIL STAGING BACKEND IS PROVISIONED.
============================================================
```
