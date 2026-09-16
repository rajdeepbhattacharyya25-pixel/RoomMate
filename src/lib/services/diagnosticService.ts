import { BUILD_INFO } from '../../config/buildInfo';
import { User, Room, BugReportDiagnostics } from '../../types';
import { isNativeApp } from '../platform/deviceDetector';

// Lightweight circular log buffer to capture recent warnings and errors
const recentLogsBuffer: string[] = [];
const MAX_LOG_ENTRIES = 8;

if (typeof window !== 'undefined') {
  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    try {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      recentLogsBuffer.push(`[ERROR ${new Date().toLocaleTimeString()}] ${msg.slice(0, 200)}`);
      if (recentLogsBuffer.length > MAX_LOG_ENTRIES) recentLogsBuffer.shift();
    } catch {
      // noop
    }
    origError.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    try {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      recentLogsBuffer.push(`[WARN ${new Date().toLocaleTimeString()}] ${msg.slice(0, 200)}`);
      if (recentLogsBuffer.length > MAX_LOG_ENTRIES) recentLogsBuffer.shift();
    } catch {
      // noop
    }
    origWarn.apply(console, args);
  };
}

/**
 * Returns the configured admin email for bug and problem reports.
 * Can be customized by setting VITE_ADMIN_SUPPORT_EMAIL in .env or localStorage.
 */
export function getAdminSupportEmail(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('roommate_admin_support_email');
    if (custom?.trim()) return custom.trim();
  }
  return (
    (import.meta.env.VITE_ADMIN_SUPPORT_EMAIL as string | undefined)?.trim() ||
    'support@roommate.app'
  );
}

/**
 * Set a custom admin email destination (saved in localStorage).
 */
export function setAdminSupportEmail(email: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('roommate_admin_support_email', email.trim());
  }
}

/**
 * Capture a comprehensive diagnostic snapshot of the application state.
 */
export function captureDiagnosticReport(
  _currentUser?: User | null,
  activeRoom?: Room | null,
  currentRoute: string = 'dashboard'
): BugReportDiagnostics {
  const isOnline =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;
  const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : 'Unknown';

  let platformName = 'Web Browser';
  if (isNativeApp()) {
    platformName = /Android/i.test(ua)
      ? 'Android Native APK'
      : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS Native App'
      : 'Capacitor Native';
  } else if (/Android/i.test(ua)) {
    platformName = 'Android Mobile Web';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platformName = 'iOS Mobile Web';
  }

  const viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 844,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };

  return {
    route: currentRoute,
    appVersion: `v${BUILD_INFO.version} (Build ${BUILD_INFO.buildNumber} - ${BUILD_INFO.channel})`,
    platform: platformName,
    networkOnline: isOnline,
    viewport,
    userAgent: ua,
    roomId: activeRoom?.id,
    roomName: activeRoom?.name,
    recentLogs: [...recentLogsBuffer],
    timestamp: new Date().toISOString(),
    osVersion: ua.split(')')[0]?.split('(')[1] || ua,
    networkStatus: isOnline ? 'Online' : 'Offline',
    screenResolution: `${viewport.width}x${viewport.height}`,
  };
}

/**
 * Generate a pre-filled mailto URL for direct email dispatch.
 */
export function generateBugReportMailtoUrl(params: {
  category: string;
  severity: string;
  description: string;
  currentUser: User;
  diagnostics: BugReportDiagnostics;
}): string {
  const adminEmail = getAdminSupportEmail();
  const subject = encodeURIComponent(`[RoomMate Issue] ${params.category} (${params.severity}) - ${params.currentUser.name}`);

  const bodyText = [
    `Hi RoomMate Support Team,`,
    ``,
    `I would like to report an issue:`,
    `----------------------------------------`,
    `Category: ${params.category}`,
    `Severity: ${params.severity}`,
    `Resident: ${params.currentUser.name} (${params.currentUser.email || 'No email'}) [ID: ${params.currentUser.id}]`,
    ``,
    `Description:`,
    params.description,
    ``,
    `----------------------------------------`,
    `Automatic Diagnostics Telemetry:`,
    `App Version: ${params.diagnostics.appVersion}`,
    `Active Screen: ${params.diagnostics.route}`,
    `Active Room: ${params.diagnostics.roomName || 'None'} (${params.diagnostics.roomId || 'N/A'})`,
    `Platform: ${params.diagnostics.platform}`,
    `Network Status: ${params.diagnostics.networkOnline ? 'Online' : 'Offline'}`,
    `Viewport: ${params.diagnostics.viewport.width}x${params.diagnostics.viewport.height} @ ${params.diagnostics.viewport.pixelRatio}x`,
    `Timestamp: ${params.diagnostics.timestamp}`,
    ``,
    params.diagnostics.recentLogs && params.diagnostics.recentLogs.length > 0
      ? `Recent Logs:\n${params.diagnostics.recentLogs.join('\n')}\n`
      : '',
  ].join('\n');

  return `mailto:${adminEmail}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
}
