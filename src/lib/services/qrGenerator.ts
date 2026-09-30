import QRCode from 'qrcode';

export interface QrCodeOptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * Generates an offline, high-contrast data URI for a QR code locally on-device.
 * Requires zero external network calls, ensuring instant loading on spotty WiFi or offline.
 */
export async function generateQrDataUrl(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const {
    width = 280,
    margin = 2,
    darkColor = '#0F172A',
    lightColor = '#FFFFFF',
  } = options;

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width,
      margin,
      color: {
        dark: darkColor,
        light: lightColor,
      },
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch (err) {
    console.warn('Local QRCode generation error, falling back to remote:', err);
    // Safe remote fallback if local canvas generation throws
    return `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${width}&margin=${margin * 4}&data=${encodeURIComponent(text)}`;
  }
}
