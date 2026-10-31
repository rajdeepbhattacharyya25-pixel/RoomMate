import { describe, it, expect } from 'vitest';
import {
  calculateReceiptItemSplits,
  ReceiptAllocationParams,
} from '../../lib/ocr/itemSplitAllocation';
import { ParsedReceiptItem } from '../../lib/ocr/receiptTextParser';

describe('Phase 2: Integer Paise Item-Level Splitting & Proration Engine', () => {
  const mockItem = (id: string, name: string, pricePaise: number): ParsedReceiptItem => ({
    id,
    name,
    quantity: 1,
    unitPricePaise: pricePaise,
    totalPricePaise: pricePaise,
    confidence: 'HIGH',
    rawLine: `${name} ${pricePaise / 100}`,
  });

  it('allocates distinct items to different roommates with proportional tax and discount', () => {
    // 3 items:
    // Item 1: Milk (₹60.00 / 6000 paise) -> Alice & Bob
    // Item 2: Bread (₹40.00 / 4000 paise) -> Bob only
    // Item 3: Coffee (₹100.00 / 10000 paise) -> Alice only
    // Subtotal: ₹200.00 (20000 paise)
    // Tax 5%: ₹10.00 (1000 paise)
    // Discount: ₹20.00 (2000 paise)
    // Total Payable: ₹190.00 (19000 paise)

    const params: ReceiptAllocationParams = {
      items: [
        {
          item: mockItem('1', 'Amul Milk', 6000),
          assignedUserIds: ['user-alice', 'user-bob'],
        },
        {
          item: mockItem('2', 'Wheat Bread', 4000),
          assignedUserIds: ['user-bob'],
        },
        {
          item: mockItem('3', 'Nescafe Coffee', 10000),
          assignedUserIds: ['user-alice'],
        },
      ],
      taxPaise: 1000,
      deliveryPaise: 0,
      discountPaise: 2000,
      totalReceiptPaise: 19000,
    };

    const summary = calculateReceiptItemSplits(params);

    expect(summary.isReconciled).toBe(true);
    expect(summary.reconciliationDeltaPaise).toBe(0);
    expect(summary.allocatedTotalPaise).toBe(19000);

    const alice = summary.userAllocations['user-alice'];
    const bob = summary.userAllocations['user-bob'];

    // Base items:
    // Alice: 3000 (half of milk) + 10000 (coffee) = 13000 paise (65% of subtotal)
    // Bob: 3000 (half of milk) + 4000 (bread) = 7000 paise (35% of subtotal)
    expect(alice.itemsSharePaise).toBe(13000);
    expect(bob.itemsSharePaise).toBe(7000);

    // Prorated Net Overhead (-1000 paise):
    // Alice 65% of -1000 = -650 paise (-₹6.50) -> Total = 13000 - 650 = 12350 paise (₹123.50)
    // Bob 35% of -1000 = -350 paise (-₹3.50) -> Total = 7000 - 350 = 6650 paise (₹66.50)
    expect(alice.totalOwedPaise + bob.totalOwedPaise).toBe(19000);
    expect(alice.totalOwedRupees).toBe(123.5);
    expect(bob.totalOwedRupees).toBe(66.5);
  });

  it('handles indivisible remainder paise cleanly (100 paise split 3 ways)', () => {
    const params: ReceiptAllocationParams = {
      items: [
        {
          item: mockItem('1', 'Candy', 100), // ₹1.00
          assignedUserIds: ['u1', 'u2', 'u3'],
        },
      ],
      taxPaise: 0,
      deliveryPaise: 0,
      discountPaise: 0,
      totalReceiptPaise: 100,
    };

    const summary = calculateReceiptItemSplits(params);
    expect(summary.isReconciled).toBe(true);

    const shares = [
      summary.userAllocations['u1'].totalOwedPaise,
      summary.userAllocations['u2'].totalOwedPaise,
      summary.userAllocations['u3'].totalOwedPaise,
    ];

    // Remainder 100 % 3 = 1 -> First user gets 34, other two get 33
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('guarantees 100% mathematical reconciliation across 100 randomized receipt scenarios', () => {
    for (let run = 0; run < 100; run++) {
      const numItems = Math.floor(Math.random() * 8) + 1;
      const numUsers = Math.floor(Math.random() * 4) + 2;
      const userIds = Array.from({ length: numUsers }, (_, i) => `user_${i + 1}`);

      let subtotal = 0;
      const items = Array.from({ length: numItems }, (_, idx) => {
        const price = Math.floor(Math.random() * 15000) + 100; // ₹1 to ₹150
        subtotal += price;

        // Assign to random subset of users
        const assigned = userIds.filter(() => Math.random() > 0.4);
        return {
          item: mockItem(`it_${idx}`, `Item ${idx}`, price),
          assignedUserIds: assigned.length > 0 ? assigned : [userIds[0]],
        };
      });

      const tax = Math.floor(Math.random() * 1500); // 0 to ₹15
      const delivery = Math.floor(Math.random() * 3000); // 0 to ₹30
      const discount = Math.floor(Math.random() * 2000); // 0 to ₹20
      const expectedTotal = Math.max(100, subtotal + tax + delivery - discount);

      const summary = calculateReceiptItemSplits({
        items,
        taxPaise: tax,
        deliveryPaise: delivery,
        discountPaise: discount,
        totalReceiptPaise: expectedTotal,
      });

      expect(summary.isReconciled).toBe(true);
      expect(summary.allocatedTotalPaise).toBe(expectedTotal);
      expect(summary.reconciliationDeltaPaise).toBe(0);
    }
  });
});
