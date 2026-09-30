# Project Plan: Progressive Feed Pagination ("Show More" & "View All")

**File:** `docs/PLAN-progressive-feed-load.md`  
**Mode:** PLANNING ONLY (No Code)  
**Task Slug:** `progressive-feed-load`  
**Target:** Personal Vault (`MobilePersonalVault.tsx`) & Room Ledger (`MobileRoomLedger.tsx`)  
**Pattern:** Option C — Hybrid Dynamic Paging (15 items batch, Show 15 More, View All, and Collapse to Top 15)

---

## 1. Context & Problem Statement

Currently, both the **Personal Vault** and **Room Ledger** render all monthly or filtered transactions directly into the mobile DOM in a single continuous list. When a student logs 30–80+ expenses in a month:
- Scrolling becomes tedious and tiring on touchscreens.
- Critical top summaries (monthly budget cards, category breakdowns, debt balances) are pushed far out of reach.
- The DOM footprint grows unnecessarily large on lower-end mobile devices.

### Desired Solution
Implement **Option C: Hybrid Dynamic Paging** with a batch size of **15 records**:
1. Initially render **15 records**.
2. If total records exceed 15, display a modern, tactile action bar below the 15th item:
   - **Primary Action Button:** `Show 15 More` with an active counter pill badge (e.g. `Showing 15 of 42 records`).
   - **Secondary Quick Action:** `View All (42)` for 1-tap complete expansion.
3. When expanded past 15 items, provide a clean `Collapse to Top 15` toggle so the user can immediately snap back to the compact view without scrolling back up.
4. Smoothly reset the pagination slice back to 15 whenever search queries, category filters, month pickers, or period tabs change.

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **UX & Frontend Architect** | `frontend-design`, `mobile-design` | Design mobile-tactile pagination bar with active badges, chevron animations, and dark mode styling matching RoomMate design tokens. |
| **Mobile Lead Developer** | `clean-code`, `react-patterns` | Implement slice logic & reset triggers in `MobilePersonalVault.tsx` and `MobileRoomLedger.tsx`. Ensure zero side-effects on expense deletion, editing, or balance math. |
| **QA & Verification Engineer** | `testing-patterns`, `checklist` | Validate filter/search transitions, empty states (< 15 items), boundary edge cases (= 15, = 16 items), and run code linting/type-checking. |

---

## 3. Interaction & State Machine Architecture

```
                       [ User opens Month / Tab / Filter ]
                                        │
                                        ▼
                           Total Expenses Count (N)
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
               N <= 15 items                           N > 15 items
                    │                                       │
                    ▼                                       ▼
            Render all N items                     Render slice(0, 15)
           (No pagination bar)                              │
                                                            ▼
                                                Display Action Bar:
                                                • [ ▾ Show 15 More (15/N) ]
                                                • [ View All (N) ]
                                                            │
                            ┌───────────────────────────────┴───────────────────────────────┐
                            ▼                                                               ▼
                 Tap "Show 15 More"                                                 Tap "View All (N)"
                            │                                                               │
                            ▼                                                               ▼
             limit = min(limit + 15, N)                                                  limit = N
                            │                                                               │
                            └───────────────────────────────┬───────────────────────────────┘
                                                            │
                                                            ▼
                                              Render slice(0, limit)
                                              + If limit >= N:
                                                Display: [ ▴ Show Less (Top 15) ]
                                              + If limit < N:
                                                Display: [ ▾ Show 15 More (limit/N) ] • [ View All ]
```

---

## 4. UI/UX Specifications

### A. Action Bar Component Design
- **Container:** Rounded-2xl card or pill bar with subtle border (`border-slate-200/80 dark:border-[#27354A]`).
- **Primary Button (`Show 15 More`):**
  - Indigo/violet-tinted background (`bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60`).
  - Text: `Show 15 More` with animated downward chevron `ChevronDown`.
  - Counter badge: Pill tag displaying `15 of 38` in tabular figures (`tabular-nums font-semibold`).
- **Secondary Action (`View All`):**
  - Ghost button / text link with tap target `>= 44px` per mobile HIG guidelines.
  - Text: `View All (38)`.
- **Collapse Action (`Show Less`):**
  - Displayed when the list has been expanded beyond 15 items (or completely viewed).
  - Text: `Show Less (Top 15)` with `ChevronUp` icon.
  - Automatically scrolls smoothly back to the top of the records card using `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.

### B. Filter & Search Reactivity
Whenever the user interacts with any filter control:
- Changing category chips (e.g. `All` ➔ `Food`)
- Typing in search input (`searchQuery`)
- Switching month / year using calendar navigation
- Switching period between `WEEK` / `MONTH` / `ALL`
The visible limit **must automatically reset to 15**.

---

## 5. Implementation Touchpoints

### 1. `src/components/mobile/MobilePersonalVault.tsx`
- **State Additions:**
  - `const [vaultVisibleLimit, setVaultVisibleLimit] = useState(15);`
  - `const VAULT_PAGE_SIZE = 15;`
- **Filter Reset Effects:**
  - Reset `vaultVisibleLimit` to 15 on change of `[selectedPeriod, selectedMonthIndex, selectedYear, selectedCategoryFilter, searchQuery]`.
- **Render Slice:**
  - `const displayedExpenses = filteredExpenses.slice(0, vaultVisibleLimit);`
- **Bottom Pagination Bar:**
  - Insert right after the expense cards list (around line 1135), before the month picker sheet.

### 2. `src/components/mobile/MobileRoomLedger.tsx`
- **State Additions:**
  - `const [ledgerVisibleLimit, setLedgerVisibleLimit] = useState(15);`
  - `const LEDGER_PAGE_SIZE = 15;`
- **Filter Reset Effects:**
  - Reset `ledgerVisibleLimit` to 15 on change of `[selectedMonthIndex, selectedYear, activeFilter]`.
- **Render Slice:**
  - `const displayedExpenses = monthlyRoomData.expenses.slice(0, ledgerVisibleLimit);`
- **Bottom Pagination Bar:**
  - Insert right after the shared expense list (around line 1490), keeping balances, totals, and export sheets intact.

### 3. Reusable Sub-Component (Optional / Recommended)
- Create or embed `ProgressiveListFooter.tsx` or an inline component to maintain 100% design consistency between Personal Vault and Room Ledger:
  ```typescript
  interface ProgressiveListFooterProps {
    currentCount: number;
    totalCount: number;
    pageSize: number;
    onShowMore: () => void;
    onViewAll: () => void;
    onShowLess: () => void;
  }
  ```

---

## 6. Edge Cases & Safeguards

1. **Total Count <= 15:**
   - Pagination bar is hidden completely. No unnecessary UI clutter.
2. **Total Count = 16 (Only 1 item left):**
   - The button adjusts gracefully to `Show 1 More (15 of 16)` or automatically expands cleanly.
3. **Expense Deletion while Expanded:**
   - If an expense is deleted while the user is viewing items 15–30, the list length decrements without out-of-bounds exceptions or UI flicker.
4. **Haptic Feedback:**
   - Trigger tactile feedback (`hapticImpact('light')` or `hapticSelection()`) on tap of *Show More*, *View All*, and *Show Less*.
5. **Scroll Position on Collapse:**
   - When tapping `Show Less (Top 15)`, smooth-scroll to the top of the feed container so the user isn't left stranded in blank space.

---

## 7. Verification Checklist

- [ ] Personal Vault renders exactly 15 records when >= 15 exist.
- [ ] Tapping "Show 15 More" loads the next 15 records (total 30) with haptic feedback.
- [ ] Tapping "View All" displays all records instantly.
- [ ] Tapping "Show Less" collapses list back to 15 and smoothly scrolls to top.
- [ ] Search input resets visible limit to 15.
- [ ] Switching categories or months resets visible limit to 15.
- [ ] Room Ledger (`MobileRoomLedger.tsx`) operates identically with the same 15-item paging pattern.
- [ ] Both light mode and dark mode styles match RoomMate tokens seamlessly.
- [ ] TypeScript passes with zero errors (`npm run build` or typecheck).
