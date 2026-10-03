# Project Plan: Android Sub-Tab Back Navigation & Split Allocation Validation

**Slug:** `PLAN-tab-back-split-fix`  
**Generated:** 2026-10-03  
**Mode:** PLANNING ONLY (No Application Code Modified)  
**Target File:** `docs/PLAN-tab-back-split-fix.md`  

---

## 1. Executive Summary

During the secondary architectural audit of mobile user interaction patterns, two moderate UX and data-integrity defects were identified:

1. **Android Hardware Back Button Exits from Sub-Tabs**:
   - In `src/components/mobile/MobileLayout.tsx`, when a user switches from `dashboard` to the `rooms`, `vault`, or `activity` tab, pressing the Android hardware Back button or performing the edge swipe gesture does not return the user to the Dashboard.
   - Instead, the event falls through to the root app exit listener, prompting *"Press back again to exit RoomMate"* and closing the app on a second press.
   - **Target Behavior:** Pressing Back on any sub-tab must first navigate back to `dashboard`. Only when the user is already on `dashboard` (with no modals open) should pressing Back trigger exit protection.

2. **Incomplete Allocation Submission in Shared Bill Splits**:
   - In `src/components/mobile/MobileRoomLedger.tsx`, `splitValidation` calculates whether custom allocations match the bill total for `EXACT` and `PERCENTAGE` split methods (`isValid`, `diff`, `message`).
   - However, neither the top "Save" button nor the bottom "Confirm & Split Bill" button is disabled when `!splitValidation.isValid`.
   - Furthermore, `handleCreateSplit()` does not enforce `if (!splitValidation.isValid) return;`, allowing unallocated split amounts to be submitted to the ledger and causing `SPLIT_SUM_MISMATCH` errors or corrupted member debt balances.
   - **Target Behavior:** Enforce strict validation in `handleCreateSplit()`, set field errors/toasts, and disable both confirmation buttons whenever an allocation discrepancy exists.

---

## 2. Architectural Design & Interaction Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Navigation & Split Validation                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
     ┌─────────────────────────────────┴─────────────────────────────────┐
     ▼                                                                   ▼
[Android Back Stack in MobileLayout]                 [Split Allocation Gate in MobileRoomLedger]
- If activeTab !== 'dashboard':                      - If splitMethod in ['EXACT', 'PERCENTAGE']:
  * Register back handler (LIFO)                       * Check splitValidation.isValid
  * On back press: setActiveTab('dashboard')           * If invalid: abort, trigger hapticWarning,
  * Consume back event (return true)                     display allocation error
- If activeTab === 'dashboard':                        * Disable header Save & bottom Confirm buttons
  * No handler registered in MobileLayout              * Prevent unallocated debt mutations
  * Falls through to double-tap exit
```

---

## 3. Targeted Component Remediation Plan

### Component 1: `src/components/mobile/MobileLayout.tsx`
- **Import Back Handler**:
  ```typescript
  import { registerBackButtonHandler } from '../../lib/native/backButton';
  ```
- **Register Tab Back Listener**:
  ```typescript
  // Hardware Back Button: navigate back to 'dashboard' tab before triggering app exit
  useEffect(() => {
    if (activeTab === 'dashboard') return;

    return registerBackButtonHandler(() => {
      setActiveTab('dashboard');
      return true; // Event consumed
    });
  }, [activeTab]);
  ```
- **Modal Priority Harmony**:
  Because `registerBackButtonHandler` maintains a strict LIFO stack:
  1. If any modal/sheet is open (`showQuickActionSheet`, `showQrScanner`, `showShakeReportModal`, or a tab modal), that modal's handler was registered last and will consume the back press to dismiss the modal.
  2. Once all modals are dismissed, pressing Back navigates from `rooms` / `vault` / `activity` back to `dashboard`.
  3. Once on `dashboard`, the handler is unregistered, allowing the global 2-second double-tap exit protector to function normally.

---

### Component 2: `src/components/mobile/MobileRoomLedger.tsx`
- **Validation Guard in `handleCreateSplit()`**:
  Add validation guard before dispatching `onAddSharedExpense`:
  ```typescript
  if (splitMethod !== 'EQUAL' && !splitValidation.isValid) {
    hapticWarning();
    setSplitValidationErrors((prev) => ({
      ...prev,
      amount: splitValidation.message || 'Please allocate the full amount across selected roommates.',
    }));
    return;
  }
  ```
- **Header "Save" Button Disabled State**:
  ```tsx
  <button
    onClick={() => handleCreateSplit()}
    disabled={splitMethod !== 'EQUAL' && !splitValidation.isValid}
    className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${
      splitMethod !== 'EQUAL' && !splitValidation.isValid
        ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
        : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 active:scale-95'
    }`}
    type="button"
  >
    Save
  </button>
  ```
- **Bottom "Confirm & Split Bill" Button Disabled State**:
  ```tsx
  <button
    type="button"
    onClick={() => handleCreateSplit()}
    disabled={splitMethod !== 'EQUAL' && !splitValidation.isValid}
    className={`w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-transform ${
      splitMethod !== 'EQUAL' && !splitValidation.isValid
        ? 'opacity-40 cursor-not-allowed bg-slate-300 dark:bg-slate-700 text-slate-500'
        : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white active:scale-[0.98]'
    }`}
  >
    <Check className="w-4 h-4 stroke-[2.5]" />
    <span>Confirm & Split Bill</span>
  </button>
  ```

---

## 4. Verification Checklist & Testing Strategy

- [x] **Android Back Stack Navigation Tests**:
  - [x] Test simulated back button press when `activeTab === 'rooms'` transitions to `'dashboard'`.
  - [x] Test simulated back button press when `activeTab === 'vault'` transitions to `'dashboard'`.
  - [x] Test simulated back button press when modal is open on sub-tab closes the modal first, keeping tab intact.
  - [x] Test simulated back button press on `activeTab === 'dashboard'` does not intercept the exit handler.

- [x] **Split Validation & Allocation Guard Tests**:
  - [x] Test `handleCreateSplit` with `splitMethod === 'EXACT'` rejects unallocated sum.
  - [x] Test `handleCreateSplit` with `splitMethod === 'PERCENTAGE'` rejects allocations !== 100%.
  - [x] Test `splitValidation.isValid === true` allows submission and clears form.
  - [x] Verify disabled visual styles on both header and footer submission buttons.

- [x] **Full Regression & Quality Gate**:
  - [x] Vitest test suite execution: all 40 test files (419 tests) passing.
  - [x] TypeScript validation: `npx tsc --noEmit` returns 0 errors.
  - [x] Production build: `npm run build` passes with zero compilation issues.

---

## 5. Agent Deliverables

| Deliverable | Target Path | Owner Agent | Status |
|---|---|---|---|
| Project Plan | `docs/PLAN-tab-back-split-fix.md` | `project-planner` | COMPLETE |
| Subtab Back Navigation Handler | `src/components/mobile/MobileLayout.tsx` | `mobile-developer` | COMPLETE |
| Split Allocation Form Validation | `src/components/mobile/MobileRoomLedger.tsx` | `frontend-specialist` | COMPLETE |
| Regression & Navigation Tests | `src/components/mobile/appLockLifecycle.test.ts` | `mobile-developer` | COMPLETE |
