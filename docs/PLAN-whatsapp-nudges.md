# Project Plan: WhatsApp Nudges & 1-Tap UPI Settlement Engine

**File:** `docs/PLAN-whatsapp-nudges.md`  
**Mode:** PLANNING ONLY (No Code)  
**Task Slug:** `whatsapp-nudges`  
**Target:** 1-Tap WhatsApp Nudge Studio & Deep-Linked UPI Debt Settlement for CampusFlow Roommates.

---

## 1. Context & Problem Statement

In shared student apartments and flatmate housing, calculating shared bills is only half the battle. The single highest emotional friction point is **debt collection**:
- Reminding roommates face-to-face feels uncomfortable and awkward.
- Expecting roommates to open an app daily to check dues leads to delayed payments.
- When roommates do want to pay, manual copy-pasting of UPI IDs and re-entering exact amounts into GPay or PhonePe creates friction.

**The Solution:**
A mobile **WhatsApp Nudge Studio** that generates a polite, transparent expense breakdown with an embedded 1-tap UPI deep-link (`upi://pay?pa=...&am=...&tn=...`). When the roommate taps the link inside WhatsApp, their default payment app (Google Pay, PhonePe, Paytm, BHIM) opens with the payee and exact amount pre-filled, ready to settle in seconds.

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **UX & Stitch Lead** | `stitch-loop`, `ui-ux-pro-max`, `DESIGN.md` | Stitch mobile prototype generation, bottom sheet tactile layout, WhatsApp bubble styling, tone selector. |
| **Mobile Frontend Engineer** | `react-components`, `mobile-design` | Implement `WhatsAppNudgeModal.tsx`, integrate nudge triggers into `MobileRoomLedger.tsx` and `MobileDashboard.tsx`. |
| **Payments & Deep-Link Architect** | `clean-code`, `upi-specs` | Implement `upiUriService.ts` generating RFC-compliant UPI URIs, WhatsApp `wa.me` URL schemes, and fallback QR code data. |
| **QA & Verification Engineer** | `oxlint`, `browser-test` | Validate URL encoding, copy-to-clipboard fallbacks, responsive 390px mobile layout, and zero terminology violations. |

---

## 3. Stitch Visual Prototype & Design Asset

- **Screen ID:** `5246a26fb2574ff4ab8203d8ce723563`
- **Title:** `CampusFlow - WhatsApp Nudge Studio`
- **Device Viewport:** Mobile 390px (iOS tactile bottom sheet)
- **Stitch Prototype Preview:** [View WhatsApp Nudge Studio on Stitch](https://lh3.googleusercontent.com/aida/AEtjO1VrKJLWsbMXxRsVeppRrWnONB3Ks1fa4PXFuX4a2qTGRbs6a3uf6JVVVllIF3CQxFVj3J5bh3JksPuXsEoqY7EeREprh3H_90HgDgRaOYZVfXXegZvz7mgt55KihEN_HqNx1oWUeOvz-4z2DM5R2Qohg260r4Vu3DQZyRVvpUM45LVcOQIJFngA7v-m98WQErl6tmRHAdoUoW2-MWASMz5rLjrRM2gU1tbM54OmhciMuq6ovCgdGO7aiqo)

---

## 4. Architecture & User Journey

```
+-------------------------------------------------------------+
| 1. Mobile Ledger / Debt Tile                                |
|    "Sneha owes you ₹350.00"                                 |
|    [ 💬 Nudge via WhatsApp ] ──> Tapped by resident         |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| 2. WhatsApp Nudge Studio (iOS Bottom Sheet)                 |
|    • Target: Sneha (Room 14) • Debt: ₹350.00                |
|    • Itemized Chips: [📶 WiFi: ₹200] [🛒 Groceries: ₹150]   |
|    • Receiving UPI ID: rajdeep@okaxis (with edit option)    |
|    • Tone Selector: [☕ Casual] [⚡ Direct] [🍕 Roomie]      |
|    • Live WhatsApp Chat Bubble Preview with UPI link        |
|    • Action 1: [ 🚀 Send via WhatsApp ]                    |
|    • Action 2: [ 📋 Copy Link ]  [ 📱 Show In-Person QR ]  |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| 3. WhatsApp Opens Automatically                             |
|    "Hey Sneha! 👋 Quick reminder for our Flat 302 split:    |
|     • WiFi: ₹200                                            |
|     • Groceries: ₹150                                       |
|     Total Due: ₹350.00                                      |
|     👉 Tap here to pay in 1-tap via GPay/PhonePe:           |
|     upi://pay?pa=rajdeep@okaxis&am=350&tn=Flat302_Split"    |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| 4. Roommate Taps Link inside WhatsApp                       |
|    GPay / PhonePe / Paytm opens immediately with:           |
|    • Payee: Rajdeep                                         |
|    • Amount: ₹350.00                                        |
|    • Roommate enters UPI PIN ➔ Settle Completed!            |
+-------------------------------------------------------------+
```

---

## 5. Technical Specifications

### A. UPI Deep-Link Format (NPCI Specification)
```text
upi://pay?pa={vpa}&pn={payeeName}&am={amount}&cu=INR&tn={note}
```
- `pa`: Payee Virtual Payment Address (e.g. `rajdeep@okaxis`).
- `pn`: Payee display name (e.g. `Rajdeep`).
- `am`: Exact calculated balance (e.g. `350.00`).
- `cu`: Currency `INR`.
- `tn`: Transaction note (e.g. `Flat302_WiFi_Groceries`).

### B. WhatsApp Universal URL Scheme
```text
https://wa.me/{phoneNumber}?text={urlEncodedMessage}
```
- If phone number is available on the user profile, pre-populates target contact.
- If phone is empty, uses universal share `https://api.whatsapp.com/send?text={urlEncodedMessage}` allowing resident to pick any contact or roommate group!

### C. Nudge Tone Matrix

1. **☕ Casual / Polite (Default):**
   > *"Hey {name}! 👋 Hope you're having a good week. Whenever you get a minute, here's our Flat {room} split breakdown: {items}. Total: ₹{amount}. Tap here to pay in 1-tap via GPay/PhonePe: {upi_link}"*

2. **⚡ Direct / Quick:**
   > *"Flat {room} Split Reminder: ₹{amount} due for {items}. Settle up in 1-tap via UPI: {upi_link}"*

3. **🍕 Roomie / Fun:**
   > *"Hey {name}! 🍕 Dues reminder for Flat {room}: ₹{amount} ({items}). Settle up so we can order snacks for the weekend! 🚀 1-Tap Pay: {upi_link}"*

---

## 6. Implementation Task Breakdown

### Phase 1: UPI & WhatsApp Engine (`src/lib/ledger/nudgeService.ts`)
- [ ] Build `generateUpiUri(options)` utility.
- [ ] Build `generateWhatsAppNudgeUrl(options)` supporting phone-target and universal broadcast.
- [ ] Build tone template engine formatting itemized expenses cleanly.
- [ ] Generate standard QR code payload for in-person camera scanning.

### Phase 2: WhatsApp Nudge Studio Component (`src/components/mobile/WhatsAppNudgeModal.tsx`)
- [ ] Implement 390px iOS bottom sheet modal matching Stitch design `5246a26fb2574ff4ab8203d8ce723563`.
- [ ] Roommate debt banner with itemized expense breakdown tags.
- [ ] Receiving UPI VPA card with 1-tap inline edit/change.
- [ ] Interactive Tone Switcher (Casual, Direct, Roomie).
- [ ] Realistic WhatsApp chat bubble preview with dynamic message updating.
- [ ] Primary Action: `Send Nudge via WhatsApp` (vibrant green `#25D366`).
- [ ] Secondary Actions: `Copy Message` and `Show In-Person UPI QR`.
- [ ] Fast Settlement shortcut: `Record Received Payment`.

### Phase 3: Integration into Room Ledger & Dashboard
- [ ] Add `Nudge via WhatsApp` trigger button to debt summary tiles in `MobileRoomLedger.tsx`.
- [ ] Add `Nudge` quick action on pending receivables in `MobileDashboard.tsx`.
- [ ] Wire `onRecordSettlement` callback to instantly mark debts settled.

### Phase 4: Verification & Polishing
- [ ] TypeScript check (`tsc -b`).
- [ ] Linter check (`npx oxlint`).
- [ ] Verify URL encoding handles special characters and emojis smoothly.
- [ ] Verify mobile layout at 375px, 390px, and 412px viewports.
- [ ] Verify zero terminology violations (0 occurrences of `/student/i`).

---

## 7. Verification Checklist

- [ ] Tapping "Nudge via WhatsApp" on any debtor opens the Nudge Studio sheet.
- [ ] Toggling between Casual, Direct, and Roomie updates the WhatsApp message preview in real time.
- [ ] Changing receiving UPI ID dynamically updates the embedded `upi://` URI.
- [ ] Clicking "Send Nudge via WhatsApp" opens WhatsApp with formatted message and deep-link.
- [ ] Clicking "Copy Message" copies formatted text to clipboard with toast confirmation.
- [ ] Clicking "Show UPI QR" displays a scannable QR code.
- [ ] Clicking "Record Received Payment" marks the debt settled in the ledger.
