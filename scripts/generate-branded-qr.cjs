/**
 * RoomMate Branded QR Code Generator
 * Generates both high-resolution SVG and PNG branded cards containing:
 * - Official RoomMate Logo
 * - "RoomMate" App Name & Subtitle
 * - "SCAN TO DOWNLOAD" Prominent Typography
 * - Scannable QR Matrix (Error Correction Level H) pointing to https://roommate26.vercel.app/?action=download
 * - Centered Logo Emblem Overlay
 * - Build info (v1.0.4 • Build 10 • 7.29 MB) & Security Verification Badges
 * - Automated jsQR verification
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');

// Target landing page URL with action=download trigger
const TARGET_URL = 'https://roommate26.vercel.app/?action=download';
const APP_VERSION = 'v1.0.4';
const BUILD_NUMBER = 'Build 10';
const FILE_SIZE = '7.29 MB';

// Simple 5x7 ASCII bitmap font definition for crisp raster text in PNG
const FONT_5X7 = {
  ' ': [0,0,0,0,0],
  'A': [0x7E, 0x11, 0x11, 0x11, 0x7E],
  'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
  'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
  'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
  'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
  'F': [0x7F, 0x09, 0x09, 0x09, 0x01],
  'G': [0x3E, 0x41, 0x49, 0x49, 0x7A],
  'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
  'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
  'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
  'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
  'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
  'M': [0x7F, 0x02, 0x04, 0x02, 0x7F],
  'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
  'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
  'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
  'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
  'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
  'S': [0x46, 0x49, 0x49, 0x49, 0x31],
  'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
  'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
  'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
  'W': [0x7F, 0x20, 0x18, 0x20, 0x7F],
  'X': [0x63, 0x14, 0x08, 0x14, 0x63],
  'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
  'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
  'a': [0x20, 0x54, 0x54, 0x54, 0x78],
  'b': [0x7F, 0x48, 0x44, 0x44, 0x38],
  'c': [0x38, 0x44, 0x44, 0x44, 0x20],
  'd': [0x38, 0x44, 0x44, 0x48, 0x7F],
  'e': [0x38, 0x54, 0x54, 0x54, 0x18],
  'f': [0x08, 0x7E, 0x09, 0x01, 0x02],
  'g': [0x0C, 0x52, 0x52, 0x52, 0x3E],
  'h': [0x7F, 0x08, 0x04, 0x04, 0x78],
  'i': [0x00, 0x44, 0x7D, 0x40, 0x00],
  'j': [0x20, 0x40, 0x44, 0x3D, 0x00],
  'k': [0x7F, 0x10, 0x28, 0x44, 0x00],
  'l': [0x00, 0x41, 0x7F, 0x40, 0x00],
  'm': [0x7C, 0x04, 0x18, 0x04, 0x78],
  'n': [0x7C, 0x08, 0x04, 0x04, 0x78],
  'o': [0x38, 0x44, 0x44, 0x44, 0x38],
  'p': [0x7C, 0x14, 0x14, 0x14, 0x08],
  'q': [0x08, 0x14, 0x14, 0x18, 0x7C],
  'r': [0x7C, 0x08, 0x04, 0x04, 0x08],
  's': [0x48, 0x54, 0x54, 0x54, 0x20],
  't': [0x04, 0x3F, 0x44, 0x40, 0x20],
  'u': [0x3C, 0x40, 0x40, 0x20, 0x7C],
  'v': [0x1C, 0x20, 0x40, 0x20, 0x1C],
  'w': [0x3C, 0x40, 0x30, 0x40, 0x3C],
  'x': [0x44, 0x28, 0x10, 0x28, 0x44],
  'y': [0x0C, 0x50, 0x50, 0x50, 0x3C],
  'z': [0x44, 0x64, 0x54, 0x4C, 0x44],
  '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
  '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '?': [0x02, 0x01, 0x51, 0x09, 0x06],
  '=': [0x14, 0x14, 0x14, 0x14, 0x14],
  '(': [0x00, 0x1C, 0x22, 0x41, 0x00],
  ')': [0x00, 0x41, 0x22, 0x1C, 0x00],
  '•': [0x00, 0x1C, 0x1C, 0x1C, 0x00],
  '✓': [0x00, 0x40, 0x20, 0x10, 0x7F],
  '|': [0x00, 0x00, 0x7F, 0x00, 0x00],
};

function drawPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  const alpha = a / 255;
  if (alpha >= 1) {
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  } else {
    png.data[idx] = Math.round(r * alpha + png.data[idx] * (1 - alpha));
    png.data[idx + 1] = Math.round(g * alpha + png.data[idx + 1] * (1 - alpha));
    png.data[idx + 2] = Math.round(b * alpha + png.data[idx + 2] * (1 - alpha));
    png.data[idx + 3] = Math.min(255, Math.round(a + png.data[idx + 3] * (1 - alpha)));
  }
}

function fillRect(png, x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      drawPixel(png, x, y, r, g, b, a);
    }
  }
}

function fillRoundedRect(png, x0, y0, w, h, rad, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(0, Math.abs(x - (x0 + w / 2)) - (w / 2 - rad));
      const dy = Math.max(0, Math.abs(y - (y0 + h / 2)) - (h / 2 - rad));
      if (dx * dx + dy * dy <= rad * rad) {
        drawPixel(png, x, y, r, g, b, a);
      }
    }
  }
}

function drawStrokeRoundedRect(png, x0, y0, w, h, rad, strokeWidth, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(0, Math.abs(x - (x0 + w / 2)) - (w / 2 - rad));
      const dy = Math.max(0, Math.abs(y - (y0 + h / 2)) - (h / 2 - rad));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= rad - strokeWidth && dist <= rad) {
        drawPixel(png, x, y, r, g, b, a);
      }
    }
  }
}

function drawText(png, text, x0, y0, scale, r, g, b, a = 255) {
  let currX = x0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const bitmap = FONT_5X7[char] || FONT_5X7[' '];
    for (let col = 0; col < 5; col++) {
      const bits = bitmap[col];
      for (let row = 0; row < 7; row++) {
        if ((bits >> row) & 1) {
          fillRect(png, currX + col * scale, y0 + row * scale, scale, scale, r, g, b, a);
        }
      }
    }
    currX += 6 * scale;
  }
  return currX;
}

function getTextWidth(text, scale) {
  return text.length * 6 * scale;
}

function drawTextCentered(png, text, centerX, y0, scale, r, g, b, a = 255) {
  const width = getTextWidth(text, scale);
  const startX = Math.round(centerX - width / 2);
  drawText(png, text, startX, y0, scale, r, g, b, a);
  return width;
}

async function generateBrandedQR() {
  console.log('🚀 Starting RoomMate Branded QR Code Generation...');
  console.log(`📍 Encoded Destination URL: ${TARGET_URL}`);

  // ==========================================
  // STEP 1: Generate High-Resolution SVG Card
  // ==========================================
  console.log('🎨 Generating Scalable Vector (SVG) Card...');
  const logoRaw = fs.readFileSync('public/logo.png');
  const logoBase64 = `data:image/png;base64,${logoRaw.toString('base64')}`;

  // Generate QR SVG string
  const qrSvgString = await QRCode.toString(TARGET_URL, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    color: {
      dark: '#0C6B70',
      light: '#FFFFFF',
    },
  });

  // Extract inner svg content or paths
  const qrInnerMatch = qrSvgString.match(/<path[^>]+>/g);
  const qrInnerContent = qrInnerMatch ? qrInnerMatch.join('\n') : '';
  const qrViewBoxMatch = qrSvgString.match(/viewBox="([^"]+)"/);
  const qrViewBox = qrViewBoxMatch ? qrViewBoxMatch[1] : '0 0 45 45';

  const svgCard = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1360" width="1000" height="1360">
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#073B3E" />
      <stop offset="50%" stop-color="#0C6B70" />
      <stop offset="100%" stop-color="#0A5054" />
    </linearGradient>

    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F8FAFC" />
    </linearGradient>

    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#10B981" />
    </linearGradient>

    <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0C6B70" />
      <stop offset="100%" stop-color="#14B8A6" />
    </linearGradient>

    <!-- Filters & Shadows -->
    <filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="24" stdDeviation="32" flood-color="#000000" flood-opacity="0.3" />
    </filter>
    <filter id="qrShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0C6B70" flood-opacity="0.12" />
    </filter>
  </defs>

  <!-- Canvas Outer Background -->
  <rect width="1000" height="1360" fill="url(#bgGrad)" />

  <!-- Background Ambient Glow Circles -->
  <circle cx="200" cy="180" r="280" fill="#14B8A6" opacity="0.12" />
  <circle cx="850" cy="1150" r="320" fill="#10B981" opacity="0.1" />

  <!-- Main Container Card -->
  <rect x="60" y="50" width="880" height="1260" rx="40" fill="url(#cardGrad)" filter="url(#cardShadow)" />
  <rect x="60" y="50" width="880" height="1260" rx="40" fill="none" stroke="#E2E8F0" stroke-width="2" />

  <!-- ================= HEADER SECTION ================= -->
  <g transform="translate(500, 110)">
    <!-- App Logo -->
    <image href="${logoBase64}" x="-48" y="0" width="96" height="96" />
    
    <!-- App Name -->
    <text x="0" y="145" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="900" fill="#0F172A" letter-spacing="-1">
      RoomMate
    </text>

    <!-- Subtitle -->
    <text x="0" y="178" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#64748B" letter-spacing="0.5">
      SMART EXPENSE &amp; ROOM MANAGEMENT
    </text>
  </g>

  <!-- ================= SCAN TO DOWNLOAD PROMINENT BANNER ================= -->
  <g transform="translate(500, 340)">
    <!-- Pill Background -->
    <rect x="-240" y="-28" width="480" height="56" rx="28" fill="url(#pillGrad)" />
    
    <!-- Text -->
    <text x="0" y="9" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="800" fill="#FFFFFF" letter-spacing="2">
      SCAN TO DOWNLOAD
    </text>
  </g>

  <!-- ================= QR CODE CONTAINER ================= -->
  <g transform="translate(170, 410)">
    <!-- QR White Plate Background -->
    <rect x="0" y="0" width="660" height="660" rx="32" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5" filter="url(#qrShadow)" />

    <!-- Embedded Scalable QR Matrix -->
    <svg x="40" y="40" width="580" height="580" viewBox="${qrViewBox}">
      ${qrInnerContent}
    </svg>

    <!-- Centered Logo Shield Overlay -->
    <g transform="translate(330, 330)">
      <!-- Outer White Plate -->
      <rect x="-65" y="-65" width="130" height="130" rx="28" fill="#FFFFFF" stroke="#0C6B70" stroke-width="4" filter="url(#cardShadow)" />
      <!-- Logo inside Shield -->
      <image href="${logoBase64}" x="-50" y="-50" width="100" height="100" />
    </g>
  </g>

  <!-- ================= FOOTER & METADATA SECTION ================= -->
  <g transform="translate(500, 1130)">
    <!-- Release Info Badge -->
    <rect x="-260" y="0" width="520" height="42" rx="21" fill="#F1F5F9" stroke="#E2E8F0" stroke-width="1.5" />
    <text x="0" y="27" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#334155">
      Android APK • ${APP_VERSION} (${BUILD_NUMBER}) • ${FILE_SIZE}
    </text>

    <!-- Trust Badges & Verified Staging -->
    <g transform="translate(0, 75)">
      <!-- Green Checkmark Pill -->
      <rect x="-190" y="-18" width="380" height="36" rx="18" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1" />
      <text x="0" y="6" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#047857">
        ✓ 100% Virus-Free • Digitally Signed • Direct Install
      </text>
    </g>

    <!-- Scan Instruction Text -->
    <text x="0" y="125" text-anchor="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#94A3B8">
      Point your phone camera to download directly
    </text>
  </g>
</svg>
`;

  // Write SVG files
  fs.writeFileSync('public/RoomMate-Scan-To-Download-QR.svg', svgCard);
  fs.writeFileSync('RoomMate-Scan-To-Download-QR.svg', svgCard);
  console.log('✅ SVG Card Generated: public/RoomMate-Scan-To-Download-QR.svg & root');

  // ==========================================
  // STEP 2: Generate High-Resolution PNG Card
  // ==========================================
  console.log('🖼️  Generating High-Resolution PNG Card (1000x1360)...');
  const cardW = 1000;
  const cardH = 1360;
  const cardPng = new PNG({ width: cardW, height: cardH });

  // 1. Fill Background Gradient (Dark Teal: #073B3E -> #0C6B70)
  for (let y = 0; y < cardH; y++) {
    const factor = y / cardH;
    const r = Math.round(7 * (1 - factor) + 12 * factor);
    const g = Math.round(59 * (1 - factor) + 107 * factor);
    const b = Math.round(62 * (1 - factor) + 112 * factor);
    for (let x = 0; x < cardW; x++) {
      drawPixel(cardPng, x, y, r, g, b, 255);
    }
  }

  // 2. Draw White Inner Card with Rounded Corners (margin 60px)
  const innerX = 60;
  const innerY = 50;
  const innerW = 880;
  const innerH = 1260;
  const innerRad = 40;
  fillRoundedRect(cardPng, innerX, innerY, innerW, innerH, innerRad, 255, 255, 255, 255);
  drawStrokeRoundedRect(cardPng, innerX, innerY, innerW, innerH, innerRad, 2, 226, 232, 240, 255);

  // 3. Composite Header Logo (from public/logo.png)
  const logoPng = PNG.sync.read(logoRaw);
  const headerLogoSize = 96;
  const headerLogoX = Math.round((cardW - headerLogoSize) / 2);
  const headerLogoY = 110;

  for (let ly = 0; ly < headerLogoSize; ly++) {
    for (let lx = 0; lx < headerLogoSize; lx++) {
      const srcX = Math.floor((lx / headerLogoSize) * logoPng.width);
      const srcY = Math.floor((ly / headerLogoSize) * logoPng.height);
      const srcIdx = (logoPng.width * srcY + srcX) << 2;
      const alpha = logoPng.data[srcIdx + 3];
      if (alpha > 5) {
        drawPixel(
          cardPng,
          headerLogoX + lx,
          headerLogoY + ly,
          logoPng.data[srcIdx],
          logoPng.data[srcIdx + 1],
          logoPng.data[srcIdx + 2],
          alpha
        );
      }
    }
  }

  // 4. Header Titles (RoomMate)
  drawTextCentered(cardPng, 'ROOMMATE', cardW / 2, 225, 7, 15, 23, 42);
  drawTextCentered(cardPng, 'SMART STUDENT AND ROOMMATE FINANCE', cardW / 2, 285, 2, 100, 116, 139);

  // 5. "SCAN TO DOWNLOAD" Banner Pill
  const pillW = 460;
  const pillH = 54;
  const pillX = Math.round((cardW - pillW) / 2);
  const pillY = 325;
  fillRoundedRect(cardPng, pillX, pillY, pillW, pillH, 27, 12, 107, 112); // #0C6B70
  drawTextCentered(cardPng, 'SCAN TO DOWNLOAD', cardW / 2, 342, 3, 255, 255, 255);

  // 6. Generate QR Matrix for target URL
  console.log('🔄 Rendering QR Matrix with Centered Emblem...');
  const qrSize = 580;
  const qrBuffer = await QRCode.toBuffer(TARGET_URL, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 1,
    width: qrSize,
    color: {
      dark: '#0C6B70',
      light: '#FFFFFF',
    },
  });
  const qrPng = PNG.sync.read(qrBuffer);

  // QR Plate Box
  const qrPlateSize = 660;
  const qrPlateX = Math.round((cardW - qrPlateSize) / 2);
  const qrPlateY = 410;
  fillRoundedRect(cardPng, qrPlateX, qrPlateY, qrPlateSize, qrPlateSize, 32, 255, 255, 255);
  drawStrokeRoundedRect(cardPng, qrPlateX, qrPlateY, qrPlateSize, qrPlateSize, 32, 2, 203, 213, 225);

  // Composite QR code into plate
  const qrDestX = qrPlateX + Math.round((qrPlateSize - qrSize) / 2);
  const qrDestY = qrPlateY + Math.round((qrPlateSize - qrSize) / 2);

  for (let qy = 0; qy < qrSize; qy++) {
    for (let qx = 0; qx < qrSize; qx++) {
      const srcIdx = (qrSize * qy + qx) << 2;
      drawPixel(
        cardPng,
        qrDestX + qx,
        qrDestY + qy,
        qrPng.data[srcIdx],
        qrPng.data[srcIdx + 1],
        qrPng.data[srcIdx + 2],
        255
      );
    }
  }

  // Centered Logo Shield Overlay inside QR code
  const shieldSize = 130;
  const shieldX = Math.round((cardW - shieldSize) / 2);
  const shieldY = qrPlateY + Math.round((qrPlateSize - shieldSize) / 2);
  fillRoundedRect(cardPng, shieldX, shieldY, shieldSize, shieldSize, 28, 255, 255, 255);
  drawStrokeRoundedRect(cardPng, shieldX, shieldY, shieldSize, shieldSize, 28, 3, 12, 107, 112);

  // Draw logo inside shield
  const innerLogoSize = 98;
  const innerLogoX = Math.round((cardW - innerLogoSize) / 2);
  const innerLogoY = shieldY + Math.round((shieldSize - innerLogoSize) / 2);

  for (let ly = 0; ly < innerLogoSize; ly++) {
    for (let lx = 0; lx < innerLogoSize; lx++) {
      const srcX = Math.floor((lx / innerLogoSize) * logoPng.width);
      const srcY = Math.floor((ly / innerLogoSize) * logoPng.height);
      const srcIdx = (logoPng.width * srcY + srcX) << 2;
      const alpha = logoPng.data[srcIdx + 3];
      if (alpha > 10) {
        drawPixel(
          cardPng,
          innerLogoX + lx,
          innerLogoY + ly,
          logoPng.data[srcIdx],
          logoPng.data[srcIdx + 1],
          logoPng.data[srcIdx + 2],
          alpha
        );
      }
    }
  }

  // 7. Footer Metadata & Verification
  // Release info box
  const infoBoxW = 540;
  const infoBoxH = 46;
  const infoBoxX = Math.round((cardW - infoBoxW) / 2);
  const infoBoxY = 1120;
  fillRoundedRect(cardPng, infoBoxX, infoBoxY, infoBoxW, infoBoxH, 23, 241, 245, 249);
  drawStrokeRoundedRect(cardPng, infoBoxX, infoBoxY, infoBoxW, infoBoxH, 23, 1, 226, 232, 240);
  drawTextCentered(
    cardPng,
    `ANDROID APK - ${APP_VERSION} (${BUILD_NUMBER}) - ${FILE_SIZE}`,
    cardW / 2,
    1136,
    2,
    51,
    65,
    85
  );

  // Trust pill
  const trustW = 460;
  const trustH = 40;
  const trustX = Math.round((cardW - trustW) / 2);
  const trustY = 1180;
  fillRoundedRect(cardPng, trustX, trustY, trustW, trustH, 20, 236, 253, 245);
  drawStrokeRoundedRect(cardPng, trustX, trustY, trustW, trustH, 20, 1, 167, 243, 208);
  drawTextCentered(cardPng, 'VERIFIED SAFE - DIGITALLY SIGNED - DIRECT INSTALL', cardW / 2, 1194, 2, 4, 120, 87);

  // Instructions
  drawTextCentered(cardPng, 'POINT YOUR PHONE CAMERA TO DOWNLOAD DIRECTLY', cardW / 2, 1245, 2, 148, 163, 184);

  // ==========================================
  // STEP 3: Automated jsQR Verification
  // ==========================================
  console.log('🔍 Executing Automated jsQR Decode Verification on Generated Image...');
  const decoded = jsQR(new Uint8ClampedArray(cardPng.data), cardW, cardH);
  if (!decoded || decoded.data !== TARGET_URL) {
    throw new Error(`CRITICAL: QR Code Decode Mismatch! Expected '${TARGET_URL}', got: '${decoded ? decoded.data : 'NULL'}'`);
  }
  console.log(`✅ VERIFIED: jsQR successfully decoded URL with 100% exact parity: ${decoded.data}`);

  // Write PNG files
  const pngBuffer = PNG.sync.write(cardPng);
  fs.writeFileSync('public/RoomMate-Scan-To-Download-QR.png', pngBuffer);
  fs.writeFileSync('RoomMate-Scan-To-Download-QR.png', pngBuffer);
  
  // Also write to conversation artifact directory if available
  const artifactDir = 'C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\8333382f-2273-4fd4-bdae-8717d0304056';
  try {
    fs.writeFileSync(path.join(artifactDir, 'RoomMate-Scan-To-Download-QR.png'), pngBuffer);
    console.log(`✅ Saved copy to artifact directory: ${artifactDir}`);
  } catch (err) {
    console.warn('Could not write to artifactDir:', err.message);
  }

  console.log('🎉 Generation Finished Successfully!');
  console.log(`📁 Files Created:`);
  console.log(`   - public/RoomMate-Scan-To-Download-QR.png (${(pngBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`   - public/RoomMate-Scan-To-Download-QR.svg (${(Buffer.byteLength(svgCard) / 1024).toFixed(1)} KB)`);
  console.log(`   - RoomMate-Scan-To-Download-QR.png (Project Root)`);
  console.log(`   - RoomMate-Scan-To-Download-QR.svg (Project Root)`);
}

generateBrandedQR().catch((err) => {
  console.error('❌ QR Generation Failed:', err);
  process.exit(1);
});
