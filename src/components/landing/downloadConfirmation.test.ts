import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { getInitialDeviceMode } from '../../lib/platform/deviceDetector';

describe('Branded QR Code & Automated Download Confirmation Flow', () => {
  const originalWindow = (globalThis as any).window;

  const setMockWindow = (urlStr: string, innerWidth = 390) => {
    const parsed = new URL(urlStr);
    (globalThis as any).window = {
      location: {
        href: parsed.href,
        search: parsed.search,
        pathname: parsed.pathname,
        hostname: parsed.hostname,
      },
      innerWidth,
    };
  };

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('Device Detection & Routing Override', () => {
    it('returns "desktop" (landing page) when ?action=download is present even on mobile screen width', () => {
      setMockWindow('https://roommate26.vercel.app/?action=download', 390);

      const mode = getInitialDeviceMode();
      expect(mode).toBe('desktop');
    });

    it('returns "desktop" (landing page) when ?download=apk is present on mobile screen width', () => {
      setMockWindow('https://roommate26.vercel.app/?download=apk', 390);

      const mode = getInitialDeviceMode();
      expect(mode).toBe('desktop');
    });

    it('returns "desktop" (landing page) when ?view=landing is present', () => {
      setMockWindow('https://roommate26.vercel.app/?view=landing', 390);

      const mode = getInitialDeviceMode();
      expect(mode).toBe('desktop');
    });

    it('returns "mobile" for normal mobile visits without download triggers', () => {
      setMockWindow('https://roommate26.vercel.app/', 390);

      const mode = getInitialDeviceMode();
      expect(mode).toBe('mobile');
    });
  });

  describe('Branded QR Code PNG Verification', () => {
    it('generates a valid, scannable PNG that decodes to the download URL via jsQR', () => {
      const pngPath = path.resolve(process.cwd(), 'public/RoomMate-Scan-To-Download-QR.png');
      expect(fs.existsSync(pngPath)).toBe(true);

      const fileBuffer = fs.readFileSync(pngPath);
      const png = PNG.sync.read(fileBuffer);

      expect(png.width).toBe(1000);
      expect(png.height).toBe(1360);

      // Verify that jsQR can decode the QR code within the generated branded card
      const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      expect(decoded).not.toBeNull();
      expect(decoded?.data).toBe('https://roommate26.vercel.app/?action=download');
    });

    it('root copy of the QR PNG exists for direct local file access', () => {
      const rootPngPath = path.resolve(process.cwd(), 'RoomMate-Scan-To-Download-QR.png');
      expect(fs.existsSync(rootPngPath)).toBe(true);
      expect(fs.statSync(rootPngPath).size).toBeGreaterThan(10000);
    });
  });

  describe('Branded QR Code SVG Vector Verification', () => {
    it('contains all required branding, logo, typography, and release badges in SVG', () => {
      const svgPath = path.resolve(process.cwd(), 'public/RoomMate-Scan-To-Download-QR.svg');
      expect(fs.existsSync(svgPath)).toBe(true);

      const svgContent = fs.readFileSync(svgPath, 'utf8');

      // Verify essential visual branding elements
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('RoomMate');
      expect(svgContent).toContain('SCAN TO DOWNLOAD');
      expect(svgContent).toContain('Android APK');
      expect(svgContent).toContain('v1.0.4');
      expect(svgContent).toContain('Build 10');
      expect(svgContent).toContain('7.29 MB');
      expect(svgContent).toContain('data:image/png;base64,'); // Embedded official logo
      expect(svgContent).toContain('#0C6B70'); // Brand Teal color
    });

    it('root copy of the QR SVG exists for direct local vector access', () => {
      const rootSvgPath = path.resolve(process.cwd(), 'RoomMate-Scan-To-Download-QR.svg');
      expect(fs.existsSync(rootSvgPath)).toBe(true);
      expect(fs.statSync(rootSvgPath).size).toBeGreaterThan(50000);
    });
  });
});
