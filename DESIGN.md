# Design System: Student Expense Mobile App
**Device Target:** Mobile (Touch-First, 390px base width, 44pt/48dp touch targets)

## 1. Visual Theme & Atmosphere
The design system embodies **"Tactile Campus Precision"**—a clean, high-trust financial companion tailored for student living and roommate expense sharing. It rejects the generic "vibe-coded" AI tropes (no oversaturated purple/cyan neon glows, no unreadable milky glassmorphism, no cramped bento grids). 

Instead, the atmosphere is:
- **Calm, Authoritative & Legible:** Deep Slate base with crisp, warm text and distinct tactile card elevation.
- **Ergonomic & Thumb-Friendly:** Primary controls, bottom sheets, and split triggers sit naturally in the lower 40% of the screen (Fitts' Law thumb zone).
- **Direct & Transparent:** Indian Rupee amounts (₹) are rendered with tabular numerical alignment for effortless financial scanning.

---

## 2. Color Palette & Roles

| Role | Descriptive Name | Hex Code | Purpose & Function |
| :--- | :--- | :--- | :--- |
| **Surface Base** | Midnight Slate | `#0A0F1D` | Canvas background that eliminates eye strain in dorm rooms. |
| **Surface Card** | Deep Navy Slate | `#131C2E` | Primary container surface for ledger cards, transaction items, and balance summaries. |
| **Surface Elevated** | Midnight Charcoal | `#1E293B` | Interactive input containers, numpad keys, and segmented tab strips. |
| **Border Subtle** | Muted Slate Edge | `#27354A` | 1px clean containment boundary; crisp, never blurry or glowing. |
| **Primary Positive** | Emerald Mint | `#10B981` | Credits, money owed to you ("You get back"), settled payments, success states. |
| **Warning / Debit** | Warm Amber | `#F59E0B` | Pending debts ("You owe"), payment reminders, split alerts. |
| **Interactive Accent** | Electric Indigo | `#6366F1` | Primary CTA buttons, active bottom nav indicators, selected category chips. |
| **Text Primary** | Pure Ivory Chalk | `#F8FAFC` | Main headings, large financial values, member names (contrast 12:1). |
| **Text Muted** | Cool Slate Silver | `#94A3B8` | Dates, category tags, payment split ratios, secondary descriptions. |
| **Destructive** | Crimson Rose | `#F43F5E` | Delete expense, cancel invite, leave room actions. |

---

## 3. Typography Rules
- **Primary Workhorse:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Numbers & Currency:** `font-variant-numeric: tabular-nums` (ensures aligned decimals in financial figures like `₹1,240.00`).
- **Scale Hierarchy:**
  - **Display / Hero Balance:** `2rem` (`32px`), Bold `700`, line-height `1.15`, letter-spacing `-0.02em`.
  - **Screen Titles:** `1.25rem` (`20px`), Semi-Bold `600`, line-height `1.3`.
  - **Section Subheadings / Card Headers:** `0.875rem` (`14px`), Medium `500`, uppercase with `letter-spacing: 0.05em`.
  - **Body Text:** `0.9375rem` (`15px`), Regular `400`, line-height `1.5`.
  - **Micro Metadata / Badges:** `0.75rem` (`12px`), Medium `500`.

---

## 4. Component Stylings & Touch Rules

### Touch Targets (MANDATORY)
- All tappable buttons, list items, and input triggers must have **minimum 44px × 44px** hit area.
- Minimum **8px-12px spacing** between adjacent touch targets to eliminate accidental roommate taps.

### Buttons & CTAs
- **Primary Bottom Action:** Full-width thumb bar (`h-13` / `52px`), solid `#6366F1` (Indigo) with `#FFFFFF` text, `rounded-2xl` (16px), subtle inner highlight, no harsh glow.
- **Secondary / Ghost:** `#1E293B` background with 1px `#27354A` border, smooth press state (`scale(0.98)`).
- **Split Method Selector:** Segmented control with equal 4-way pill options (`Equally`, `Exact ₹`, `%`, `Shares`). Active pill is highlighted in `#6366F1`.

### Cards & Feed Items
- **Corner Radius:** `rounded-2xl` (16px) for major cards, `rounded-xl` (12px) for transaction rows.
- **Elevation:** Tonal layering (`#131C2E` on `#0A0F1D`) with subtle `box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4)`.
- **Feed Item Affordance:** Left-side color status bar (Emerald for money incoming, Amber for money outgoing, Slate for neutral).

### Bottom Sheet Modals
- Slides up from screen bottom with `rounded-t-3xl` (24px) corners.
- Visible drag handle pill (40px × 4px) in `#475569`.
- Backdrop: `rgba(10, 15, 29, 0.75)` with soft `backdrop-blur-sm`.

---

## 5. Layout & Thumb-Zone Strategy
- **Sticky / Fixed Bottom Tab Bar:** `h-16` (64px) with safe area padding, hosting 4 primary tabs:
  1. `Dashboard` (Home overview & quick stats)
  2. `Vault` (100% private student expense tracker)
  3. `Rooms` (Roommate ledger, split bill, UPI settlements)
  4. `Profile` (SaaS subscription, linked UPI, account switcher)
- **Floating Action Button (FAB):** Centered floating `+ Split / Add` thumb button with immediate action drawer.
- **Safe Area Inset:** `padding-bottom: max(16px, env(safe-area-inset-bottom))` for edge-to-edge mobile compatibility.
