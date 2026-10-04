/**
 * Avatar utilities for detecting Google default generated avatars
 * vs genuine user-uploaded custom profile photos.
 *
 * When a Google user has not uploaded a personal profile photo, Google
 * automatically generates a single-color background stamped with the user's initial.
 * We detect this so the app accurately falls back to the Instagram silhouette default avatar.
 */

// In-memory cache for avatar classification results
const avatarClassificationCache = new Map<string, boolean>();

/**
 * Checks if a given image URL points to a Google default/placeholder letter avatar.
 *
 * Employs a multi-tier strategy:
 * 1. Fast cache check (memory & localStorage).
 * 2. Static URL heuristics (known default path patterns).
 * 3. Fast Canvas pixel sampling (determines if image is >72% solid background + letter glyph with <=16 distinct quantized colors).
 */
export async function isGoogleDefaultAvatar(url?: string | null): Promise<boolean> {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.trim();
  if (!cleanUrl) return false;

  // Only Google-hosted user content URLs can be Google default letter avatars
  if (
    !cleanUrl.includes('googleusercontent.com') &&
    !cleanUrl.includes('google.com') &&
    !cleanUrl.includes('gstatic.com')
  ) {
    return false;
  }

  // 1. In-memory cache
  if (avatarClassificationCache.has(cleanUrl)) {
    return avatarClassificationCache.get(cleanUrl)!;
  }

  // 2. LocalStorage cache
  const cacheKey = `roommate_is_default_avatar_${cleanUrl}`;
  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached === 'true' || cached === 'false') {
        const val = cached === 'true';
        avatarClassificationCache.set(cleanUrl, val);
        return val;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  // 3. Known default URL path patterns
  if (
    cleanUrl.includes('/default-user') ||
    cleanUrl.includes('/default_avatar') ||
    cleanUrl.includes('/silhouette') ||
    cleanUrl.endsWith('/photo.jpg')
  ) {
    recordCache(cleanUrl, true);
    return true;
  }

  // 4. In browser / WebView / Capacitor: Use Canvas pixel analysis
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Image !== 'undefined') {
    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        recordCache(cleanUrl, result);
        resolve(result);
      };

      // Guard with timeout so we never hang UI
      const timer = setTimeout(() => finish(false), 2500);

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
              finish(false);
              return;
            }

            ctx.drawImage(img, 0, 0, 16, 16);
            const imgData = ctx.getImageData(0, 0, 16, 16).data;

            // Downsampled color quantization (5-bit per channel: 32 levels = 32,768 bins)
            const colorCounts = new Map<number, number>();
            let totalPixels = 0;

            for (let i = 0; i < imgData.length; i += 4) {
              // Ignore fully transparent pixels if any
              if (imgData[i + 3] < 128) continue;
              const r = imgData[i] >> 3;
              const g = imgData[i + 1] >> 3;
              const b = imgData[i + 2] >> 3;
              const qColor = (r << 10) | (g << 5) | b;
              colorCounts.set(qColor, (colorCounts.get(qColor) || 0) + 1);
              totalPixels++;
            }

            if (totalPixels === 0) {
              finish(false);
              return;
            }

            let maxCount = 0;
            for (const count of colorCounts.values()) {
              if (count > maxCount) maxCount = count;
            }

            const dominantRatio = maxCount / totalPixels;
            // Google default letter avatars are 80-95% uniform flat background color
            // with very few total quantized colors (typically 3-10).
            // Natural photos have dozens of quantized colors and dominant ratio < 0.65.
            const isDefault = dominantRatio >= 0.72 && colorCounts.size <= 16;
            finish(isDefault);
          } catch {
            finish(false);
          }
        };

        img.onerror = () => {
          clearTimeout(timer);
          finish(false);
        };

        img.src = cleanUrl;
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    });
  }

  // 5. In Node.js / test environment where Image/Canvas is not available
  recordCache(cleanUrl, false);
  return false;
}

function recordCache(url: string, isDefault: boolean) {
  avatarClassificationCache.set(url, isDefault);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`roommate_is_default_avatar_${url}`, isDefault ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }
}

/**
 * Synchronous check for cached avatar classification.
 * Returns boolean if already classified, or null if pending.
 */
export function isGoogleDefaultAvatarSync(url?: string | null): boolean | null {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.trim();
  if (!cleanUrl) return false;
  if (!cleanUrl.includes('googleusercontent.com') && !cleanUrl.includes('google.com')) return false;

  if (avatarClassificationCache.has(cleanUrl)) {
    return avatarClassificationCache.get(cleanUrl)!;
  }

  // Known default URL path patterns are synchronous
  if (
    cleanUrl.includes('/default-user') ||
    cleanUrl.includes('/default_avatar') ||
    cleanUrl.includes('/silhouette') ||
    cleanUrl.endsWith('/photo.jpg')
  ) {
    recordCache(cleanUrl, true);
    return true;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(`roommate_is_default_avatar_${cleanUrl}`);
      if (cached === 'true' || cached === 'false') {
        const val = cached === 'true';
        avatarClassificationCache.set(cleanUrl, val);
        return val;
      }
    } catch {
      // Ignore
    }
  }

  return null;
}
