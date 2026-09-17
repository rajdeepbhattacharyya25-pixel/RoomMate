# Project Plan: Mobile Input Layouts & Shared Input Primitives Refactor

**File:** `docs/PLAN-mobile-input-refactor.md`  
**Mode:** PLANNING ONLY (No Code Modification)  
**Task Slug:** `mobile-input-refactor`  
**Target:** Eliminate all text/icon overlapping bugs, replace brittle absolute input overlays with unified flex groups (Option A), and establish reusable mobile input primitives (`<CurrencyInput>`, `<PhoneInput>`, `<PrefixInput>`) across RoomMate mobile (Option B).

---

## 1. Problem Statement & Root Cause Analysis

### 🔴 Problem 1: Absolute Icon/Prefix Overlays Colliding with Text
- **Root Cause:** Multiple inputs across the app use an `absolute left-*` overlay positioned on top of an `<input>` styled with ad-hoc padding (e.g., `pl-8`, `pl-9`, `pl-13`, `pl-7`).
- **Failure Modes:**
  1. **Invalid Tailwind classes:** E.g., `pl-13` in `EditPhoneModal.tsx` does not exist in Tailwind's default spacing scale, resulting in `padding-left: 0px` and causing text to render directly under the `+91` pill (`8 [ +91 ] 34817`).
  2. **Font Scaling & Heavy Font Weight:** In `MobilePersonalVault.tsx` and `MobileRoomLedger.tsx`, `text-2xl font-bold` digits only have ~4px clearance next to the absolute `₹` symbol. On high-DPI Android devices or when system font scaling is enabled, the symbol touches or overlaps the first digit.
  3. **Cursor & Selection Distortion:** When tapping near the beginning of the text field, the cursor falls behind the absolute icon because the click target of the underlying input is covered by the overlay badge.

### 🔴 Problem 2: Inconsistent Sizing & Non-Standard Utilities
- Non-standard Tailwind utility classes were discovered in several components:
  - `w-13 h-13` in `JoinRequestReviewModal.tsx` (avatar sizing collapses).
  - `h-13` in `MobileLogin.tsx` (room code input height unstyled).
  - `h-13` in `AppLockGateway.tsx` (biometric unlock button collapses).
  - `py-0.2` in `RoomSettingsModal.tsx` and `p-4.5` in `SettlementProofModal.tsx`.

### 🔴 Problem 3: Duplicated Input Logic & Mobile Formatting
- `EditPhoneModal` and `FirstLoginOnboardingModal` implemented duplicated, fragile phone number string parsing.
- Pasting full numbers with `+91` or hyphens caused truncation under `maxLength={13}`.
- Currency fields lack unified clearing, formatting, and numeric `inputMode` attributes.

---

## 2. Architecture & Solution Strategy

We execute this in two sequential phases:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Phase 1: Option A (Immediate Surgical Input Overhaul)                │
│  - Convert remaining 4 ₹ overlay inputs to unified Flex Input Groups   │
│  - Standardize non-standard Tailwind classes across all screens        │
│  - Ensure zero text/icon overlap across ledger & vault immediately    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Phase 2: Option B (Shared Mobile Input Primitives)                   │
│  - Create src/components/common/CurrencyInput.tsx                      │
│  - Create src/components/common/PhoneInput.tsx                         │
│  - Create src/components/common/PrefixInput.tsx                        │
│  - Migrate all call sites (Modals, Ledger, Vault, Onboarding)          │
│  - Add automated Vitest unit tests for formatting & edge cases         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Phase Breakdown

### 🔹 Phase 1: Option A — Immediate Flex Group Overhaul

#### 1. `src/components/mobile/MobileRoomLedger.tsx`
- **Settle Amount Modal Input (Lines 2089–2108):**
  - Replace `<span className="absolute left-3 ...">₹</span>` with a flex input container.
  - Prefix: `div.flex.items-center.px-3.5.bg-slate-100/90.border-r.border-slate-200.text-indigo-600.font-bold`
  - Input: `input.w-full.px-3.5.py-2.5.bg-transparent.border-0.text-lg.font-bold`
  - Outer Container: `focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20`
- **Exact Split Inputs (Lines 1815–1828):**
  - Replace `<span className="absolute left-2.5 ...">₹</span>` with a compact flex input group.

#### 2. `src/components/mobile/MobilePersonalVault.tsx`
- **Add / Edit Expense Amount Input (Lines 1175–1198):**
  - Replace `<span className="absolute left-3 text-lg ...">₹</span>` with a prominent flex group.
  - Sibling `₹` container in `text-xl font-black text-indigo-600` with subtle right border.
  - Input: `text-2xl font-bold tabular-nums`.
- **Monthly Allowance Budget Input (Lines 1365–1375):**
  - Replace absolute `₹` with a flex group matching the vault aesthetic.
- **Split Custom Participant Amount (Lines 1432–1447):**
  - Convert to compact flex group.

#### 3. `src/components/mobile/UpiIntentPayModal.tsx`
- **Pay Amount Input (Lines 266–278):**
  - Replace absolute `₹` overlay with an input group featuring an auto-focus focus ring.

#### 4. Fix Remaining Non-Standard Utility Classes
- `JoinRequestReviewModal.tsx`: Replace `w-13 h-13` with `w-12 h-12` (48px) or `w-14 h-14` (56px).
- `MobileLogin.tsx`: Replace `h-13` with `h-12` (48px).
- `AppLockGateway.tsx`: Replace `h-13` with `h-12` (48px).
- `RoomSettingsModal.tsx`: Replace `py-0.2` with `py-0.5`.
- `SettlementProofModal.tsx`: Replace `p-4.5` with `p-4`.

---

### 🔹 Phase 2: Option B — Reusable Mobile Input Primitives

#### 1. `<CurrencyInput>` (`src/components/common/CurrencyInput.tsx`)
- **Props:**
  - `value: number | string`
  - `onChange: (val: string, numericVal: number) => void`
  - `currencySymbol?: string` (default: `'₹'`)
  - `size?: 'sm' | 'md' | 'lg' | 'xl'`
  - `hasError?: boolean`
  - `placeholder?: string`
  - `autoFocus?: boolean`
  - `showClear?: boolean`
  - `disabled?: boolean`
- **Features:**
  - Standardized flex input wrapper with focus-within ring.
  - Dedicated prefix pill with subtle divider (`border-r`).
  - Mobile numeric keypad enforcement (`inputMode="decimal"`).
  - Clean error styling and optional 1-tap clear button.

#### 2. `<PhoneInput>` (`src/components/common/PhoneInput.tsx`)
- **Props:**
  - `value: string` (accepts raw 10-digits or canonical `+91 XXXXX XXXXX`)
  - `onChange: (cleanDigits: string, formattedDisplay: string) => void`
  - `onValidationChange?: (isValid: boolean, formattedCanonical: string) => void`
  - `hasError?: boolean`
  - `disabled?: boolean`
  - `autoFocus?: boolean`
- **Features:**
  - Encapsulates `🇮🇳 +91` prefix container.
  - Automatic `XXXXX XXXXX` 5-5 readable formatting.
  - Robust paste sanitizer: automatically strips `+91`, `91`, spaces, hyphens, and non-digits without truncation.
  - 1-tap clear button.

#### 3. `<PrefixInput>` (`src/components/common/PrefixInput.tsx`)
- **Props:**
  - `prefix: React.ReactNode | string`
  - `inputProps: React.InputHTMLAttributes<HTMLInputElement>`
  - `hasError?: boolean`
- **Features:**
  - Generalized flex container for any prefix (`@`, `#`, URL icon, etc.).

#### 4. Component Migration & Call Site Integration
- Refactor `EditPhoneModal.tsx` and `FirstLoginOnboardingModal.tsx` to use `<PhoneInput>`.
- Refactor `EditUsernameModal.tsx` to use `<PrefixInput prefix="@">`.
- Refactor `MobileRoomLedger.tsx`, `MobilePersonalVault.tsx`, and `UpiIntentPayModal.tsx` to use `<CurrencyInput>`.

---

## 4. Verification & Testing Checklist

### Automated Unit Tests
- [ ] Create `src/components/common/mobileInputs.test.tsx`:
  - Test `<CurrencyInput>` decimal parsing, negative prevention, and empty string handling.
  - Test `<PhoneInput>` paste normalization (e.g. `+91-98765-43210` -> `9876543210`).
  - Test `<PhoneInput>` 5-5 formatting display.
  - Test clear button resets value and fires callback.
- [ ] Run full test suite: `npm test`.
- [ ] Run linter: `npm run lint`.
- [ ] Run TypeScript check: `npx tsc -b`.

### Manual & Visual Verification
- [ ] Verify Settings -> Account -> Edit Phone:
  - Phone renders cleanly with `🇮🇳 +91` pill.
  - No text overlap on any screen resolution.
  - Typing formats as `XXXXX XXXXX`.
  - Save button updates profile.
- [ ] Verify Personal Vault -> Add Expense:
  - Large amount input displays `₹` cleanly without touching digits.
- [ ] Verify Room Ledger -> Settle Debt:
  - Settle amount input displays `₹` prefix and accepts decimal amounts cleanly.
- [ ] Verify Mobile Login & Join Room:
  - Verify room code input height is properly sized.
  - Verify requester avatar in join requests maintains circular/square proportions.
- [ ] Verify soft keyboard behavior:
  - Action buttons remain scrollable and visible when keyboard is open.
