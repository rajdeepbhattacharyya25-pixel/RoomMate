import { describe, it, expect } from 'vitest';
import { parseReceiptText } from '../../lib/ocr/receiptTextParser';

describe('Phase 1: Receipt Text Parser (Indian Retail & Restaurant Heuristics)', () => {
  it('parses standard supermarket receipt with items, GST, discount and total', () => {
    const rawReceipt = `
      BigBasket Supermarket
      Tax Invoice
      GSTIN: 27AABCB1234F1Z5
      Date: 25/10/2026
      Bill No: BB-998877

      Amul Taaza Milk 1L 2 x 33.00 66.00
      Whole Wheat Bread 45.00
      Fortune Sunflower Oil 1L 140.00
      Lays Potato Chips 20.00

      Sub Total: 271.00
      CGST 2.5%: 6.78
      SGST 2.5%: 6.78
      Festival Discount: 20.00
      Total Amount: 264.56

      Thank you for shopping!
    `;

    const result = parseReceiptText(rawReceipt);

    expect(result.vendor).toBe('BigBasket Supermarket');
    expect(result.date).toBe('2026-10-25');
    expect(result.items.length).toBe(4);

    expect(result.items[0].name).toContain('Amul Taaza Milk 1L');
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].totalPricePaise).toBe(6600);

    expect(result.items[1].name).toContain('Whole Wheat Bread');
    expect(result.items[1].totalPricePaise).toBe(4500);

    expect(result.items[2].name).toContain('Fortune Sunflower Oil 1L');
    expect(result.items[2].totalPricePaise).toBe(14000);

    expect(result.items[3].name).toContain('Lays Potato Chips');
    expect(result.items[3].totalPricePaise).toBe(2000);

    expect(result.subtotalPaise).toBe(27100);
    expect(result.taxPaise).toBe(1356); // 678 + 678
    expect(result.discountPaise).toBe(2000);
    expect(result.totalPaise).toBe(26456);
    expect(result.confidence).toBe('HIGH');
  });

  it('parses Indian restaurant bill with multiple dishes and service charge', () => {
    const restaurantBill = `
      Pind Balluchi Dhaba & Restaurant
      Order #42
      Date: 2026-10-30
      Cashier: Ramesh

      Paneer Butter Masala 280.00
      Garlic Naan 3 150.00
      Dal Makhani 220.00
      Jeera Rice 140.00
      Service Charge 50.00
      GST 5% 39.50

      Grand Total: 879.50
    `;

    const result = parseReceiptText(restaurantBill);

    expect(result.vendor).toBe('Pind Balluchi Dhaba & Restaurant');
    expect(result.date).toBe('2026-10-30');
    expect(result.items.length).toBe(4);
    expect(result.deliveryPaise).toBe(5000); // Service charge classified under delivery/surcharges
    expect(result.taxPaise).toBe(3950);
    expect(result.totalPaise).toBe(87950);
    expect(result.confidence).toBe('HIGH');
  });

  it('correctly handles Blinkit / Zepto quick commerce receipts with delivery fees', () => {
    const qCommerce = `
      Blinkit Delivery
      Date: 28/10/2026
      
      Eggs Pack of 6 55.00
      Maggi 4 Pack 56.00
      Coca Cola 750ml 40.00
      Delivery Fee 25.00
      Handling Fee 5.00
      
      Total Payable: ₹181.00
    `;

    const result = parseReceiptText(qCommerce);

    expect(result.vendor).toBe('Blinkit Delivery');
    expect(result.date).toBe('2026-10-28');
    expect(result.items.length).toBe(3);
    expect(result.deliveryPaise).toBe(3000); // 25 + 5
    expect(result.totalPaise).toBe(18100);
    expect(result.confidence).toBe('HIGH');
  });

  it('infers total when total line is missing or obscured', () => {
    const receiptWithoutExplicitTotal = `
      Local Sabzi Mandi
      Date: 2026-10-29
      
      Tomato 1kg 40.00
      Potato 2kg 60.00
      Onion 1kg 50.00
    `;

    const result = parseReceiptText(receiptWithoutExplicitTotal);

    expect(result.items.length).toBe(3);
    // 40 + 60 + 50 = 150
    expect(result.totalPaise).toBe(15000);
    expect(result.subtotalPaise).toBe(15000);
  });

  it('safely handles empty or corrupt input strings', () => {
    const emptyResult = parseReceiptText('');
    expect(emptyResult.items).toHaveLength(0);
    expect(emptyResult.totalPaise).toBe(0);
    expect(emptyResult.confidence).toBe('LOW');

    const garbageResult = parseReceiptText('asdfghjkl #$%^&*()');
    expect(garbageResult.items).toHaveLength(0);
    expect(garbageResult.totalPaise).toBe(0);
  });
});
