import jsQR from 'jsqr';

export interface QrDecodeResult {
  success: boolean;
  rawPayload?: string;
  error?: 'NO_QR_DETECTED' | 'UNREADABLE_QR' | 'IMAGE_LOAD_FAILED';
  errorMessage?: string;
}

/**
 * Loads a File or Blob into an HTMLImageElement.
 */
function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image data.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Decodes a QR code from an uploaded image file locally on-device.
 *
 * Strategy:
 * 1. Tries native BarcodeDetector API (fast, hardware-accelerated on Chromium/Android).
 * 2. If unavailable or undetected, draws image to an offscreen canvas and runs jsQR with both regular and inverted contrast attempts.
 * 3. Handles downscaling for high-resolution camera photos (max 1600px dimension) to ensure fast processing and low memory overhead.
 */
export async function decodeQrFromImage(file: File | Blob): Promise<QrDecodeResult> {
  let img: HTMLImageElement;
  try {
    img = await loadImageFromFile(file);
  } catch {
    return {
      success: false,
      error: 'IMAGE_LOAD_FAILED',
      errorMessage: "Unable to read the selected file. Please select a valid image file.",
    };
  }

  // 1. Try native Web API BarcodeDetector if supported
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(img);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return {
          success: true,
          rawPayload: barcodes[0].rawValue,
        };
      }
    } catch {
      // Native detector failed or format unsupported; proceed to jsQR fallback
    }
  }

  // 2. Offscreen Canvas + jsQR Engine
  try {
    const canvas = document.createElement('canvas');
    const MAX_DIM = 1600;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width === 0 || height === 0) {
      return {
        success: false,
        error: 'UNREADABLE_QR',
        errorMessage: "We couldn't read this QR code. Please upload a clearer image.",
      };
    }

    // Proportional downscale if image is exceptionally large (e.g. 12MP+ camera screenshot)
    if (width > MAX_DIM || height > MAX_DIM) {
      if (width > height) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        success: false,
        error: 'UNREADABLE_QR',
        errorMessage: "Failed to initialize image canvas for QR reading.",
      };
    }

    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // Run jsQR with inversionAttempts='attemptBoth' to support dark-mode/colored QR codes
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data && code.data.trim()) {
      return {
        success: true,
        rawPayload: code.data.trim(),
      };
    }

    // If jsQR at scaled resolution found nothing, and we scaled down, try one more attempt at native resolution if reasonable
    if (width !== img.naturalWidth && img.naturalWidth <= 2400) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      const fullImageData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
      const fullCode = jsQR(fullImageData.data, fullImageData.width, fullImageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (fullCode && fullCode.data && fullCode.data.trim()) {
        return {
          success: true,
          rawPayload: fullCode.data.trim(),
        };
      }
    }

    return {
      success: false,
      error: 'NO_QR_DETECTED',
      errorMessage: "We couldn't detect a QR code in this image.",
    };
  } catch {
    return {
      success: false,
      error: 'UNREADABLE_QR',
      errorMessage: "We couldn't read this QR code. Please upload a clearer image.",
    };
  }
}

/**
 * Decodes a QR code directly from a video frame using dual engines:
 * 1. Native BarcodeDetector (fast, hardware accelerated on Chromium/Android when supported)
 * 2. Offscreen Canvas + jsQR fallback (pure JS, 100% cross-platform for iOS, Safari, Firefox, older WebViews)
 */
export async function decodeQrFromVideoFrame(
  video: HTMLVideoElement,
  offscreenCanvas?: HTMLCanvasElement | null
): Promise<string | null> {
  if (!video || video.readyState < 2) return null;

  // 1. Try native Web API BarcodeDetector if supported
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(video);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return barcodes[0].rawValue;
      }
    } catch {
      // Frame drop or unsupported, fall through to jsQR fallback
    }
  }

  // 2. Offscreen Canvas + jsQR Engine
  try {
    const canvas = offscreenCanvas || document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    if (width === 0 || height === 0) return null;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data && code.data.trim()) {
      return code.data.trim();
    }
  } catch {
    // Frame drop, continue
  }

  return null;
}

/**
 * Normalizes and extracts room token or 6-digit code from any user input:
 * - Direct codes: '#FLAT02', 'flat02', 'flat-02', 'FLAT 02' -> 'FLAT02'
 * - Web join links: 'https://roommate26.vercel.app/join/FLAT02' -> 'FLAT02'
 * - Query strings: 'https://roommate26.vercel.app/?join=FLAT02' -> 'FLAT02'
 * - Custom schemes: 'roommate://join?code=FLAT02' -> 'FLAT02'
 * - Long tokens/UUIDs: preserves exact casing if > 10 chars
 */
export function cleanAndNormalizeRoomCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  let candidate = trimmed;

  // 1. Check HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      const joinIdx = segments.indexOf('join');
      if (joinIdx >= 0 && segments[joinIdx + 1]) {
        candidate = decodeURIComponent(segments[joinIdx + 1]);
      } else {
        const param = url.searchParams.get('token') || url.searchParams.get('join') || url.searchParams.get('code');
        if (param) candidate = decodeURIComponent(param);
      }
    } catch {
      // parse fallback
    }
  } else if (trimmed.startsWith('roommate://') || trimmed.startsWith('campusflow://')) {
    try {
      const url = new URL(trimmed);
      const param = url.searchParams.get('token') || url.searchParams.get('join') || url.searchParams.get('code');
      if (param) {
        candidate = decodeURIComponent(param);
      } else {
        const fullPath = (url.host + '/' + url.pathname).replace(/^\/+/, '');
        const segments = fullPath.split('/').filter(Boolean);
        const joinIdx = segments.indexOf('join');
        if (joinIdx >= 0 && segments[joinIdx + 1]) {
          candidate = decodeURIComponent(segments[joinIdx + 1]);
        }
      }
    } catch {
      // fallback
    }
  }

  // Remove leading '#' or symbols
  candidate = candidate.replace(/^#+/, '').trim();

  // If candidate is a standard room invite code (typically <= 10 alphanumeric characters without dots/slashes)
  // Clean whitespace and dashes, and convert to uppercase
  if (!candidate.includes('/') && !candidate.includes('.') && candidate.length <= 10) {
    return candidate.replace(/[\s\-_]+/g, '').toUpperCase();
  }

  return candidate;
}

