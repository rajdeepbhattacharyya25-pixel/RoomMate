# Project Plan: Comprehensive Modal & Wizard Back-Button Navigation Hardening

**Slug:** `PLAN-modal-back-nav`  
**Generated:** 2026-10-03  
**Mode:** PLANNING ONLY  
**Target File:** `docs/PLAN-modal-back-nav.md`  

---

## 1. Executive Summary

While `MobileBottomSheet.tsx` automatically registers with `registerBackButtonHandler` to intercept Android's back gesture and physical back key, all standalone dialogs, drawers, and multi-step wizards that render direct overlays (`fixed inset-0`) currently do not register a back button handler.

When a user taps or edge-swipes **Back** while one of these screens is open on Android:
1. **Background Desynchronization**: If open inside Settings, pressing Back triggers `MobileSettings.tsx` to reset the active category behind the modal (e.g., jumping from Security to Account while Change PIN modal remains open).
2. **Abrupt Tab Jumps**: If open in Room Ledger, pressing Back triggers `MobileLayout.tsx` to switch the active tab to Dashboard, unmounting or orphaning the modal.
3. **Accidental App Termination**: If already on the base tab, pressing Back bypasses the open modal completely and triggers the root `"Press back again to exit RoomMate"` toast, exiting the app if pressed again.
4. **Broken Multi-Step Navigation**: In multi-step wizards (`FirstLoginOnboardingModal` step 2, `GooglePinSetupModal` step 2, `ChangePinModal` step 2/3, and `MobileLogin` join wizard), pressing Back does not step back to the previous input step.

---

## 2. Architectural Design & The `useBackButton` Hook

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 LIFO Android Hardware Back Button Architecture              │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
     ┌─────────────────────────────────┼────────────────────────────────┐
     ▼                                 ▼                                ▼
[Active Modal / Dialog]        [Parent Screen / Tab]           [Global Native Listener]
- Registered via useBackButton - MobileSettings (cat -> 'account') - Double-tap within 2s
- Intercepts Back (returns true)- MobileLayout (tab -> 'dashboard') - Exit app if unhandled
- Top-most overlay closes first
```

### Core Architecture:
In `src/lib/native/backButton.ts`, export a dedicated React hook `useBackButton`:
```ts
export function useBackButton(onBack: () => boolean | void, active: boolean = true): void {
  const handlerRef = useRef(onBack);
  handlerRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    return registerBackButtonHandler(() => {
      const res = handlerRef.current();
      return res !== false; // If undefined or true, treat as consumed (true)
    });
  }, [active]);
}
```

**Benefits:**
- **Zero Callback Dependency Churn**: Uses `handlerRef` to avoid stale closures and eliminate the need for `useCallback` at call sites.
- **Dynamic Activation**: Accepts an `active` boolean (e.g. `isOpen`, `showDetailsSheet`, or step flags) so it only registers when the modal is actually visible.
- **Natural LIFO Stacking**: As modals open on top of each other, each pushes onto the stack. The top-most modal intercepts and consumes the back action first.

---

## 3. Scope of Changes

### Phase 1: Native Back Button Hook
* **File:** `src/lib/native/backButton.ts`
  - Export `useBackButton(onBack: () => boolean | void, active: boolean = true)` with automatic LIFO registration and cleanup.

---

### Phase 2: Standalone Overlays & Action Sheets
* **`SettlementProofModal.tsx`**: Add `useBackButton(onClose, isOpen)` to dismiss the receipt voucher.
* **`MobileLeaveRoomModal.tsx`**: Add `useBackButton(onClose, isOpen)` to dismiss the leave confirmation.
* **`NotificationHistoryModal.tsx`**: Add `useBackButton(onClose, isOpen)` to dismiss historical log.
* **`NotificationSettingsModal.tsx`**: Add `useBackButton(onClose, isOpen)` to dismiss notification settings.
* **`NotificationCenterDrawer.tsx`**: Add `useBackButton(onClose, true)` to dismiss notifications slide-up drawer.
* **`CloudSyncSheet.tsx`**: Add `useBackButton(onClose, true)` to dismiss cloud sync sheet.
* **`MobileOfflineBanner.tsx`**: Add `useBackButton(() => setShowDetailsSheet(false), showDetailsSheet)` to dismiss network diagnostics.
* **`MobileRoomLedger.tsx`**: Add `useBackButton(() => setShowCreateRoomModal(false), showCreateRoomModal)` to dismiss the Create Room dialog.
* **`WhatsAppNudgeModal.tsx`**: Add `useBackButton(() => setShowQrModal(false), showQrModal)` so Back closes the nested UPI QR modal before closing the parent bottom sheet.

---

### Phase 3: Multi-Step Wizards & Auth Overlays
* **`FirstLoginOnboardingModal.tsx`**:
  - If `step === 'PHONE'`, Back returns to `step === 'NAME'`.
  - If `step === 'NAME'`, Back can be consumed or ignored depending on whether onboarding is mandatory.
* **`GooglePinSetupModal.tsx`**:
  - If `step === 'CONFIRM'`, Back returns to `step === 'ENTER'`.
* **`OAuthProviderNoticeModal.tsx`**:
  - Add `useBackButton(onClose, isOpen)` to dismiss manual OAuth token modal.
* **`MobileLogin.tsx`**:
  - If `showForgotPinModal`, Back closes the modal.
  - If `inspectingJwt`, Back closes the JWT inspection modal.
  - If `authTab === 'join'`:
    - If `joinWizardStep !== 'scan_or_code'`, Back returns to previous step (`confirm_room` -> `scan_or_code`, `resident_info` -> `confirm_room`, etc.).
    - If `joinWizardStep === 'scan_or_code'`, Back switches `authTab` to `'signin'`.
  - If `authTab === 'create'`, Back switches `authTab` to `'signin'`.

---

### Phase 4: Settings Sub-Modals (16 files)
Wire `useBackButton(onClose, isOpen)` into:
1. `src/components/mobile/settings/modals/ChangePinModal.tsx` (also steps back from `CONFIRM_NEW` -> `ENTER_NEW` -> `VERIFY_OLD` -> `onClose`)
2. `src/components/mobile/settings/modals/ReportProblemModal.tsx`
3. `src/components/mobile/settings/modals/DeleteAccountModal.tsx`
4. `src/components/mobile/settings/modals/RestoreBackupModal.tsx`
5. `src/components/mobile/settings/modals/GoogleDriveBackupModal.tsx`
6. `src/components/mobile/settings/modals/EditNameModal.tsx`
7. `src/components/mobile/settings/modals/EditPhoneModal.tsx`
8. `src/components/mobile/settings/modals/EditUpiIdModal.tsx`
9. `src/components/mobile/settings/modals/EditUsernameModal.tsx`
10. `src/components/mobile/settings/modals/ChangeEmailModal.tsx`
11. `src/components/mobile/settings/modals/FullScreenQrModal.tsx`
12. `src/components/mobile/settings/modals/QrPreviewModal.tsx`
13. `src/components/mobile/settings/modals/SignOutOthersModal.tsx`
14. `src/components/mobile/settings/modals/LockTimeoutSheet.tsx`
15. `src/components/mobile/settings/modals/QuietHoursSheet.tsx`
16. `src/components/mobile/settings/tabs/DataBackupTab.tsx` (`showBackupPinModal`)

---

## 4. Verification & Testing Checklist

- [ ] **Automated Hook & LIFO Order Tests**:
  - Test registration, unregistration, and priority invocation in `backButton.ts`.
  - Test that nested modals pop in reverse order (LIFO).
  - Test multi-step state regression (e.g. `CONFIRM` -> `ENTER` -> `close`).
- [ ] **Type Check**: Run `npx tsc --noEmit` to ensure 0 TypeScript compile errors.
- [ ] **Full Test Suite**: Run `npm test` to ensure all 40 test files pass.
- [ ] **Production Build**: Run `npm run build` to confirm clean asset bundling.
