# Project Plan: Automatically Extract UPI ID from Uploaded Payment QR Code

**Task Slug**: `extract-upi-qr`  
**Mode**: PLANNING COMPLETE  
**Application**: Roommate (Student Expense App)  
**Deliverable**: `docs/PLAN-extract-upi-qr.md` & `implementation_plan.md`

---

## 1. Overview & Context

Whenever a resident uploads a payment-app QR code (PhonePe, Google Pay, Paytm, etc.) to their Roommate profile, the app should automatically attempt to decode the QR code on-device, extract the authoritative `pa` (payee UPI ID / VPA) parameter from the UPI payment payload, and present a confirmation dialog to the user before saving both the payment QR image and the extracted UPI ID independently.

---

## 2. Key Architecture Decisions

1. **Client-Side QR Decoding**:
   - Primary: Native `window.BarcodeDetector` for hardware-accelerated detection on Chromium/Android.
   - Fallback: `jsqr` pure-JS library for complete cross-platform coverage (iOS, Safari, Firefox, older WebViews) without external cloud OCR APIs.
2. **Authoritative VPA Extraction**:
   - Only `upi://pay` payloads with a valid `pa` query parameter are extracted.
   - Full URL decoding (`%40` -> `@`), lowercasing, whitespace trimming, and VPA syntax validation.
   - Non-UPI QR codes (URLs, Wi-Fi, plain text) gracefully save the QR image without guessing a UPI ID.
3. **User Confirmation Protocol**:
   - "Is this your UPI ID?" dialog is mandatory before saving any extracted UPI ID.
   - Options:
     - **[ Yes, save it ]**: Saves both QR image & extracted UPI ID.
     - **[ No, edit it ]**: Allows editing the pre-filled UPI ID before saving.
     - Handles duplicate UPI IDs (no duplicate writes).
     - Handles conflicting existing UPI IDs (asks before overwriting).
4. **Database & Sync**:
   - Supabase migration: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT NULL;`.
   - `cloudStorageAdapter.ts` synchronizes `upi_id` across local database and Supabase Cloud.
   - Settlement flows (`UpiIntentPayModal`, `MobileRoomLedger`) automatically use the roommate's saved UPI ID.

---

## 3. Detailed Task Breakdown

### Phase 1: Dependencies & Core Services
- [ ] **Task 1.1**: Install `jsqr` and `@types/jsqr` as dependencies.
- [ ] **Task 1.2**: Create `src/lib/services/qrDecoder.ts` for dual-engine (`BarcodeDetector` + `jsQR`) local image decoding.
- [ ] **Task 1.3**: Create `src/lib/payments/upiExtraction.ts` for strictly extracting and validating UPI VPAs from QR strings.
- [ ] **Task 1.4**: Add comprehensive unit tests in `src/lib/payments/upiExtraction.test.ts`.

### Phase 2: Database Schema & Adapter Updates
- [ ] **Task 2.1**: Create migration `supabase/migrations/20260915_profiles_upi_id.sql`.
- [ ] **Task 2.2**: Update TypeScript definitions in `src/types/supabase.ts`.
- [ ] **Task 2.3**: Update `cloudStorageAdapter.ts` to sync `upi_id` to Supabase `profiles` on profile updates and state hydration.

### Phase 3: UI & Confirmation Flow
- [ ] **Task 3.1**: Enhance `src/components/mobile/settings/modals/QrPreviewModal.tsx` to handle:
  - Detection loading state
  - "Is this your UPI ID?" confirmation card
  - Existing UPI ID conflict/duplicate handling
  - Inline "No, edit it" mode with real-time validation
  - Non-UPI QR fallback
- [ ] **Task 3.2**: Update `src/components/mobile/settings/tabs/AccountTab.tsx` to trigger the decoding pipeline on image selection and handle confirmation actions.
- [ ] **Task 3.3**: Ensure `UpiIntentPayModal.tsx` prioritizes `activePayee.upiId` when settling debts.

### Phase 4: Verification & Acceptance Testing
- [ ] **Task 4.1**: Execute Vitest test suite (`npm test`).
- [ ] **Task 4.2**: Run linter check (`npm run lint`).
- [ ] **Task 4.3**: Verify all 8 acceptance tests outlined in specification.

---

## 4. Verification Checklist (Phase X)

- [ ] Valid UPI QR (`upi://pay?pa=test@upi`) prompts confirmation and saves UPI ID.
- [ ] URL-encoded UPI QR (`pa=test%40okaxis`) decodes to `test@okaxis`.
- [ ] User can click "No, edit it" to modify and save an adjusted UPI ID.
- [ ] Non-UPI QR codes save normally without showing the UPI confirmation dialog.
- [ ] Corrupted/unreadable QR images display clear retry messages.
- [ ] Duplicate UPI IDs do not generate redundant entries.
- [ ] Existing different UPI IDs prompt the user before changing.
- [ ] Database/network errors display clean notifications without false success.
