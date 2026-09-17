# PLAN: Remove Hardcoded Dummy Data & Fix Google Sign-Up Room Isolation

**Goal:** Eliminate all hardcoded mock/staging data (Flat 302, Sneha, Amit, mock debts/notifications/bugs) and ensure newly signed-up Google users start with a clean state and are strictly isolated to rooms they created or joined.

---

## 1. Problem Statement & Root Cause

### Symptoms
1. A user signs up with Google and is immediately greeted with "Hi Rajdeep", "Roommates in Flat 302: Sneha, Amit", and Flat 302 room ledger.
2. The user was never asked to create or join a room, yet was automatically placed into "Flat 302" where Sneha and Amit are listed as flatmates.
3. The login page displayed a "Quick Select Account (Staging) - Flat 302" card and pre-filled inputs with `rajdeep@roommate.app`, `4821`, and `FLAT02`.

### Root Causes
1. **Mock Storage Auto-Seeding (`mockStorage.ts`)**: `DEFAULT_STAGING_SEEDS` contained hardcoded entries for Rajdeep (`usr-rajdeep-1`, `rajdeep@roommate.app`), Sneha (`usr-sneha-2`), Amit (`usr-amit-3`), Flat 302 (`room-flat-302`), and Flat 302 memberships. Whenever `localStorage` was initialized, `mockStorage.ts` saved these staging seeds into `localStorage`.
2. **`activeRoom` Defaulting in `App.tsx`**: `useState<Room | null>(() => db.getState().rooms[0] || null)` unconditionally selected the first room in the database (Flat 302), even if `currentUser` was not an active member of that room.
3. **Unfiltered Room Props**: `App.tsx` passed `rooms={dbState.rooms}` directly to `MobileLayout` instead of filtering to rooms where `currentUser` is an active member.
4. **Pre-filled Dummy Values in `MobileLogin.tsx`**: Login form state defaulted to `rajdeep@roommate.app`, PIN `4821`, invite code `FLAT02`, and rendered a 3-column staging shortcut for Flat 302.
5. **Existing Cached Dummy Data**: Existing user devices have the old seed data cached in `localStorage['roommate_saas_db_v1']`.

---

## 2. Implementation Tasks

### Task 1: Clean Mock Storage Seeds & Add Automatic Cache Sanitization
**File:** `src/lib/storage/mockStorage.ts`
- Strip dummy resident users (`usr-rajdeep-1`, `usr-sneha-2`, `usr-amit-3`) from `DEFAULT_STAGING_SEEDS`. Keep only `usr-superadmin-master` for admin management.
- Remove `room-flat-302`, `rm-rajdeep-1`, `rm-sneha-2`, `rm-amit-3`, and `inv-flat-302`.
- Remove dummy notifications (`notif-seed-1`, `notif-seed-2`, `notif-seed-3`), dummy bug reports, dummy feature suggestions, and dummy contact requests.
- In `MockDatabase.load()`:
  - Add an automatic sanitization migration that purges legacy dummy IDs (`usr-rajdeep-1`, `usr-sneha-2`, `usr-amit-3`, `room-flat-302`, etc.) from existing `localStorage` data so returning devices are immediately cleansed.
  - Do not auto-seed dummy resident rooms or users if storage is empty.

### Task 2: Fix Room Isolation & Dynamic Active Room in `App.tsx`
**File:** `src/App.tsx`
- Compute `userRooms`:
  ```ts
  const userRooms = useMemo(() => {
    return dbState.rooms.filter((r) =>
      dbState.roomMembers.some(
        (m) => m.roomId === r.id && m.userId === currentUser.id && m.status === 'ACTIVE'
      )
    );
  }, [dbState.rooms, dbState.roomMembers, currentUser.id]);
  ```
- Initialize and update `activeRoom` strictly against `userRooms`:
  - If `userRooms.length === 0`, `activeRoom` is `null`.
  - When `currentUser` logs in or switches, re-evaluate `activeRoom` to only select a room belonging to `userRooms`.
- Pass `rooms={userRooms}` to `MobileLayout` and child components so users never see rooms they have not joined.

### Task 3: Remove Hardcoded Dummy Data & Staging Shortcuts in `MobileLogin.tsx`
**File:** `src/components/mobile/MobileLogin.tsx`
- Remove the "Quick Select Account (Staging) - Flat 302" demo row.
- Remove pre-filled default state values:
  - `identifier`: `''` (placeholder: "Enter email or phone")
  - `password`: `''`
  - `joinInviteCode`: `''` (placeholder: "e.g. FLAT02")
  - `joinPin`: `''`
- Remove all fallback references to `DEFAULT_STAGING_SEEDS.users`.

### Task 4: Polish 0-Room Empty States on Mobile Dashboard & Ledger
**Files:** `src/components/mobile/MobileDashboard.tsx`, `src/components/mobile/MobileRoomLedger.tsx`
- **`MobileDashboard.tsx`**:
  - When `activeRoom` is `null`, display an inviting card encouraging the user to "Create or Join a Room" instead of showing "Roommates in Flat 302" or empty roommate lists.
  - Ensure net balance hero card reflects zero state without claiming settlement with non-existent roommates.
- **`MobileRoomLedger.tsx`**:
  - When `!activeRoom` or `rooms.length === 0`, only show the "No Shared Rooms Yet" action card with "Create Room" and "Join with Code" buttons.
  - Hide the debt settlement matrix, member lists, and history for non-existent rooms.

### Task 5: Clean Static "Flat 302" References in Admin Views
**Files:** `src/components/admin/pages/AdminDashboard.tsx`, `src/components/admin/pages/AdminUserDetailModal.tsx`
- Replace hardcoded "Flat 302" strings with generic or dynamic room names.

---

## 3. Verification Plan

1. **Automated Unit Tests**: Run `npm test` to ensure all 140+ Vitest tests continue to pass.
2. **First-Time Google Sign-Up Simulation**:
   - Clear `localStorage`.
   - Sign up / sign in with a new user.
   - Verify:
     - No Flat 302 appears.
     - Sneha and Amit are nowhere in the app.
     - Dashboard displays a clean 0-room state prompting to create or join a room.
     - Rooms tab shows "No Shared Rooms Yet" with "Create Room" and "Join with Code".
3. **Legacy Cache Migration Verification**:
   - Populate `localStorage` with old staging data containing `room-flat-302` and `usr-sneha-2`.
   - Reload app and verify the sanitization routine automatically removes the dummy records.
4. **Room Creation & Isolation Verification**:
   - Create a new room (e.g. "Green Villa") as the logged-in user.
   - Verify the user is now the sole Admin of "Green Villa" with 1 active member.
