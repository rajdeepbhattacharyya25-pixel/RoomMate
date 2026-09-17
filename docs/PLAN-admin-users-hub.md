# PLAN: Superadmin Users Management Power Suite & Contact Hub

**Status**: Draft / Pending Approval  
**Target Area**: SuperAdmin Portal (`src/components/admin/pages/AdminUsers.tsx`, `src/components/admin/common/DataTable.tsx`)  
**Scope**: Omni-search, multi-attribute sort presets, interactive summary badges, 1-tap WhatsApp/Call contact shortcuts, and onboarding health filters.

---

## 1. Problem Statement & Motivation
In the current SuperAdmin console:
1. **Search Limitations**: Administrators can only search by name or email. Searching by mobile phone numbers (with or without `+91`, spaces, or hyphens), UPI IDs, or User UUIDs fails to return matching records.
2. **Sorting Controls**: Admins cannot easily choose sorting presets like "Newest first", "Oldest first", "Alphabetical A–Z / Z–A", or "Most rooms", especially on tablet or mobile viewports where clicking thin column headers is cumbersome.
3. **Contact Friction**: When resolving resident payment disputes, verifying identities, or troubleshooting room locks, admins have to manually copy phone numbers and paste them into WhatsApp or phone dialers.
4. **Resident Onboarding Blindspots**: Admins cannot quickly identify residents who have registered but never joined a room (0 rooms, high churn risk) or residents who haven't completed phone verification.

---

## 2. Proposed Architecture & Solutions

### A. Omni-Search Engine
Expand the search filter in `AdminUsers.tsx` to match:
- **Resident Name** (case-insensitive substring)
- **Email** (case-insensitive substring)
- **Phone Number** (both formatted string e.g. `+91 99999 00000` and digit-normalized match `9999900000` stripped of spaces, dashes, parentheses)
- **User ID / Supabase UUID** (full or partial ID e.g. `usr_...` or hex UUID)
- **UPI ID** (e.g. `user@okaxis`)
- **Assigned Room Names** (matching any room name the resident belongs to via `roomMembers`)
- **Role** (`Student` or `SuperAdmin`)

### B. Sort Presets Dropdown & Custom Comparator Support
Add a dedicated Sort Dropdown to the table toolbar:
1. `newest`: 🕒 Newest Registered (Default: `createdAt` desc)
2. `oldest`: ⏳ Oldest Registered (`createdAt` asc)
3. `name_asc`: 🔤 Resident Name (A → Z)
4. `name_desc`: 🔠 Resident Name (Z → A)
5. `rooms_desc`: 🏠 Most Rooms (Computed count high to low)
6. `rooms_asc`: 🚪 Least Rooms (Computed count low to high)

Enhance `DataTable.tsx` with `sortValue?: (row: T) => any` in `Column<T>` so that clicking the "Rooms" column header also correctly sorts by the dynamically computed room count rather than failing on an undefined property.

### C. Interactive Summary Metric Pills (Click-to-Filter)
Convert the top summary badges into interactive, toggleable filter pills:
- **Total Residents**: Shows all residents (clears status/phone/room filters)
- **Active Residents**: Filters to active users only
- **Suspended Residents**: Filters to suspended users only
- **Unassigned (0 Rooms)**: Highlights residents who haven't joined any room yet
- **Missing Phone**: Highlights residents without a phone number

Include an active visual indicator (ring/glow) and a "Clear Filters" badge when any non-default filter is applied.

### D. Contact Hub (1-Tap WhatsApp, Call & Copy)
In the Phone Number table cell and detail views:
- **🟢 1-Tap WhatsApp Action**: Leverages `generateWhatsAppUrl` from `src/lib/ledger/nudgeService.ts` to launch a WhatsApp chat (`wa.me/91...`) with a polite admin message header.
- **📞 Direct Call Action**: `tel:${phone}` link for mobile/VoIP dialer.
- **📋 1-Tap Copy Action**: Copies the phone number to the clipboard with visual confirmation (check icon for 2 seconds).
- **Missing Phone Alert**: A subtle "Missing" badge with a 1-tap option to send an in-app reminder notification directly to the resident.

---

## 3. Files to Modify

| File | Change Type | Description |
|---|---|---|
| `src/components/admin/common/DataTable.tsx` | Modify | Add `sortValue` function support in `Column<T>` for computed values (like room count). |
| `src/components/admin/pages/AdminUsers.tsx` | Modify | Implement omni-search, sort presets, interactive summary pills, room/phone dropdowns, and contact action buttons. |
| `src/components/admin/pages/AdminUsers.test.ts` | New | Comprehensive unit tests for omni-search matching, phone normalization, sorting presets, and filtering logic. |

---

## 4. Verification & Testing Plan
1. **Automated Unit Tests**:
   - `npm run test` to verify omni-search logic across phone numbers, emails, UUIDs, UPI IDs, and room names.
   - Verify sort preset ordering for dates, names, and room counts.
2. **Linting & Code Quality**:
   - `npm run lint` (`oxlint src`) to ensure 0 errors.
   - `npx tsc -b` to guarantee TypeScript type safety.
3. **Manual Verification via Browser**:
   - Test searching by phone with spaces (`+91 80135 34817`) and raw digits (`8013534817`).
   - Test sorting by Newest, Oldest, A-Z, Z-A, and Most Rooms.
   - Test clicking metric pills (Active, Suspended, No Rooms, Missing Phone).
   - Test WhatsApp URL trigger and copy-to-clipboard functionality.
