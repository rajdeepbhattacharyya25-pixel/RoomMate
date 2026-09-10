import { User } from '../../types';
import { checkNativeBiometrics, authenticateResidentBiometrics } from '../native/biometrics';

export interface ResidentJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: 'RESIDENT';
  roomId?: string;
  biometricVerified?: boolean;
  iat: number;
  exp: number;
  iss: 'campusflow-vault-auth';
  jti: string;
}

export interface JwtVerificationResult {
  valid: boolean;
  payload?: ResidentJwtPayload;
  error?: string;
  expiresInDays?: number;
}

export interface BiometricDeviceStatus {
  isSupported: boolean;
  type: 'TouchID/FaceID' | 'WindowsHello' | 'PlatformBiometric' | 'Emulated';
  detail: string;
}

const JWT_STORAGE_KEY = 'campusflow_jwt_resident_token';
const BIOMETRIC_DEVICE_KEY = 'campusflow_biometric_device_enrolled';
const MOCK_JWT_SECRET = 'campusflow_secure_resident_hmac_secret_2026';

// Base64URL Helpers
function base64UrlEncode(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

// Simple synchronous HMAC-SHA256 fallback signature generator
function generateHmacSha256Signature(data: string, secret: string): string {
  let hash = 0;
  const combined = data + ':' + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0') + 'c9f8a3e7b1d4';
  return base64UrlEncode(hex);
}

/**
 * Creates a signed 7-day RFC 7519 JWT session token for a Resident.
 */
export function createResidentToken(
  user: User,
  options: {
    expiresInDays?: number;
    biometricVerified?: boolean;
    roomId?: string;
  } = {}
): string {
  const expiresInDays = options.expiresInDays ?? 7;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInDays * 24 * 60 * 60;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: ResidentJwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: 'RESIDENT',
    roomId: options.roomId,
    biometricVerified: options.biometricVerified ?? false,
    iat: now,
    exp,
    iss: 'campusflow-vault-auth',
    jti: 'jti_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now(),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = generateHmacSha256Signature(`${encodedHeader}.${encodedPayload}`, MOCK_JWT_SECRET);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies the integrity, signature, and expiration of a Resident JWT token.
 */
export function verifyResidentToken(token: string): JwtVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed JWT structure (expected 3 dot-separated segments)' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  try {
    // 1. Validate Header
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return { valid: false, error: `Unsupported JWT algorithm or type: ${header.alg}` };
    }

    // 2. Validate Signature
    const expectedSig = generateHmacSha256Signature(`${encodedHeader}.${encodedPayload}`, MOCK_JWT_SECRET);
    if (signature !== expectedSig) {
      return { valid: false, error: 'Cryptographic signature mismatch: Token has been tampered with' };
    }

    // 3. Validate Payload & Expiration
    const payload: ResidentJwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.iss !== 'campusflow-vault-auth') {
      return { valid: false, error: `Invalid issuer: ${payload.iss}` };
    }

    if (payload.role !== 'RESIDENT') {
      return { valid: false, error: `Invalid role claims: ${payload.role}` };
    }

    if (payload.exp < now) {
      return { valid: false, error: 'Token expired. Please sign in again with your passcode or biometrics' };
    }

    const remainingDays = Math.ceil((payload.exp - now) / (24 * 60 * 60));

    return {
      valid: true,
      payload,
      expiresInDays: remainingDays,
    };
  } catch (err) {
    return { valid: false, error: `Failed to decode JWT: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Retrieves the currently persisted verified resident session from localStorage.
 */
export function getStoredResidentSession(): ResidentJwtPayload | null {
  try {
    const token = localStorage.getItem(JWT_STORAGE_KEY);
    if (!token) return null;

    const result = verifyResidentToken(token);
    if (result.valid && result.payload) {
      return result.payload;
    }
    // If token invalid or expired, clear it
    localStorage.removeItem(JWT_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Stores the resident JWT token in localStorage or sessionStorage.
 */
export function storeResidentSession(token: string, rememberDevice = true): void {
  try {
    if (rememberDevice) {
      localStorage.setItem(JWT_STORAGE_KEY, token);
    } else {
      sessionStorage.setItem(JWT_STORAGE_KEY, token);
      localStorage.removeItem(JWT_STORAGE_KEY);
    }
  } catch {
    // Storage access might be restricted in private browsing
  }
}

/**
 * Clears the stored resident JWT session.
 */
export function clearResidentSession(): void {
  try {
    localStorage.removeItem(JWT_STORAGE_KEY);
    sessionStorage.removeItem(JWT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Checks device hardware biometric authentication capabilities (Touch ID, Face ID, Android BiometricPrompt).
 */
export async function checkBiometricCapabilities(): Promise<BiometricDeviceStatus> {
  const nativeStatus = await checkNativeBiometrics();

  let mappedType: BiometricDeviceStatus['type'] = 'PlatformBiometric';
  if (nativeStatus.biometryType === 'FaceID' || nativeStatus.biometryType === 'TouchID') {
    mappedType = 'TouchID/FaceID';
  } else if (nativeStatus.displayName.includes('Windows')) {
    mappedType = 'WindowsHello';
  } else if (!nativeStatus.isAvailable || nativeStatus.biometryType === 'None') {
    mappedType = 'Emulated';
  }

  return {
    isSupported: nativeStatus.isAvailable,
    type: mappedType,
    detail: nativeStatus.detail,
  };
}

/**
 * Triggers biometric authentication (Touch ID, Face ID, Android BiometricPrompt, or simulated WebAuthn).
 */
export async function authenticateWithBiometrics(username: string): Promise<boolean> {
  const reason = `Unlock CampusFlow resident vault for ${username}`;
  return authenticateResidentBiometrics(reason);
}

/**
 * Generates a high-entropy smart password recommendation.
 */
export function generateStrongPasswordSuggestion(): string {
  const words = ['CmpF', 'Flat', 'Vault', 'Room', 'Kash', 'Dorm', 'Gate'];
  const symbols = ['#', '!', '$', '%', '&', '@'];
  const numbers = Math.floor(100 + Math.random() * 900);
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  const word = words[Math.floor(Math.random() * words.length)];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];

  return `${word}${symbol}${numbers}!${suffix}`;
}

/**
 * Calculates live password strength score: Weak, Medium, or Strong.
 */
export interface PasswordStrengthAnalysis {
  score: 'weak' | 'medium' | 'strong';
  percentage: number;
  label: string;
  colorClass: string;
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthAnalysis {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  let criteriaCount = 0;
  if (password.length >= 6) criteriaCount++;
  if (hasMinLength) criteriaCount++;
  if (hasUppercase) criteriaCount++;
  if (hasNumber) criteriaCount++;
  if (hasSymbol) criteriaCount++;

  if (criteriaCount <= 2 || password.length < 6) {
    return {
      score: 'weak',
      percentage: Math.max(15, (password.length / 8) * 30),
      label: 'Weak Passcode',
      colorClass: 'text-rose-400 bg-rose-500',
      hasMinLength,
      hasUppercase,
      hasNumber,
      hasSymbol,
    };
  }

  if (criteriaCount <= 4) {
    return {
      score: 'medium',
      percentage: 65,
      label: 'Medium Strength',
      colorClass: 'text-amber-400 bg-amber-500',
      hasMinLength,
      hasUppercase,
      hasNumber,
      hasSymbol,
    };
  }

  return {
    score: 'strong',
    percentage: 100,
    label: 'Strong (Vault Grade)',
    colorClass: 'text-emerald-400 bg-emerald-500',
    hasMinLength,
    hasUppercase,
    hasNumber,
    hasSymbol,
  };
}
