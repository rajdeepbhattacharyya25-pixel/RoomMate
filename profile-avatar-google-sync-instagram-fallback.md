# Task: Profile Avatar Google Sync & Instagram Fallback

## 1. Goal
1. Automatically collect and set the Google account profile picture upon login or session load, while allowing the user to change or remove it at any time without subsequent logins overriding custom photos.
2. If there is no profile picture (or if removed), display a crisp, pixel-accurate Instagram-style default avatar (grey background with white head and torso capsule silhouette) app-wide.
3. Provide a clear "Change Photo" / "Remove Photo" action in Settings Account so users can easily manage their avatar.

## 2. Implementation Steps
- [ ] **Step 1: Create `src/components/common/UserAvatar.tsx`**
  - Implement reusable `UserAvatar` with Instagram default silhouette fallback (SVG: `#797E87` background, white circle head, white capsule torso matching user reference image).
  - Handle image error fallback (`onError`) gracefully.
  - Support multiple sizes (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`, or custom class), shapes (`rounded-2xl` or `rounded-full`), and image loading states.

- [ ] **Step 2: Google Photo Immediate Auto-Collection in `cloudStorageAdapter.ts` & `App.tsx`**
  - Ensure `syncOAuthSessionToProfile` extracts Google profile picture from `user_metadata.avatar_url`, `user_metadata.picture`, `user_metadata.photo_url`, and `identities[0].identity_data`.
  - Check `roommate_avatar_custom_${userId}` in `localStorage`. If user has NOT explicitly marked `'custom'` or `'removed'`, immediately adopt the Google avatar into `resolvedUser.avatarUrl` and persist to DB/local storage.

- [ ] **Step 3: Upgrade `AccountTab.tsx` Profile Photo Management**
  - Use `UserAvatar` for the 64x64 (`w-16 h-16 rounded-2xl`) profile avatar.
  - Add auto-fetch on mount: if `currentUser.avatarUrl` is empty and a Google session picture exists without explicit custom override, auto-apply it.
  - Add a dedicated photo action sheet/modal when clicking the camera button:
    - 📷 Upload new photo
    - 🌐 Re-import Google profile photo (if available)
    - 🗑️ Remove photo (revert to Instagram default fallback)
  - When photo is uploaded, mark `roommate_avatar_custom_${userId} = 'custom'`.
  - When photo is removed, mark `roommate_avatar_custom_${userId} = 'removed'` and set `avatarUrl = null`.

- [ ] **Step 4: Adopt `UserAvatar` App-wide**
  - Update `MobileDashboard.tsx` header avatar and member avatars.
  - Update `RoomMembersModal.tsx` admin and member avatars.
  - Update `MobileRoomLedger.tsx` debt summary and member avatars.
  - Update `RoomLedger.tsx` member avatars.

- [ ] **Step 5: Verification & Testing**
  - Add/update unit and integration tests covering:
    - Instagram default silhouette rendering when `avatarUrl` is null/empty.
    - Google photo auto-sync on OAuth session and custom override persistence.
    - Photo removal reverting to Instagram fallback.
  - Run `npx tsc --noEmit`, `npx oxlint src`, and `npx vitest run`.
