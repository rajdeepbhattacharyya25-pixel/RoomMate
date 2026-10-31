/**
 * itemSplitAllocation.ts
 *
 * Integer Paise Precision Item-Level Splitting & Proration Engine.
 *
 * Distributes multi-item grocery/restaurant receipts among roommates:
 * 1. Divides individual item costs among assigned roommates.
 * 2. Prorates taxes, delivery charges, and discounts proportionally.
 * 3. Enforces zero float drift with mathematical remainder absorption,
 *    guaranteeing sum(liabilities) === totalReceiptPaise to the exact paise.
 */

import { ParsedReceiptItem } from './receiptTextParser';

export interface ItemAssignmentInput {
  item: ParsedReceiptItem;
  assignedUserIds: string[]; // At least 1 member must be assigned
}

export interface UserItemSplitCalculation {
  userId: string;
  itemsSharePaise: number;
  taxSharePaise: number;
  deliverySharePaise: number;
  discountSharePaise: number;
  totalOwedPaise: number;
  totalOwedRupees: number;
  assignedItems: Array<{
    itemId: string;
    name: string;
    rawPricePaise: number;
    userPortionPaise: number;
  }>;
}

export interface ReceiptAllocationParams {
  items: ItemAssignmentInput[];
  taxPaise: number;
  deliveryPaise: number;
  discountPaise: number;
  totalReceiptPaise: number; // Ground truth total from receipt
  fallbackPayerUserId?: string;
}

export interface ReceiptAllocationSummary {
  totalReceiptPaise: number;
  allocatedTotalPaise: number;
  reconciliationDeltaPaise: number;
  isReconciled: boolean;
  userAllocations: Record<string, UserItemSplitCalculation>;
}

/**
 * Calculates exact per-roommate liabilities from itemized receipt assignments.
 */
export function calculateReceiptItemSplits(
  params: ReceiptAllocationParams
): ReceiptAllocationSummary {
  const {
    items,
    taxPaise = 0,
    deliveryPaise = 0,
    discountPaise = 0,
    totalReceiptPaise,
    fallbackPayerUserId,
  } = params;

  // Initialize tracking containers
  const userAllocations: Record<string, UserItemSplitCalculation> = {};

  const ensureUser = (uid: string) => {
    if (!userAllocations[uid]) {
      userAllocations[uid] = {
        userId: uid,
        itemsSharePaise: 0,
        taxSharePaise: 0,
        deliverySharePaise: 0,
        discountSharePaise: 0,
        totalOwedPaise: 0,
        totalOwedRupees: 0,
        assignedItems: [],
      };
    }
    return userAllocations[uid];
  };

  // Step 1: Divide base items among assigned roommates
  let totalBaseItemsPaise = 0;

  for (const itemInput of items) {
    const { item, assignedUserIds } = itemInput;
    const pricePaise = item.totalPricePaise;
    totalBaseItemsPaise += pricePaise;

    if (!assignedUserIds || assignedUserIds.length === 0) {
      // If unassigned, allocate to fallback payer or skip
      if (fallbackPayerUserId) {
        const u = ensureUser(fallbackPayerUserId);
        u.itemsSharePaise += pricePaise;
        u.assignedItems.push({
          itemId: item.id,
          name: item.name,
          rawPricePaise: pricePaise,
          userPortionPaise: pricePaise,
        });
      }
      continue;
    }

    const n = assignedUserIds.length;
    const baseShare = Math.floor(pricePaise / n);
    const remainder = pricePaise % n;

    for (let i = 0; i < n; i++) {
      const uid = assignedUserIds[i];
      const u = ensureUser(uid);
      // Remainder paise are distributed 1 paise each to the first 'remainder' users
      const portion = baseShare + (i < remainder ? 1 : 0);
      u.itemsSharePaise += portion;
      u.assignedItems.push({
        itemId: item.id,
        name: item.name,
        rawPricePaise: pricePaise,
        userPortionPaise: portion,
      });
    }
  }

  // Step 2: Prorate Overhead (Taxes, Delivery, Discounts)
  const allUserIds = Object.keys(userAllocations);

  if (allUserIds.length > 0 && totalBaseItemsPaise > 0) {
    for (const uid of allUserIds) {
      const u = userAllocations[uid];
      const consumptionRatio = u.itemsSharePaise / totalBaseItemsPaise;

      u.taxSharePaise = Math.round(taxPaise * consumptionRatio);
      u.deliverySharePaise = Math.round(deliveryPaise * consumptionRatio);
      u.discountSharePaise = Math.round(discountPaise * consumptionRatio);

      // Raw total preliminary owed
      u.totalOwedPaise =
        u.itemsSharePaise +
        u.taxSharePaise +
        u.deliverySharePaise -
        u.discountSharePaise;
    }
  } else if (allUserIds.length > 0 && totalBaseItemsPaise === 0) {
    // If no items extracted but total exists, split equally
    const n = allUserIds.length;
    const equalShare = Math.floor(totalReceiptPaise / n);
    const remainder = totalReceiptPaise % n;
    allUserIds.forEach((uid, idx) => {
      userAllocations[uid].totalOwedPaise = equalShare + (idx < remainder ? 1 : 0);
    });
  }

  // Step 3: Exact Integer Paise Rounding Reconciliation Invariant
  // sum(totalOwedPaise) MUST exactly equal totalReceiptPaise
  let currentAllocatedSum = 0;
  for (const uid of allUserIds) {
    currentAllocatedSum += userAllocations[uid].totalOwedPaise;
  }

  const discrepancy = totalReceiptPaise - currentAllocatedSum;

  if (discrepancy !== 0 && allUserIds.length > 0) {
    // Absorb 1-2 paise discrepancy into highest consumer (or fallback payer)
    let targetUid = fallbackPayerUserId && userAllocations[fallbackPayerUserId]
      ? fallbackPayerUserId
      : allUserIds[0];

    // Find user with highest liability to absorb discrepancy fairly
    let maxLiability = -Infinity;
    for (const uid of allUserIds) {
      if (userAllocations[uid].totalOwedPaise > maxLiability) {
        maxLiability = userAllocations[uid].totalOwedPaise;
        targetUid = uid;
      }
    }

    userAllocations[targetUid].totalOwedPaise += discrepancy;
    currentAllocatedSum += discrepancy;
  }

  // Finalize rupees representation (round2)
  for (const uid of allUserIds) {
    userAllocations[uid].totalOwedRupees = userAllocations[uid].totalOwedPaise / 100;
  }

  return {
    totalReceiptPaise,
    allocatedTotalPaise: currentAllocatedSum,
    reconciliationDeltaPaise: totalReceiptPaise - currentAllocatedSum,
    isReconciled: currentAllocatedSum === totalReceiptPaise,
    userAllocations,
  };
}
