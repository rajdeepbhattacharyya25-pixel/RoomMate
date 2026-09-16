import { describe, it, expect } from 'vitest';
import { extractUpiIdFromQrPayload, validateUpiId } from './upiExtraction';

describe('UPI Extraction & Validation Engine', () => {
  describe('extractUpiIdFromQrPayload', () => {
    it('extracts standard UPI ID from valid UPI payment URI', () => {
      const payload = 'upi://pay?pa=test@upi&pn=Test%20User&am=500';
      const result = extractUpiIdFromQrPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.upiId).toBe('test@upi');
      expect(result?.payeeName).toBe('Test User');
      expect(result?.amount).toBe(500);
    });

    it('correctly decodes percent-encoded UPI IDs', () => {
      const payload = 'upi://pay?pa=test%40okaxis&pn=Rahul';
      const result = extractUpiIdFromQrPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.upiId).toBe('test@okaxis');
      expect(result?.payeeName).toBe('Rahul');
    });

    it('handles uppercase and mixed-case schemes and parameters', () => {
      const payload = 'UPI://PAY?PA=RAHUL@OKAXIS&PN=Rahul';
      const result = extractUpiIdFromQrPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.upiId).toBe('rahul@okaxis');
    });

    it('extracts UPI ID when parameters appear in any order', () => {
      const payload = 'upi://pay?pn=Sneha&cu=INR&pa=sneha.patel@okhdfcbank&am=250.50&tn=Room_Rent';
      const result = extractUpiIdFromQrPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.upiId).toBe('sneha.patel@okhdfcbank');
      expect(result?.payeeName).toBe('Sneha');
      expect(result?.amount).toBe(250.5);
      expect(result?.note).toBe('Room Rent');
    });

    it('returns null for non-UPI URLs or arbitrary text', () => {
      expect(extractUpiIdFromQrPayload('https://example.com/payment')).toBeNull();
      expect(extractUpiIdFromQrPayload('WIFI:S:MyWifi;T:WPA;P:password;;')).toBeNull();
      expect(extractUpiIdFromQrPayload('just some random barcode text')).toBeNull();
      expect(extractUpiIdFromQrPayload('user@okaxis')).toBeNull(); // Standalone text is not a UPI QR payload
      expect(extractUpiIdFromQrPayload('')).toBeNull();
    });

    it('returns null when upi://pay URI lacks pa parameter', () => {
      expect(extractUpiIdFromQrPayload('upi://pay?pn=StoreName&am=100')).toBeNull();
      expect(extractUpiIdFromQrPayload('upi://pay?pa=')).toBeNull();
    });

    it('returns null when pa parameter is malformed', () => {
      expect(extractUpiIdFromQrPayload('upi://pay?pa=noatsign')).toBeNull();
      expect(extractUpiIdFromQrPayload('upi://pay?pa=@missingusername')).toBeNull();
      expect(extractUpiIdFromQrPayload('upi://pay?pa=missinghandle@')).toBeNull();
      expect(extractUpiIdFromQrPayload('upi://pay?pa=two@@handles')).toBeNull();
    });
  });

  describe('validateUpiId', () => {
    it('validates correct UPI VPA formats', () => {
      expect(validateUpiId('rahul@okaxis').isValid).toBe(true);
      expect(validateUpiId('9876543210@paytm').isValid).toBe(true);
      expect(validateUpiId('user.name-123_4@okhdfcbank').isValid).toBe(true);
      expect(validateUpiId('RAHUL@OKAXIS').normalized).toBe('rahul@okaxis');
    });

    it('rejects invalid UPI VPA formats', () => {
      expect(validateUpiId('').isValid).toBe(false);
      expect(validateUpiId('   ').isValid).toBe(false);
      expect(validateUpiId('plainstring').isValid).toBe(false);
      expect(validateUpiId('@handle').isValid).toBe(false);
      expect(validateUpiId('username@').isValid).toBe(false);
      expect(validateUpiId('user@bank@extra').isValid).toBe(false);
      expect(validateUpiId('user name@okaxis').isValid).toBe(false);
    });
  });
});
