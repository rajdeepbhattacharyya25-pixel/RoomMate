# PLAN: Room Member Departure & Financial Ledger Lifecycle

**Slug**: `room-member-lifecycle`  
**File**: `docs/PLAN-room-member-lifecycle.md`  
**Date**: 2026-09-12  
**Status**: APPROVED_PENDING_EXECUTION  

---

## 1. System Architecture: Separation of Concerns

```
                     ROOM
                      │
            ┌─────────┴─────────┐
            │                   │
       MEMBERSHIP           FINANCIAL LEDGER
            │                   │
     ACTIVE / LEFT /        Expenses
     REMOVED                Splits
                            Debts
                            Settlements

Core Invariant:
• Membership status determines eligibility for NEW expenses.
• Ledger history determines EXISTING obligations.
```

---

## 2. Critical Financial Invariants

1. **No False Clean Exits (Mutual Obligations)**:
   - A net balance of ₹0 does NOT mean zero obligations (e.g. A owes B ₹500, and C owes A ₹500).
   - An exit is deemed "Clean" **only if all pairwise debts and credits involving that member equal ₹0.00**.
   - `getOutstandingObligationsForMember(roomId, userId)` evaluates every individual bilateral debt.
2. **Creditor Departure Invariant**:
   - When a member leaves, all unresolved financial obligations involving that member are frozen with their existing payer/payee relationship preserved, regardless of whether the departing member is debtor or creditor (`B -> A ₹500`, A is `LEFT`, B is `ACTIVE`).
3. **Financial Equivalence of Exit and Removal**:
   - `LEFT` (voluntary) and `REMOVED` (admin action) have identical financial effects:
     - Excluded from future expenses.
     - Existing obligations remain frozen in the ledger.
     - Existing obligations can be settled post-departure.
     - Neither exit nor removal deletes, cancels, or forgives debt.
4. **Admin Protection & Succession**:
   - A `ROOM_ADMIN` cannot be removed by anyone (neither another admin nor self-removal).
   - Admins can only depart through the `leaveRoom` flow, which atomically promotes the oldest active member by `joined_at ASC`.
5. **Archived Room Ledger Preservation**:
   - When the last active member leaves, the room is marked `is_archived = true`.
   - Archival **NEVER** deletes or invalidates historical expenses, splits, settlements, or outstanding obligations.
6. **Backend Atomicity & Server Authorization**:
   - All room membership transitions in Supabase are performed through atomic Postgres RPCs (`leave_room`, `remove_room_member`) with caller verification via `auth.uid()`.
7. **Settlement Idempotency**:
   - Every settlement requires a client-generated UUID `id`. Duplicate submissions over unstable networks are safely deduplicated.
8. **Rejoining Clarity**:
   - Rejoining via invite code marks the user `ACTIVE` for new expenses; prior unsettled debts remain preserved as active ledger items.

---

## 3. Clear & Honest UX Copy

### Debtor Flow (User owes money)
- **Title**: *"You still owe ₹[Amount]"*
- **Body**: *"Leaving the room won't cancel this balance. Your ₹[Amount] debt will be frozen and can be settled with your former roommates later."*
- **CTAs**:
  - Primary: `[ Settle ₹[Amount] ]` (triggers UPI pay modal)
  - Secondary: `[ Leave with ₹[Amount] outstanding ]` (requires checkbox: *"I acknowledge that I still owe this amount to my former roommates"*)

### Creditor Flow (Roommates owe user)
- **Title**: *"You're owed ₹[Amount]"*
- **Body**: *"Leaving won't cancel this amount. Your former roommates can still settle with you later."*
- **CTAs**:
  - Primary: `[ Remind Roommates ]` (WhatsApp nudge)
  - Secondary: `[ Leave with ₹[Amount] credit ]`

### Clean Exit Flow (Zero mutual obligations)
- **Title**: *"All Settled ✅"*
- **Body**: *"You have no outstanding obligations or pending credits in [Room Name]. You can exit cleanly."*
- **CTA**: `[ Confirm & Leave Room ]`

---

## 4. 16-Scenario Automated Test Matrix

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Active member leaves with ₹0 obligations | `status = LEFT`, Clean Exit, no frozen debt |
| 2 | Net ₹0 with mutual debts (A owes B 500, C owes A 500) | `hasUnresolvedObligations = true`, blocks clean exit |
| 3 | Debtor leaves with ₹400 debt | Debt remains frozen and visible to creditor |
| 4 | Creditor leaves with ₹400 credit | Credit remains frozen, debtor still owes former member |
| 5 | Admin removes debtor | Debt remains frozen identically to voluntary exit |
| 6 | Admin removes creditor | Credit remains frozen identically to voluntary exit |
| 7 | Future bill added to room | Departed member excluded from participants; 0 split share |
| 8 | Former member full settlement | Direct settlement recorded, bilateral debt clears to ₹0 |
| 9 | Partial settlement | ₹500 owed, ₹200 paid -> exact ₹300 remaining preserved |
| 10 | Admin leaves with active members | Oldest active member promoted to `ROOM_ADMIN` |
| 11 | Last active member leaves | Room marked `is_archived = true`, obligations intact |
| 12 | Archived room integrity | Historical obligations in archived room remain queryable |
| 13 | Admin attempts to remove self | Rejected with error |
| 14 | Admin attempts to remove admin | Rejected with error |
| 15 | Non-admin attempts removal | Rejected with error |
| 16 | Duplicate settlement submission | Deduplicated by settlement ID without double-crediting |

---

## 5. Step-by-Step Task Breakdown

### Phase 1: Database & Backend Atomicity
- [ ] Task 1.1: Create Supabase SQL migration `supabase/migrations/20260912_room_member_lifecycle.sql` with atomic `leave_room` and `remove_room_member` RPCs using `auth.uid()`.
- [ ] Task 1.2: Apply migration to Supabase and verify RPC functions.
- [ ] Task 1.3: Update `src/lib/storage/mockStorage.ts` with atomic leave/remove logic, admin succession, and settlement idempotency.
- [ ] Task 1.4: Update `src/lib/storage/cloudStorageAdapter.ts` to call RPCs and handle local state sync.

### Phase 2: Ledger Engine & 16-Scenario Test Matrix
- [ ] Task 2.1: Add `getOutstandingObligationsForMember` and `canCleanExit` to `src/lib/ledger/engine.ts`.
- [ ] Task 2.2: Implement the full 16-Scenario Test Suite in `src/lib/ledger/engine.test.ts`.
- [ ] Task 2.3: Execute tests and verify 100% pass rate.

### Phase 3: Mobile Experience
- [ ] Task 3.1: Create `src/components/mobile/MobileLeaveRoomModal.tsx` implementing the revised UX copy and flows.
- [ ] Task 3.2: Wire up "Leave Room" and "Manage Roommates" in `src/components/mobile/MobileRoomLedger.tsx`.
- [ ] Task 3.3: Update mobile Settle Up modal and Simplified Settlements list to support former members with pending balances.
- [ ] Task 3.4: Filter active room selector in `src/components/mobile/MobileDashboard.tsx`.

### Phase 4: Desktop Experience
- [ ] Task 4.1: Integrate Leave Room modal and Admin Member Management modal in `src/components/RoomLedger.tsx`.
- [ ] Task 4.2: Update desktop Settle Up modal and Pairwise Debts matrix to support former members.
- [ ] Task 4.3: Wire handlers and room switching in `src/App.tsx`.

### Phase 5: Verification & Quality Assurance
- [ ] Execute automated test suite.
- [ ] Verify clean exit, mutual debt blocking, debtor leave, creditor leave, admin succession, and post-departure settlements in UI.
