/**
 * SuperAdmin Intrusion Detection & Threat Telemetry Service
 *
 * Provides:
 * 1. Hardware & Phone Model Fingerprinting (Android, iOS, Desktop)
 * 2. Passive Geo-IP Resolution (City, State, Country, ISP/Carrier - Zero GPS prompts)
 * 3. Persistent Multi-Tier Escalating Lockout (Survives page reloads)
 * 4. Real-Time SuperAdmin Incident Alert Dispatching (In-app notifications + Push)
 */

import { db } from '../storage/mockStorage';
import { getOrCreateDeviceId } from './superAdminSecurityService';

export interface ThreatTelemetrySnapshot {
  deviceModel: string;
  platform: string;
  browser: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  timestamp: string;
}

export interface IntrusionState {
  failedAttempts: number;
  lockoutUntil: number | null;
  lastAttemptAt: string;
  deviceId: string;
  isBlacklisted: boolean;
}

const INTRUSION_STORAGE_KEY = 'roommate_admin_intrusion_state_v1';
const GEO_CACHE_KEY = 'roommate_geo_telemetry_cache';

// -----------------------------------------------------------------------------
// 1. HARDWARE & PHONE MODEL FINGERPRINTING
// -----------------------------------------------------------------------------

/**
 * Parses user agent and client hints to determine the specific phone or device model.
 */
export function detectDeviceModel(uaString?: string): {
  deviceModel: string;
  platform: string;
  browser: string;
} {
  const ua = uaString || (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  let platform = 'Unknown OS';
  let deviceModel = 'Generic Device';
  let browser = 'Unknown Browser';

  // 1. Browser Detection
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Apple Safari';
  else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';

  // 2. Android Phone Model Detection
  if (/Android/i.test(ua)) {
    platform = 'Android';
    // Match common Android model identifiers: "Build/[MODEL]" or "; [MODEL] Build"
    const modelMatch = ua.match(/;\s*([^;]+?)\s+Build\//i) || ua.match(/\b([A-Z0-9_-]+)\s+Build\//i);

    if (modelMatch && modelMatch[1]) {
      const rawModel = modelMatch[1].trim();

      // Normalize known vendor prefixes
      if (/^SM-[A-Z0-9]+/i.test(rawModel)) {
        deviceModel = `Samsung Galaxy (${rawModel})`;
      } else if (/Pixel\s*[0-9a-zA-Z\s]*/i.test(rawModel)) {
        deviceModel = `Google ${rawModel}`;
      } else if (/Redmi|POCO|Mi\s/i.test(rawModel)) {
        deviceModel = `Xiaomi ${rawModel}`;
      } else if (/OnePlus|CPH[0-9]+/i.test(rawModel)) {
        deviceModel = `OnePlus (${rawModel})`;
      } else if (/vivo/i.test(rawModel)) {
        deviceModel = `Vivo (${rawModel})`;
      } else if (/OPPO/i.test(rawModel)) {
        deviceModel = `Oppo (${rawModel})`;
      } else if (/moto/i.test(rawModel)) {
        deviceModel = `Motorola (${rawModel})`;
      } else {
        deviceModel = rawModel;
      }
    } else {
      deviceModel = 'Android Smartphone';
    }
  }
  // 3. Apple iOS Device Detection
  else if (/iPhone/i.test(ua)) {
    platform = 'iOS';
    // Screen size approximation or standard iPhone identifier
    deviceModel = 'Apple iPhone';
  } else if (/iPad/i.test(ua)) {
    platform = 'iPadOS';
    deviceModel = 'Apple iPad';
  }
  // 4. Desktop Platforms
  else if (/Windows/i.test(ua)) {
    platform = 'Windows';
    deviceModel = ua.includes('Windows NT 10.0') ? 'Windows 10/11 PC' : 'Windows PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platform = 'macOS';
    deviceModel = 'Apple MacBook / Mac';
  } else if (/Linux/i.test(ua)) {
    platform = 'Linux';
    deviceModel = 'Linux Workstation';
  }

  return { deviceModel, platform, browser };
}

// -----------------------------------------------------------------------------
// 2. PASSIVE GEO-IP RESOLUTION (ZERO PERMISSION PROMPTS)
// -----------------------------------------------------------------------------

/**
 * Resolves estimated city, state/region, country, and ISP network passively via IP lookup.
 * Uses strict 2.5-second timeout and session cache to prevent delay.
 */
export async function resolveEstimatedLocation(): Promise<{
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
}> {
  // Check cached telemetry (valid for 1 hour)
  if (typeof sessionStorage !== 'undefined') {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
          return parsed.data;
        }
      } catch {
        // Continue to fresh fetch
      }
    }
  }

  const fallbackResult = {
    ip: '127.0.0.1 (Local / Private)',
    city: 'Local Area',
    region: 'Campus Network',
    country: 'India',
    isp: 'Local Network Provider',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    // Primary: ipapi.co (HTTPS, CORS-friendly, rich Indian ISP data)
    const response = await fetch('https://ipapi.co/json/', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const resolved = {
        ip: data.ip || 'Unknown IP',
        city: data.city || 'Unknown City',
        region: data.region || 'Unknown State',
        country: data.country_name || 'India',
        isp: data.org || data.asn || 'ISP Network',
      };

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(
          GEO_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), data: resolved })
        );
      }

      return resolved;
    }
  } catch {
    // Gracefully handle offline or network error
  }

  return fallbackResult;
}

// -----------------------------------------------------------------------------
// 3. PERSISTENT MULTI-TIER ESCALATING LOCKOUT
// -----------------------------------------------------------------------------

export function getIntrusionState(): IntrusionState {
  const defaultState: IntrusionState = {
    failedAttempts: 0,
    lockoutUntil: null,
    lastAttemptAt: new Date().toISOString(),
    deviceId: getOrCreateDeviceId(),
    isBlacklisted: false,
  };

  if (typeof localStorage === 'undefined') return defaultState;

  const raw = localStorage.getItem(INTRUSION_STORAGE_KEY);
  if (!raw) return defaultState;

  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
    };
  } catch {
    return defaultState;
  }
}

export function saveIntrusionState(state: IntrusionState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(INTRUSION_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to save intrusion state', err);
  }
}

export function checkIntrusionLockout(): {
  isLocked: boolean;
  remainingSeconds: number;
  failedAttempts: number;
  isBlacklisted: boolean;
} {
  const state = getIntrusionState();

  if (state.isBlacklisted) {
    return {
      isLocked: true,
      remainingSeconds: 24 * 60 * 60,
      failedAttempts: state.failedAttempts,
      isBlacklisted: true,
    };
  }

  if (state.lockoutUntil && state.lockoutUntil > Date.now()) {
    const remainingSeconds = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
    return {
      isLocked: true,
      remainingSeconds,
      failedAttempts: state.failedAttempts,
      isBlacklisted: false,
    };
  }

  return {
    isLocked: false,
    remainingSeconds: 0,
    failedAttempts: state.failedAttempts,
    isBlacklisted: false,
  };
}

export function clearIntrusionLockout(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(INTRUSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Records a failed SuperAdmin authentication attempt and calculates escalating cooldown:
 * - 1-2 attempts: Normal warning
 * - 3-4 attempts: 5-minute soft throttle
 * - 5-6 attempts: 30-minute hard lockout + triggers alert
 * - 7+ attempts: 24-hour device ban + triggers alert
 */
export function recordFailedAdminProbe(): {
  isLocked: boolean;
  remainingSeconds: number;
  failedAttempts: number;
  shouldAlertAdmin: boolean;
  isBlacklisted: boolean;
} {
  const state = getIntrusionState();
  state.failedAttempts += 1;
  state.lastAttemptAt = new Date().toISOString();

  let lockoutMinutes = 0;
  let shouldAlertAdmin = false;

  if (state.failedAttempts >= 7) {
    // Tier 3: 24-hour device blacklist
    lockoutMinutes = 24 * 60;
    state.isBlacklisted = true;
    shouldAlertAdmin = true;
  } else if (state.failedAttempts >= 5) {
    // Tier 2: 30-minute hard lockout
    lockoutMinutes = 30;
    shouldAlertAdmin = true;
  } else if (state.failedAttempts >= 3) {
    // Tier 1: 5-minute soft throttle
    lockoutMinutes = 5;
    shouldAlertAdmin = true;
  }

  if (lockoutMinutes > 0) {
    state.lockoutUntil = Date.now() + lockoutMinutes * 60 * 1000;
  }

  saveIntrusionState(state);

  const remainingSeconds = lockoutMinutes * 60;
  return {
    isLocked: lockoutMinutes > 0,
    remainingSeconds,
    failedAttempts: state.failedAttempts,
    shouldAlertAdmin,
    isBlacklisted: state.isBlacklisted,
  };
}

// -----------------------------------------------------------------------------
// 4. REAL-TIME SUPERADMIN INCIDENT ALERT DISPATCHING
// -----------------------------------------------------------------------------

/**
 * Dispatches an urgent security incident notification to all legitimate SuperAdmin accounts
 * including device model, estimated city/state location, and IP address.
 */
export async function dispatchIntrusionAlert(
  targetEmail: string,
  failedAttempts: number,
  customUa?: string
): Promise<ThreatTelemetrySnapshot> {
  const { deviceModel, platform, browser } = detectDeviceModel(customUa);
  const location = await resolveEstimatedLocation();

  const snapshot: ThreatTelemetrySnapshot = {
    deviceModel,
    platform,
    browser,
    ip: location.ip,
    city: location.city,
    region: location.region,
    country: location.country,
    isp: location.isp,
    timestamp: new Date().toISOString(),
  };

  try {
    const state = db.getState();
    const superAdmins = state.users.filter((u) => u.role === 'SUPER_ADMIN');

    const alertTitle =
      failedAttempts >= 5
        ? '🚨 CRITICAL: SuperAdmin Lockout Triggered'
        : '⚠️ Security Alert: Failed SuperAdmin Login Probe';

    const alertMessage = [
      `Unauthorized login attempts detected on: ${targetEmail}`,
      `Attempts: ${failedAttempts} failed tries (Device Lockout Active)`,
      `📱 Device: ${deviceModel} (${platform} / ${browser})`,
      `📍 Location: ${location.city}, ${location.region}, ${location.country}`,
      `🌐 Network: ${location.isp} (IP: ${location.ip})`,
    ].join('\n');

    // Deliver in-app notification to all SuperAdmin accounts
    superAdmins.forEach((admin) => {
      db.createNotification({
        userId: admin.id,
        type: 'SYSTEM_INFO',
        title: alertTitle,
        message: alertMessage,
        priority: 'HIGH',
        isRead: false,
        actionType: 'NONE',
      });

      // Record in Security Audit Logs
      db.logAdminAudit(
        admin.id,
        'SECURITY_INTRUSION_PROBE',
        'SECURITY',
        targetEmail,
        {
          targetEmail,
          failedAttempts,
          telemetry: snapshot,
        }
      );
    });

    console.warn('[Threat Defense] Dispatched intrusion incident alert:', snapshot);
  } catch (err) {
    console.error('[Threat Defense] Failed to dispatch incident alert:', err);
  }

  return snapshot;
}
