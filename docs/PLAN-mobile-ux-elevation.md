# Project Plan: Full Mobile UX Elevation (Option B)

**Plan Slug:** `PLAN-mobile-ux-elevation.md`  
**Target:** Mobile Experience Polish across Personal Vault, Room Ledger, and Profile  
**Status:** Ready for Execution  

---

## 1. Objectives & Goals
1. **Interactive Form Validation (No Silent Disabled Buttons)**:
   - When a student taps "Save Private Expense" or "Confirm & Split Bill" with missing required fields (Description or Amount), never freeze silently.
   - Smoothly auto-scroll up to the missing field.
   - Highlight the input with a distinct red border (`border-rose-400 focus:border-rose-500 bg-rose-50/20`), an inline red required indicator `* Required`, and an inline error message (*"Description is required to save"*).
   - Auto-focus the input so the keyboard opens immediately.
   - Trigger tactile alert haptics (`hapticWarning()`).

2. **Category-Based Smart Quick-Description Chips**:
   - Provide student-tailored quick chips below the description input based on the chosen category (e.g. Food -> `[Chai ☕]`, `[Lunch 🍲]`, `[Groceries 🛒]`, `[Swiggy 🍕]`; Travel -> `[Metro 🚇]`, `[Auto 🛺]`).
   - Tapping any chip fills the field instantly and clears error states.

3. **Accidental Deletion Protection (Undo Snackbar)**:
   - Provide optimistic expense deletion in the Vault with a 4-second floating "Undo" snackbar.
   - Tapping "Undo" restores the record immediately with zero data loss.

4. **Settle Up 1-Tap Presets**:
   - Provide quick 1-tap settlement chips (`Pay Full Debt`, `Pay Half`, `Round to ₹100`).

5. **Editable Real UPI VPA in Profile**:
   - Allow students to input and update their actual bank UPI ID with live regex format validation.

---

## 2. Component Breakdown & Task Allocation

### Phase 1: Personal Vault Form Validation & Quick-Fill
- **Target File:** `src/components/mobile/MobilePersonalVault.tsx`
- **Tasks:**
  - [ ] Add `useRef` for `titleInputRef` and `amountInputRef`.
  - [ ] Add `validationErrors` state (`{ title?: string; amount?: string }`).
  - [ ] Remove `disabled={!title.trim() || ...}` from the `Save Private Expense` button.
  - [ ] Implement `validateAndScroll()`: smooth-scroll to first invalid input, focus, highlight red border, display red `*` and helper message.
  - [ ] Implement `CATEGORY_QUICK_CHIPS` map and horizontal chip carousel.
  - [ ] Add dynamic error clearance on typing / chip click.

### Phase 2: Accidental Deletion Protection (Undo Snackbar)
- **Target File:** `src/components/mobile/MobilePersonalVault.tsx`
- **Tasks:**
  - [ ] Add `pendingDeletion` state with timer and `hiddenExpenseIds` set.
  - [ ] Render floating bottom Undo snackbar with remaining time progress bar.
  - [ ] Add "Undo" handler that cancels timer and unhides expense.
  - [ ] Finalize deletion on timer expiry via `onDeleteExpense`.

### Phase 3: Room Ledger Form Parity & Settle Up Shortcuts
- **Target File:** `src/components/mobile/MobileRoomLedger.tsx`
- **Tasks:**
  - [ ] Remove `disabled` condition on `Confirm & Split Bill` button.
  - [ ] Add `titleInputRef`, scroll-to-field, red border, and inline warning on empty description.
  - [ ] Add `SHARED_QUICK_CHIPS` (`WiFi Bill`, `Electricity`, `Groceries`, etc.).
  - [ ] Add 1-tap quick buttons in Settle Up modal (`Pay Full ₹X`, `Pay Half ₹Y`).

### Phase 4: Profile Real UPI ID Editing
- **Target File:** `src/components/mobile/MobileProfile.tsx`
- **Tasks:**
  - [ ] Add state for editable UPI VPA with edit/save mode.
  - [ ] Validate VPA regex (`^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`).
  - [ ] Add Copy UPI button with visual feedback.
  - [ ] Persist changes to user state & local storage.

---

## 3. Verification Checklist
- [ ] Form submission without description scrolls to description, highlights red, shows `* Required`, and focuses.
- [ ] Category quick chips populate description in 1 tap.
- [ ] Deleting an expense shows `Expense deleted • Undo` snackbar; tapping Undo restores it.
- [ ] Shared bill form auto-scrolls to missing fields with red highlights.
- [ ] Profile UPI ID can be edited, validated, and copied.
- [ ] `npm run build` succeeds with zero errors.
