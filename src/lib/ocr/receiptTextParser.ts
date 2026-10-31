/**
 * receiptTextParser.ts
 *
 * Rule-based heuristic parser specialized for Indian retail, grocery,
 * restaurant, and thermal supermarket receipts (BigBasket, Blinkit, Zepto, D-Mart, etc.).
 *
 * Converts unformatted raw OCR text lines into structured items, totals,
 * taxes, and discounts with confidence ratings.
 */

export interface ParsedReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rawLine: string;
}

export interface ParsedReceiptData {
  vendor?: string;
  date?: string; // YYYY-MM-DD
  items: ParsedReceiptItem[];
  subtotalPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  discountPaise: number;
  totalPaise: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rawText: string;
}

// Common keywords for line classification
const TOTAL_KEYWORDS = [
  'grand total',
  'net amount',
  'total payable',
  'total amount',
  'amount payable',
  'total due',
  'balance due',
  'bal due',
  'amount paid',
  'final total',
  'total bill',
  'total',
];

const SUBTOTAL_KEYWORDS = [
  'sub total',
  'subtotal',
  'item total',
  'items total',
  'total items',
];

const TAX_KEYWORDS = [
  'cgst',
  'sgst',
  'igst',
  'vat',
  'service tax',
  'tax',
  'gst',
  'cess',
];

const DISCOUNT_KEYWORDS = [
  'discount',
  'scheme',
  'savings',
  'saved',
  'less',
  'promo',
  'coupon',
  'cashback',
];

const DELIVERY_KEYWORDS = [
  'delivery',
  'handling',
  'packing',
  'packaging',
  'convenience fee',
  'platform fee',
  'surge fee',
  'service charge',
];

const IGNORED_HEADER_PATTERNS = [
  /gstin/i,
  /tax\s*invoice/i,
  /retail\s*invoice/i,
  /cash\s*memo/i,
  /order\s*#/i,
  /bill\s*no/i,
  /invoice\s*no/i,
  /tel\s*:/i,
  /phone\s*:/i,
  /mob\s*:/i,
  /cin\s*:/i,
  /fssai/i,
  /cashier/i,
  /counter/i,
  /pos\s*terminal/i,
  /welcome/i,
  /thank\s*you/i,
  /visit\s*again/i,
  /upi\s*ref/i,
  /auth\s*code/i,
  /card\s*number/i,
  /payment\s*mode/i,
  /tendered/i,
  /change\s*due/i,
  /items?\s+qty\s+rate\s+amount/i,
  /item\s+desc/i,
  /s\.?no\.?/i,
];

/**
 * Strips currency marks and extracts floating point number string.
 */
function cleanAmountString(raw: string): number | null {
  if (!raw) return null;
  // 1. Strip percentage qualifiers like 2.5%, 5%, 18% to avoid capturing tax rates
  let cleaned = raw.replace(/\b\d+(?:\.\d+)?%/g, '');

  // 2. Replace currency symbols: ₹, INR, Rs., Rs, /-, comma
  cleaned = cleaned
    .replace(/[₹\u20B9]/g, '')
    .replace(/\b(INR|RS\.?|RUPEES?)\b/gi, '')
    .replace(/\/-\s*$/, '')
    .replace(/,/g, '')
    .trim();

  // 3. Find all numeric tokens, pick the last one (monetary total of the line)
  const matches = cleaned.match(/[-+]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;

  const lastNum = parseFloat(matches[matches.length - 1]);
  return isNaN(lastNum) ? null : lastNum;
}

/**
 * Parses date string in DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD format.
 */
function extractDate(text: string): string | undefined {
  // 1. Matches DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d\d)\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 2. Matches YYYY-MM-DD
  const ymdMatch = text.match(/\b(20\d\d)[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

/**
 * Main parser entry point.
 */
export function parseReceiptText(rawText: string): ParsedReceiptData {
  if (!rawText || typeof rawText !== 'string') {
    return {
      items: [],
      subtotalPaise: 0,
      taxPaise: 0,
      deliveryPaise: 0,
      discountPaise: 0,
      totalPaise: 0,
      confidence: 'LOW',
      rawText: '',
    };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let detectedVendor: string | undefined;
  let detectedDate: string | undefined;
  let detectedTotalPaise = 0;
  let detectedSubtotalPaise = 0;
  let detectedTaxPaise = 0;
  let detectedDeliveryPaise = 0;
  let detectedDiscountPaise = 0;

  const candidateItems: ParsedReceiptItem[] = [];

  // Pass 1: Extract Vendor and Date from top lines
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];

    if (!detectedDate) {
      detectedDate = extractDate(line);
    }

    if (!detectedVendor && !detectedDate) {
      const isHeaderNoise = IGNORED_HEADER_PATTERNS.some((pat) => pat.test(line));
      const hasDigit = /\d{4,}/.test(line); // likely phone or tax number
      if (!isHeaderNoise && !hasDigit && line.length >= 3 && line.length <= 40) {
        // Strip trailing punctuation
        detectedVendor = line.replace(/[^\w\s&'-]/g, '').trim();
      }
    }
  }

  // Pass 2: Line-by-line categorization
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lower = line.toLowerCase();

    // Look for date anywhere in receipt if not found in header
    if (!detectedDate) {
      const d = extractDate(line);
      if (d) detectedDate = d;
    }

    // Skip known decorative / invoice header lines
    if (IGNORED_HEADER_PATTERNS.some((pat) => pat.test(line))) {
      continue;
    }

    // 1. Detect Grand Total
    const isTotalLine = TOTAL_KEYWORDS.some((kw) => {
      const kwIdx = lower.indexOf(kw);
      return kwIdx !== -1 && !lower.includes('sub') && !lower.includes('items');
    });

    if (isTotalLine) {
      const amt = cleanAmountString(line);
      if (amt !== null && amt > 0) {
        // Keep highest detected total or overwrite previous
        const paise = Math.round(amt * 100);
        if (paise > detectedTotalPaise) {
          detectedTotalPaise = paise;
        }
        continue;
      }
    }

    // 2. Detect Subtotal
    const isSubtotalLine = SUBTOTAL_KEYWORDS.some((kw) => lower.includes(kw));
    if (isSubtotalLine) {
      const amt = cleanAmountString(line);
      if (amt !== null && amt > 0) {
        detectedSubtotalPaise = Math.round(amt * 100);
        continue;
      }
    }

    // 3. Detect Taxes
    const isTaxLine = TAX_KEYWORDS.some((kw) => lower.includes(kw));
    if (isTaxLine) {
      const amt = cleanAmountString(line);
      if (amt !== null && amt > 0) {
        detectedTaxPaise += Math.round(amt * 100);
        continue;
      }
    }

    // 4. Detect Discounts
    const isDiscountLine = DISCOUNT_KEYWORDS.some((kw) => lower.includes(kw));
    if (isDiscountLine) {
      const amt = cleanAmountString(line);
      if (amt !== null && amt > 0) {
        detectedDiscountPaise += Math.round(amt * 100);
        continue;
      }
    }

    // 5. Detect Delivery / Extra Surcharges
    const isDeliveryLine = DELIVERY_KEYWORDS.some((kw) => lower.includes(kw));
    if (isDeliveryLine) {
      const amt = cleanAmountString(line);
      if (amt !== null && amt > 0) {
        detectedDeliveryPaise += Math.round(amt * 100);
        continue;
      }
    }

    // 6. Line Item Pattern Recognition
    // Common formats:
    // Format A: "Item Name [Qty] x [Rate] [Total]" (e.g. "Amul Milk 2 x 33.00 66.00")
    // Format B: "Item Name [Price]" (e.g. "Bread Loaf 45.00")
    // Format C: "Item Name 1 45.00"

    const multiQtyMatch = line.match(/^(.+?)\s+(\d+)\s*[xX*]\s*([\d,.]+)\s+([\d,.]+)\s*$/);
    if (multiQtyMatch) {
      const name = multiQtyMatch[1].trim();
      const qty = parseInt(multiQtyMatch[2], 10);
      const rate = cleanAmountString(multiQtyMatch[3]) || 0;
      const total = cleanAmountString(multiQtyMatch[4]) || rate * qty;

      if (name.length >= 2 && total > 0) {
        candidateItems.push({
          id: `item_${candidateItems.length + 1}`,
          name,
          quantity: qty > 0 ? qty : 1,
          unitPricePaise: Math.round(rate * 100),
          totalPricePaise: Math.round(total * 100),
          confidence: 'HIGH',
          rawLine: line,
        });
        continue;
      }
    }

    // Format B & C: Trailing amount on line
    const trailingAmountMatch = line.match(/^(.+?)\s+([₹\u20B9\sINRrsRS.]*[\d,]+\.\d{2}|[\d,]+(?:\.\d+)?)\s*$/);
    if (trailingAmountMatch) {
      const rawName = trailingAmountMatch[1].trim();
      const amtStr = trailingAmountMatch[2];
      const parsedAmt = cleanAmountString(amtStr);

      // Check if rawName ends with a single digit quantity (e.g. "Paneer Masala 1")
      const qtySuffixMatch = rawName.match(/^(.+?)\s+(\d{1,2})$/);
      let name = rawName;
      let qty = 1;

      if (qtySuffixMatch) {
        name = qtySuffixMatch[1].trim();
        qty = parseInt(qtySuffixMatch[2], 10);
      }

      // Filter out lines that are purely numeric, dates, or too short
      if (
        name.length >= 2 &&
        parsedAmt !== null &&
        parsedAmt > 0 &&
        parsedAmt < 1000000 && // sanity check (< 10 lakhs)
        !/^\d+$/.test(name) && // name isn't just numbers
        !TOTAL_KEYWORDS.some((k) => name.toLowerCase().includes(k))
      ) {
        const totalPaise = Math.round(parsedAmt * 100);
        const unitPaise = qty > 0 ? Math.round(totalPaise / qty) : totalPaise;

        candidateItems.push({
          id: `item_${candidateItems.length + 1}`,
          name,
          quantity: qty,
          unitPricePaise: unitPaise,
          totalPricePaise: totalPaise,
          confidence: parsedAmt >= 1 ? 'HIGH' : 'MEDIUM',
          rawLine: line,
        });
      }
    }
  }

  // Pass 3: Mathematical Reconciliation & Inference
  const itemsSumPaise = candidateItems.reduce((acc, it) => acc + it.totalPricePaise, 0);

  // If subtotal wasn't explicitly extracted, infer from items sum
  if (detectedSubtotalPaise === 0) {
    detectedSubtotalPaise = itemsSumPaise;
  }

  // If total wasn't explicitly detected, calculate from components
  if (detectedTotalPaise === 0) {
    detectedTotalPaise =
      itemsSumPaise + detectedTaxPaise + detectedDeliveryPaise - detectedDiscountPaise;
  }

  // Calculate overall confidence
  let overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const expectedTotal = itemsSumPaise + detectedTaxPaise + detectedDeliveryPaise - detectedDiscountPaise;
  const discrepancy = Math.abs(detectedTotalPaise - expectedTotal);

  if (detectedTotalPaise > 0 && candidateItems.length > 0) {
    if (discrepancy <= 200) {
      // Within ₹2 reconciliation tolerance
      overallConfidence = 'HIGH';
    } else if (discrepancy <= 1000) {
      // Within ₹10
      overallConfidence = 'MEDIUM';
    } else {
      overallConfidence = 'LOW';
    }
  } else if (detectedTotalPaise > 0) {
    overallConfidence = 'MEDIUM';
  }

  return {
    vendor: detectedVendor,
    date: detectedDate,
    items: candidateItems,
    subtotalPaise: detectedSubtotalPaise,
    taxPaise: detectedTaxPaise,
    deliveryPaise: detectedDeliveryPaise,
    discountPaise: detectedDiscountPaise,
    totalPaise: detectedTotalPaise,
    confidence: overallConfidence,
    rawText,
  };
}
