# Implementation Plan: Personal Vault Add Window & App Theme Harmony

## 1. Problem Statement & Root Cause
- **Regression in Personal Vault Add Window**:
  - `MobileBottomSheet` was positioned with `fixed md:absolute inset-0`. When rendered inside `MobilePersonalVault`, which was inside `<div className="flex-1 overflow-y-auto relative pb-nav-safe">`, it anchored to the inner scroll container instead of the mobile phone simulator.
  - Flexbox `items-end` combined with excessive vertical form height pushed the top inputs (Amount, Presets, Title) off-screen, leaving users unable to see or fill in the expense amount.
  - Excessive bottom padding (`56px`) created a blank void at the bottom, and allowed list items (`... Other ₹0`) to peek through beneath the sheet.
- **Theme Mismatch in Recurring Bills & Modals**:
  - `RecurringBillsModal.tsx` contained hardcoded dark-mode classes (`text-white`, `bg-slate-950/40`, `border-slate-800`), causing invisible white text on white backgrounds in light mode, as well as a harsh dark slate box.
  - Modals broke out of the mobile simulator on desktop view instead of behaving as a native bottom sheet.

## 2. Solution Architecture
1. **`src/components/mobile/MobileBottomSheet.tsx`**:
   - Add dark & light mode support: `bg-white dark:bg-[#12121A]`, `border-slate-200/90 dark:border-[#27354A]`, `text-slate-900 dark:text-slate-100`.
   - Fix flexbox clipping: Ensure `flex flex-col justify-end`, `min-h-0` on scrollable content so it scrolls naturally without pushing header/top inputs off-screen.
   - Adjust bottom padding to avoid awkward void while preserving safe area.
2. **`src/components/mobile/MobileLayout.tsx`**:
   - Adjust the scrollable container wrapper so that `md:absolute` bottom sheets anchor to the phone frame container directly, covering the bottom nav cleanly when open.
3. **`src/components/mobile/MobilePersonalVault.tsx`**:
   - Streamline Add Private Expense form to match the user's selected "Clean & Streamlined" preference:
     - Prominent CurrencyInput with error feedback.
     - Fast preset chips (+₹50, +₹100, +₹200, +₹500, +₹1,000).
     - Clean Description input with autofocus and clear icons.
     - Ergonomic 2-row Category selection grid with active state.
     - Subtle, compact budget limit indicator.
     - Date input and full-width "Save Private Expense" action button.
   - Wire Recurring Bills on mobile to open via `RecurringBillsBottomSheet` or adaptive modal.
4. **`src/components/recurring/RecurringBillsModal.tsx`**:
   - Fully harmonize theme tokens across Light & Dark modes:
     - Text colors (`text-slate-900 dark:text-white`, `text-slate-500 dark:text-slate-400`).
     - Card & input surfaces (`bg-white dark:bg-[#12121A]`, `bg-slate-50 dark:bg-[#20202A]`).
     - Empty state styling (`border-slate-200 dark:border-slate-800`, `bg-slate-50 dark:bg-slate-900/40`).
     - Provide adaptive presentation for mobile bottom sheet vs desktop modal.

## 3. Verification & Testing
- Test light mode and dark mode rendering.
- Verify opening "Add Private Expense" inside Personal Vault: header, amount, and presets must be immediately visible without clipping.
- Verify bottom sheet cleanly covers the screen and backdrop without background items peeking through.
- Verify Recurring Bills modal has legible text, cohesive card colors, and matches the natural light & dark design system.
