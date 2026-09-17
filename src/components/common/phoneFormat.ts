// Extract standard 10 digits from any raw/pasted string
export function extractTenDigits(val: string): string {
  if (!val) return '';
  const digits = val.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(digits.length - 10);
  }
  return digits.slice(0, 10);
}

// Format 10 digits into Indian mobile 5-5 layout "XXXXX XXXXX"
export function formatPhoneDisplay(digits: string): string {
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
}
