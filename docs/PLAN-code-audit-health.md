# Project Plan: Code Audit, Test Health & CodeRabbitMCP Remediation

**Task Slug**: `code-audit-health`  
**Target File**: `docs/PLAN-code-audit-health.md`  
**Status**: Ready for Review  
**Date**: 2026-09-13

---

## 1. Context & Scope

In the past 2 conversations, over 10,600 lines of code across 75 files were modified and added to:
- Fully rebrand the application from CampusFlow to **RoomMate** (native Android assets, icons, splash, deep link intents, titles, and configs).
- Overhaul the mobile experience with modern bottom sheets, responsive views, interactive modals, and UPI payments (Google Pay, PhonePe, Paytm, QR codes, canvas voucher receipts).
- Build robust room member lifecycle management (leave room, admin departure succession, member removal, clean exit checks, and debt freezing).
- Implement Capacitor native bridges (biometrics, haptics, status bar, network status, local notifications, OTA app updater).
- Connect offline-first storage with Supabase cloud sync and database migrations.

---

## 2. Audit Findings & Health Matrix

| Test / Audit Dimension | Current Result | Risk Level | Action Needed |
|---|---|---|---|
| **TypeScript Build (`tsc -b`)** | 0 errors | 🟢 Low | Clean |
| **Vite Bundle (`vite build`)** | Success (2.31s) | 🟢 Low | Clean |
| **Ledger Engine Unit Tests** | 16/16 Passed | 🟢 Low | Clean logic, needs Vitest wrapper |
| **CodeRabbit Security Scan** | 1 Critical | 🔴 High | Hardcoded secret in `src/lib/auth/jwtService.ts` |
| **CodeRabbit Dependency Check** | 1 Info | ℹ️ Low | Missing `"license"` in `package.json` |
| **CodeRabbit Health Check** | 1 Low | 🔵 Low | `any` type in `src/lib/storage/offlineQueue.ts` |
| **Node.js Test Portability** | 1 Runtime Error | 🟠 Medium | `import.meta.env` crash in `src/lib/supabase/client.ts` |
| **Linter (`oxlint src`)** | 98 Warnings | 🟡 Medium | React 19 `useEffect` setState and unmemoized `now` instances |
| **Legacy Keys** | Present | 🟡 Medium | Residual `campusflow_*` localStorage keys |

---

## 3. Phase Breakdown & Tasks

### Phase 1: Environment Portability & Security Remediation
- [ ] **Task 1.1**: Patch `src/lib/supabase/client.ts` to guard `import.meta.env` with fallback for non-Vite/test environments.
- [ ] **Task 1.2**: Remove hardcoded secret from `src/lib/auth/jwtService.ts`, configure environment variable support, and add Web Crypto fallback.
- [ ] **Task 1.3**: Migrate localStorage keys (`campusflow_jwt_resident_token` -> `roommate_jwt_resident_token`, `campusflow_offline_sync_queue` -> `roommate_offline_sync_queue`) with automatic fallback.

### Phase 2: Vitest Configuration & Standard Test Runner
- [ ] **Task 2.1**: Add `vitest.config.ts` scoping test discovery strictly to `src/**/*.{test,spec}.{ts,tsx}` (excluding `.agents` and `dist`).
- [ ] **Task 2.2**: Wire Vitest `describe()` / `it()` blocks into `src/lib/ledger/engine.test.ts` while retaining `runAllLedgerTests()` for the in-app modal.
- [ ] **Task 2.3**: Wire Vitest `describe()` / `it()` blocks into `src/lib/native/network.test.ts`.
- [ ] **Task 2.4**: Add `"test": "vitest run"` and `"license": "MIT"` to `package.json`.

### Phase 3: Code Health & React 19 Hook Optimization
- [ ] **Task 3.1**: Fix unmemoized `const now = new Date()` in `src/components/mobile/MobilePersonalVault.tsx` preventing constant hook recalculations.
- [ ] **Task 3.2**: Resolve cascading `setState` calls in `useEffect` in `MobilePersonalVault.tsx` and `MobileRoomLedger.tsx`.
- [ ] **Task 3.3**: Type `payload` in `src/lib/storage/offlineQueue.ts` with discriminated union `OfflineMutationPayload` to satisfy CodeRabbit health.

### Phase 4: Final Verification & CodeRabbit Re-Scan
- [ ] **Task 4.1**: Run `npm test` to verify 100% test pass rate across all suites.
- [ ] **Task 4.2**: Run `npx tsc -b` and `npx oxlint src` to verify clean builds.
- [ ] **Task 4.3**: Re-run CodeRabbit MCP security scan and health check to confirm all warnings resolved.

---

## 4. Verification Checklist

- [ ] All 16 ledger financial math & lifecycle tests pass via `npm test`.
- [ ] Network engine offline simulation tests pass via `npm test`.
- [ ] `tsc -b` exits with code 0.
- [ ] `npm run build` generates production bundle without regressions.
- [ ] CodeRabbit security scan reports 0 critical issues.
