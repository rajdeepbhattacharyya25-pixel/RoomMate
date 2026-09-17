import { Capacitor } from '@capacitor/core';
import { analytics } from '../analytics/posthog';

export type UpiAppTarget = 'gpay' | 'phonepe' | 'paytm' | 'generic';

export interface UpiIntentOptions {
  pa: string; // Payee VPA / UPI ID (e.g. sneha@okaxis)
  pn: string; // Payee Name
  am: number; // Amount in INR
  tn: string; // Transaction Note
  tr?: string; // Optional reference / transaction ID
}

export interface SettlementReceiptData {
  amount: number;
  payerName: string;
  payeeName: string;
  payeeUpiId: string;
  roomName: string;
  paymentMethod: string;
  transactionRef: string;
  dateStr?: string;
}

/**
 * Checks if the current environment is a mobile phone (native Capacitor or mobile browser).
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Generates an NPCI-compliant UPI query parameter string.
 */
function buildUpiQueryParams(options: UpiIntentOptions): string {
  const cleanUpi = options.pa.trim();
  const cleanName = encodeURIComponent(options.pn.trim());
  const cleanAmount = options.am.toFixed(2);
  const cleanNote = encodeURIComponent(options.tn.trim().replace(/\s+/g, '_'));
  let query = `pa=${cleanUpi}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
  if (options.tr) {
    query += `&tr=${encodeURIComponent(options.tr)}`;
  }
  return query;
}

/**
 * Generates an app-specific or universal UPI deep link URL.
 */
export function generateUpiAppIntent(app: UpiAppTarget, options: UpiIntentOptions): string {
  const query = buildUpiQueryParams(options);

  switch (app) {
    case 'gpay':
      // Google Pay Tez scheme
      return `tez://upi/pay?${query}`;
    case 'phonepe':
      // PhonePe scheme
      return `phonepe://pay?${query}`;
    case 'paytm':
      // Paytm mobile payment scheme
      return `paytmmp://pay?${query}`;
    case 'generic':
    default:
      // Standard NPCI UPI URI scheme (invokes OS intent chooser on Android/iOS)
      return `upi://pay?${query}`;
  }
}

/**
 * Launches the selected UPI intent or falls back gracefully.
 */
export function launchUpiIntent(app: UpiAppTarget, options: UpiIntentOptions): boolean {
  analytics.trackPaymentFlowStarted({ appTarget: app, isFallback: false });
  const uri = generateUpiAppIntent(app, options);

  if (typeof window === 'undefined') return false;

  try {
    // In mobile browsers and Capacitor WebViews, navigating to the URI triggers the native app
    window.location.href = uri;
    return true;
  } catch (err) {
    console.warn('Failed to launch UPI intent directly:', err);
    // Secondary fallback: generic intent
    if (app !== 'generic') {
      try {
        analytics.trackPaymentFlowStarted({ appTarget: 'generic', isFallback: true });
        window.location.href = generateUpiAppIntent('generic', options);
        return true;
      } catch {
        analytics.trackPaymentFlowFailed({ reason: 'generic_fallback_error' });
        return false;
      }
    }
    analytics.trackPaymentFlowFailed({ reason: 'direct_intent_error' });
    return false;
  }
}

/**
 * Generates an official high-contrast QR code URL for in-person scanning.
 */
export function generateUpiQrCodeUrl(options: UpiIntentOptions, size = 300): string {
  const genericUri = generateUpiAppIntent('generic', options);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(
    genericUri
  )}`;
}

/**
 * Generates a unique, branded settlement transaction reference token.
 */
export function generateSettlementToken(): string {
  const now = new Date();
  const year = now.getFullYear();
  const hexTime = Math.floor(now.getTime() / 1000).toString(16).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CF-${year}-${hexTime}-${rand}`;
}

/**
 * Formats a clean, professional settlement confirmation for WhatsApp sharing.
 */
export function formatWhatsAppSettlementReceipt(data: SettlementReceiptData): string {
  const date =
    data.dateStr ||
    new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return [
    `*RoomMate Settlement Receipt* 🧾✨`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `✅ *Payment Recorded & Cleared*`,
    `💰 *Amount:* ₹${data.amount.toFixed(2)}`,
    `👤 *From (Payer):* ${data.payerName}`,
    `👥 *To (Payee):* ${data.payeeName} (${data.payeeUpiId})`,
    `🏠 *Room / Flat:* ${data.roomName}`,
    `💳 *Method:* ${data.paymentMethod}`,
    `🔖 *Ref / UTR:* ${data.transactionRef}`,
    `🕒 *Timestamp:* ${date}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `_Balance updated instantly across all flatmates' devices._ 🚀`,
  ].join('\n');
}

/**
 * Renders a high-resolution, exportable digital voucher receipt onto an HTML5 Canvas.
 * Returns a data URL ready for download or sharing.
 */
export function renderSettlementVoucherCanvas(data: SettlementReceiptData): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  const width = 800;
  const height = 1000;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0F172A'); // Slate 900
  bgGrad.addColorStop(0.5, '#1E1B4B'); // Indigo 950
  bgGrad.addColorStop(1, '#090D16'); // Deep void
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Card Inner Border (Frosted glass outline)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  // Top Accent Bar
  const accentGrad = ctx.createLinearGradient(30, 30, width - 30, 30);
  accentGrad.addColorStop(0, '#6366F1');
  accentGrad.addColorStop(0.5, '#10B981');
  accentGrad.addColorStop(1, '#3B82F6');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(30, 30, width - 60, 6);

  // Header Title
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 18px Inter, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ROOMMATE • VERIFIED SETTLEMENT VOUCHER', width / 2, 85);

  // Checkmark Badge Circle
  ctx.beginPath();
  ctx.arc(width / 2, 160, 42, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  // White Checkmark Icon
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 16, 160);
  ctx.lineTo(width / 2 - 4, 172);
  ctx.lineTo(width / 2 + 18, 148);
  ctx.stroke();

  // Status Text
  ctx.fillStyle = '#10B981';
  ctx.font = '700 16px Inter, system-ui, sans-serif';
  ctx.fillText('PAYMENT CLEARED & CLOUD SYNCED', width / 2, 235);

  // Amount in ₹
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 64px Inter, system-ui, sans-serif';
  ctx.fillText(`₹${data.amount.toFixed(2)}`, width / 2, 315);

  // Divider line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, 355);
  ctx.lineTo(width - 70, 355);
  ctx.stroke();

  // Details Grid
  const drawRow = (label: string, value: string, yPos: number) => {
    ctx.fillStyle = '#64748B';
    ctx.font = '500 17px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 80, yPos);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '600 18px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, width - 80, yPos);
  };

  drawRow('Paid by (Resident):', data.payerName, 410);
  drawRow('Paid to (Recipient):', data.payeeName, 465);
  drawRow('Recipient UPI ID:', data.payeeUpiId, 520);
  drawRow('Flat / Room:', data.roomName, 575);
  drawRow('Payment Method:', data.paymentMethod, 630);
  drawRow('Transaction Ref / UTR:', data.transactionRef, 685);
  drawRow('Date & Time:', data.dateStr || 'Verified Live', 740);

  // Bottom Box (Verification Stamp)
  ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
  ctx.fillRect(70, 785, width - 140, 95);
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
  ctx.strokeRect(70, 785, width - 140, 95);

  ctx.fillStyle = '#A5B4FC';
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OFFICIAL DIGITAL SETTLEMENT PROOF', width / 2, 825);

  ctx.fillStyle = '#64748B';
  ctx.font = '400 13px Inter, system-ui, sans-serif';
  ctx.fillText('Protected by Supabase Cloud Row-Level Security & PostgreSQL WAL Broadcast', width / 2, 855);

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '500 13px Inter, system-ui, sans-serif';
  ctx.fillText('Generated on RoomMate Mobile • Student Expense & Ledger System', width / 2, 935);

  return canvas.toDataURL('image/png');
}

/**
 * Triggers a direct browser download of the rendered voucher PNG.
 */
export function downloadSettlementVoucherImage(data: SettlementReceiptData): void {
  const dataUrl = renderSettlementVoucherCanvas(data);
  if (!dataUrl) return;

  const link = document.createElement('a');
  link.download = `RoomMate_Settlement_${data.payeeName.replace(/\s+/g, '_')}_₹${data.amount.toFixed(0)}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface ParsedUpiData {
  vpa: string;
  name: string;
  amount?: number;
  note?: string;
  ref?: string;
  raw: string;
}

/**
 * Parses raw QR string or UPI intent URI (upi://pay?pa=... or merchant@bank) into structured parameters.
 */
export function parseUpiQrString(rawInput: string): ParsedUpiData | null {
  if (!rawInput) return null;
  const input = rawInput.trim();

  // 1. Standard NPCI UPI URI scheme: upi://pay?pa=...
  if (input.toLowerCase().startsWith('upi://pay')) {
    try {
      const url = new URL(input.replace(/^[uU][pP][iI]:\/\/[pP][aA][yY]\??/, 'https://dummy.local/?'));
      const pa = url.searchParams.get('pa') || '';
      const pn = url.searchParams.get('pn') || '';
      const am = url.searchParams.get('am') ? parseFloat(url.searchParams.get('am')!) : undefined;
      const tn = url.searchParams.get('tn') || '';
      const tr = url.searchParams.get('tr') || '';

      if (pa) {
        return {
          vpa: pa,
          name: pn || pa.split('@')[0] || 'Merchant',
          amount: am && !isNaN(am) ? am : undefined,
          note: tn ? decodeURIComponent(tn).replace(/_/g, ' ') : undefined,
          ref: tr || undefined,
          raw: input,
        };
      }
    } catch {
      // Manual regex fallback
      const paMatch = input.match(/[?&]pa=([^&]+)/i);
      if (paMatch) {
        const pnMatch = input.match(/[?&]pn=([^&]+)/i);
        const amMatch = input.match(/[?&]am=([^&]+)/i);
        const tnMatch = input.match(/[?&]tn=([^&]+)/i);
        const trMatch = input.match(/[?&]tr=([^&]+)/i);
        const vpa = decodeURIComponent(paMatch[1]);
        return {
          vpa,
          name: pnMatch ? decodeURIComponent(pnMatch[1]) : vpa.split('@')[0],
          amount: amMatch ? parseFloat(amMatch[1]) : undefined,
          note: tnMatch ? decodeURIComponent(tnMatch[1]).replace(/_/g, ' ') : undefined,
          ref: trMatch ? decodeURIComponent(trMatch[1]) : undefined,
          raw: input,
        };
      }
    }
  }

  // 2. Direct VPA (e.g. resident@okaxis, 9876543210@paytm)
  const vpaRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  if (vpaRegex.test(input)) {
    return {
      vpa: input,
      name: input.split('@')[0],
      raw: input,
    };
  }

  return null;
}
