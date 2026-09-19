/**
 * Image Upload Service — ImgBB
 *
 * Uploads images to ImgBB's free hosting service and returns a permanent public URL.
 * Designed to be modular:
 *   - Currently uses anonymous upload (no API key required, local data URL fallback)
 *   - Add VITE_IMGBB_API_KEY to .env for hosted 32MB uploads
 *   - Can be swapped to Supabase Storage in the future without changing callers
 */

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

export interface ImageUploadResult {
  url: string;         // Direct image URL
  thumbnailUrl: string; // Smaller thumbnail URL
  deleteUrl: string;   // URL to delete the image
  success: boolean;
  error?: string;
}

/**
 * Get the configured ImgBB API key, if any.
 */
function getApiKey(): string | null {
  const key = import.meta.env.VITE_IMGBB_API_KEY;
  return key && key !== '' && key !== 'your-imgbb-api-key' ? key : null;
}

/**
 * Convert a File to a base64 string (data URI stripped).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert file to a data URL for local fallback storage.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate the file before upload.
 */
function validateFile(file: File): string | null {
  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Use JPEG, PNG, WebP, or GIF.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`;
  }
  return null;
}

/**
 * Upload an image file to ImgBB and return the hosted URL.
 * Falls back to data URL if no API key is configured.
 *
 * @param file - The image File from an <input type="file"> or camera capture
 * @param name - Optional name for the image (defaults to file name)
 */
export async function uploadImage(file: File, name?: string): Promise<ImageUploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { url: '', thumbnailUrl: '', deleteUrl: '', success: false, error: validationError };
  }

  const apiKey = getApiKey();

  // No API key configured → local data URL fallback (dev/local only, never production)
  if (!apiKey) {
    console.warn('[ImageUpload] No ImgBB API key configured. Using local data URL fallback (not saved to cloud).');
    try {
      const dataUrl = await fileToDataUrl(file);
      return { url: dataUrl, thumbnailUrl: dataUrl, deleteUrl: '', success: true };
    } catch {
      return { url: '', thumbnailUrl: '', deleteUrl: '', success: false, error: 'Failed to read file' };
    }
  }

  // API key is configured → upload to ImgBB CDN. Do NOT fall back to base64 on failure
  // because base64 data URLs would bloat Supabase rows (500KB–2MB per image).
  try {
    const base64 = await fileToBase64(file);
    const formData = new FormData();
    formData.append('image', base64);
    if (name) formData.append('name', name);

    const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${apiKey}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`ImgBB upload failed (HTTP ${response.status}). Check your connection and retry.`);
    }

    const json = await response.json();
    if (!json.success) {
      throw new Error(json.error?.message || 'ImgBB returned an unsuccessful response');
    }

    return {
      url: json.data.display_url || json.data.url,
      thumbnailUrl: json.data.thumb?.url || json.data.display_url || json.data.url,
      deleteUrl: json.data.delete_url || '',
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upload error';
    console.error('[ImageUpload] ImgBB upload error:', message);
    // Return failure — caller will show a retry toast. Never save base64 blobs to Supabase.
    return { url: '', thumbnailUrl: '', deleteUrl: '', success: false, error: message };
  }
}

/**
 * Create a hidden file input, trigger it, and return the selected File.
 * Useful for profile photo / QR upload flows.
 */
export function pickImageFile(accept: string = 'image/*'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      document.body.removeChild(input);
      resolve(file);
    });

    input.addEventListener('cancel', () => {
      document.body.removeChild(input);
      resolve(null);
    });

    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
        resolve(null);
      }
    }, 120000);

    input.click();
  });
}
