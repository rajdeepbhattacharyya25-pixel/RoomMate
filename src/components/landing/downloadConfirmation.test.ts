import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { getInitialDeviceMode } from '../../lib/platform/deviceDetector';
import { isIOSDevice, isAndroidDevice, getDeviceInfo } from '../../lib/utils/deviceDetector';
import { DownloadConfirmationModal } from './DownloadConfirmationModal';

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

  describe('Device Classifier: iOS vs Android', () => {
    it('accurately identifies iPhone user agents as iOS', () => {
      const iphoneUA =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      expect(isIOSDevice(iphoneUA)).toBe(true);
      expect(isAndroidDevice(iphoneUA)).toBe(false);

      const info = getDeviceInfo(iphoneUA);
      expect(info.isIOS).toBe(true);
      expect(info.isAndroid).toBe(false);
      expect(info.platformName).toBe('iOS');
    });

    it('accurately identifies iPadOS desktop emulation with touch points', () => {
      const ipadDesktopUA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
      expect(isIOSDevice(ipadDesktopUA, 'MacIntel', 5)).toBe(true);
    });

    it('accurately identifies Android user agents as Android', () => {
      const androidUA =
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';
      expect(isIOSDevice(androidUA)).toBe(false);
      expect(isAndroidDevice(androidUA)).toBe(true);

      const info = getDeviceInfo(androidUA);
      expect(info.isIOS).toBe(false);
      expect(info.isAndroid).toBe(true);
      expect(info.platformName).toBe('Android');
    });
  });

  describe('DownloadConfirmationModal Device Adaptation', () => {
    it('renders iOS specific view with PWA guidance when isIOSTestOverride is true', () => {
      const html = renderToString(
        React.createElement(DownloadConfirmationModal, {
          isOpen: true,
          onClose: () => {},
          onDownload: () => {},
          onOpenGuide: () => {},
          onOpenWebApp: () => {},
          isIOSTestOverride: true,
        })
      );

      // Verify iOS specific headings and guidance
      expect(html).toContain('RoomMate for iOS');
      expect(html).toContain('Instant Web App • No App Store Installation Needed');
      expect(html).toContain('You are on an Apple iOS device');
      expect(html).toContain('Android APK packages cannot be installed on iPhone or iPad');
      expect(html).toContain('Launch RoomMate Web App');
      expect(html).toContain('Add to iPhone Home Screen');
      expect(html).toContain('Add to Home Screen');
      expect(html).toContain('Runs full-screen with offline support and a dedicated app icon');

      // Verify Android countdown text is NOT present
      expect(html).not.toContain('Starting automatically in...');
      expect(html).not.toContain('Download RoomMate Android App');
    });

    it('renders Android APK download modal with countdown when isIOSTestOverride is false', () => {
      const html = renderToString(
        React.createElement(DownloadConfirmationModal, {
          isOpen: true,
          onClose: () => {},
          onDownload: () => {},
          onOpenGuide: () => {},
          onOpenWebApp: () => {},
          isIOSTestOverride: false,
        })
      );

      // Verify Android APK elements
      expect(html).toContain('Download RoomMate Android App');
      expect(html).toContain('v1.0.4 • Build 10');
      expect(html).toContain('8.12 MB (Android APK)');
      expect(html).toContain('100% Virus-Free &amp; Safe');
      expect(html).toContain('Starting automatically in...');
      expect(html).toContain('How to install APK on Android (Guide)');

      // Verify iOS PWA elements are NOT present
      expect(html).not.toContain('RoomMate for iOS');
      expect(html).not.toContain('Add to iPhone Home Screen');
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
