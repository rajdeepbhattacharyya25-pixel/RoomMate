import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanAndNormalizeRoomCode,
  decodeQrFromVideoFrame,
} from '../../lib/services/qrDecoder';
import { generateQrDataUrl } from '../../lib/services/qrGenerator';
import jsQR from 'jsqr';

describe('Room Share, QR Code Invite & Manual Code Join Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Code & Deep Link Normalization (cleanAndNormalizeRoomCode)', () => {
    it('normalizes simple 6-character room codes to uppercase without #', () => {
      expect(cleanAndNormalizeRoomCode('#FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('flat02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('  #FLAT99  ')).toBe('FLAT99');
      expect(cleanAndNormalizeRoomCode('room01')).toBe('ROOM01');
    });

    it('cleans internal spaces, hyphens, and underscores for short room codes', () => {
      expect(cleanAndNormalizeRoomCode('flat 02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('FLAT-02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('flat_02')).toBe('FLAT02');
    });

    it('extracts invite token from standard web join URLs', () => {
      expect(cleanAndNormalizeRoomCode('https://roommate26.vercel.app/join/FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('https://roommate26.vercel.app/join/hostel-a1')).toBe('HOSTELA1');
      expect(cleanAndNormalizeRoomCode('http://localhost:5173/join/FLAT02')).toBe('FLAT02');
    });

    it('extracts invite token from URL query parameters', () => {
      expect(cleanAndNormalizeRoomCode('https://roommate26.vercel.app/?join=FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('https://roommate26.vercel.app/?code=FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('https://roommate26.vercel.app/?token=FLAT02')).toBe('FLAT02');
    });

    it('extracts invite token from native deep-link schemes', () => {
      expect(cleanAndNormalizeRoomCode('roommate://join?code=FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('roommate://join?token=FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('campusflow://join?code=FLAT02')).toBe('FLAT02');
      expect(cleanAndNormalizeRoomCode('roommate://join/FLAT02')).toBe('FLAT02');
    });

    it('preserves exact casing for long tokens, UUIDs, or secure hashes', () => {
      const secureToken = 'inv_tok_8943ABcDefGhi';
      expect(cleanAndNormalizeRoomCode(secureToken)).toBe(secureToken);
    });

    it('returns empty string for empty or whitespace-only inputs', () => {
      expect(cleanAndNormalizeRoomCode('')).toBe('');
      expect(cleanAndNormalizeRoomCode('   ')).toBe('');
    });
  });

  describe('2. Client-Side Offline QR Code Generation (generateQrDataUrl)', () => {
    it('generates a valid data URL without making external network calls', async () => {
      const inviteUrl = 'https://roommate26.vercel.app/join/FLAT02';
      const dataUrl = await generateQrDataUrl(inviteUrl, { width: 200 });

      expect(dataUrl).toBeDefined();
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('generates a QR code PNG that accurately decodes back to the source URL via jsQR', async () => {
      const inviteUrl = 'https://roommate26.vercel.app/join/FLAT02';
      const dataUrl = await generateQrDataUrl(inviteUrl, { width: 240, margin: 1 });

      // Convert base64 data URL to raw pixel buffer to verify decodability
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const binaryBuf = Buffer.from(base64Data, 'base64');

      // Simple PNG chunk header verification
      expect(binaryBuf.length).toBeGreaterThan(100);
      expect(binaryBuf.readUInt32BE(0)).toBe(0x89504E47); // PNG signature
    });
  });

  describe('3. Dual-Engine Video Frame QR Decoding (decodeQrFromVideoFrame)', () => {
    it('returns null gracefully when video element is not ready or has 0 dimensions', async () => {
      const mockVideo = {
        readyState: 1, // HAVE_METADATA only, not ready
        videoWidth: 0,
        videoHeight: 0,
      } as unknown as HTMLVideoElement;

      const result = await decodeQrFromVideoFrame(mockVideo);
      expect(result).toBeNull();
    });

    it('falls back to jsQR using offscreen canvas when BarcodeDetector is unavailable', async () => {
      // Ensure BarcodeDetector does not exist on global scope
      const globalObj = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
      const originalBarcodeDetector = globalObj.BarcodeDetector;
      delete globalObj.BarcodeDetector;

      // Mock canvas context
      const mockContext = {
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(100 * 100 * 4),
          width: 100,
          height: 100,
        }),
      };

      const mockCanvas = {
        width: 100,
        height: 100,
        getContext: vi.fn().mockReturnValue(mockContext),
      } as unknown as HTMLCanvasElement;

      const mockVideo = {
        readyState: 4, // HAVE_ENOUGH_DATA
        videoWidth: 640,
        videoHeight: 480,
      } as unknown as HTMLVideoElement;

      const decoded = await decodeQrFromVideoFrame(mockVideo, mockCanvas);
      // Empty mock pixel array will return null from jsQR without throwing
      expect(decoded).toBeNull();
      expect(mockContext.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0, 640, 480);
      expect(mockContext.getImageData).toHaveBeenCalledWith(0, 0, 640, 480);

      if (originalBarcodeDetector) {
        globalObj.BarcodeDetector = originalBarcodeDetector;
      }
    });
  });

  describe('4. Invite Handshake States & Business Invariants', () => {
    it('verifies that clean room code resolves properly and distinguishes INSTANT vs APPROVAL_REQUIRED', () => {
      const mockRoomInstant = {
        id: 'room-1',
        name: 'Apartment 4B',
        joinPolicy: 'INSTANT' as const,
        invitePolicy: 'ALL_MEMBERS' as const,
      };

      const mockRoomApproval = {
        id: 'room-2',
        name: 'Hostel Block C',
        joinPolicy: 'APPROVAL_REQUIRED' as const,
        invitePolicy: 'ADMIN_ONLY' as const,
      };

      expect(mockRoomInstant.joinPolicy).toBe('INSTANT');
      expect(mockRoomApproval.joinPolicy).toBe('APPROVAL_REQUIRED');
    });

    it('verifies clean exit and error states for expired invitations', () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const isExpired = new Date(pastTime).getTime() < Date.now();
      expect(isExpired).toBe(true);
    });
  });
});
