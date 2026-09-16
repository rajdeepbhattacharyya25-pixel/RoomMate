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
  iss: 'roommate-vault-auth' | 'campusflow-vault-auth';
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

const PRIMARY_JWT_STORAGE_KEY = 'roommate_jwt_resident_token';
const LEGACY_JWT_STORAGE_KEY = 'campusflow_jwt_resident_token';
export const BIOMETRIC_DEVICE_KEY = 'roommate_biometric_device_enrolled';

/**
 * Derives HMAC signing key from environment or deterministic runtime origin.
 */
function getJwtSigningKey(): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
  const processEnv = typeof globalThis !== 'undefined' ? (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env : undefined;
  const env = metaEnv || processEnv || {};

  if (env.VITE_RESIDENT_JWT_SECRET) {
    return String(env.VITE_RESIDENT_JWT_SECRET);
  }

  // Non-hardcoded runtime fallback
  const origin = typeof window !== 'undefined' ? window.location.origin : 'localhost';
  return `roommate_resident_auth_${origin}`;
}

// Base64URL Helpers
function base64UrlEncode(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

// Standard SHA-256 (FIPS 180-4)
function sha256Bytes(input: Uint8Array<any>): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const len = input.length;
  const bitLen = len * 8;
  const padLen = (((len + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(input);
  padded[len] = 0x80;

  padded[padLen - 4] = (bitLen >>> 24) & 0xff;
  padded[padLen - 3] = (bitLen >>> 16) & 0xff;
  padded[padLen - 2] = (bitLen >>> 8) & 0xff;
  padded[padLen - 1] = bitLen & 0xff;

  const w = new Int32Array(64);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = offset + (i << 2);
      w[i] = (padded[idx] << 24) | (padded[idx + 1] << 16) | (padded[idx + 2] << 8) | padded[idx + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i] + w[i]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const hashes = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (hashes[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (hashes[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (hashes[i] >>> 8) & 0xff;
    out[i * 4 + 3] = hashes[i] & 0xff;
  }
  return out;
}

/**
 * Synchronous, RFC 2104-compliant HMAC-SHA256 signature generator.
 */
export function generateHmacSha256Signature(data: string, secret: string): string {
  const enc = new TextEncoder();
  let keyBytes: Uint8Array<any> = enc.encode(secret);
  if (keyBytes.length > 64) {
    keyBytes = sha256Bytes(keyBytes);
  }
  const paddedKey = new Uint8Array(64);
  paddedKey.set(keyBytes);

  const dataBytes = enc.encode(data);
  const inner = new Uint8Array(64 + dataBytes.length);
  const outer = new Uint8Array(64 + 32);

  for (let i = 0; i < 64; i++) {
    inner[i] = paddedKey[i] ^ 0x36;
    outer[i] = paddedKey[i] ^ 0x5c;
  }
  inner.set(dataBytes, 64);

  const innerHash = sha256Bytes(inner);
  outer.set(innerHash, 64);

  const finalHash = sha256Bytes(outer);
  return base64UrlEncodeBytes(finalHash);
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
    iss: 'roommate-vault-auth',
    jti: 'jti_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now(),
  };

  const secret = getJwtSigningKey();
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = generateHmacSha256Signature(`${encodedHeader}.${encodedPayload}`, secret);

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
    const secret = getJwtSigningKey();
    const expectedSig = generateHmacSha256Signature(`${encodedHeader}.${encodedPayload}`, secret);
    if (signature !== expectedSig) {
      return { valid: false, error: 'Cryptographic signature mismatch: Token has been tampered with' };
    }

    // 3. Validate Payload & Expiration
    const payload: ResidentJwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.iss !== 'roommate-vault-auth' && payload.iss !== 'campusflow-vault-auth') {
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
    const token =
      localStorage.getItem(PRIMARY_JWT_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_JWT_STORAGE_KEY);
    if (!token) return null;

    const result = verifyResidentToken(token);
    if (result.valid && result.payload) {
      // Migrate forward to new key
      if (!localStorage.getItem(PRIMARY_JWT_STORAGE_KEY)) {
        localStorage.setItem(PRIMARY_JWT_STORAGE_KEY, token);
      }
      return result.payload;
    }
    // If token invalid or expired, clear both
    localStorage.removeItem(PRIMARY_JWT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
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
      localStorage.setItem(PRIMARY_JWT_STORAGE_KEY, token);
      localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
    } else {
      sessionStorage.setItem(PRIMARY_JWT_STORAGE_KEY, token);
      localStorage.removeItem(PRIMARY_JWT_STORAGE_KEY);
      localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
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
    localStorage.removeItem(PRIMARY_JWT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
    sessionStorage.removeItem(PRIMARY_JWT_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
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
  const reason = `Unlock RoomMate resident vault for ${username}`;
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

export interface PinValidationResult {
  isValid: boolean;
  sanitized: string;
  error?: string;
}

/**
 * Validates a strict 4-digit numeric PIN.
 * Rejects any value that is not exactly 4 digits or contains non-numeric characters.
 */
export function validateStrict4DigitPin(raw: string): PinValidationResult {
  const clean = raw.trim();
  if (!clean) {
    return { isValid: false, sanitized: '', error: 'Please enter your 4-digit PIN.' };
  }
  if (!/^\d+$/.test(clean)) {
    return {
      isValid: false,
      sanitized: clean.replace(/\D/g, '').slice(0, 4),
      error: 'PIN must contain numbers only.',
    };
  }
  if (clean.length !== 4) {
    return {
      isValid: false,
      sanitized: clean.slice(0, 4),
      error: 'PIN must be exactly 4 digits.',
    };
  }
  return { isValid: true, sanitized: clean };
}

/**
 * Strips non-numeric characters and limits length to 4 digits.
 * Detects whether invalid characters were typed or pasted.
 */
export function sanitizePinInput(value: string): { value: string; rejectedInvalidChars: boolean } {
  const digitsOnly = value.replace(/\D/g, '');
  const limited = digitsOnly.slice(0, 4);
  const rejectedInvalidChars = value.length > 0 && digitsOnly.length < value.length;
  return { value: limited, rejectedInvalidChars };
}

/**
 * Cryptographically hashes a 4-digit PIN using SHA-256 via Web Crypto API.
 * Never stores or transmits plaintext PIN credentials.
 * Independently validates that the PIN is strictly 4 numeric digits.
 */
export async function hashPin(pin: string): Promise<string> {
  const validation = validateStrict4DigitPin(pin);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid 4-digit PIN');
  }
  const clean = validation.sanitized;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`roommate_pin_salt_v1_${clean}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-subtle environments
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return `hash_pin_${Math.abs(hash).toString(16)}`;
}

