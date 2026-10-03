# Project Plan: Biometric Unlock Loop & Mobile App Lock Lifecycle Fix

**Slug:** `PLAN-biometric-unlock-fix`  
**Generated:** 2026-10-03  
**Mode:** PLANNING ONLY  
**Target File:** `docs/PLAN-biometric-unlock-fix.md`

---

## 1. Executive Summary & Problem Diagnosis

### The Reported Issue
The user reported:
> "in the notification sec in thesettings after i turned off the haptic feedback and close the app and after opening the app it keeps reasking for fingerprint even after unlocking the app with correct biometric it keeps asking again and again teh popup coming up . look after the issue and fix it also find if there any other bugs in the app too"

### Root Cause Analysis

#### Root Cause 1: Re-render & Effect Loop in `AppLockGateway.tsx`
- **File:** `src/components/mobile/AppLockGateway.tsx` (Lines 44–87)
- **The Bug:**
  1. The auto-prompt `useEffect` had `triggerBiometricAuth` in its dependency array:
     ```ts
     useEffect(() => {
       if (!isOpen) return;
       checkNativeBiometrics().then((status) => {
         setBiometricStatus(status);
         triggerBiometricAuth(status.displayName);
       });
     }, [isOpen, triggerBiometricAuth]);
     ```
  2. `triggerBiometricAuth` was wrapped in `useCallback` with dependencies `[isPrompting, biometricStatus?.displayName, currentUser.name, onUnlock]`.
  3. Inside `triggerBiometricAuth`:
     - Calls `setIsPrompting(true)` -> re-renders `AppLockGateway` with new `triggerBiometricAuth` reference.
     - Performs native biometric authentication.
     - In `finally`: calls `setIsPrompting(false)` -> re-renders with yet another new `triggerBiometricAuth` reference!
     - Also calls `setBiometricStatus(status)` -> re-renders with new `biometricStatus?.displayName`.
     - In `App.tsx`, `onUnlock={() => setIsAppLocked(false)}` passes an anonymous inline closure, creating a new reference on every parent render.
  4. Each reference change triggered the `useEffect` again, repeatedly calling `triggerBiometricAuth`, resulting in an unstoppable biometric popup storm.
  5. There was **no single-invocation guard (`hasAutoPromptedRef`)** to restrict the automatic OS BiometricPrompt to exactly once per lock presentation.

#### Root Cause 2: Android Activity Lifecycle & Resume Lockout in `App.tsx` & `network.ts`
- **Files:** `src/App.tsx` (Lines 278–319), `src/lib/native/network.ts` (Lines 284–312)
- **The Bug:**
  1. `listenToAppLifecycle` only listened for foreground events (`state.isActive === true`), completely ignoring background events (`state.isActive === false`).
  2. `lastBackgroundTime` in `App.tsx` was only updated via web `visibilitychange` (`document.visibilityState === 'hidden'`), which does not reliably fire in Android Capacitor activities or when system dialogs appear.
  3. On native Android, presenting `androidx.biometric.BiometricPrompt` and dismissing it causes the Android Activity lifecycle to trigger `onPause()` / `onResume()`, which Capacitor dispatches as `appStateChange: { isActive: true }`.
  4. When `appStateChange` fires, `onResume` in `App.tsx` computes:
     ```ts
     const elapsed = Date.now() - lastBackgroundTime;
     if (elapsed >= timeoutMs) {
       setIsAppLocked(true);
     }
     ```
  5. If the app was opened cold, `lastBackgroundTime` was `0`, making `elapsed` over 1.7 trillion milliseconds.
  6. More critically: **`lastBackgroundTime` was NEVER reset when `onUnlock` succeeded**, and there was **no post-unlock grace period / cooldown**.
  7. Therefore, the instant the user scanned their fingerprint and `onUnlock()` set `isAppLocked(false)`, Android dismissed the dialog, Capacitor fired `appStateChange: { isActive: true }`, `onResume` ran, evaluated `elapsed >= timeoutMs` as true, and **immediately called `setIsAppLocked(true)` again**!
  8. This re-locked the app in the exact same millisecond the user unlocked it.

#### Secondary & Correlated Bugs Found in Mobile Audit
1. **Unsafe JSON Parsing in `NotificationsTab.tsx`**:
   - Line 59: `JSON.parse(quietHoursConfig)` has no `try/catch` wrapper. If localStorage data is malformed or corrupted, opening the Notifications settings tab crashes the whole screen.
2. **Missing `roommate_settings_changed` Listener in `App.tsx`**:
   - When the user toggles App Lock or Security settings in `SecurityTab`, `App.tsx` does not react immediately in memory until the app is fully restarted or re-mounted.
3. **External UPI App Handoff Re-lock Trap (`UpiIntentPayModal.tsx`)**:
   - Launching UPI apps (GPay, PhonePe, Paytm) takes the user out of the app for 15–30 seconds. On returning, the immediate timeout locks the screen and previously caused the biometric loop to wipe out or trap the payment confirmation screen.
4. **Haptics Disabled Error-Free Early Return**:
   - In `src/lib/native/haptics.ts`, turning off haptic feedback works cleanly, but `AppLockGateway` was awaiting haptics synchronously during critical unlock transitions. This will be made purely non-blocking and safe.

---

## 2. Core Architectural Principles & Fix Design

```text
+---------------------------------------------------------------------------------+
|                               RoomMate App Lock Flow                            |
+---------------------------------------------------------------------------------+
                                      │
               App launches or resumes after >= timeoutMs
                                      │
                                      ▼
                        Is App Lock enabled in settings?
                                      │
                        ┌─────────────┴─────────────┐
                        │ YES                       │ NO
                        ▼                           ▼
            Set isAppLocked(true)              Normal App Access
                        │
                        ▼
            Mount <AppLockGateway />
                        │
     ┌──────────────────┴──────────────────┐
     │ Auto-trigger biometrics EXACTLY ONCE│ (Guarded by hasAutoPromptedRef)
     ▼                                     │
Native BiometricPrompt / WebAuthn          │
     │                                     │
     ├──────────────────────────┐          │
     ▼ (User Scans Fingerprint) ▼ (User Cancels / Fails)
Biometric Success          Show error message + Stop auto-prompting
     │                     Keep manual "Unlock with Biometrics" button
     │                     & "Unlock with Vault PIN" active
     ▼
1. Mark session unlocked: lastUnlockTime = Date.now()
2. Set grace period: ignore appStateChange for next 5000ms
3. Reset lastBackgroundTime = Date.now()
4. Call onUnlock() -> setIsAppLocked(false)
5. Android closes dialog -> appStateChange fires -> GRACE PERIOD ACTIVE!
   -> IGNORE resume re-lock -> App stays UNLOCKED smoothly!
```

1. **Strict Single-Shot Auto Prompting**:
   - `AppLockGateway` must use a `useRef<boolean>(false)` (`hasAutoPromptedRef`) to track whether the biometric challenge has already executed for the current modal session.
   - When `isOpen` transitions to `true`, the ref resets. Once fired, neither re-renders nor state updates can re-trigger `authenticateResidentBiometrics`.
2. **Native Lifecycle Completeness**:
   - `listenToAppLifecycle` must accept both `onResume` and `onPause` handlers.
   - `CapApp.addListener('appStateChange')` must update `lastBackgroundTime` when `state.isActive === false`.
3. **Post-Unlock Cooldown / Grace Period**:
   - When the user successfully unlocks the app (via biometrics or PIN), set `lastUnlockTimeRef.current = Date.now()` and set `lastBackgroundTime = Date.now()`.
   - On resume, if `Date.now() - lastUnlockTimeRef.current < 5000`, bypass the timeout lock check because the resume was triggered by the dismissal of the native biometric prompt or immediate unlock.
4. **Defensive Storage & Settings Sync**:
   - Safely parse JSON in `NotificationsTab.tsx` and all settings tabs.
   - Listen to `roommate_settings_changed` in `App.tsx` so toggling App Lock off immediately updates `isAppLocked(false)`.

---

## 3. Comprehensive Task Breakdown

### Phase 1: Native App Lifecycle & Background Sync Hardening
- [ ] Modify `src/lib/native/network.ts`:
  - Enhance `listenToAppLifecycle(onResume: () => void, onPause?: () => void): () => void` to support both active and background state changes.
  - When `state.isActive === false`, fire `onPause()`.
  - Also hook `document.addEventListener('visibilitychange')` to trigger `onPause()` when `hidden` and `onResume()` when `visible`.
- [ ] Update `src/App.tsx`:
  - Track `lastBackgroundTime` via the enhanced `listenToAppLifecycle` `onPause` callback.
  - Maintain `lastUnlockTimeRef = useRef<number>(Date.now())` to prevent re-locking within a 5-second post-unlock grace period.
  - Reset `lastBackgroundTime = Date.now()` upon successful unlock in `handleUnlock`.
  - Memoize `handleUnlock = useCallback(() => { ... }, [])` to avoid passing unstable callback references to `AppLockGateway`.
  - Listen to `roommate_settings_changed` so toggling App Lock off in Security Settings immediately syncs in-memory lock state.

### Phase 2: AppLockGateway Loop Elimination & UX Polish
- [ ] Refactor `src/components/mobile/AppLockGateway.tsx`:
  - Replace the volatile `useEffect([isOpen, triggerBiometricAuth])` dependency with a stable one-shot trigger.
  - Add `hasAutoPromptedRef = useRef(false)`.
  - When `isOpen` becomes `false`, reset `hasAutoPromptedRef.current = false`.
  - When `isOpen` is `true` and `!hasAutoPromptedRef.current`:
    - Set `hasAutoPromptedRef.current = true`.
    - Fetch biometric status and initiate the challenge once.
  - Use `useRef` for tracking `isPrompting` state internally to avoid re-triggering effects during `setIsPrompting(true/false)`.
  - When authentication succeeds:
    - Invoke non-blocking `hapticSuccess().catch(() => {})`.
    - Clear errors and PIN.
    - Call `onUnlock()` safely.
  - When authentication is cancelled or fails:
    - Do NOT re-prompt automatically.
    - Show clear error feedback with the manual "Unlock with Fingerprint / Biometrics" button and the "Unlock with Vault PIN Instead" option.

### Phase 3: Mobile Audit & Edge Case Bug Fixes
- [ ] **NotificationsTab Defensive Parsing**:
  - In `src/components/mobile/settings/tabs/NotificationsTab.tsx`, wrap `JSON.parse(quietHoursConfig)` in a safe helper with fallback defaults (`{ enabled: false, start: '22:00', end: '07:00' }`).
- [ ] **External Payment App Handoff Safety**:
  - In `src/components/mobile/UpiIntentPayModal.tsx` & `src/App.tsx`, mark when an external UPI app intent is launched (`isLaunchingExternalUpiIntent`). Provide a 60-second grace buffer on resume so returning from GPay/PhonePe doesn't abruptly lock the user out before confirming the payment.
- [ ] **Biometrics Error & Emulation Handling**:
  - In `src/lib/native/biometrics.ts`, ensure `authenticateResidentBiometrics` never throws uncaught exceptions across all platforms (Android, iOS, Web).

### Phase 4: Automated Testing & Verification
- [ ] Create dedicated test suite `src/components/mobile/appLockLifecycle.test.ts`:
  - Test 1: Single biometric trigger per lock session (verify no infinite loop on prompt completion).
  - Test 2: Lifecycle resume within grace period does not re-lock the app.
  - Test 3: Lifecycle resume after timeout period correctly triggers lock.
  - Test 4: App Lock setting toggle dispatches and updates state.
  - Test 5: Safe handling of corrupt JSON in quiet hours / notification settings.
  - Test 6: Safe haptics toggle with app lock persistence.
- [ ] Run full test suite (`npm test -- --run`) ensuring all 400+ tests pass with zero regressions.
- [ ] Perform Android build validation check if necessary.

---

## 4. Deliverables & Checkpoint

| Deliverable | File Path | Status |
|-------------|-----------|--------|
| Planning Specification | `docs/PLAN-biometric-unlock-fix.md` | COMPLETE |
| Native Lifecycle Sync | `src/lib/native/network.ts` | Ready for implementation |
| App Lock Gateway Fix | `src/components/mobile/AppLockGateway.tsx` | Ready for implementation |
| App Shell Controller | `src/App.tsx` | Ready for implementation |
| Notifications Robustness | `src/components/mobile/settings/tabs/NotificationsTab.tsx` | Ready for implementation |
| Automated Test Suite | `src/components/mobile/appLockLifecycle.test.ts` | Ready for implementation |

---
**Next Step:** Proceed to implementation upon review.
