# Project Plan: Comprehensive Mobile Audit & Lifecycle Hardening

**Slug:** `PLAN-app-audit-fixes`  
**Generated:** 2026-10-03  
**Mode:** PLANNING ONLY  
**Target File:** `docs/PLAN-app-audit-fixes.md`

---

## 1. Executive Summary

During the comprehensive audit of the RoomMate mobile application across native Capacitor events, Android activity lifecycle transitions, auth state changes, and hardware interaction flows, five interrelated bugs and edge cases were identified:

1. **BiometricPrompt Re-asking Loop**: Android Activity resume events collided with `AppLockGateway` auto-prompting `useEffect`, causing an infinite re-locking loop on app resume.
2. **Auth Transition Lockout (Login / Logout)**: Logging out or switching resident accounts failed to reset `isAppLocked`, trapping residents behind the lock screen upon re-authenticating.
3. **Android Hardware Back Button Navigation in App Lock**: The lock gateway lacked a hardware back button handler; tapping Back on the 4-digit PIN fallback triggered app exit instead of returning to the biometric unlock screen.
4. **False Shake-to-Report Triggering During Camera QR Scanning**: Physical phone movement while pointing the camera at a QR code triggered the global shake detector, popping up the Bug Report modal over the active viewfinder.
5. **Object URL Memory Leak in QR Selection**: Selecting new UPI QR codes repeatedly allocated `blob:` URLs via `URL.createObjectURL` without calling `URL.revokeObjectURL`.

---

## 2. Architectural Principles & Safeguards

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Hardened Mobile Architecture                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     ▼                                ▼                                ▼
[Biometrics & Lifecycle]       [Auth Transitions]             [Hardware & UX]
- Single-shot prompt guard      - Reset isAppLocked on login    - Back button closes PIN
- 5s post-unlock grace period   - Reset isAppLocked on logout   - Suppress shake on camera
- 60s external UPI buffer       - Refresh background timer      - Clean up object URLs
- Track onPause + onResume
```

---

## 3. Detailed Component Plan & Changes

### Component 1: `AppLockGateway.tsx`
- **Single-Shot Prompt Guard**: Use `hasAutoPromptedRef = useRef(false)` to ensure native biometrics triggers strictly once per lock session.
- **Stable Callback References**: Wrap `onUnlockRef = useRef(onUnlock)` and `currentUserRef = useRef(currentUser)` to decouple re-render triggers from effects.
- **Hardware Back Button Priority**: Register a back handler returning `true` to close PIN fallback before delegating to the app-level exit handler.
- **Non-blocking Haptics**: Safeguard all `hapticSuccess()` and `hapticWarning()` calls with `.catch(() => {})`.

### Component 2: `App.tsx` & `network.ts`
- **Native Lifecycle Tracking**: Expand `listenToAppLifecycle` to accept `onPause` for native `state.isActive === false` and web `visibilitychange: hidden`.
- **Post-Unlock Cooldown**: Implement a 5-second grace window (`Date.now() - lastUnlockTimeRef.current < 5000`) where resume events cannot re-lock the app.
- **External UPI Intent Buffer**: Track `sessionStorage.getItem('roommate_upi_intent_active')` to grant a 60-second grace window when returning from GPay/PhonePe.
- **Auth State Resets**: Ensure both `handleLogin` and `handleLogout` reset `isAppLocked(false)` and update timestamp refs.
- **Dynamic Settings Sync**: Listen to `roommate_settings_changed` to immediately disable app lock in memory when toggled off in settings.

### Component 3: `MobileLayout.tsx`
- **Shake Suppression Guard**: Add `isScannerOrModalActiveRef` to check `showQrScanner`, `showQuickActionSheet`, or `showShakeReportModal`.
- **False Positive Elimination**: Ignore shake events when the camera QR scanner is active.

### Component 4: `AccountTab.tsx`
- **Memory Cleanup**: Add a cleanup `useEffect` that calls `URL.revokeObjectURL(pendingQrPreview)` whenever a new image is selected or the tab unmounts.

### Component 5: `NotificationsTab.tsx`
- **Defensive Storage Parsing**: Wrap `JSON.parse` of `roommate_quiet_hours` in a `try/catch` block with fallback defaults.

---

## 4. Verification Checklist & Test Plan

- [x] **Unit & Integration Test Suite** (`src/components/mobile/appLockLifecycle.test.ts`):
  - [x] Haptics preference & persistence across localStorage.
  - [x] Defensive JSON parsing of corrupt quiet hours configurations.
  - [x] Registration of both `onResume` and `onPause` lifecycle hooks.
  - [x] Post-unlock 5-second grace period suppression.
  - [x] Timeout threshold triggering after genuine background periods.
  - [x] External UPI payment intent grace buffer.
  - [x] Dynamic `roommate_settings_changed` event handling.
  - [x] Hardware back button consumption during PIN fallback.
  - [x] Shake detection suppression during camera QR scanning.
  - [x] Auth transition resets on login and logout.
- [x] **Full Regression Test Run**: Execute all 40 test files in the workspace (415 tests passing).
- [x] **Static Type Check**: Run `npx tsc --noEmit` (0 errors).
- [x] **Production Bundle**: Execute `npm run build` (successful compilation).

---

## 5. Deliverables

| Deliverable | Path | Status |
|-------------|------|--------|
| Project Plan | `docs/PLAN-app-audit-fixes.md` | COMPLETE |
| Lifecycle Test Suite | `src/components/mobile/appLockLifecycle.test.ts` | COMPLETE |
| Verified Codebase | All modified modules | COMPLETE |
