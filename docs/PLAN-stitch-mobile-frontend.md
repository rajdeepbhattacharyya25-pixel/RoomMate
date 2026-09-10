# Project Plan: Stitch-Powered Mobile Frontend for Student Expense App

**File:** `docs/PLAN-stitch-mobile-frontend.md`  
**Mode:** PLANNING ONLY  
**Task Slug:** `stitch-mobile-frontend`  
**Target:** Natural, ergonomic, touch-first mobile frontend for Student Expense App using Stitch MCP, design-md, stitch-loop, mobile-design, and ui-ux-pro-max.

---

## 1. Context & Objectives

- **Domain:** Student shared expenses (roommate flat splitting, personal vault, UPI settlements, SaaS subscription tiers).
- **Goal:** Design and build a production-grade, natural mobile frontend that avoids "vibe-coded" AI clichés (no gratuitous neon blobs, no unreadable glassmorphism, no cramped bento grids, no generic copy).
- **Core Technology:**
  - **Google Stitch MCP Server** for screen generation and design asset extraction (`deviceType: MOBILE`).
  - **`design-md` Skill** for establishing `DESIGN.md` as the semantic token source of truth.
  - **`stitch-loop` Skill** for iterative screen generation, asset retrieval, and baton passing.
  - **`mobile-design` & `ui-ux-pro-max` Skills** for touch targets (≥44pt/48dp), Fitts' Law thumb-zone layout, bottom sheet modals, tabular numbers, and performance optimization.
  - **`apply-hig` / `apply-material3`** for authentic iOS and Android platform design conventions.

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Responsibilities |
| :--- | :--- | :--- |
| **Design Systems Lead** | `design-md`, `ui-ux-pro-max` | Formulate `DESIGN.md` with semantic tokens, typography scales, touch rules, and anti-patterns. |
| **Stitch Generator** | `stitch-loop`, `stitch_mcp_server` | Create Stitch mobile project, craft screen prompts, generate mobile screens, download HTML and screenshot artifacts. |
| **Mobile Frontend Engineer** | `mobile-design`, `react-components` | Transform Stitch outputs into responsive, accessible React mobile components with state bindings to mock storage / Supabase. |
| **QA / Accessibility Auditor** | `clean-code`, `lint-and-validate` | Audit touch targets (≥44px), contrast ratios (≥4.5:1), responsive viewports (375px-430px), and execute TypeScript/lint checks. |

---

## 3. Screen Breakdown & Specifications

### Screen 1: Mobile Dashboard (`/mobile/dashboard`)
- **Header:** Persona avatar, student greeting ("Hey Rajdeep 👋"), active room badge ("Flat 402 Boys"), notifications.
- **Hero Balance:** Net balance card ("You get back ₹1,450" vs "You owe ₹620"), personal month-to-date spending.
- **Thumb-Zone Quick Actions:**
  - `+ Add Personal Expense`
  - `⚡ Split Room Bill`
  - `📲 Settle via UPI`
- **Recent Feed:** Combined transactions (personal lock icon 🔒 vs room tags).
- **Navigation:** Persistent bottom tab bar (Dashboard, Personal, Rooms, Activity, Profile).

### Screen 2: Personal Expense Vault (`/mobile/personal`)
- **Monthly Budget Thermometer:** Spent vs budget remaining bar, burn-rate velocity indicator.
- **Category Chips:** Food, Groceries, Academics, Travel, Entertainment, Health.
- **Quick-Add Bottom Sheet:** Touch-friendly numpad with quick chips (+₹50, +₹100, +₹500), category pills, date, notes.

### Screen 3: Room Ledger & Split Calculator (`/mobile/rooms`)
- **Active Room Selector:** Horizontal tabs for user's rooms + 6-digit invite code badge.
- **Debt Matrix (Who Owes Whom):** Simplified peer-to-peer debt summary tiles.
- **Split Bill Flow:**
  - Total Amount input with currency symbol (₹).
  - Paid By selector (You, Kabir, Dev, Priya).
  - Split Method tabs: `Equally`, `Exact ₹`, `Percentage %`, `Shares`.
  - Live share preview calculation before saving.
- **Settle Up Modal:** Peer selector → Amount → Generate UPI intent link (`upi://pay?pa=...`) and instant QR code.

### Screen 4: Room Member Management & Invites (`/mobile/rooms/manage`)
- **Room Details & Role Badges:** Room Admin vs Member, status toggles.
- **Invite Hub:** 6-digit code card, WhatsApp sharing button, QR code for in-person scanning.

### Screen 5: Student SaaS Profile & Subscriptions (`/mobile/profile`)
- **Student ID Card:** Name, university email, linked UPI ID.
- **Subscription Status:** Plan tier (`FREE` / `PRO ₹49/mo` / `CAMPUS MAX`), renewal timer, Razorpay billing trigger.
- **Dev Persona Switcher:** One-tap switcher between Rajdeep (Student), Priya (Room Admin), Kabir (Roommate), Super Admin.

---

## 4. Phase-by-Phase Task List

### Phase 1: Semantic Design System Formulation (`DESIGN.md`)
- [ ] Draft `DESIGN.md` with:
  - Color palette: Deep Slate (`#0F172A`), Card Slate (`#1E293B`), Emerald (`#10B981`), Amber (`#F59E0B`), Crisp Text (`#F8FAFC`).
  - Typography: IBM Plex Sans / Inter, tabular numbers for currency.
  - Spacing & Geometry: 8pt grid, 12-16px rounded corners, 1px subtle borders.
  - Mobile constraints: Minimum 44x44px touch targets, bottom navigation, bottom sheets.

### Phase 2: Stitch MCP Mobile Generation
- [ ] Call `stitch:create_project` to initialize `"Student Expense Mobile App"` (`deviceType: MOBILE`).
- [ ] Generate Screen 1: Mobile Dashboard via `stitch:generate_screen_from_text`.
- [ ] Generate Screen 2: Personal Vault & Quick-Add Sheet via `stitch:generate_screen_from_text`.
- [ ] Generate Screen 3: Room Ledger & Split Calculator via `stitch:generate_screen_from_text`.
- [ ] Generate Screen 4: Settle Up & UPI Payment Screen via `stitch:generate_screen_from_text`.
- [ ] Download screen HTML and screenshot assets to `docs/stitch-output/`.

### Phase 3: Mobile Component Integration
- [ ] Create mobile container & viewport switcher (`MobileViewport.tsx`, `MobileTabNav.tsx`).
- [ ] Implement `MobileDashboard.tsx`.
- [ ] Implement `MobilePersonalVault.tsx` with ergonomic quick-add sheet.
- [ ] Implement `MobileRoomLedger.tsx` with multi-method split modal and UPI QR generator.
- [ ] Implement `MobileProfile.tsx` with subscription controls.
- [ ] Wire touch feedback, haptics emulation, and state syncing with `mockStorage.ts`.

### Phase 4: Verification & Audit
- [ ] TypeScript check (`tsc -b`).
- [ ] Linter check (`npm run lint` / `oxlint`).
- [ ] Mobile UX audit (touch targets, no horizontal overflows, 375px/390px/412px responsive checks).
- [ ] End-to-end split calculation and settlement verification.

---

## 5. Verification Checklist (Phase X)

- [ ] Zero lint warnings or TypeScript errors.
- [ ] All interactive buttons and inputs have minimum 44px height and width.
- [ ] Touch targets have at least 8px spacing to prevent accidental taps.
- [ ] Indian Rupee currency (₹) formatted with tabular numbers.
- [ ] Bottom sheet modals smoothly open from bottom on touch.
- [ ] Debt simplification correctly balances roommate splits.
- [ ] UPI QR and intent links generated properly.
