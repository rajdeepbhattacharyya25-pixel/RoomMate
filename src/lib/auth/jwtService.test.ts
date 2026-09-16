import { describe, it, expect } from 'vitest';
import {
  createResidentToken,
  verifyResidentToken,
  validateStrict4DigitPin,
  sanitizePinInput,
  evaluatePasswordStrength,
  generateHmacSha256Signature,
} from './jwtService';
import { User } from '../../types';

describe('Resident JWT Cryptography & Auth Test Suite', () => {
  const mockUser: User = {
    id: 'usr-test-123',
    name: 'Rajdeep',
    email: 'rajdeep@campusflow.in',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('creates and verifies a valid RFC-compliant JWT session token', () => {
    const token = createResidentToken(mockUser, { expiresInDays: 7, roomId: 'room-abc-999' });
    expect(token).toBeDefined();

    const parts = token.split('.');
    expect(parts.length).toBe(3);

    const result = verifyResidentToken(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe(mockUser.id);
    expect(result.payload?.email).toBe(mockUser.email);
    expect(result.payload?.roomId).toBe('room-abc-999');
    expect(result.payload?.role).toBe('RESIDENT');
  });

  it('detects and rejects cryptographically tampered payloads or signatures', () => {
    const validToken = createResidentToken(mockUser);
    const parts = validToken.split('.');

    // Tamper with payload (e.g. elevate user ID)
    const tamperedPayload = btoa(JSON.stringify({ ...mockUser, sub: 'usr-hacker-evil' }));
    const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const tamperResult = verifyResidentToken(forgedToken);
    expect(tamperResult.valid).toBe(false);
    expect(tamperResult.error).toContain('Cryptographic signature mismatch');
  });

  it('rejects expired tokens', () => {
    // Create token with negative expiration
    const expiredToken = createResidentToken(mockUser, { expiresInDays: -1 });
    const result = verifyResidentToken(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Token expired');
  });

  it('validates RFC 2104 HMAC-SHA256 deterministic signatures', () => {
    const data = 'header.payload';
    const secret = 'my-super-secure-key';

    const sig1 = generateHmacSha256Signature(data, secret);
    const sig2 = generateHmacSha256Signature(data, secret);
    expect(sig1).toBe(sig2);

    // Different secret must produce different signature
    const sig3 = generateHmacSha256Signature(data, 'different-key');
    expect(sig1).not.toBe(sig3);
  });
});

describe('Passcode & PIN Security Test Suite', () => {
  it('strictly validates 4-digit numeric PINs', () => {
    expect(validateStrict4DigitPin('1234').isValid).toBe(true);
    expect(validateStrict4DigitPin('0000').isValid).toBe(true);
    expect(validateStrict4DigitPin('9876').isValid).toBe(true);

    // Rejections
    expect(validateStrict4DigitPin('123').isValid).toBe(false);
    expect(validateStrict4DigitPin('12345').isValid).toBe(false);
    expect(validateStrict4DigitPin('abcd').isValid).toBe(false);
    expect(validateStrict4DigitPin('12a4').isValid).toBe(false);
    expect(validateStrict4DigitPin('   ').isValid).toBe(false);
  });

  it('sanitizes input and detects invalid characters', () => {
    const clean = sanitizePinInput('1234');
    expect(clean.value).toBe('1234');
    expect(clean.rejectedInvalidChars).toBe(false);

    const dirty = sanitizePinInput('12a4#');
    expect(dirty.value).toBe('124');
    expect(dirty.rejectedInvalidChars).toBe(true);

    const oversized = sanitizePinInput('1234567');
    expect(oversized.value).toBe('1234');
  });

  it('evaluates password strength accurately', () => {
    const weak = evaluatePasswordStrength('12345');
    expect(weak.score).toBe('weak');

    const medium = evaluatePasswordStrength('Password12');
    expect(medium.score).toBe('medium');

    const strong = evaluatePasswordStrength('RoomMate#2026!Vault');
    expect(strong.score).toBe('strong');
    expect(strong.percentage).toBe(100);
  });
});
