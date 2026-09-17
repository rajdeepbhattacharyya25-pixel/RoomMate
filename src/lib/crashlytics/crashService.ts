import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics, StackFrame } from '@capacitor-firebase/crashlytics';
import { BUILD_INFO } from '../../config/buildInfo';

export type DiagnosticErrorCategory =
  | 'VAULT_CRYPTO'
  | 'CLOUD_SYNC_CORRUPT'
  | 'AUTH_JWT_ANOMALY'
  | 'NATIVE_BRIDGE_FAILURE'
  | 'RENDER_BOUNDARY'
  | 'APP_LIFECYCLE';

/**
 * Regex patterns for redacting sensitive PII, credentials, and financial information.
 */
const SENSITIVE_PATTERNS = [
  // UPI IDs: e.g. student@okaxis, roomie@upi
  { regex: /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/gi, replacement: '[REDACTED_UPI]' },
  // Bearer tokens
  { regex: /Bearer\s+[A-Za-z0-9-_=.]+/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // JWT tokens (3 parts base64)
  { regex: /eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/g, replacement: '[REDACTED_JWT]' },
  // Indian phone numbers (10 digits starting with 6-9, optional +91/0 prefix)
  { regex: /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, replacement: '[REDACTED_PHONE]' },
  // Key-value pairs for passwords, pins, tokens, secrets
  {
    regex: /(password|passwd|pin|passcode|secret|api_key|token)\s*[:=]\s*([^\s,;]+)/gi,
    replacement: '$1: [REDACTED]',
  },
];

const FORBIDDEN_CONTEXT_KEYS = new Set([
  'password',
  'pin',
  'pinCode',
  'pincode',
  'passcode',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'jwt',
  'secret',
  'apiKey',
  'api_key',
  'upiId',
  'upi_id',
  'phone',
  'amount',
  'userNotes',
]);

/**
 * Redacts any sensitive financial, personal, or credential patterns from diagnostic text.
 */
export function sanitizeDiagnosticText(text: string): string {
  if (!text) return text;
  let sanitized = text;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}

/**
 * Sanitizes context metadata objects by stripping forbidden keys and scrubbing string values.
 */
export function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (FORBIDDEN_CONTEXT_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeDiagnosticText(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (value && typeof value === 'object') {
      sanitized[key] = '[OBJECT]';
    } else {
      sanitized[key] = String(value);
    }
  }

  return sanitized;
}

/**
 * Detects transient network offline drops that should NOT be reported as application crashes.
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('aborterror') ||
    msg.includes('the user aborted a request') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('load failed')
  );
}

class CrashService {
  private initialized = false;
  private isNative = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.isNative = Capacitor.isNativePlatform();

    if (!this.isNative) {
      console.log('[Crashlytics] Running in web/browser environment; Crashlytics telemetry is in fallback mode.');
      return;
    }

    try {
      // Enable Crashlytics collection
      await FirebaseCrashlytics.setEnabled({ enabled: true });

      // Set global diagnostic keys (strictly non-PII build/environment metadata)
      await FirebaseCrashlytics.setCustomKey({
        key: 'app_channel',
        value: BUILD_INFO.channel || 'staging',
        type: 'string',
      });
      await FirebaseCrashlytics.setCustomKey({
        key: 'app_version',
        value: BUILD_INFO.version || '1.0.4',
        type: 'string',
      });
      await FirebaseCrashlytics.setCustomKey({
        key: 'platform',
        value: Capacitor.getPlatform(),
        type: 'string',
      });

      // Listen to window unhandled errors and rejections
      if (typeof window !== 'undefined') {
        window.addEventListener('error', (event) => {
          this.recordError(event.error || event.message, {
            source: 'window.onerror',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          });
        });

        window.addEventListener('unhandledrejection', (event) => {
          this.recordError(event.reason || 'Unhandled Promise Rejection', {
            source: 'unhandledrejection',
          });
        });
      }

      console.log('[Crashlytics] Initialized native Crashlytics monitoring successfully.');
    } catch (err) {
      console.warn('[Crashlytics] Failed to initialize native Crashlytics:', err);
    }
  }

  /**
   * Associates a privacy-safe user identifier (internal UUID only).
   * Rejects any attempt to set email addresses, phone numbers, or plain names.
   */
  public async setUserId(userId: string | null): Promise<void> {
    if (!this.isNative) return;
    try {
      if (!userId) {
        await FirebaseCrashlytics.setUserId({ userId: '' });
        return;
      }

      // Security check: Must not look like an email or phone number
      if (userId.includes('@') || /^\+?\d{10,13}$/.test(userId.trim())) {
        console.warn('[Crashlytics Guard] Rejected PII user identifier (email or phone). Use internal UUID only.');
        await FirebaseCrashlytics.setUserId({ userId: '' });
        return;
      }

      await FirebaseCrashlytics.setUserId({ userId });
    } catch (err) {
      console.warn('[Crashlytics] setUserId error:', err);
    }
  }

  /**
   * Logs a sanitized diagnostic breadcrumb to Crashlytics.
   */
  public async logBreadcrumb(message: string): Promise<void> {
    if (!this.isNative) return;
    try {
      const sanitized = sanitizeDiagnosticText(message);
      await FirebaseCrashlytics.log({ message: sanitized });
    } catch {
      // Silent catch
    }
  }

  /**
   * Sets a sanitized custom key-value pair for diagnostic context.
   */
  public async setCustomKey(key: string, value: string | number | boolean): Promise<void> {
    if (!this.isNative) return;
    try {
      if (FORBIDDEN_CONTEXT_KEYS.has(key)) {
        console.warn(`[Crashlytics Guard] Disallowed setting sensitive custom key: "${key}"`);
        return;
      }

      const cleanValue = typeof value === 'string' ? sanitizeDiagnosticText(value) : value;
      const type = typeof cleanValue === 'boolean' ? 'boolean' : typeof cleanValue === 'number' ? 'double' : 'string';
      await FirebaseCrashlytics.setCustomKey({ key, value: cleanValue, type });
    } catch {
      // Silent catch
    }
  }

  /**
   * Records a categorized non-fatal diagnostic error.
   * Suppresses transient network offline errors so Crashlytics remains focused on true anomalies.
   */
  public async recordNonFatalError(
    category: DiagnosticErrorCategory,
    error: unknown,
    context?: Record<string, unknown>
  ): Promise<void> {
    if (isTransientNetworkError(error)) {
      // Do not pollute Crashlytics with standard offline / network disconnect drops
      return;
    }

    await this.setCustomKey('diagnostic_category', category);
    await this.recordError(error, { category, ...context });
  }

  /**
   * Records an exception with sanitized stack trace and context.
   */
  public async recordError(error: unknown, context?: Record<string, unknown>): Promise<void> {
    const errorObj = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const message = sanitizeDiagnosticText(errorObj.message || 'Unknown Error');
    const stack = errorObj.stack || '';

    const sanitizedContext = sanitizeContext(context);
    if (sanitizedContext) {
      const contextStr = Object.entries(sanitizedContext)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ');
      await this.logBreadcrumb(`Context: ${contextStr}`);
    }

    if (!this.isNative) {
      console.error('[Crashlytics Mock Log]', message, stack);
      return;
    }

    try {
      const stackFrames: StackFrame[] | undefined = stack
        ? stack
            .split('\n')
            .slice(1)
            .map((line) => {
              const trimmed = line.trim().replace(/^at\s+/, '');
              return {
                functionName: trimmed.split(' ')[0] || 'anonymous',
                fileName: trimmed,
              };
            })
        : undefined;

      await FirebaseCrashlytics.recordException({
        message,
        stacktrace: stackFrames,
      });
    } catch (err) {
      console.warn('[Crashlytics] Failed to record exception:', err);
    }
  }

  /**
   * Diagnostic test non-fatal error utility (for verifying reporting without terminating app)
   */
  public async testNonFatalError(): Promise<void> {
    await this.recordNonFatalError(
      'APP_LIFECYCLE',
      new Error('RoomMate Verified Diagnostic Non-Fatal Test'),
      { trigger: 'developer_settings_test' }
    );
  }

  /**
   * Diagnostic test crash utility (strictly for debug/verification builds)
   */
  public async testCrash(): Promise<void> {
    if (!this.isNative) {
      throw new Error('Test crash triggered in web browser fallback mode.');
    }
    await FirebaseCrashlytics.crash({ message: 'RoomMate Crashlytics Controlled Test Crash' });
  }
}

export const crashService = new CrashService();
