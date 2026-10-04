# ROOMMATE SHARED EXPENSE ENGINE V2
# PHASE 4: REPOSITORY FINANCIAL CODE-PATH AUDIT & CANONICAL CLASSIFICATION

**Date:** October 4, 2026  
**Phase:** 4 — Backend Integration & Canonical Ledger Cutover  
**Safety Protocol Verification:**  
- **Target Host:** `127.0.0.1`  
- **Target Port:** `54322`  
- **Target Database:** `v2_staging_test`  
- **Environment:** `LOCAL` (Isolated Docker PostgreSQL 15.19 Alpine)  
- **Production Supabase:** `https://pbzaaskftrmnvocczhat.supabase.co`  
- **Production Safety Check:** 100% UNTOUCHED, PROTECTED, AND ISOLATED  

---

## 1. Executive Summary

This document establishes the repository-wide inventory of all financial code-paths, calculation routines, database RPCs, and balance consumers across the RoomMate application as required by Phase 4.

The target architecture enforces **ONE canonical financial source of truth**:
- **Authoritative Database Tier:** PostgreSQL V2 RPCs (`get_room_financial_summary_v2`, `record_room_settlement_v2`)
- **Authoritative Client/Offline Tier:** RoomMate Canonical V2 Engine (`src/lib/ledger/v2/`)
- **Integration Layer:** Unified Financial Integration Facade (`financialIntegrationService.ts` & upgraded `engine.ts`)
- **Downstream Consumers:** Ledger UI, Dashboards, and Export services consume the unified layer without direct uncoordinated calculations.

---

## 2. Complete Financial Code-Path Inventory

| # | File | Function / Symbol | Purpose | Source of Truth | Calculates Money? | Queries Supabase? | Duplicates V2? | Is Still Used? | Safe to Deprecate? | Migration Action Required |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `supabase/migrations/ 20261004120000_v2_...sql` | `record_room_settlement_v2` | Atomic settlement recording with room lock & net debt check | PostgreSQL Database | Yes (NUMERIC / BIGINT) | Yes (DB Function) | Is V2 Core | Yes | No | Connect application settlement flow to invoke this RPC |
| 2 | `supabase/migrations/ 20261004120000_v2_...sql` | `get_room_financial_summary_v2` | Authoritative room financial summary & zero-sum verification | PostgreSQL Database | Yes (NUMERIC / BIGINT) | Yes (DB Function) | Is V2 Core | Yes | No | Expose in Supabase client and financial integration layer |
| 3 | `supabase/migrations/ 20260901000000_...sql` | `get_room_balances` | Legacy balance calculation function | Legacy Database | Yes (NUMERIC) | Yes (DB Function) | Yes | No (Unused) | Yes | Deprecate in favor of V2 summary |
| 4 | `src/lib/supabase/ supabaseService.ts` | `getRoomBalances` | Client wrapper for legacy `get_room_balances` RPC | Legacy Database RPC | No (Type cast only) | Yes | Yes | No | Yes | Mark deprecated; add `getRoomFinancialSummaryV2` and `recordRoomSettlementV2` |
| 5 | `src/lib/ledger/v2/ money.ts` | `rupeesToPaise`, `paiseToRupees`, `addPaise`, `subPaise`, `mulPaise`, `distributePaise` | Exact integer Paise arithmetic & remainder distribution | Client Canonical V2 | Yes (Exact Paise) | No | Is V2 Core | Yes | No | Canonical math foundation for all client calculations |
| 6 | `src/lib/ledger/v2/ splits.ts` | `calculateEqualSplitsV2`, `validateAndCalculateExactSplitsV2`, etc. | Deterministic integer paise splits across members | Client Canonical V2 | Yes (Exact Paise) | No | Is V2 Core | Yes | No | Used in expense creation and split previews |
| 7 | `src/lib/ledger/v2/ netPositions.ts` | `calculateMemberNetPositionsV2` | Multilateral net-position engine | Client Canonical V2 | Yes (Exact Paise) | No | Is V2 Core | Yes | No | Canonical net position computation across room members |
| 8 | `src/lib/ledger/v2/ simplification.ts` | `simplifyDebtsV2` | Greedy min-cash-flow algorithm (O(N) simplified transfers) | Client Canonical V2 | Yes (Exact Paise) | No | Is V2 Core | Yes | No | Canonical debt simplification; replaces legacy bilateral debts |
| 9 | `src/lib/ledger/v2/ summary.ts` | `calculateRoomFinancialSummaryV2`, `validateSettlementAttemptV2` | Canonical summary, zero-sum verification & settlement validation | Client Canonical V2 | Yes (Exact Paise) | No | Is V2 Core | Yes | No | Authoritative offline and client-side summary calculation |
| 10 | `src/lib/ledger/ engine.ts` | `round2` | Floating-point rounding to 2 decimal places | Client calculation | Yes (Float) | No | Yes | Yes (UI legacy) | Yes | Retain for UI compatibility; mark deprecated |
| 11 | `src/lib/ledger/ engine.ts` | `calculateSplits` | Legacy split calculation with remainder cent distribution | Client calculation | Yes (Float) | No | Yes | Yes | Yes | Wrap with V2 integer paise splits internally |
| 12 | `src/lib/ledger/ engine.ts` | `calculateRoomPairwiseDebts` | Legacy bilateral pairwise calculation (O(N^2) debts, circular loops) | Client calculation | Yes (Float) | No | Yes | Yes (Test runner) | Yes | Retain for legacy test runner compatibility |
| 13 | `src/lib/ledger/ engine.ts` | `calculateRoomSummary` | Computes room totals, paid, share, net balance, and debt transfers | Client calculation | Yes (Float) | No | Yes | Yes (RoomLedger, MobileRoomLedger, Dashboards) | No (Core Facade) | Upgrade to consume V2 engine (`calculateRoomFinancialSummaryV2`) as source of truth |
| 14 | `src/lib/ledger/ engine.ts` | `calculateUnifiedDashboard` | Aggregates private personal expenses + shared room obligations | Client calculation | Yes (Float) | No | Yes | Yes (UnifiedDashboard) | No | Consumes upgraded `calculateRoomSummary` |
| 15 | `src/lib/ledger/ engine.ts` | `getOutstandingObligationsForMember`, `canCleanExit` | Determines if member has outstanding debts/credits before exiting | Client calculation | Yes (Float) | No | Yes | Yes (RoomLedger, MobileRoomLedger) | No | Operates on simplified transfers produced by V2 |
| 16 | `src/lib/services/ roomExpenseExportService.ts` | `gatherRoomExportData` & `RoommateSettlementRow` | Aggregates monthly expenses, splits, and settlements into PDF/CSV/XLSX | Client calculation | Yes (Float) | No | Yes | Yes (Export modal) | No | Align net balance and settlement status with V2 exact paise |
| 17 | `src/lib/storage/ cloudStorageAdapter.ts` | `recordSettlementCloud` | Syncs settlement payment to Supabase | Supabase sync | No | Yes | Bypasses V2 RPC | Yes | No | Update to invoke `record_room_settlement_v2` RPC |
| 18 | `src/lib/storage/ offlineQueue.ts` | `processOfflineQueue` (`RECORD_SETTLEMENT`) | Replays queued offline settlement payments to Supabase | Supabase sync | No | Yes | Bypasses V2 RPC | Yes | No | Call `record_room_settlement_v2` RPC on replay |
| 19 | `src/lib/storage/ mockStorage.ts` | `createSharedExpense`, `recordSettlementPayment` | In-memory mock database for offline demo mode | In-memory DB | Yes | No | No | Yes (Mock mode) | No | Ensure compatibility with V2 exact splits and settlements |
| 20 | `src/components/ RoomLedger.tsx` | Desktop Room Ledger view | UI display & user interaction | Reads `calculateRoomSummary` | Presentation only | No | No | Yes | No | Preserve UI; wire to upgraded summary |
| 21 | `src/components/mobile/ MobileRoomLedger.tsx` | Mobile Room Ledger view | UI display & user interaction | Reads `calculateRoomSummary` | Presentation only | No | No | Yes | No | Preserve UI; wire to upgraded summary |
| 22 | `src/components/mobile/ MobileDashboard.tsx` | Mobile Dashboard view | UI display & user interaction | Reads `calculateRoomSummary` | Presentation only | No | No | Yes | No | Preserve UI; wire to upgraded summary |
| 23 | `src/components/ UnifiedDashboard.tsx` | Desktop Unified Dashboard view | UI display & user interaction | Reads `calculateRoomSummary` | Presentation only | No | No | Yes | No | Preserve UI; wire to upgraded summary |
| 24 | `src/lib/payments/ upiIntentService.ts` | `buildUpiQueryParams`, `generateUpiAppIntent` | NPCI UPI deep link URL generation | Presentation/Intent | Formatting only | No | No | Yes | No | Preserve NPCI standard query formatting |
| 25 | `src/lib/ledger/ ledgerTestRunner.ts` | Legacy test runner | Legacy test harness | Test runner | Yes | No | No | Yes (Vitest) | No | Preserve for regression verification |

---

## 3. Explicit Path Classification (Section 5)

Every existing balance source in the application is explicitly classified into one of the 7 designated categories:

### Category A: AUTHORITATIVE V2 DATABASE PATH
These paths represent the canonical database-level financial computation:
1. `public.get_room_financial_summary_v2(p_room_id UUID)`
2. `public.record_room_settlement_v2(p_room_id UUID, p_payer_id UUID, p_payee_id UUID, p_amount NUMERIC)`

### Category B: LEGACY DATABASE PATH
These paths queried legacy database RPCs or directly inserted into tables without V2 invariant validation:
1. `public.get_room_balances(p_room_id UUID)` (Supabase migration)
2. `supabaseService.getRoomBalances(roomId)` (`src/lib/supabase/supabaseService.ts`)
3. Direct `supabase.from('settlement_payments').insert(...)` (`cloudStorageAdapter.ts`)
4. Direct `supabase.from('settlement_payments').upsert(...)` (`offlineQueue.ts`)

### Category C: CLIENT-SIDE CALCULATION
These paths compute financial state in TypeScript:
- **Canonical V2 Pure Engine:**
  1. `src/lib/ledger/v2/money.ts` (`rupeesToPaise`, `paiseToRupees`, `addPaise`, etc.)
  2. `src/lib/ledger/v2/splits.ts` (`calculateEqualSplitsV2`, `validateAndCalculateExactSplitsV2`, etc.)
  3. `src/lib/ledger/v2/netPositions.ts` (`calculateMemberNetPositionsV2`)
  4. `src/lib/ledger/v2/simplification.ts` (`simplifyDebtsV2`)
  5. `src/lib/ledger/v2/summary.ts` (`calculateRoomFinancialSummaryV2`, `validateSettlementAttemptV2`, `canMemberExitRoomV2`)
- **Legacy & Compatibility Adapters:**
  6. `src/lib/ledger/engine.ts`: `calculateRoomSummary` (Target bridge to V2)
  7. `src/lib/ledger/engine.ts`: `calculateRoomPairwiseDebts` (Legacy bilateral math, retained for tests)
  8. `src/lib/ledger/engine.ts`: `calculateSplits` (Legacy split wrapper)
  9. `src/lib/ledger/engine.ts`: `calculateUnifiedDashboard` (Multi-room student overview)
  10. `src/lib/ledger/engine.ts`: `getOutstandingObligationsForMember` & `canCleanExit`

### Category D: EXPORT-ONLY CALCULATION
1. `src/lib/services/roomExpenseExportService.ts`: `gatherRoomExportData` (computes `netBalance` and `status` for PDF, CSV, and XLSX exports)

### Category E: UI-ONLY PRESENTATION
These paths format numbers for screen display and handle user actions without performing independent financial calculations:
1. `src/components/RoomLedger.tsx` (Desktop view)
2. `src/components/mobile/MobileRoomLedger.tsx` (Mobile view)
3. `src/components/mobile/MobileDashboard.tsx` (Mobile dashboard)
4. `src/components/UnifiedDashboard.tsx` (Unified student dashboard)
5. `src/lib/payments/upiIntentService.ts` (NPCI UPI URL formatting)

### Category F: TEST-ONLY
1. `src/lib/ledger/ledgerTestRunner.ts` (Legacy engine unit tests)
2. `src/test/v2-financial-engine/*.test.ts` (10 V2 verification test suites)
3. `scripts/verify_phase3_5c_real_database.cjs` (Real Docker PostgreSQL 15 staging verification script)

### Category G: DEAD / UNUSED
1. `supabaseService.getRoomBalances` (Defined in `src/lib/supabase/supabaseService.ts`, but has zero callers across the entire repository)

---

## 4. Canonical Target Architecture

```
                ┌──────────────────────────────────────────────┐
                │          PostgreSQL V2 (Staging)             │
                │                                              │
                │   public.get_room_financial_summary_v2()     │
                │   public.record_room_settlement_v2()         │
                └──────────────────────┬───────────────────────┘
                                       │
                                       ▼
                ┌──────────────────────────────────────────────┐
                │   RoomMate Financial Integration Layer       │
                │                                              │
                │   - financialIntegrationService.ts           │
                │   - supabaseService.ts (V2 RPC methods)      │
                │   - engine.ts (V2-backed calculateRoomSummary)│
                │   - v2/ canonical calculation engine         │
                └──────────────────────┬───────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐         ┌───────────────────┐         ┌────────────────────┐
│    Ledger UI     │         │    Dashboards     │         │   Export Service   │
│                  │         │                   │         │                    │
│ RoomLedger       │         │ MobileDashboard   │         │ roomExpenseExport- │
│ MobileRoomLedger │         │ UnifiedDashboard  │         │ Service (Parity)   │
└──────────────────┘         └───────────────────┘         └────────────────────┘
```

The integration strategy preserves the exact component tree, layout, styling, and UX of all existing screens while cutting over the underlying calculations to the canonical V2 ledger engine.
