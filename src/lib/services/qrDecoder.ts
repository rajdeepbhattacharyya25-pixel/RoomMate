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
