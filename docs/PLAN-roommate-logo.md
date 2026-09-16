# Implementation Plan: Integrate Official RoomMate Logo Across Landing Page

Integrate the official RoomMate app emblem (`/logo.png`) across all brand touchpoints on the landing page, replacing synthetic generic SVG placeholders with the authentic app logo used in the mobile application.

---

## User Review Required

> [!IMPORTANT]
> **Asset & Branding Source of Truth:**
> - Source: `public/logo.png` (the official high-resolution RoomMate app icon).
> - Presentation: Crisp, rounded corners (`rounded-xl` / `rounded-2xl`), proper aspect ratio preservation (`object-contain`), and graceful vector fallback matching `MobileLogin.tsx` and `AppLockGateway.tsx`.
> - Zero impact on layout stability: Fixed explicit dimensions (`width` & `height`) to eliminate cumulative layout shifts (CLS).

---

## 1. Logo Integration Touchpoints

### 1. Main Navigation Bar ([`LandingNavbar.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/LandingNavbar.tsx))
- **Current**: Hardcoded synthetic SVG rectangle with text.
- **Update**:
  - Replace the SVG rectangle with `/logo.png` (`w-9 h-9 rounded-xl object-contain shadow-xs`).
  - Pair with clean brand typography `Room` + `<span className="text-brand">Mate</span>`.
  - Maintain hover scale interaction (`group-hover:scale-105 transition-transform`).

### 2. Hero Interactive Product Mockup ([`HeroSection.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/HeroSection.tsx))
- **Current**: Plain text "My Personal Budget" / "Flat 402 Room Ledger" next to window dots.
- **Update**:
  - Add the official `/logo.png` emblem (`w-5 h-5 rounded-md object-contain`) in the mockup window titlebar.
  - Gives the interactive preview the authentic look and feel of the real mobile application.

### 3. Sideload Installation Guide Modal ([`SideloadGuideModal.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/SideloadGuideModal.tsx))
- **Current**: Generic shield icon in header.
- **Update**:
  - Replace shield with `/logo.png` (`w-10 h-10 rounded-2xl object-contain shadow-xs`).
  - Visitors immediately recognize the exact app launcher icon they are downloading to their Android or iOS device.

### 4. QR Code Phone Scanner Modal ([`QrCodeModal.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/QrCodeModal.tsx))
- **Current**: Generic Lucide `QrCode` icon in header and plain SVG QR grid.
- **Update**:
  - Header: feature `/logo.png` (`w-12 h-12 rounded-2xl object-contain shadow-sm`).
  - Center of QR code: embed a branded center emblem badge with `/logo.png` (standard branded QR pattern).

### 5. Final CTA Conversion Section ([`FinalCTASection.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/FinalCTASection.tsx))
- **Current**: Text badge only.
- **Update**:
  - Add the official `/logo.png` emblem (`w-16 h-16 rounded-3xl object-contain shadow-fin-glow border-2 border-white/20 mb-6 mx-auto`) hovering above the headline inside the dark teal card.
  - Creates a memorable final brand impression right before clicking "Get Started" or "Download APK".

### 6. Landing Footer ([`LandingFooter.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/LandingFooter.tsx))
- **Current**: Hardcoded synthetic SVG rectangle.
- **Update**:
  - Replace synthetic SVG with `/logo.png` (`w-10 h-10 rounded-xl object-contain shadow-xs`) paired with the `RoomMate` brand wordmark.

---

## 2. Proposed Changes & File Modifications

| File | Action | Purpose |
| :--- | :---: | :--- |
| [`src/components/landing/LandingNavbar.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/LandingNavbar.tsx) | MODIFY | Replace synthetic SVG mark with `/logo.png` in navbar header. |
| [`src/components/landing/HeroSection.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/HeroSection.tsx) | MODIFY | Add `/logo.png` in the hero interactive app window titlebar. |
| [`src/components/landing/SideloadGuideModal.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/SideloadGuideModal.tsx) | MODIFY | Use `/logo.png` in the modal header as the real app launcher icon. |
| [`src/components/landing/QrCodeModal.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/QrCodeModal.tsx) | MODIFY | Add `/logo.png` to modal header and center QR brand badge. |
| [`src/components/landing/FinalCTASection.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/FinalCTASection.tsx) | MODIFY | Feature `/logo.png` emblem above the conversion headline. |
| [`src/components/landing/LandingFooter.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/landing/LandingFooter.tsx) | MODIFY | Replace synthetic SVG mark with `/logo.png` in footer brand column. |

---

## 3. Verification Plan

### Automated Verification
1. `npm test`: Ensure all 13 test files and 130 tests pass.
2. `npm run lint`: Confirm 0 linter errors across all modified files.
3. `npm run build`: Verify production build succeeds with 0 errors.

### Visual & Interactive Browser Verification
1. Verify `/logo.png` renders sharply in the top navigation bar at all screen sizes.
2. Verify `/logo.png` renders cleanly in the hero mockup titlebar.
3. Verify `/logo.png` appears in the Sideload Guide modal and QR Code modal.
4. Verify `/logo.png` appears above the Final CTA block.
5. Verify `/logo.png` renders in the footer.
6. Verify fallback handling in case of image load delay.
