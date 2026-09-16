# Implementation Plan: Full App Rebrand to RoomMate

Rebrand the entire application from **CampusFlow** to **RoomMate** ("Live Together. Spend Smarter.") across all UI components, desktop landing pages, mobile auth screens, UPI voucher generators, push notifications, and native Android configurations.

---

## User Review Required

> [!IMPORTANT]
> **Android Application ID (`package_name`) Decision**:
> We will update the user-facing app name (`appName` in `capacitor.config.ts`, `app_name` in `strings.xml`) to **"RoomMate"**.
> 
> *Should we also change the internal Android bundle ID from `io.campusflow.app` to `io.roommate.app`?*
> - **Keeping `io.campusflow.app` internally**: Seamlessly updates over existing installs without uninstalling the APK on test devices.
> - **Changing to `io.roommate.app`**: Complete brand isolation, but requires uninstalling the old app from your phone before installing the new APK.
> 
> *Recommended: Update user-facing names to "RoomMate" and update deep-link scheme to `roommate://`, with dual support for legacy keys.*

> [!NOTE]
> **Storage Migration & Persistence**:
> Existing users may have stored tokens, haptic preferences, or sound settings under `campusflow_*` localStorage keys. We will implement dual-read compatibility so existing sessions and preferences are preserved without logging users out.

---

## Proposed Changes

### Component 1: Mobile UI & Auth

#### [MODIFY] [MobileLogin.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/MobileLogin.tsx)
- Update demo user email placeholder to `rahul@roommate.app`.
- Ensure all headers, badge pills, and legal footers read **RoomMate**.

#### [MODIFY] [AppLockGateway.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/AppLockGateway.tsx)
- Change `"CampusFlow Vault Locked"` to `"RoomMate Vault Locked"`.
- Update biometric prompt reason: `"Unlock RoomMate Vault with..."`.
- Dual-read PIN from `roommate_vault_pin` with fallback to `campusflow_vault_pin`.

#### [MODIFY] [MobileProfile.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/MobileProfile.tsx)
- Ensure all card titles and settings labels say **RoomMate**.
- Support `roommate_*` localStorage keys with backward compatibility for `campusflow_*`.

---

### Component 2: Desktop & Navigation

#### [MODIFY] [Navbar.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/Navbar.tsx)
- Update brand text from `CampusFlow` to `RoomMate`.
- Update tagline to `Shared Expense Ledger & Room Vault`.

#### [MODIFY] [DesktopLandingPage.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/desktop/DesktopLandingPage.tsx)
- Replace all `CampusFlow` brand mentions with `RoomMate`.
- Update APK download prompt: `RoomMate-v1.2.0.apk`.
- Update TestFlight / iOS references, footer copyright, and value proposition cards.

#### [MODIFY] [SuperAdminPortal.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/SuperAdminPortal.tsx)
- Replace `CampusFlow` in header with `RoomMate Operations Console`.

#### [MODIFY] [SuperAdminLoginModal.tsx](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/desktop/SuperAdminLoginModal.tsx)
- Update admin email placeholder to `admin@roommate.app`.

---

### Component 3: Payments, Vouchers & Nudges

#### [MODIFY] [upiIntentService.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/lib/payments/upiIntentService.ts)
- Update WhatsApp share receipt header: `*RoomMate Settlement Receipt* 🧾✨`.
- Canvas voucher title: `ROOMMATE • VERIFIED SETTLEMENT VOUCHER`.
- Canvas voucher footer: `Generated on RoomMate Mobile • Student Expense & Ledger System`.
- Download image filename: `RoomMate_Settlement_<Name>_₹<Amount>.png`.

#### [MODIFY] [nudgeService.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/lib/ledger/nudgeService.ts)
- Update WhatsApp nudge signoffs: `_Tracked securely on RoomMate_` and `_Recorded by ${creditorName} on RoomMate_`.

---

### Component 4: Native & Service Integrations

#### [MODIFY] [backButton.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/lib/native/backButton.ts)
- Change exit confirmation message to: `Press back again to exit RoomMate`.

#### [MODIFY] [biometrics.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/lib/native/biometrics.ts)
- Update biometric prompt: `Scan Face ID or Fingerprint to unlock RoomMate resident vault`.

#### [MODIFY] [pushService.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/lib/firebase/pushService.ts)
- Update default notification title: `RoomMate Update`.

#### [MODIFY] [firebase-messaging-sw.js](file:///c:/Users/ASUS/Downloads/student%20expense%20app/public/firebase-messaging-sw.js)
- Update background notification title fallback to `RoomMate Alert`.

#### [MODIFY] [capacitor.config.ts](file:///c:/Users/ASUS/Downloads/student%20expense%20app/capacitor.config.ts)
- Update `appName: 'RoomMate'`.

#### [MODIFY] [strings.xml](file:///c:/Users/ASUS/Downloads/student%20expense%20app/android/app/src/main/res/values/strings.xml)
- Change `<string name="app_name">RoomMate</string>`.
- Change `<string name="title_activity_main">RoomMate</string>`.

---

## Verification Plan

### Automated Build Verification
- Run `npm run build` to verify clean TypeScript compilation and bundling.
- Run `npm run lint` (or `npx oxlint src`) to ensure zero syntax or lint errors.

### Manual Verification
1. **Login & Mobile Views**: Verify header, logo, and badge display "RoomMate" and "Live Together. Spend Smarter."
2. **Desktop View**: Verify navbar, landing hero, and APK download modal show "RoomMate".
3. **Receipt Generation**: Generate a UPI settlement receipt voucher and confirm it stamps "ROOMMATE • VERIFIED SETTLEMENT VOUCHER".
4. **WhatsApp Nudges**: Open Nudge Studio and preview template text to verify "Tracked securely on RoomMate".
5. **Android Native**: Check `strings.xml` to verify Android app launcher displays "RoomMate".
