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
 * - Mobile browser -> 'mobile'
 * - Desktop browser -> 'desktop'
 */
export const getInitialDeviceMode = (): 'mobile' | 'desktop' => {
  if (typeof window === 'undefined') return 'mobile';

  // Explicit URL query override for previewing and download flows (e.g. ?action=download, ?download=apk, ?view=landing, ?view=desktop)
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view');
  const actionParam = params.get('action');
  const downloadParam = params.get('download');

  // If running inside Capacitor Android/iOS APK, ALWAYS mobile
  if (isNativeApp()) {
    return 'mobile';
  }

  // QR scan download triggers or landing view overrides should always display the landing page
  if (actionParam === 'download' || downloadParam === 'apk' || viewParam === 'landing' || viewParam === 'desktop') {
    return 'desktop';
  }
  if (viewParam === 'mobile') return 'mobile';

  // If on desktop screen width (>= 1024px) or on admin subdomain
  if (isAdminSubdomain() || window.innerWidth >= 1024) {
    return 'desktop';
  }

  return 'mobile';
};
