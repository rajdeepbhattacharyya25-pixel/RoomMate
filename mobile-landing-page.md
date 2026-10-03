# Mobile Landing Page & APK Download Access

## Goal
Ensure mobile web visitors searching/opening `https://roommate26.vercel.app/` land on the feature-rich landing page where they can explore features and download the Android APK, while maintaining a smooth entry path to the web app for new and existing users.

## Tasks
- [x] Task 1: Update `src/lib/platform/deviceDetector.ts` to return `'desktop'` (landing page mode) by default for all web browsers (both mobile and desktop) unless inside Capacitor native APK or URL params specify app mode (`?view=mobile`, `?view=app`, `?join=`, `?code=`, `?verified=`). → Verify: unit tests pass.
- [x] Task 2: Update `src/App.tsx` and `src/components/desktop/DesktopLandingPage.tsx` to pass `isAuthenticated` & `currentUser` to the landing page, and support "Go to Dashboard" when authenticated and "Get Started" when unauthenticated. → Verify: landing page displays properly in both states.
- [x] Task 3: Update `src/components/landing/LandingNavbar.tsx` and `src/components/landing/HeroSection.tsx` to show "Go to Dashboard" / "Launch Web App" dynamically based on `isAuthenticated`. → Verify: button text and actions react correctly.
- [x] Task 4: Add an optional "← Back to Product & APK Download" navigation option in `src/components/mobile/MobileLogin.tsx` when on web browsers (`!isNativeApp()`). → Verify: mobile web users on login screen can return to landing page with one tap.
- [x] Task 5: Update tests in `src/components/landing/downloadConfirmation.test.ts` to reflect the new mobile landing page routing behavior and verify all tests pass with `npm test`. → Verify: `npm test` runs with 100% pass rate.

## Done When
- [x] Opening `https://roommate26.vercel.app/` on a mobile browser immediately shows the landing page with APK download options.
- [x] Mobile web users can explore all features (Personal Vault, Shared Ledger, Settlements, etc.).
- [x] Mobile web users can tap "Get Started" or "Go to Dashboard" to access the web app.
- [x] Capacitor native APK users continue directly to the app without seeing the landing page.
- [x] All automated tests pass cleanly.
