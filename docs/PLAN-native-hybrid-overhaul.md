# Plan: Native-First Hybrid Overhaul (Option A)

**Slug:** `docs/PLAN-native-hybrid-overhaul.md`  
**Goal:** Fix system bar overlaps, biometric app lock on launch/resume, live camera & gallery UPI QR scanner, touch/haptics responsiveness, and hardware back button navigation in CampusFlow.

---

## 1. Context & Objectives
- **Target OS:** Android & iOS (via Capacitor 8 + React 19) + Desktop Web Simulator.
- **Key Pain Points Solved:**
  1. Status bar clock/battery invisibility & 3-button system nav overlap.
  2. Biometric app lock on cold start and background resume.
  3. Live camera UPI QR scanner & gallery QR screenshot uploader.
  4. Sluggish touch response & unreliable Android haptic feedback.
  5. Android hardware Back button causing unexpected app exits.

---

## 2. Implementation Phases

### Phase 1: Native Edge-to-Edge & System Insets
- Update `capacitor.config.ts` & `src/lib/native/statusBar.ts` with `Style.Light` dark text icons for light app theme.
- In `src/components/mobile/MobileLayout.tsx`, strip the simulated frame and fake clock bar when running on a native device (`Capacitor.isNativePlatform()`).
- In `src/components/mobile/MobileBottomNav.tsx`, remove fake iOS bar on Android and apply `padding-bottom: max(env(safe-area-inset-bottom, 12px), 12px)`.
- Add scroll padding `pb-[calc(5.5rem+env(safe-area-inset-bottom,16px))]` across all views.

### Phase 2: Biometric App Lock & Resume Lifecycle
- Build `src/components/mobile/AppLockGateway.tsx` with BiometricPrompt (Fingerprint / Face ID), 4-digit PIN fallback, and Switch Account option.
- Wire `App.tsx` state to trigger App Lock on cold start and when returning from background (`state.isActive`).
- Add App Lock customization controls in `MobileProfile.tsx`.

### Phase 3: Live Camera UPI QR Scanner & Gallery Upload
- Add `android.permission.CAMERA` in `AndroidManifest.xml`.
- Build `src/components/mobile/UpiQrScannerModal.tsx`:
  - Live video scanner with `BarcodeDetector` / canvas decoding.
  - Image uploader for QR code screenshots.
  - Automatic `upi://pay` parser populating payee name, VPA, and amount.
- Integrate into `UpiIntentPayModal.tsx` and Floating Action Button (FAB) quick actions.

### Phase 4: Touch, Haptics & Hardware Back Button
- Enhance `src/lib/native/haptics.ts` with robust Android vibration timing.
- Add `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` in `index.css`.
- Build `src/lib/native/backButton.ts` handling the modal back-stack on Android.

---

## 3. Verification Checklist
- [ ] `npm run build` passes with zero errors.
- [ ] `npx cap sync` succeeds without plugin discrepancies.
- [ ] Native Android system status bar clock and battery remain crisp and readable.
- [ ] Android 3-button navigation does not block bottom tabs.
- [ ] Biometric challenge prompts on app launch and background resume.
- [ ] Camera and screenshot image QR scanning auto-fills UPI payment parameters.
- [ ] Hardware Back button closes open modals cleanly.
