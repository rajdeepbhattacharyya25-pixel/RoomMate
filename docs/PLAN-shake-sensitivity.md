# Project Plan: Mobile Shake-to-Report Sensitivity Calibration & False-Trigger Elimination

**File:** `docs/PLAN-shake-sensitivity.md`  
**Task Slug:** `shake-sensitivity`  
**Status:** COMPLETED  
**Priority:** High (UX Defect)  
**Target:** Mobile Web & Native Android / iOS WebView

---

## 1. Executive Summary & Root-Cause Diagnosis

### The Problem
Residents report that the "Shake to Report" bug reporting option in the mobile application is excessively sensitive. Normal hand movements, picking the phone up from a desk, walking with the device in hand, or rotating the screen between portrait and landscape inadvertently trigger the bug reporting bottom sheet modal.

### Root-Cause Analysis
Investigation of `src/lib/native/shakeDetector.ts` reveals four fundamental algorithmic flaws:
1. **Unfiltered Gravitational Acceleration:** The sensor listener defaults to `event.accelerationIncludingGravity`. Earth's constant $9.81\,\text{m/s}^2$ gravitational vector is included. Simply tilting or rotating the phone shifts ~9.8 m/s² across axes, producing huge delta spikes without any actual physical shake.
2. **Algebraic Scalar Sum vs. Vector Magnitude:** The delta calculation uses `Math.abs(x + y + z - lastX - lastY - lastZ)`. Adding 3D vectors as scalars means opposing movements cancel out, while diagonal hand tilts sum constructively up to $3\times$. True physical acceleration must use Euclidean vector magnitude:
   $$\|\vec{a}\| = \sqrt{a_x^2 + a_y^2 + a_z^2}$$
3. **Single-Sample Triggering:** Any single 100ms interval with `speed > 950` immediately triggers `notifyShake()`. Natural human walking ($2\text{--}5\,\text{m/s}^2$), lifting the phone, or setting it on a surface produces single isolated impulse peaks that trigger the modal.
4. **Lack of User Sensitivity Controls:** Users currently only have a binary on/off toggle. There is no sensitivity adjustment for varying accelerometer hardware calibrations or high-movement lifestyles (e.g. walking, transit, workouts).

---

## 2. Proposed Architecture & Solution Design

### 2.1 Multi-Peak Oscillation Detection (Seismic Shake Algorithm)
Genuine user shakes are high-frequency, bidirectional oscillations. The new detection algorithm will require:
- **Linear Acceleration First:** Prioritize `event.acceleration` (gravity-free linear acceleration computed by mobile sensor fusion).
- **High-Pass Gravity Filter Fallback:** When only `accelerationIncludingGravity` is available, apply a standard low-pass/high-pass IIR filter ($\alpha = 0.82$) to isolate dynamic motion from static gravity:
  $$g_i(t) = \alpha \cdot g_i(t-1) + (1 - \alpha) \cdot a_i(t)$$
  $$a_{\text{linear}, i}(t) = a_i(t) - g_i(t)$$
- **Multi-Peak Counting Window:** Require a burst of consecutive acceleration peaks (minimum 3 reversals within an 800ms rolling window, with each peak separated by $\ge 60\text{ms}$ and $\le 350\text{ms}$). Single spikes (e.g. bumping the phone, walking steps) are automatically rejected.
- **Calibrated Thresholds:** Increase base threshold from hair-trigger levels to a robust minimum of $16\,\text{m/s}^2$ (~$1.6g$), ensuring normal motion cannot reach the trigger line.

### 2.2 User-Configurable Sensitivity Settings
Provide 3 calibrated sensitivity presets stored in `localStorage` (`roommate_shake_sensitivity`):
- **Medium (Standard / Default):** Threshold $16\,\text{m/s}^2$, 3 peaks in 750ms. Perfect balance for normal daily phone usage.
- **Low (Firm Shake / Sports Safe):** Threshold $22\,\text{m/s}^2$, 4 peaks in 800ms. Requires a firm, deliberate double-shake. Completely immune to jogging, transit vibration, or pocket friction.
- **High (Gentle Shake):** Threshold $12\,\text{m/s}^2$, 2 peaks in 600ms. For users with limited wrist mobility or lighter shake preference.

### 2.3 Modal Active Suppression
When `ShakeBugReportModal` is already open, further shake listener triggers must be suppressed to prevent repeated haptic firing or re-renders while the user is typing their bug report.

---

## 3. Work Breakdown & Affected Files

| Component / Layer | File Path | Nature of Change |
|-------------------|-----------|------------------|
| **Shake Detector Core** | `src/lib/native/shakeDetector.ts` | **Refactor**: Implement Euclidean linear acceleration, high-pass gravity filtering, 3-peak oscillation window, and sensitivity tier management (`getShakeSensitivity`, `setShakeSensitivity`). |
| **Unit Test Suite** | `src/lib/native/shakeDetector.test.ts` | **Update**: Add test coverage for sensitivity presets, rejection of single isolated impulse spikes, multi-peak shake sequences, and gravity tilt immunity. |
| **Settings UI** | `src/components/mobile/settings/tabs/AppPreferencesTab.tsx` | **Enhance**: Add Sensitivity selector (`Standard`, `Firm`, `Gentle`) directly under the "Shake to Report" toggle with descriptive helper text. |
| **Bug Report Modal** | `src/components/mobile/ShakeBugReportModal.tsx` | **Enhance**: Ensure listener suppression while modal is open, and surface quick sensitivity adjustment link/indicator in footer. |

---

## 4. Phase-by-Phase Execution Plan

### Phase 1: Algorithmic Refactor of `shakeDetector.ts`
1. Define sensitivity configuration interface:
   ```ts
   export type ShakeSensitivity = 'low' | 'medium' | 'high';
   ```
2. Implement linear acceleration extraction with gravity-filter fallback.
3. Replace algebraic sum with Euclidean vector magnitude:
   $$\|\vec{a}_{\text{linear}}\| = \sqrt{x^2 + y^2 + z^2}$$
4. Implement multi-peak rolling window counter:
   - Track `peakCount`, `lastPeakTime`, `windowStartTime`.
   - Reject single isolated spikes.
   - Require calibrated consecutive reversals.
5. Export `getShakeSensitivity()`, `setShakeSensitivity()`, and fire custom event `roommate_shake_sensitivity_changed`.

### Phase 2: App Preferences & Settings UI
1. Update `AppPreferencesTab.tsx`:
   - When "Shake to Report" is enabled, display an interactive 3-segment pill selector:
     - `Firm` (Low sensitivity, zero false triggers while walking/jogging)
     - `Standard` (Default, requires deliberate multi-shake)
     - `Gentle` (High sensitivity)
   - Add haptic feedback on selector change and save to `localStorage`.

### Phase 3: Modal Active Suppression & Polish
1. In `MobileLayout.tsx` and `ShakeBugReportModal.tsx`:
   - Pass active state or check suppression so shaking while the modal is open does not trigger duplicate events.
   - In the modal footer, display the active sensitivity tier next to the toggle.

### Phase 4: Unit Testing & Verification
1. Run Vitest suite:
   ```bash
   npm test -- src/lib/native/shakeDetector.test.ts
   ```
2. Test cases to cover:
   - Default sensitivity is `'medium'`.
   - Persistence of `'low'`, `'medium'`, and `'high'` in `localStorage`.
   - Single tilt / single acceleration impulse does NOT trigger shake.
   - 3 rapid oscillatory peaks trigger shake successfully.
   - Cooldown prevents re-triggering within 2.5 seconds.
   - Setting disabled stops all triggers.

---

## 5. Verification Checklist

- [ ] **Single Motion Immunity:** Tilt the device 90 degrees or pick it up quickly; verify shake is NOT triggered.
- [ ] **Walking / Jogging Simulation:** Simulate repetitive single-axis acceleration spikes below threshold; verify no false positives.
- [ ] **Intentional Multi-Shake:** Vigorously shake phone back-and-forth 2-3 times; verify modal opens immediately with haptic pulse.
- [ ] **Sensitivity Settings:** Change sensitivity to "Firm" in Preferences; verify even vigorous single shakes do not trigger until firm double-shake is performed.
- [ ] **Modal Suppression:** While modal is open, shake phone; verify no extra haptic triggers or screen flickers.
- [ ] **Test Coverage:** All unit tests pass cleanly without regressions.
