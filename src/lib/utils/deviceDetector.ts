/**
 * Device Detector Utility
 * Accurately detects iOS (iPhone, iPad, iPod), Android, and desktop environments.
 * Handles modern iPadOS Safari user agents that mimic macOS desktop Safari.
 */

export interface DeviceInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isSafari: boolean;
  platformName: 'iOS' | 'Android' | 'Desktop' | 'Other';
}

/**
 * Checks if the user is running on an iOS device (iPhone, iPad, or iPod).
 * Also accounts for iPads running iPadOS 13+ where Safari identifies as MacIntel with touch points.
 */
export function isIOSDevice(
  userAgent?: string,
  platform?: string,
  maxTouchPoints?: number
): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const plat = platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '');
  const touchPoints =
    maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);

  if (!ua && !plat) return false;

  // Direct iOS user agents (iPhone, iPod, iPad)
  const isDirectIOS = /iPhone|iPad|iPod/i.test(ua);

  // iPadOS on desktop Safari mode (identifies as MacIntel with multi-touch screen)
  const isIPadOSDesktop = plat === 'MacIntel' && touchPoints > 1;

  return isDirectIOS || isIPadOSDesktop;
}

/**
 * Checks if the user is running on an Android device.
 */
export function isAndroidDevice(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return false;
  return /Android/i.test(ua);
}

/**
 * Checks if the browser is Safari or Mobile Safari (excluding Chrome/Firefox iOS webviews).
 */
export function isSafariBrowser(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return false;
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  return isSafari;
}

/**
 * Returns comprehensive device information.
 */
export function getDeviceInfo(customUserAgent?: string): DeviceInfo {
  const isIOS = isIOSDevice(customUserAgent);
  const isAndroid = isAndroidDevice(customUserAgent);
  const isSafari = isSafariBrowser(customUserAgent);
  const isMobile = isIOS || isAndroid;
  const isDesktop = !isMobile;

  let platformName: DeviceInfo['platformName'] = 'Other';
  if (isIOS) platformName = 'iOS';
  else if (isAndroid) platformName = 'Android';
  else if (isDesktop) platformName = 'Desktop';

  return {
    isIOS,
    isAndroid,
    isMobile,
    isDesktop,
    isSafari,
    platformName,
  };
}
