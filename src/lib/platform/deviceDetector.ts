import { Capacitor } from '@capacitor/core';

/**
 * Device & Environment Detection Engine
 * Segregates native Capacitor mobile packaging (Android APK / iOS)
 * from Desktop Web / Admin subdomains.
 */

export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isNativeApp()) return true;
  
  // Check touch and viewport width
  const isNarrowScreen = window.innerWidth < 768;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return isNarrowScreen && isTouchDevice;
};

export const isAdminSubdomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname.startsWith('admin.') || hostname.includes('-admin.');
};

/**
 * Returns initial display mode:
 * - Native Mobile App (Capacitor) -> strictly 'mobile'
 * - Web Browsers (both Mobile & Desktop) -> default to 'desktop' (Landing Page)
 *   so visitors can explore features and download the APK, or launch the web app.
 * - Explicit URL query overrides (e.g. ?action=download, ?download=apk, ?view=landing, ?view=desktop, ?view=mobile, ?view=app, ?join=, ?code=, ?token=, ?verified=)
 */
export const getInitialDeviceMode = (): 'mobile' | 'desktop' => {
  if (typeof window === 'undefined') return 'desktop';

  // If running inside Capacitor Android/iOS APK, ALWAYS mobile
  if (isNativeApp()) {
    return 'mobile';
  }

  // Explicit URL query overrides
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view');

  // Direct app entry queries: room invitations, auth verification callbacks, or explicit app view requests
  if (
    viewParam === 'mobile' ||
    viewParam === 'app' ||
    params.has('join') ||
    params.has('code') ||
    params.has('token') ||
    params.get('verified') === 'true'
  ) {
    return 'mobile';
  }

  // QR scan download triggers, landing view overrides, or standard web browser visits
  // Both mobile and desktop browsers show the full responsive landing page
  return 'desktop';
};

export * from '../utils/deviceDetector';

