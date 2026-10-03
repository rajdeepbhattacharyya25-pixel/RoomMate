# Project Plan: Full Comprehensive App Sweep & Code Health Hardening

**Slug:** `PLAN-comprehensive-sweep`  
**Generated:** 2026-10-03  
**Mode:** FULL EXECUTION  
**Target File:** `docs/PLAN-comprehensive-sweep.md`  

---

## 1. Executive Summary

Based on user request and our deep static analysis audit, we are conducting a comprehensive zero-defect sweep across the application. The primary focus areas are:
1. **Expense Creation & Roommate Split State Synchronization (`MobileRoomLedger.tsx`)**: Fixing stale participant state when room membership changes, and ensuring custom values (percentages/exact shares) stay in sync with selected participants.
2. **React Hook Dependencies & Effect Lifecycle**: Resolving all missing dependencies across `App.tsx`, `MobileLogin.tsx`, `JoinRoomModal.tsx`, and `AdminRouter.tsx` to prevent stale closure bugs or infinite render cycles.
3. **Dead Code & Unused Variable Cleanup**: Eliminating unused imports, dead variables, and test harness warnings across the entire repository to achieve a clean linter report (`0 errors, 0 warnings`).
4. **End-to-End Build & Test Validation**: Ensuring `oxlint`, `tsc`, `vitest`, and production `vite build` all exit with code 0.

---

## 2. Detailed Task Breakdown

### Task 1: Expense Creation & Split Calculation State Sync
* **Target:** `src/components/mobile/MobileRoomLedger.tsx`
  - Fix `useEffect` on line 443: Include `roomMembers` in the dependency array (or memoize the active member IDs) so that when roommates join, leave, or change active status, `selectedParticipants` automatically synchronizes with active room members.
  - When participants are toggled in custom split modes (`EXACT`, `PERCENTAGE`, `SHARES`), automatically clean up deleted member keys from `customSplitValues` to prevent phantom unallocated debt calculation errors.

---

### Task 2: Live Room Membership & Eviction Effects
* **Target:** `src/App.tsx`
  - Line 81: Remove unused import `setAppStatusBarStyle`.
  - Line 391: Stabilize `currentUser.role` in auth verification effect.
  - Line 474: Stabilize `activeRoom` and `activeRoom.createdBy` in room ownership sync effect.
  - Line 638: Stabilize `activeRoom` and `handleLogout` references in real-time membership event listener.
  - Line 741: Prefix unused arguments with `_table` and `_eventType`.
  - Line 1375: Stabilize `isAuthenticated` and `refreshState` in OAuth listener.

---

### Task 3: Wizard & Real-time Live Approvals
* **Target:** `src/components/mobile/MobileLogin.tsx`
  - Line 896: Wrap `handleLiveApprovalAndAutoEnter` in `useCallback` or use a stable callback ref so the waiting room polling effect does not suffer from stale closures or re-trigger loops.
* **Target:** `src/components/mobile/JoinRoomModal.tsx`
  - Line 378: Ensure `joinResult.room` and `joinResult.requestId` dependencies are tracked cleanly in request status polling.

---

### Task 4: Admin & Landing Code Clean-Up
* **Target:** `src/components/admin/AdminRouter.tsx`
  - Line 228: Add `currentUser.role` to role-redirection effect.
* **Target:** `src/components/admin/pages/AdminUserDetailModal.tsx`
  - Line 156: Stabilize `userRoomMemberships` in `useMemo`.
* **Target:** `src/components/landing/HeroSection.tsx`
  - Line 21: Prefix unused `_currentUser`.
* **Target:** `src/components/landing/QrCodeModal.tsx`
  - Line 2: Remove unused `ExternalLink` import.
* **Target:** `src/lib/platform/deviceDetector.ts`
  - Lines 47-48: Prefix unused `_actionParam` and `_downloadParam`.
* **Target:** `src/components/mobile/settings/modals/GoogleDriveBackupModal.tsx`
  - Line 4: Remove unused `ShieldCheck` import.

---

### Task 5: Test Files Clean-up
* **Target:** `src/lib/native/backButton.test.ts`
  - Remove unused `vi` import; prefix unused test variables.
* **Target:** `src/lib/storage/offlineQueue.test.ts`
  - Remove unused `vi` import.
* **Target:** `src/components/mobile/roomJoinInvite.test.ts`
  - Remove unused `jsQR` import.
* **Target:** `src/components/landing/downloadConfirmation.test.ts`
  - Remove unused `beforeEach` import.

---

## 3. Verification Criteria & Results
1. `npx oxlint src` returns `0 problems` (0 errors, 0 warnings).  
   - **Result:** PASSED (Found 0 warnings and 0 errors across 225 files).
2. `npx tsc --noEmit` returns `code 0` (0 type errors).  
   - **Result:** PASSED (0 type errors).
3. `npm test` passes all 41 test files (423+ tests).  
   - **Result:** PASSED (41/41 test files passed, 423/423 tests passed, 100% pass rate).
4. `npm run build` succeeds cleanly.  
   - **Result:** PASSED (Build completed in 2.23s, all assets emitted cleanly).

---

## 4. Execution Summary

| Task | Target | Status | Notes |
|------|--------|--------|-------|
| Task 1 | `MobileRoomLedger.tsx` | COMPLETE | Participant sync & split calculation state updated when room members change |
| Task 2 | `App.tsx` | COMPLETE | Stabilized `handleLogoutRef`, auth verification, room sync, and realtime listeners |
| Task 3 | `MobileLogin.tsx` & `JoinRoomModal.tsx` | COMPLETE | Stabilized `handleLiveApprovalRef` and destructured room/request ID effect dependencies |
| Task 4 | `AdminRouter.tsx`, `AdminUserDetailModal.tsx`, `ThemeContext.tsx`, `deviceDetector.ts`, `GoogleDriveBackupModal.tsx`, `QrCodeModal.tsx`, `HeroSection.tsx` | COMPLETE | Added role dependencies, memoized user room memberships, eliminated unused imports/variables |
| Task 5 | Test suites (`backButton.test.ts`, `offlineQueue.test.ts`, `roomJoinInvite.test.ts`, `downloadConfirmation.test.ts`) | COMPLETE | Cleaned up unused imports (`vi`, `jsQR`, `beforeEach`) and prefixed test tracking variables |
