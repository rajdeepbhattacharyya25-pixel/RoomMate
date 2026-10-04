# ROOMMATE SHARED EXPENSE ENGINE V2
## PHASE 3 BASELINE SNAPSHOT

**Timestamp:** 2026-10-04T10:55:30 IST  
**Environment:** Local Node/TypeScript workspace  
**Safety Status:** Production Supabase (`pbzaaskftrmnvocczhat.supabase.co`) is **100% UNTOUCHED**.

---

### 1. Git Status Baseline

- **Current Branch:** `main` (up to date with `origin/main`)
- **Working Tree State:** Clean with untracked documentation and Phase 2 test suite:
  - `ROOMMATE_SHARED_EXPENSE_ENGINE_V2_PHASE_0_AUDIT.md` (untracked)
  - `ROOMMATE_SHARED_EXPENSE_ENGINE_V2_PHASE_1_FINANCIAL_SPEC.md` (untracked)
  - `ROOMMATE_SHARED_EXPENSE_ENGINE_V2_PHASE_2_TEST_REPORT.md` (untracked)
  - `src/test/v2-financial-engine/` (untracked)
- **Modified Tracked Files:** 0 pre-existing modified files.

---

### 2. Current Test Status Baseline

- **Test Suite Command:** `npm test` (`vitest run`)
- **Total Test Files:** 51 passed (100%)
- **Total Tests:** 504 passed (100%)
- **Phase 2 Dedicated Tests:** 75 tests across 9 test files passed (100%)
- **Execution Time:** ~7.2 seconds

---

### 3. Current Build Status Baseline

- **Build Command:** `npm run build` (`node scripts/generate-build-info.js && tsc -b && vite build`)
- **TypeScript Check (`tsc -b`):** 0 errors
- **Vite Production Bundle:** Built successfully in 5.08 seconds (`dist/` directory generated)

---

### 4. Existing Financial Functions Inventory

| File Path | Function Name | Purpose | Current Limitation |
|---|---|---|---|
| `src/lib/ledger/engine.ts` | `round2(num)` | Math.round to 2 decimals | Floating point binary rounding |
| `src/lib/ledger/engine.ts` | `calculateSplits()` | Point-in-time expense splits | Array-order dependent remainder cents, floating point |
| `src/lib/ledger/engine.ts` | `calculateRoomPairwiseDebts()` | Bilateral debts between member pairs | $O(N^2)$ pairwise debts, creates circular debts, intermediate hops |
| `src/lib/ledger/engine.ts` | `calculateRoomSummary()` | Single user room summary | Depends on pairwise debt output |
| `src/lib/ledger/engine.ts` | `calculateUnifiedDashboard()` | Personal + shared summary | Aggregates pairwise outputs |
| `src/lib/ledger/engine.ts` | `canCleanExit()` | Checks if member can leave room | Checks pairwise debts instead of net position |
| `src/lib/services/roomExpenseExportService.ts` | `gatherRoomExportData()` | Assembles monthly room data for PDF/CSV | Contains $\pm ₹0.50$ tolerance threshold for 'Settled' |

---

### 5. Existing Database RPCs & Schemas

| RPC / Function Name | Schema Location | Current Implementation Summary |
|---|---|---|
| `public.create_shared_expense_with_splits` | `supabase/migrations/20260921210000_phase2c4_financial_integrity_hardening.sql` | Inserts `shared_expenses` and `expense_splits`. Enforces exact equality: `ROUND(v_sum_splits, 2) = ROUND(v_total_amount, 2)`. Uses `NUMERIC(12, 2)`. |
| `public.get_room_balances` | `supabase/migrations/20260921210000_phase2c4_financial_integrity_hardening.sql` | Computes: `(total_paid + settlements_paid) - (total_share + settlements_received) AS net_balance`. Does not return simplified min-cash-flow transfers. |
| `public.enforce_expense_splits_integrity` | Trigger on `expense_splits` | Checks `share_amount > 0`, row lock on `shared_expenses`, sum does not exceed `total_amount`. |
| `public.enforce_settlement_payments_integrity` | Trigger on `settlement_payments` | Checks `amount > 0`, `payer_id <> payee_id`, room membership. Settlement records are immutable. |

---

### 6. Existing Monetary Columns

| Table | Column | Postgres Data Type | Application Data Type |
|---|---|---|---|
| `public.shared_expenses` | `total_amount` | `NUMERIC(12, 2)` | `number` (INR floating point) |
| `public.expense_splits` | `share_amount` | `NUMERIC(12, 2)` | `number` (INR floating point) |
| `public.settlement_payments` | `amount` | `NUMERIC(12, 2)` | `number` (INR floating point) |
| `public.personal_expenses` | `amount` | `NUMERIC(12, 2)` | `number` (INR floating point) |
| `public.budgets` | `monthly_budget_limit` | `NUMERIC(12, 2)` | `number` (INR floating point) |

---
