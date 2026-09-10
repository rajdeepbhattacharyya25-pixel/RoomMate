export type NudgeTone = 'casual' | 'direct' | 'roomie';

export interface NudgeOptions {
  debtorName: string;
  debtorPhone?: string;
  creditorName: string;
  creditorUpiId: string;
  roomName: string;
  totalAmount: number;
  items?: Array<{ title: string; shareAmount: number }>;
  tone: NudgeTone;
}

/**
 * Generates an NPCI-compliant UPI payment URI for 1-tap mobile payment apps (GPay, PhonePe, Paytm).
 */
export function generateUpiDeepLink(options: {
  pa: string; // Payee VPA / UPI ID
  pn: string; // Payee Name
  am: number; // Amount in INR
  tn: string; // Transaction note
}): string {
  const cleanUpi = options.pa.trim();
  const cleanName = encodeURIComponent(options.pn.trim());
  const cleanAmount = options.am.toFixed(2);
  const cleanNote = encodeURIComponent(options.tn.trim().replace(/\s+/g, '_'));

  return `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
}

/**
 * Builds a formatted message according to the selected tone.
 */
export function formatNudgeMessage(options: NudgeOptions, upiLink: string): string {
  const { debtorName, creditorName, roomName, totalAmount, items, tone } = options;
  const firstName = debtorName.split(' ')[0];

  // Itemized breakdown bullets
  let itemsBreakdown = '';
  if (items && items.length > 0) {
    itemsBreakdown = items
      .slice(0, 4)
      .map((item) => `• ${item.title}: ₹${item.shareAmount.toFixed(2)}`)
      .join('\n');
    if (items.length > 4) {
      itemsBreakdown += `\n• +${items.length - 4} more shared items`;
    }
  }

  const formattedTotal = `₹${totalAmount.toFixed(2)}`;

  switch (tone) {
    case 'direct':
      return [
        `*${roomName} Expense Split Reminder* ⚡`,
        `Hey ${firstName},`,
        itemsBreakdown ? `Pending splits:\n${itemsBreakdown}` : '',
        `*Total Due: ${formattedTotal}*`,
        '',
        `👉 *1-Tap Pay via GPay / PhonePe / Paytm:*`,
        upiLink,
        '',
        `_Tracked securely on CampusFlow_`,
      ]
        .filter(Boolean)
        .join('\n');

    case 'roomie':
      return [
        `Hey ${firstName}! 🍕 Dues check for ${roomName}:`,
        itemsBreakdown ? `${itemsBreakdown}\n` : '',
        `Total is *${formattedTotal}*.`,
        `Settle up so we can order weekend snacks & chai! ☕🚀`,
        '',
        `👉 *Tap to pay in 1-click:*`,
        upiLink,
        '',
        `_Recorded by ${creditorName} on CampusFlow_`,
      ]
        .filter(Boolean)
        .join('\n');

    case 'casual':
    default:
      return [
        `Hey ${firstName}! 👋 Hope you're having a good day.`,
        `Quick reminder for our ${roomName} split:`,
        itemsBreakdown ? `${itemsBreakdown}` : '',
        `*Total Pending: ${formattedTotal}*`,
        '',
        `👉 *Tap here to settle in 1-tap via GPay/PhonePe:*`,
        upiLink,
        '',
        `Thanks a lot! — ${creditorName}`,
      ]
        .filter(Boolean)
        .join('\n');
  }
}

/**
 * Builds the WhatsApp universal or targeted intent URL.
 */
export function generateWhatsAppUrl(phoneNumber?: string, message?: string): string {
  const encodedText = message ? encodeURIComponent(message) : '';

  if (phoneNumber) {
    // Strip non-numeric characters
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    // If Indian number without country code, prepend 91
    const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    return `https://wa.me/${finalPhone}?text=${encodedText}`;
  }

  // Universal share picker
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Generates an in-person scannable QR code URL for the UPI payment link.
 */
export function generateUpiQrCodeUrl(upiLink: string, size = 260): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(
    upiLink
  )}`;
}
