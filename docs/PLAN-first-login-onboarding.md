# Plan: First-Login Profile Setup & Google Sign-In Onboarding

**Document ID**: `docs/PLAN-first-login-onboarding.md`  
**Status**: Ready for Review  
**Date**: September 2026  
**Target Platform**: RoomMate Mobile (Android / Capacitor) & Web

---

## 1. Executive Summary

Improve the RoomMate onboarding experience so that immediately after a user **signs up or logs in for the first time** (especially via **Google Sign-In**), the application automatically initializes their basic profile information:
1. Automatically extract the user's **first name** from their Google account metadata.
2. Display the extracted first name in a confirmation/edit prompt ("Is this correct?").
3. Allow the user to edit their first name immediately.
4. Persist the confirmed/edited name to the backend (`profiles.name`).
5. Ask the user to provide their **phone number** after first-name confirmation.
6. Validate and persist the phone number to the backend (`profiles.phone`).
7. Reflect the canonical profile information across **SuperAdmin → Room Users**.
8. Keep existing **Settings → Account** fully intact and add phone number editing so users can change their details anytime.
9. Support non-Google sign-ups seamlessly with manual first-name input.

---

## 2. Architecture & Design Decisions

### 2.1 Canonical Schema Reuse
- We reuse the canonical `name` and `phone` columns on `public.profiles`.
- We add `onboarding_completed BOOLEAN NOT NULL DEFAULT false` to `public.profiles` to track completion state authoritatively on the backend without relying on `localStorage`.
- Existing users with populated `name` and `phone` are automatically migrated with `onboarding_completed = true`.

### 2.2 Google First Name Extraction Logic
```typescript
export function extractGoogleFirstName(metadata?: Record<string, unknown>, email?: string): string {
  if (metadata?.given_name && typeof metadata.given_name === 'string' && metadata.given_name.trim()) {
    return metadata.given_name.trim();
  }
  if (metadata?.first_name && typeof metadata.first_name === 'string' && metadata.first_name.trim()) {
    return metadata.first_name.trim();
  }
  const fullName = (metadata?.full_name as string) || (metadata?.name as string);
  if (fullName && typeof fullName === 'string' && fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'Resident';
}
```

### 2.3 First-Login Detection & State Flow
```
User Authenticates (Google or Email/Password)
                 ↓
      Backend Profile Lookup
                 ↓
    Is onboarding_completed == true?
            /        \
          YES         NO
          /             \
Open RoomMate normally   Does profile have confirmed name?
                             /          \
                           YES           NO
                           /              \
                   Skip to Phone       Show Step 1:
                       Step          "Is your first name [Name]?"
                                          ↓
                                     User Confirms / Edits
                                          ↓
                                     Save Name to Backend
                                          ↓
                                      Show Step 2:
                                    "Add phone number"
                                          ↓
                                    Validate Phone (+91 XXXXX XXXXX)
                                          ↓
                                    Save Phone + Set
                                  onboarding_completed = true
                                          ↓
                              PIN Setup (if not yet configured)
                                          ↓
                                     Enter RoomMate
```

---

## 3. Detailed Component Plan

### 3.1 Migration: `supabase/migrations/20260917_profiles_onboarding_completed.sql`
- Add `onboarding_completed` boolean column to `profiles`.
- Create index on `onboarding_completed`.
- Backfill existing users who already have both name and phone.
- Update `handle_new_user()` trigger to use extracted first name and default `onboarding_completed = false`.

### 3.2 Storage Adapter: `src/lib/storage/cloudStorageAdapter.ts`
- Add `extractGoogleFirstName(metadata, email)`.
- Add `validateAndFormatPhoneNumber(phone)`.
- Add `updateProfilePhone(userId, phone)`.
- Add `completeProfileOnboarding(userId, { name, phone })`.
- Update `syncOAuthSessionToProfile` to return `needsProfileOnboarding`, `extractedFirstName`, and preserve existing user names.

### 3.3 UI: `src/components/mobile/FirstLoginOnboardingModal.tsx`
- Step 1: Welcome & First Name confirmation/edit.
- Step 2: Phone Number setup with auto-formatting and validation.
- Responsive design for mobile sheet and desktop modal.
- Failure handling: inline error messages, disables submit while saving.

### 3.4 Settings → Account: `src/components/mobile/settings/modals/EditPhoneModal.tsx` & `AccountTab.tsx`
- Display phone number in profile card.
- Add `Edit Phone` button next to `Edit Name`.
- Connect to `updateProfilePhone`.

### 3.5 SuperAdmin → Room Users: `src/components/admin/pages/AdminUsers.tsx`
- Ensure Name, Email, and Phone columns display canonical user data.
- Update column header to "Phone Number".

### 3.6 App Integration: `src/App.tsx`
- Wire `onboardingUser` state in Google session listener and auth handlers.
- Render `FirstLoginOnboardingModal` for uncompleted profiles before dashboard access.

---

## 4. Verification Plan

1. **Unit & Integration Tests**:
   - `src/lib/storage/profileOnboarding.test.ts` testing extraction, validation, and sync behavior.
2. **Automated Vitest Run**:
   - Execute `npm test` to ensure 100% test pass rate across all suites.
3. **Manual Flow Testing**:
   - New Google user flow (name edit -> phone entry -> dashboard).
   - Returning Google user (instant login, no prompt).
   - Existing users (no overwrite of existing data).
   - Settings -> Account (edit name and edit phone).
   - SuperAdmin -> Room Users reflection.
