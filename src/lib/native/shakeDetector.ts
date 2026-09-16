import { hapticImpact } from './haptics';

const SHAKE_PREFERENCE_KEY = 'roommate_shake_to_report';
const SHAKE_SENSITIVITY_KEY = 'roommate_shake_sensitivity';
const SHAKE_COOLDOWN_MS = 2500; // Minimum delay between successful triggers

export type ShakeSensitivity = 'low' | 'medium' | 'high';

export interface SensitivityProfile {
  threshold: number;      // m/s^2 linear acceleration magnitude
  requiredPeaks: number;  // consecutive oscillatory peaks required
  windowMs: number;       // maximum time window for the burst
}

export const SENSITIVITY_PROFILES: Record<ShakeSensitivity, SensitivityProfile> = {
  low: { threshold: 22, requiredPeaks: 4, windowMs: 800 },    // Firm / Sports-safe (immune to walking/jogging)
  medium: { threshold: 16, requiredPeaks: 3, windowMs: 750 }, // Standard / Balanced (default)
  high: { threshold: 12, requiredPeaks: 2, windowMs: 600 },   // Gentle / Light
};

type ShakeCallback = () => void;

let listeners: Set<ShakeCallback> = new Set();
let isListening = false;

// Multi-peak tracking state
let peakCount = 0;
let firstPeakTime = 0;
let lastPeakTime = 0;
let lastShakeTime = -SHAKE_COOLDOWN_MS;

// Dynamic gravity filter state (fallback when hardware linear acceleration is unavailable)
let gravityX = 0;
let gravityY = 0;
let gravityZ = 0;
let gravityInitialized = false;

/**
 * Check whether "Shake to Report" is enabled in settings (default: true).
 */
export function isShakeDetectionEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
  try {
    const val = localStorage.getItem(SHAKE_PREFERENCE_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Enable or disable "Shake to Report" globally.
 */
export function setShakeDetectionEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SHAKE_PREFERENCE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent('roommate_shake_setting_changed', { detail: { enabled } }));
    window.dispatchEvent(new Event('roommate_settings_changed'));
  } catch (err) {
    console.warn('[RoomMate] Failed to persist shake detection preference:', err);
  }
}

/**
 * Get current shake sensitivity setting (default: 'medium').
 */
export function getShakeSensitivity(): ShakeSensitivity {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 'medium';
  try {
    const val = localStorage.getItem(SHAKE_SENSITIVITY_KEY);
    if (val === 'low' || val === 'medium' || val === 'high') return val;
    return 'medium';
  } catch {
    return 'medium';
  }
}

/**
 * Set shake sensitivity preference globally.
 */
export function setShakeSensitivity(sensitivity: ShakeSensitivity): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SHAKE_SENSITIVITY_KEY, sensitivity);
    window.dispatchEvent(new CustomEvent('roommate_shake_sensitivity_changed', { detail: { sensitivity } }));
    window.dispatchEvent(new Event('roommate_settings_changed'));
  } catch (err) {
    console.warn('[RoomMate] Failed to persist shake sensitivity preference:', err);
  }
}

/**
 * Request permission for device motion sensors (required on modern iOS Safari).
 */
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const anyDeviceMotion = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof anyDeviceMotion?.requestPermission === 'function') {
    try {
      const permissionState = await anyDeviceMotion.requestPermission();
      return permissionState === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Core motion processing logic that isolates linear acceleration, calculates
 * Euclidean vector magnitude, and requires multi-peak oscillations within a rolling window.
 * Exported for rigorous unit testing and verification.
 */
export function processMotionSample(
  acc: { x?: number | null; y?: number | null; z?: number | null } | null | undefined,
  accWithGravity: { x?: number | null; y?: number | null; z?: number | null } | null | undefined,
  now = Date.now()
): boolean {
  if (!isShakeDetectionEnabled()) {
    resetShakeState();
    return false;
  }

  let linX = 0;
  let linY = 0;
  let linZ = 0;

  // 1. Prefer true hardware linear acceleration (already stripped of 9.81m/s^2 gravity)
  if (
    acc &&
    typeof acc.x === 'number' &&
    typeof acc.y === 'number' &&
    typeof acc.z === 'number'
  ) {
    linX = acc.x;
    linY = acc.y;
    linZ = acc.z;
  } else if (
    accWithGravity &&
    (typeof accWithGravity.x === 'number' ||
      typeof accWithGravity.y === 'number' ||
      typeof accWithGravity.z === 'number')
  ) {
    // 2. Fallback: Apply dynamic high-pass filter to strip static gravity
    const rawX = accWithGravity.x ?? 0;
    const rawY = accWithGravity.y ?? 0;
    const rawZ = accWithGravity.z ?? 0;

    if (!gravityInitialized) {
      gravityX = rawX;
      gravityY = rawY;
      gravityZ = rawZ;
      gravityInitialized = true;
      return false;
    }

    const alpha = 0.82; // Filter smoothing constant
    gravityX = alpha * gravityX + (1 - alpha) * rawX;
    gravityY = alpha * gravityY + (1 - alpha) * rawY;
    gravityZ = alpha * gravityZ + (1 - alpha) * rawZ;

    linX = rawX - gravityX;
    linY = rawY - gravityY;
    linZ = rawZ - gravityZ;
  } else {
    return false;
  }

  // 3. Euclidean vector magnitude: ||a|| = sqrt(x^2 + y^2 + z^2)
  const magnitude = Math.sqrt(linX * linX + linY * linY + linZ * linZ);

  const sensitivity = getShakeSensitivity();
  const profile = SENSITIVITY_PROFILES[sensitivity];

  // 4. Check if current magnitude exceeds the sensitivity threshold
  if (magnitude >= profile.threshold) {
    const timeSinceLastPeak = now - lastPeakTime;
    const timeSinceFirstPeak = now - firstPeakTime;

    // Filter out sensor noise: require at least 50ms between distinct reversals
    if (timeSinceLastPeak > 50) {
      // Check if this continues an ongoing rhythmic shake or starts a new burst
      if (
        peakCount === 0 ||
        timeSinceLastPeak > 350 ||
        timeSinceFirstPeak > profile.windowMs
      ) {
        peakCount = 1;
        firstPeakTime = now;
        lastPeakTime = now;
      } else {
        peakCount++;
        lastPeakTime = now;

        // Met the required peak count for an intentional shake gesture
        if (peakCount >= profile.requiredPeaks) {
          if (now - lastShakeTime > SHAKE_COOLDOWN_MS) {
            lastShakeTime = now;
            peakCount = 0;
            notifyShake();
            return true;
          }
        }
      }
    }
  }

  return false;
}

function handleDeviceMotion(event: DeviceMotionEvent) {
  processMotionSample(event.acceleration, event.accelerationIncludingGravity, Date.now());
}

function notifyShake() {
  // Fire tactile haptic confirmation
  hapticImpact('HEAVY').catch(() => {});

  listeners.forEach((callback) => {
    try {
      callback();
    } catch (err) {
      console.error('[RoomMate] Error executing shake callback:', err);
    }
  });
}

/**
 * Reset internal motion filter state (useful in tests).
 */
export function resetShakeState(): void {
  peakCount = 0;
  firstPeakTime = 0;
  lastPeakTime = 0;
  lastShakeTime = -SHAKE_COOLDOWN_MS;
  gravityX = 0;
  gravityY = 0;
  gravityZ = 0;
  gravityInitialized = false;
}

/**
 * Subscribe a callback to shake events.
 * Returns an unsubscription function.
 */
export function addShakeListener(callback: ShakeCallback): () => void {
  listeners.add(callback);

  if (!isListening && typeof window !== 'undefined') {
    window.addEventListener('devicemotion', handleDeviceMotion, false);
    isListening = true;
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && isListening && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', handleDeviceMotion, false);
      isListening = false;
    }
  };
}

/**
 * Manually trigger a shake event (ideal for testing in browser preview or desktop simulator).
 */
export function triggerSimulatedShake(): void {
  notifyShake();
}
