/**
 * imagePreprocessor.ts
 *
 * Client-side canvas preprocessing for receipt photos.
 * Downscales images to safe dimensions, applies grayscale conversion,
 * and enhances contrast for faded thermal inks before passing to OCR.
 *
 * ZERO-RETENTION: Processed strictly in-memory and revoked after usage.
 */

export interface PreprocessResult {
  processedBlob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PreprocessOptions {
  maxDimension?: number;
  contrast?: number; // 1.0 = normal, 1.3 = enhanced
  brightness?: number; // 0 = normal, 10 = slightly brighter
}

/**
 * Resizes, grayscales, and enhances contrast of an image blob for optimal OCR.
 */
export async function preprocessReceiptImage(
  imageSource: Blob | File | string,
  options: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const maxDim = options.maxDimension || 1600;
  const contrastFactor = options.contrast ?? 1.35;
  const brightnessOffset = options.brightness ?? 5;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Node.js environment fallback (for testing or SSR)
    const mockBlob = imageSource instanceof Blob ? imageSource : new Blob([]);
    return {
      processedBlob: mockBlob,
      dataUrl: typeof imageSource === 'string' ? imageSource : '',
      width: 800,
      height: 1200,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrlToRevoke: string | null = null;

    img.onload = () => {
      try {
        let { width, height } = img;

        // Downscale while preserving aspect ratio
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
          return reject(new Error('Failed to get 2D canvas rendering context'));
        }

        // Draw downscaled image
        ctx.drawImage(img, 0, 0, width, height);

        // Get pixel data for contrast enhancement and grayscaling
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Contrast formula: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
        // Simplified contrast scaling: newValue = factor * (value - 128) + 128 + brightness
        for (let i = 0; i < data.length; i += 4) {
          // Standard luminosity grayscaling: 0.299R + 0.587G + 0.114B
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

          // Contrast and brightness adjustment
          let enhanced = contrastFactor * (gray - 128) + 128 + brightnessOffset;
          enhanced = Math.min(255, Math.max(0, enhanced));

          data[i] = enhanced;     // R
          data[i + 1] = enhanced; // G
          data[i + 2] = enhanced; // B
          // data[i + 3] remains alpha
        }

        ctx.putImageData(imgData, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            if (!blob) {
              return reject(new Error('Canvas toBlob conversion failed'));
            }
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve({
              processedBlob: blob,
              dataUrl,
              width,
              height,
            });
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
      reject(new Error(`Failed to load image for preprocessing: ${err}`));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      objectUrlToRevoke = URL.createObjectURL(imageSource);
      img.src = objectUrlToRevoke;
    }
  });
}
