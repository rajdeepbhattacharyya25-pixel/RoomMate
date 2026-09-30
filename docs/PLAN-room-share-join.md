# PLAN: Room Share, QR Invite & Manual Code Join Hardening

**Slug**: `room-share-join`  
**File**: `docs/PLAN-room-share-join.md`  
**Date**: 2026-09-30  
**Status**: COMPLETED_AND_VERIFIED  
**Mode**: FULL_EXECUTION  

---

## 1. Executive Summary & Root Cause Analysis

In the mobile app's **Room Share Section** (`src/components/mobile/MobileRoomLedger.tsx`), roommates share bills, invite flatmates, and join shared rooms. While basic UI shells exist for both `RoomInviteModal.tsx` and `JoinRoomModal.tsx`, a technical audit reveals **critical cross-platform flaws and friction points** that prevent invitations and joining from working reliably:

1. **Camera QR Scan Deadlock on Mobile WebViews (`BarcodeDetector` Missing)**:
   - In `JoinRoomModal.tsx` (and `MobileLogin.tsx`), the continuous camera frame scanner only runs `if ('BarcodeDetector' in window)`.
   - On Android Capacitor WebViews, iOS WKWebView, Safari, and desktop Firefox, `BarcodeDetector` is **undefined** or disabled by default.
   - **Result**: The camera turns on, but it **never scans or recognizes any QR code**, silently dropping all frames without any user feedback.
   - **Fix**: Wire up the **Dual-Engine QR Decoder** pattern using `jsQR` (already in `package.json` and `src/lib/services/qrDecoder.ts`). If `BarcodeDetector` is unavailable or fails, grab the `<video>` frame onto an offscreen canvas and decode via `jsQR` with `inversionAttempts: 'attemptBoth'`.

2. **No QR Screenshot / Image Upload Option in Room Join Modal**:
   - Students frequently receive room invite QR codes via WhatsApp, Telegram, or Discord screenshots. They cannot physically point their phone's camera at their own screen.
   - While `UpiQrScannerModal.tsx` supports gallery upload, `JoinRoomModal.tsx` lacks an "Upload QR Screenshot" button.
   - **Fix**: Add a 1-tap "Upload Screenshot / Select Image" button with file picker integrated into `decodeQrFromImage()`.

3. **Fragile Offline QR Generation in `RoomInviteModal.tsx`**:
   - `RoomInviteModal.tsx` generates the QR code via an external third-party URL: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=...`.
   - When on spotty college Wi-Fi, airplane mode, or offline, the image fails to render, showing a broken image icon.
   - **Fix**: Use bundled local QR generation (`qrcode` data URL / SVG) with offline caching and graceful fallback.

4. **Input Normalization & Resilient Code Parsing**:
   - Users type room codes in varied formats: `#FLAT02`, `flat02`, `FLAT-02`, `flat 02`, or paste full URLs like `https://roommate26.vercel.app/join/FLAT02` or `roommate://join?code=FLAT02`.
   - Ensure the token extractor strips prefixes (`#`, `roommate://join?code=`), trims whitespace, removes accidental spaces/hyphens, and uppercases short room codes while preserving case-sensitive full JWT/tokens.

5. **Smooth End-to-End Handshake**:
   - **Preview Phase**: Instant feedback showing Room Name, Member Count, Admin Name, and Join Policy (`INSTANT` vs `APPROVAL_REQUIRED`).
   - **Instant Join**: Direct activation, switching the active room, and triggering celebratory haptics + toast.
   - **Approval Required**: Creates a pending request in Supabase/local storage with clear status indicator.
   - **Already Member**: Clear messaging with a 1-tap "Open Room" button instead of a cryptic error.

---

## 2. System Architecture & Join Flow

```
                           ROOM INVITATION & JOIN LIFECYCLE
                           
       ┌───────────────────────────────┐
       │   ROOM ADMIN / ACTIVE MEMBER  │
       └───────────────┬───────────────┘
                       │ Opens "Invite" in Room Share
                       ▼
       ┌───────────────────────────────┐
       │     RoomInviteModal.tsx       │
       │  • Offline Local QR (qrcode)  │
       │  • Manual Code (#FLAT02)      │
       │  • Native Share Sheet API     │
       │  • Token Expiry (24h/7d/Never)│
       └───────────────┬───────────────┘
                       │ Shares via WhatsApp / QR Scan / Manual Code
                       ▼
       ┌───────────────────────────────┐
       │       JOINING ROOMMATE        │
       │     (JoinRoomModal.tsx)       │
       └───────────────┬───────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
   [ Scan Live QR ]           [ Enter Code / Upload ]
   • Dual-Engine Loop         • #FLAT02 / URL paste
   • BarcodeDetector          • Image Gallery Upload
   • jsQR Canvas Fallback     • Auto-clean & Trim
         │                           │
         └─────────────┬─────────────┘
                       ▼
       ┌───────────────────────────────┐
       │      RESOLVE INVITE STEP      │
       │  • Fetch Room Name & Admin    │
       │  • Display Member Count Badge │
       │  • Privacy Isolation Notice   │
       └───────────────┬───────────────┘
                       │ Confirm Join
                       ▼
         ┌─────────────┴─────────────┐
         │  Policy Evaluation Check  │
         └─────────────┬─────────────┘
                       │
         ┌─────────────┴────────────────────────┐
         ▼                                      ▼
   [ INSTANT JOIN ]                    [ APPROVAL REQUIRED ]
   • Status = ACTIVE                   • Status = PENDING
   • Switch Active Room                • Notify Room Admin
   • Open Room Ledger                  • Review Modal in Admin view
```

---

## 3. Work Breakdown Structure (WBS)

### Phase 1: Dual-Engine QR Scanner & Media Fallbacks
- [x] **Task 1.1**: Update `src/components/mobile/JoinRoomModal.tsx` scanning engine:
  - Add an offscreen canvas capture to `beginScanLoop()`.
  - Check `BarcodeDetector` first (hardware accelerated on supported Chromium).
  - Automatically fallback to `jsQR` using `ctx.getImageData()` from `<video>` frame when `BarcodeDetector` is missing or fails.
- [x] **Task 1.2**: Add Gallery / Image Upload option in `JoinRoomModal.tsx`:
  - Add an "Upload QR Image" option alongside "Scan with Camera".
  - Wire to `decodeQrFromImage(file)` from `src/lib/services/qrDecoder.ts`.
  - Add camera flashlight/torch toggle (when supported by `MediaTrackConstraints`).

### Phase 2: Offline-First Local QR Code in `RoomInviteModal.tsx`
- [x] **Task 2.1**: Replace remote `api.qrserver.com` image with client-side SVG / Data URL generation using `qrcode` library.
- [x] **Task 2.2**: Ensure offline compatibility: if device has zero network, QR code still renders instantly.
- [x] **Task 2.3**: Verify copy to clipboard, native share (`navigator.share`), and invite expiration selector (`24h`, `7 days`, `30 days`, `Never`).

### Phase 3: Input Cleaning, URL Resolving & Resilient Manual Code Entry
- [x] **Task 3.1**: Enhance `extractTokenOrCode()` in `JoinRoomModal.tsx` and `MobileLogin.tsx`:
  - Handle `#` stripping (e.g. `#FLAT02` -> `FLAT02`).
  - Strip spaces, punctuation, and leading/trailing whitespace.
  - Parse query strings (`?join=`, `?code=`, `?token=`) and path segments (`/join/:code`).
  - Handle deep-link URI schemes: `roommate://join?code=...` and `campusflow://join?code=...`.
- [x] **Task 3.2**: Add interactive live validation feedback on code input (e.g. character count, paste button, clear button).

### Phase 4: Join Handshake, State Transitions & Error UX
- [x] **Task 4.1**: Handle all four resolution states in `JoinRoomModal.tsx`:
  - `INSTANT`: Joins immediately, calls `onRoomJoined(room)`, switches active room, triggers confetti/haptics.
  - `APPROVAL_REQUIRED`: Shows clear "Request Sent" screen with admin name and explanation that expenses will unlock once approved.
  - `ALREADY_MEMBER`: Shows "Already a Member" confirmation card with 1-tap "Open Room Ledger" button.
  - `INVALID / EXPIRED`: Descriptive error message with option to try another code or contact room admin.
- [x] **Task 4.2**: Verify parity with `MobileLogin.tsx` (for unauthenticated users who scan an invite to sign up/join).

### Phase 5: Verification & Automated Vitest Matrix
- [x] **Task 5.1**: Create `src/components/mobile/roomJoinInvite.test.ts` covering:
  - Code extraction from various URL formats, deep links, `#` prefixed codes, and lowercase codes.
  - QR decoding fallback simulation (`jsQR` frame extraction).
  - Instant join vs Approval-required flow handling.
  - Admin invite regeneration and expiration validation.
  - Offline QR generation test.
- [x] **Task 5.2**: Run full test suite `npm run test` (384/384 tests passing) and linter `npm run lint`.

---

## 4. Automated Test Matrix

| # | Test Scenario | Input / Action | Expected Result |
|---|---------------|----------------|-----------------|
| 1 | Raw code with `#` prefix | `#FLAT02` | Normalizes to `FLAT02` and resolves room |
| 2 | Lowercase manual code | `flat02` | Normalizes to `FLAT02` and resolves room |
| 3 | Web join URL | `https://roommate26.vercel.app/join/FLAT02` | Extracts `FLAT02` and resolves room |
| 4 | Deep link scheme | `roommate://join?code=FLAT02` | Extracts `FLAT02` and resolves room |
| 5 | Live camera scan without `BarcodeDetector` | Video frame with QR | Falls back to `jsQR` and decodes correctly |
| 6 | Gallery image upload | PNG/JPEG screenshot of QR | Successfully decoded via `decodeQrFromImage` |
| 7 | Instant join policy room | User confirms join | Member added as `ACTIVE`, active room switched |
| 8 | Approval required room | User confirms join | Request created as `PENDING`, admin notified |
| 9 | User already a member | User submits code for current room | Shows `ALREADY_MEMBER` with direct "Open Room" CTA |
| 10 | Expired invitation | Code with past expiration | Returns clean `INVITE_EXPIRED` alert |
| 11 | Revoked invitation | Admin regenerated code | Old code returns `INVITE_UNAVAILABLE`, new code works |
| 12 | Offline QR generation | Device has no internet | QR code displays with zero external network requests |

---

## 5. Strategic Socratic Gate (Tier 0 Verification)

Before executing the implementation, please review these key design decisions:

1. **Camera Scanner Defaults**:
   - Would you like the scanner tab to support **both live camera streaming and gallery screenshot upload**, or keep camera-only with jsQR fallback?
2. **Short Code Format**:
   - Standard RoomMate invite codes are 6 uppercase alphanumeric characters (e.g., `FLAT02`, `ROOM99`). Should we auto-uppercase and format the input as the user types?
3. **Deep Link Experience**:
   - When a user taps a `/join/:code` link while the app is already open, should it immediately open the Room Confirmation modal inside the app?
