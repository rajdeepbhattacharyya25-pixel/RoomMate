# Project Plan: Mobile Resident Authentication & Access (Biometrics, Smart Password Strength & JWT Verification)

**File:** `docs/PLAN-mobile-login.md`  
**Mode:** PLANNING ONLY  
**Task Slug:** `mobile-login`  
**Target:** 390px Mobile Touch-First Login & Passcode Creation for Residents with Biometrics, Password Strength Meter, Smart Suggestions, and JWT Token Verification.

---

## 1. Objectives & User Directives

- **User Directives:**
  > "okay remove the superadmin option ... include biometrics login and weak medium strong password suggestion... when creating a new password... include JWT verification"

- **Critical Specifications:**
  1. **Zero Super Admin on Mobile Login:** Super Admin portal option is completely removed from the login flow. The mobile entry is 100% purpose-built for Residents and Room Members.
  2. **Strict Terminology Rule:** Never use the word **"student"** or **"students"** anywhere. Strictly use **"Resident"**, **"Member"**, or **"Roommate"**.
  3. **Biometrics Authentication:**
     - Support for iOS Face ID / Android Biometric unlock via WebAuthn API (with fallback biometric scanning simulation modal and pulse animations).
     - 1-tap biometric re-authentication for cached resident credentials.
  4. **Dynamic Password Strength & Generator (Weak / Medium / Strong):**
     - Active when creating/setting a new password or PIN.
     - Live 3-segment visual meter:
       - **Weak (Red):** `< 6 chars` or only letters.
       - **Medium (Amber):** `6-8 chars` with mixed alphanumeric.
       - **Strong (Emerald):** `8+ chars` with uppercase, numbers, and special symbols.
     - Real-time rule pills: `8+ Chars`, `Uppercase`, `Number`, `Symbol`.
     - **Smart Password Suggestion Pill:** Displays generated high-entropy passwords (e.g., `CmpF#982!vX`) with a 1-tap `Use Suggestion` button that populates the field.
  5. **JWT Token Verification Architecture:**
     - Session issuance with cryptographic JWT format (`header.payload.signature`).
     - Includes payload claims: `sub`, `name`, `email`, `role: "RESIDENT"`, `iat`, `exp`, `iss: "campusflow-vault"`, `jti`.
     - Cryptographic/Base64 verification utility validating token integrity, non-tampering, and expiration.
     - Visual trust badge: `🔒 256-bit JWT Verified Session`.
  6. **Stitch Mobile Prototype:**
     - Screen ID: `be672bd924b44c44b009825e54f9caa1`
     - Title: `CampusFlow - Resident Authentication & Access`
     - [View Stitch Mobile Prototype](https://lh3.googleusercontent.com/aida/AEtjO1XEFfY-bRLCajVz6Wyg0P5v5IOsAG7UIQeYjdgJBdJhfHRbwju74CHbKgL-WIjC_MmRj0R48xA5qdU34qoP7u8XZXRgv_rKtA19pHUlvlLzKHU4YnjUHxaSVAaiVOIE76dV96SEgrj99kmOMPUOUe8I2FT_eaxJZ--X4faCene4w-auJotXQtQcJU96lvSammWxWmDyrXjMic9WB_B9LFGJkkPVNGbOVEyescCNXEWGrJZMMSPi3hrYXuQ)

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **UX & Stitch Lead** | `stitch-loop`, `ui-ux-pro-max`, `DESIGN.md` | Stitch screen integration, tactile 44pt touch targets, biometric scanning animation modal. |
| **Mobile Frontend Engineer** | `react-components`, `mobile-design` | Implement `src/components/mobile/MobileLogin.tsx` with Sign In vs Create Passcode segmented tabs. |
| **Security & JWT Architect** | `supabase`, `clean-code` | Implement `src/lib/auth/jwtService.ts` for token signing, base64url decoding, expiry checks, and signature verification. |
| **QA & Accessibility Auditor** | `accessibility-audit`, `oxlint` | Verify contrast (≥4.5:1), zero "student" regex matches, keyboard navigation, password strength scoring accuracy. |

---

## 3. UI/UX Flow & Component Structure

```
+------------------------------------------+
|  9:41                             [WiFi] |  <- iOS Status Bar
+------------------------------------------+
|                                          |
|            [ 🛡️ CampusFlow ]              |  <- Vault Icon Badge
|        CampusFlow - Resident Access      |  <- Title (No "student")
|         Room Ledger & Personal Vault     |  <- Subtitle
|      [ Flat 302 Ledger • Secured ]       |  <- Status Pill
|                                          |
|   +----------------------------------+   |
|   |   [ Sign In ]  | Create Passcode |   |  <- Segmented Tab Control
|   +----------------------------------+   |
|                                          |
|   [TAB 1: SIGN IN AS RESIDENT]           |
|   +----------------------------------+   |
|   | ✉️ Email or Mobile Number        |   |
|   +----------------------------------+   |
|   | 🔒 Passcode / PIN           [👁️] |   |
|   +----------------------------------+   |
|                                          |
|   +----------------------------------+   |
|   | 🪪 Sign In with Face ID / Touch  |   |  <- Biometric Primary Trigger
|   +----------------------------------+   |
|                                          |
|   +----------------------------------+   |
|   | ⚡ Sign In as Resident           |   |  <- Indigo 52px CTA
|   +----------------------------------+   |
|                                          |
|   [TAB 2: CREATE PASSCODE / ACCOUNT]     |
|   +----------------------------------+   |
|   | 🔑 Set New Passcode              |   |
|   +----------------------------------+   |
|   | [==== WEAK ===][ MEDIUM ][ STRONG ]  |  <- 3-Segment Color Bar
|   | 💡 Suggested: CmpF#982!vX [Use] |   |  <- Smart Generator Pill
|   | [✓ 8+ chars] [✓ Upper] [✓ Number]    |  <- Validation Badges
|   +----------------------------------+   |
|                                          |
|   ── QUICK DEMO RESIDENTS (FLAT 302) ──  |
|   [ (R) Rajdeep ] [ (S) Sneha ] [ (A) Amit ]  <- 1-Tap Instant Auth
|                                          |
|   🔒 256-bit JWT Verified Session        |  <- Active Token Verification Badge
|                                          |
|   +----------------------------------+   |
|   | 🔑 Join Room with Invite Code    |   |  <- Direct Onboarding
|   +----------------------------------+   |
|                                          |
|                  ──────                  |  <- iOS Home Bar
+------------------------------------------+
```

---

## 4. JWT Verification Engine (`src/lib/auth/jwtService.ts`)

A dedicated lightweight JWT service implementing standard RFC 7519 token handling:
- **`createJwtSession(user: User)`**:
  - Encodes header: `{"alg": "HS256", "typ": "JWT"}`
  - Encodes payload: `user.id`, `user.email`, `user.name`, `role: "RESIDENT"`, `iat`, `exp` (+7 days), `iss: "campusflow-vault"`, `jti`.
  - Signs payload with mock secret key or Supabase auth session token.
- **`verifyJwtToken(token: string)`**:
  - Parses header, payload, and signature.
  - Checks expiration timestamp (`exp > Date.now() / 1000`).
  - Verifies issuer and role authenticity.
  - Emits verification status: `{ isValid: boolean; payload?: ResidentJwtPayload; error?: string }`.
- **`storeToken(token)` / `getStoredToken()`**: Persists verified session in `localStorage` under `campusflow_jwt_token`.

---

## 5. Phase-by-Phase Implementation Roadmap

### Phase 1: Stitch Asset Review & Schema Sync
- [x] Generated Screen in Stitch: `CampusFlow - Resident Authentication & Access` (`be672bd924b44c44b009825e54f9caa1`).
- [ ] Add new screen to `stitch.json` with screenshot and HTML asset links.
- [ ] Ensure full adherence to `DESIGN.md` light slate/indigo tokens.

### Phase 2: JWT Security Engine
- [ ] Create `src/lib/auth/jwtService.ts`:
  - RFC 7519 Base64URL encoding/decoding.
  - Expiry and signature validation.
  - Resident session payload extraction.
  - Unit tests/mock verification helper.

### Phase 3: Mobile Resident Auth Component (`MobileLogin.tsx`)
- [ ] Create `src/components/mobile/MobileLogin.tsx`:
  - Segmented toggle: **Sign In** vs **Create Passcode**.
  - **Biometric Authentication Trigger:**
    - WebAuthn / Touch ID / Face ID trigger.
    - Modal sheet with biometric scanning pulse animation and haptic feedback simulation.
  - **Dynamic Password Strength Meter:**
    - Weak (Red), Medium (Amber), Strong (Emerald).
    - Suggestion pill with 1-tap "Use Suggestion" button.
    - Live criteria status chips.
  - **JWT Verified Session Badge:**
    - Displays active token status and expiration countdown.
  - **Quick Demo Residents:**
    - 1-tap login for Rajdeep, Sneha, Amit.
  - **Strict Language Check:** Zero occurrences of the word "student".

### Phase 4: App State & Integration
- [ ] Integrate JWT session verification in `App.tsx`:
  - On app load, check stored JWT token via `jwtService.verifyJwtToken()`.
  - If valid and unexpired, automatically restore resident session.
  - If invalid/missing, present `MobileLogin`.
  - Provide "Log Out" action in `MobileProfile.tsx` which invalidates the JWT and returns to `MobileLogin`.

### Phase 5: Verification & Auditing
- [ ] Verify zero TypeScript errors (`tsc -b`).
- [ ] Run `oxlint` for style compliance.
- [ ] Ripgrep check confirming zero instances of `/student/i` in `MobileLogin.tsx`.
- [ ] Test biometric flow, password strength meter, suggestion generator, and JWT expiry.
