# Plan: Compact Room Action Pill (`+`) & Modal Streamlining

**Status:** Completed  
**Document:** `docs/PLAN-room-action-pill.md`  
**Task Slug:** `room-action-pill`  
**Primary Agent:** `frontend-specialist` / `mobile-developer`  
**Skills:** `clean-code`, `mobile-design`, `react-patterns`

---

## 1. Executive Summary & Problem Context

In the current shared room interface ([`MobileRoomLedger.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/MobileRoomLedger.tsx)), the top horizontal room switcher bar displays:
$$\text{[ 👥 Trimurti apt ]} \quad \text{[ + New Room ]} \quad \text{[ 👤+ Join ]}$$

### The Core UX Problems:
1. **Ambiguous Intent:** When a user is already an active member or admin of `Trimurti apt`, seeing a prominent `+ Join` button right next to the room pill creates cognitive confusion (*"Am I not joined yet? Do I need to click Join?"*).
2. **Horizontal Clutter:** Having two separate wide text buttons (`+ New Room` and `+ Join`) permanently consumes up to 50% of the horizontal scroll space on mobile devices, pushing active room tabs off-screen.
3. **Redundant Actions:** For 95% of students who belong to a single apartment or flat, displaying separate buttons for room creation and joining on the main screen every day is unnecessary cognitive noise.

### The Approved Solution (Option B):
Consolidate `+ New Room` and `+ Join` into a single, elegant **`[ + ]` Action Pill** at the end of the room list. Tapping `[ + ]` triggers a clean, mobile-optimized bottom sheet offering two explicit, unambiguous choices:
- 🏠 **Create a New Room** (*"Set up a flat, PG, or hostel room and invite flatmates"*).
- 🔑 **Join Another Room with Code** (*"Enter a 6-character room invite code from flatmates"*).

---

## 2. Technical Scope & Architecture

### Affected Files:
1. [`src/components/mobile/MobileRoomLedger.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/mobile/MobileRoomLedger.tsx)
   - Replace separate `New Room` and `Join` buttons in the horizontal room bar (lines 1093–1108) with the compact `+` pill.
   - Add state `showRoomActionSheet` (boolean).
   - Integrate `<MobileBottomSheet>` containing the two clear options.
2. [`src/components/RoomLedger.tsx`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/src/components/RoomLedger.tsx) (Desktop)
   - Audit desktop top bar to ensure consistent, unambiguous labeling (`+ Room` dropdown or explicit "Join Another Room" action).

---

## 3. UI/UX Specifications

### 3.1. Top Bar Pill Design
- **Shape & Size:** `min-h-[38px] w-9 h-9 sm:w-auto sm:px-3 rounded-full flex items-center justify-center gap-1`
- **Theme Styling:**
  - Light mode: `bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 shadow-2xs`
  - Dark mode: `dark:bg-[#1C1C25] dark:text-indigo-400 dark:border-indigo-900/60 dark:hover:bg-indigo-950/40`
- **Icon:** `<Plus className="w-4 h-4 stroke-[2.5]" />`
- **Accessibility:** `aria-label="Create or join another room"`, `title="Create or join another room"`
- **Haptic:** `hapticSelection()` triggered on tap.

### 3.2. Bottom Sheet: "Add or Join a Room"
When the `+` pill is tapped, open an ergonomic bottom sheet with 2 distinct action cards:

```
┌────────────────────────────────────────────────────────┐
│  Add or Join a Room                               ✕    │
│  Switch between your flat, hostel, or college clubs    │
├────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🏠  Create a New Room                            │  │
│  │     Set up a new shared ledger for your flat/PG   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔑  Join with Invite Code                        │  │
│  │     Enter a 6-digit code shared by a roommate     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

#### Card 1: Create a New Room
- **Icon:** `<Home className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />` inside `w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50`
- **Primary Text:** "Create a New Room" (font-bold text-sm text-slate-900 dark:text-white)
- **Secondary Text:** "Set up a shared expense ledger for your flat or hostel"
- **On Click:** Closes bottom sheet, opens existing `<CreateRoomModal>`.

#### Card 2: Join with Invite Code
- **Icon:** `<UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />` inside `w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50`
- **Primary Text:** "Join Another Room"
- **Secondary Text:** "Enter a 6-character room code shared by your flatmates"
- **On Click:** Closes bottom sheet, opens existing `<JoinRoomModal>`.

---

## 4. Edge Cases & Safeguards

1. **Zero Rooms State (`rooms.length === 0`):**
   - The empty-state card in the center of the screen already has prominent, self-explanatory `[ Create Room ]` and `[ Join with Code ]` buttons.
   - The top `+` pill will only appear when `rooms.length > 0`, keeping the empty state 100% focused.
2. **Keyboard Navigation & Esc Key:**
   - Standard modal escape handling closes the bottom sheet safely without state leaks.
3. **Offline Mode:**
   - Joining a room requires internet for invite code verification. If offline, the join action shows the existing offline warning banner.

---

## 5. Phased Implementation Roadmap

- [x] **Phase 1: Bottom Sheet Component**
  - Add `showRoomActionSheet` state in `MobileRoomLedger.tsx`.
  - Build `<MobileBottomSheet>` containing the two cards with theme-compliant colors and icons.
- [x] **Phase 2: Replace Top Bar Buttons**
  - Remove separate `New Room` and `Join` buttons from horizontal bar.
  - Render the single compact `+` icon pill at the end of the room tabs.
  - Wire onClick to open `showRoomActionSheet`.
  - Refined desktop label in `RoomLedger.tsx` to "Join Another Room".
- [x] **Phase 3: Verification & Polish**
  - Verified light and dark mode styling.
  - Full test suite: 80/80 test files passed (790/790 tests).
  - Oxlint static analysis: 0 errors, 0 warnings across 296 files.
  - Production build: Succeeded (`npm run build:prod`).

---

## 6. Acceptance Criteria

1. Top bar no longer shows the confusing text `[ + Join ]` next to existing rooms.
2. Clicking the `+` pill opens a clean, theme-matched bottom sheet.
3. Clicking "Create a New Room" opens the creation modal.
4. Clicking "Join with Invite Code" opens the 6-character join code modal.
5. All 790+ tests pass with zero Oxlint errors.
