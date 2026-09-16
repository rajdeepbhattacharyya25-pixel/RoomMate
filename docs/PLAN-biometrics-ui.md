# Project Plan: RoomMate Biometrics & App Lock UI Redesign (Stitch Theme)

**File:** `docs/PLAN-biometrics-ui.md`  
**Mode:** PLANNING ONLY (No code writing in this phase)  
**Task Slug:** `biometrics-ui`  
**Stitch Source Project:** [CampusFlow Expense Splitter - 7490169641002141903](https://stitch.withgoogle.com/projects/7490169641002141903)  
**Target Component:** [`src/components/mobile/AppLockGateway.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/AppLockGateway.tsx)

---

## 1. Problem Statement & Context

### The Issue
The current `AppLockGateway.tsx` modal was built as a dark, "vibe-coded" sci-fi screen (`bg-[#0A0E17]/95`, neon purple glow `shadow-[0_0_30px_rgba(99,102,241,0.25)]`, dark buttons, generic generic lock icon).
When the user locks the vault or cold-boots the mobile app, they encounter an abrupt, dark, jarring screen that completely clashes with:
1. The **Stitch Design System** (`projects/7490169641002141903`): Pure `#F9F9FF` light canvas, `#4F46E5` iOS system indigo, `#111827` primary ink, clean white inset cards, and zero gratuitous neon glow.
2. The **RoomMate Brand Identity**: Official RoomMate house emblem (`/logo.png` / gradient tile), emerald verification badge, and refined Apple Wallet / iOS native typography.

### Objective
Transform `AppLockGateway.tsx` into a cohesive, native-feeling biometric gateway matching the Stitch theme and the RoomMate brand guidelines:
- Light, distraction-free canvas (`#F9F9FF`) with subtle backdrop blur.
- High-trust elevated card (`#FFFFFF`, border `#E5E7EB`, rounded-3xl).
- Prominent RoomMate branding (official logo tile + emerald check badge + "RoomMate" typography + "Live Together. Spend Smarter.").
- Refined resident profile badge showing who is unlocking the vault.
- Primary thumb-zone biometric button (`h-13` / 52px, `#4F46E5`, tactile press scaling, Face ID / Fingerprint detection).
- Polished PIN entry fallback matching iOS passcode prompts with virtual numeric keypad (`inputMode="numeric"`).
- Accessible account switching CTA and private vault encryption label.

---

## 2. Design Specifications (Extracted from Stitch 7490169641002141903)

| Token Role | Hex Code | Stitch Specification / Usage |
| :--- | :--- | :--- |
| **Canvas / Background** | `#F9F9FF` | Clean daylight canvas matching MobileDashboard & MobileLogin. |
| **Surface Card** | `#FFFFFF` | Elevated central security card with 1px border (`#E5E7EB` / `slate-200/90`). |
| **Primary Indigo** | `#4F46E5` / `#3525CD` | Primary unlock CTA button, brand emblem background, focus rings. |
| **Positive / Verified** | `#10B981` / `#059669` | Emerald verification badge on logo, "Secured" status pill. |
| **Text Primary** | `#111827` / `#141B2B` | "RoomMate Vault Locked" header, PIN input digits. |
| **Text Muted** | `#6B7280` / `#464555` | "Protected personal finances & room ledger for", encryption subtext. |
| **Surface Inset / Muted** | `#F1F3FF` / `#F9FAFB` | Resident badge background, PIN input container, secondary button fill. |
| **Border Subtle** | `#E5E7EB` / `#DCE2F7` | 1px hairline dividers and container bounds. |

---

## 3. UI Component Architecture & Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    Backdrop: #F9F9FF/98                     │
│                                                             │
│       ┌─────────────────────────────────────────────┐       │
│       │         Central Card (max-w-[380px])        │       │
│       │                                             │       │
│       │              [ RoomMate Logo ]              │       │
│       │           (Indigo Tile + Verified)          │       │
│       │                                             │       │
│       │                  RoomMate                   │       │
│       │        Live Together. Spend Smarter.        │       │
│       │                                             │       │
│       │        [ 🔒 Flat 302 • Vault Locked ]       │       │
│       │                                             │       │
│       │         [ 👤 Rajdeep • Student ]            │       │
│       │                                             │       │
│       │  ┌───────────────────────────────────────┐  │       │
│       │  │  [Fingerprint] Unlock with Biometrics │  │       │
│       │  └───────────────────────────────────────┘  │       │
│       │                                             │       │
│       │  ┌───────────────────────────────────────┐  │       │
│       │  │    [Key] Unlock with PIN Instead      │  │       │
│       │  └───────────────────────────────────────┘  │       │
│       │                                             │       │
│       │       Switch Resident Account or Sign In    │       │
│       │                                             │       │
│       │        🔒 256-bit Encrypted Local Vault      │       │
│       └─────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Phase-by-Phase Task Breakdown

### Phase 1: Brand & Container Restyling
- [ ] Replace dark overlay `bg-[#0A0E17]/95` with Stitch canvas `bg-[#F9F9FF]/98 backdrop-blur-xl`.
- [ ] Wrap lock content in an elevated card `bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm` to match `MobileLogin` and Stitch screens.
- [ ] Integrate official RoomMate logo:
  - Gradient indigo tile (`w-16 h-16 rounded-2xl bg-indigo-600`).
  - Asset image `<img src="/logo.png" />` with `<Building />` fallback.
  - Emerald verified badge (`w-6 h-6 rounded-full bg-emerald-500` with white checkmark).
- [ ] Add app branding typography:
  - Header: `RoomMate` (`text-2xl font-bold tracking-tight text-slate-900`).
  - Tagline: `Live Together. Spend Smarter.` (`text-xs font-medium text-slate-500`).
- [ ] Add lock state pill badge:
  - `inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/80`
  - Pulsing amber/indigo status indicator + `Vault Locked`.

### Phase 2: Resident Identity Pill & Status
- [ ] Display active resident pill in Stitch style:
  - Avatar initial or profile image in `w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-bold`.
  - Name: `currentUser.name` (`text-xs font-bold text-slate-800`).
  - Role / Room: `Flat Resident` (`text-[10px] text-slate-500`).

### Phase 3: Biometric Challenge CTA (Thumb-Zone Ergonomics)
- [ ] Primary unlock button:
  - Height `h-13` (52px), full width.
  - Background: `bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-semibold text-sm`.
  - Icon: `<ScanFace />` (iOS Face ID) or `<Fingerprint />` (Touch ID / Android).
  - Label: Dynamic `"Unlock with Face ID"` / `"Unlock with Fingerprint"` / `"Scanning..."`.
  - Subtle ripple/pulse indicator when scanning.
- [ ] Secondary PIN fallback trigger:
  - Height `h-11` (44px), `bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold active:scale-98`.

### Phase 4: Refined PIN Entry Mode
- [ ] Replace dark input with clean daylight input:
  - Background: `bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white`.
  - Text: `text-2xl font-mono font-bold tracking-[0.3em] text-slate-900 text-center`.
  - Input ergonomics: `inputMode="numeric"`, `pattern="[0-9]*"`, `autoComplete="one-time-code"`, `maxLength={6}`.
- [ ] Action buttons row:
  - `Use Biometrics` (`h-11 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl`).
  - `Unlock Vault` (`h-11 bg-indigo-600 text-white font-bold text-xs rounded-xl`).

### Phase 5: Account Switcher & Encryption Footer
- [ ] Switch Account button: `text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5`.
- [ ] Security footer: `256-bit Encrypted Private Vault • Authorized Residents Only`.

### Phase 6: Verification & Quality Checks
- [ ] Run `npx vite build` to ensure clean TypeScript compilation.
- [ ] Test with `browser_subagent` on `http://localhost:5173/?view=mobile`:
  - Verify initial load and brand logo display.
  - Verify biometric prompt trigger.
  - Verify PIN fallback toggle and unlock.
  - Verify seamless visual match with Home, Vault, and Account screens.

---

## 5. Verification Checklist

- [ ] Canvas is daylight `#F9F9FF` matching the Stitch design system.
- [ ] RoomMate logo and branding prominently displayed.
- [ ] No dark mode / neon glowing "vibe-coded" artifacts.
- [ ] Touch targets ≥ 44-48px.
- [ ] Haptic feedback wired to all interactions.
- [ ] Production build passes (`npx vite build`).
