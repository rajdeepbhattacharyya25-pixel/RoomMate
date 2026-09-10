# Project Plan: 1-Tap UPI Intent Switching & Shareable Settlement Proofs

**File:** `docs/PLAN-upi-intent-proof.md`  
**Mode:** PLANNING ONLY (No Code)  
**Task Slug:** `upi-intent-proof`  
**Target:** 1-Tap native UPI app switcher (GPay, PhonePe, Paytm, CRED) & branded shareable digital settlement voucher cards for CampusFlow flatmates.

---

## 1. Context & Problem Statement

In student flatmate housing and shared apartments, debt settlement is often where friction and disputes happen:
1. **Intent Launching Gaps**: Currently, clicking "Settle via UPI" opens a generic web link. Students expect a 1-tap experience where they can choose their preferred UPI app (**Google Pay, PhonePe, Paytm, CRED**) directly without having to copy VPAs or re-enter amounts.
2. **Desktop & Fallback Sandboxing**: When running on desktop browsers or restricted mobile WebViews, generic `upi://` links often fail silently without offering an interactive high-contrast QR code or 1-tap clipboard helper.
3. **The "Did You Pay?" Roommate Dispute**: After transferring ₹350 or ₹1,200, flatmates have no digital proof within the app. They take phone screenshots of bank screens with private balance info and post them into WhatsApp, or argue over whether a payment was completed.

**The Solution:**
1. A **1-Tap UPI Intent Switcher** bottom sheet allowing residents to select their specific app (GPay, PhonePe, Paytm, Generic UPI) or scan a real-time QR code.
2. A **Branded Digital Settlement Proof Voucher Card**: Upon payment confirmation, CampusFlow renders an Apple HIG/fintech-grade verification voucher featuring the verified flatmate names, exact amount, UTR/Ref token, timestamp, and room name.
3. **Instant WhatsApp Flat Group Sharing**: 1-tap button to share the official settlement receipt card & message directly into the flat WhatsApp group, while automatically updating Supabase Cloud PostgreSQL ledger and dispatching native notifications.

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **UX & Stitch Lead** | `ui-ux-pro-max`, `DESIGN.md`, Apple HIG | Tactile bottom sheet app-selector, fintech-grade voucher card design with gradient background, emerald checkmark badge, and share actions. |
| **Mobile & Payments Engineer** | `upi-specs`, `capacitor-core`, React 19 | Implement `src/lib/payments/upiIntentService.ts` supporting `tez://`, `phonepe://`, `paytmmp://`, and `upi://` with Capacitor and Web fallbacks. |
| **Frontend Component Architect** | `react-components`, `canvas-confetti` | Build `UpiIntentPayModal.tsx` and `SettlementProofModal.tsx`; integrate into `MobileRoomLedger.tsx` and `WhatsAppNudgeModal.tsx`. |
| **Voucher Export & Sharing Specialist**| `html-canvas`, `image-export`, Web Share API | Canvas receipt rendering for downloadable PNG vouchers + pre-formatted WhatsApp settlement announcement text. |
| **QA & Verification Engineer** | `oxlint`, `tsc`, `browser-subagent` | Validate app scheme triggers, desktop QR fallback, UTR validation, confetti trigger, and cloud state synchronization. |

---

## 3. Architecture & User Journey

```
+-------------------------------------------------------------+
| 1. Mobile Room Ledger / Settlement Trigger                  |
|    "You owe Sneha ₹450.00"                                  |
|    [ ⚡ Settle via UPI ] ──> Tapped by resident             |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| 2. UPI Intent Switcher Modal (iOS Tactile Bottom Sheet)     |
|    • Payee: Sneha Roy (sneha@okaxis) • Amount: ₹450.00       |
|    • App Switcher:                                          |
|      [ 🔵 Google Pay ]  [ 🟣 PhonePe ]                       |
|      [ 💠 Paytm ]       [ 🟢 Any UPI App ]                  |
|    • Web/Desktop Fallback: Scannable QR Code + Copy UPI ID  |
|    • Resident taps their preferred app                      |
+-------------------------------------------------------------+
                              │ (OS Intent Switches to GPay/PhonePe)
                              │ Resident enters PIN in Bank App
                              ▼
+-------------------------------------------------------------+
| 3. Resident Returns to CampusFlow                           |
|    "Did you complete the payment of ₹450.00?"               |
|    • Optional UTR / Reference ID (e.g. 392819482910)        |
|    [ ✅ Confirm & Generate Proof Card ]                     |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| 4. Branded Settlement Proof Voucher Card                    |
|    ╔═══════════════════════════════════════════════════╗   |
|    ║   CampusFlow Verified Settlement Voucher          ║   |
|    ║   ✅ PAYMENT RECORDED                             ║   |
|    ║   ₹450.00                                         ║   |
|    ║   From: Rajdeep Dutta ➔ To: Sneha Roy             ║   |
|    ║   Room: Flat 402 • Method: Google Pay (UPI)       ║   |
|    ║   UTR: UPI-392819482910                           ║   |
|    ║   Date: 10 Sep 2026, 10:45 PM                     ║   |
|    ║   Status: Cleared & Cloud Synced                  ║   |
|    ╚═══════════════════════════════════════════════════╝   |
|                                                             |
|    • Action 1: [ 💬 Share to Flat WhatsApp Group ]         |
|    • Action 2: [ 📥 Download Proof Card (PNG) ]            |
|    • Action 3: [ 🏁 Done & View Ledger ]                   |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
| 5. Cloud Ledger & Notification Dispatch                     |
|    • PostgreSQL `settlement_payments` inserted via RLS      |
|    • Supabase Realtime broadcasts to all flatmates          |
|    • Native notification: "Rajdeep settled ₹450 with Sneha" |
+-------------------------------------------------------------+
```

---

## 4. Technical Specifications & URI Schemes

### A. Specific UPI Mobile Intent Schemes
| App | Native Android URI Scheme | iOS Fallback Scheme | Generic Universal Scheme |
|:---|:---|:---|:---|
| **Google Pay** | `tez://upi/pay?pa={vpa}&pn={name}&am={amount}&cu=INR&tn={note}` | `gpay://upi/pay?...` | `upi://pay?...` |
| **PhonePe** | `phonepe://pay?pa={vpa}&pn={name}&am={amount}&cu=INR&tn={note}` | `phonepe://pay?...` | `upi://pay?...` |
| **Paytm** | `paytmmp://pay?pa={vpa}&pn={name}&am={amount}&cu=INR&tn={note}` | `paytmmp://pay?...` | `upi://pay?...` |
| **BHIM / Any UPI** | `upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR&tn={note}` | `upi://pay?...` | `upi://pay?...` |

### B. Fallback Strategy Matrix
1. **Capacitor Native Platform (Android / iOS)**:
   - Try specific app URI scheme first (e.g., `phonepe://` or `tez://`).
   - If app is not installed, seamlessly fall back to generic `upi://pay?...` which invokes Android's system intent chooser.
2. **Desktop Browser / Web Preview**:
   - Detect non-mobile platform.
   - Render real-time high-resolution dynamic QR code (`https://api.qrserver.com/v1/create-qr-code/?data=...`).
   - Provide 1-tap "Copy UPI ID" and "Copy Amount" with clipboard toast feedback.

---

## 5. Branded Proof Card Design & WhatsApp Receipt Format

### A. Card Aesthetics (Apple HIG / Fintech Style)
- Gradient container: Deep sapphire to indigo (`from-slate-900 via-indigo-950 to-slate-900`) with subtle frosted glass inner border (`border border-white/15`).
- Vibrant emerald badge: `CLEARED & SYNCED` with animated pulse ring.
- Large currency typography: `₹450.00` in Inter/SF Pro with tabular numerals.
- Grid details:
  - Payer & Payee with profile avatars.
  - Payment Method badge with brand color (Google Pay Blue `#4285F4`, PhonePe Purple `#5F259F`, Paytm Cyan `#00BAF2`).
  - Generated settlement token: e.g. `CF-2026-948210`.
  - Exact timestamp & room identifier.

### B. WhatsApp Announcement Format
```text
*CampusFlow Settlement Receipt* 🧾✨
━━━━━━━━━━━━━━━━━━━━━
✅ *Payment Recorded & Verified*
💰 *Amount:* ₹450.00
👤 *Paid by:* Rajdeep Dutta
👥 *Paid to:* Sneha Roy (sneha@okaxis)
🏠 *Room:* Flat 402
💳 *Method:* Google Pay (UPI)
🔖 *UTR / Ref:* UPI-392819482910
🕒 *Date:* 10 Sep 2026, 10:45 PM
━━━━━━━━━━━━━━━━━━━━━
_Balance automatically cleared on CampusFlow Cloud Ledger_ 🚀
```

---

## 6. Implementation Task Breakdown

### Phase 1: Payments & Intent Infrastructure
- [ ] Create `src/lib/payments/upiIntentService.ts`:
  - Build parameter builder with NPCI validation.
  - Build app-specific intent generators for GPay, PhonePe, Paytm, and Generic UPI.
  - Implement platform detection (`Capacitor.isNativePlatform()`).
  - Implement intent launcher with fallback to generic UPI and error handling.
  - Implement unique receipt reference ID generator (`CF-SETTLE-${timestamp}-${random}`).

### Phase 2: UPI Intent Switcher UI
- [ ] Create `src/components/mobile/UpiIntentPayModal.tsx`:
  - iOS tactile bottom sheet modal with grab handle.
  - Payee info card (name, avatar, UPI ID).
  - Editable settlement amount with quick chips (Full balance, 50%, Custom).
  - App selector buttons: Google Pay, PhonePe, Paytm, Default UPI.
  - Desktop fallback: scannable QR code + copy UPI ID buttons.
  - "I Have Paid" confirmation button with optional UTR input.

### Phase 3: Shareable Settlement Proof Card
- [ ] Create `src/components/mobile/SettlementProofModal.tsx`:
  - Confetti burst on modal reveal using `canvas-confetti`.
  - Aesthetic proof voucher card matching Apple HIG / fintech specifications.
  - "Share to WhatsApp Flat Group" button via `https://api.whatsapp.com/send?text=...`.
  - "Download Proof Image" using HTML5 canvas rendering.
  - "Done & Update Ledger" button triggering cloud write and native notification.

### Phase 4: Integration with Ledger & Nudge Studio
- [ ] Integrate into `src/components/mobile/MobileRoomLedger.tsx`:
  - Replace the static UPI link with `UpiIntentPayModal` trigger.
  - Upon completion, launch `SettlementProofModal`.
- [ ] Integrate into `src/components/mobile/WhatsAppNudgeModal.tsx`:
  - Allow debtor or creditor to view and export the proof card immediately after settlement.

### Phase 5: Verification & Quality Assurance
- [ ] Verify static typing with `npx tsc -b`.
- [ ] Verify code quality with `npx oxlint`.
- [ ] Verify production bundle with `npm run cap:build`.
- [ ] Interactive browser test: verify modal open/close, app switcher clicks, QR code generation, UTR input, proof card rendering, WhatsApp share text encoding, and cloud settlement creation.

---

## 7. Verification Checklist

- [ ] GPay, PhonePe, Paytm, and Generic UPI URIs correctly formatted with valid query parameters.
- [ ] Desktop environments smoothly display QR code without broken intent links.
- [ ] Voucher card displays correct payer, payee, amount, room, UTR, and timestamp.
- [ ] WhatsApp share button opens WhatsApp with pre-filled formatted receipt text.
- [ ] Download button produces a clean PNG image of the voucher card.
- [ ] Recording settlement persists to Supabase PostgreSQL cloud table with RLS.
- [ ] Supabase Realtime broadcast and native local notification triggered.
- [ ] Zero TypeScript errors and zero linter warnings.
