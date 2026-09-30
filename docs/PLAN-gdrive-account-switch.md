# Project Plan: Google Drive Account Switching & Streamlined Backup Flow

**File:** `docs/PLAN-gdrive-account-switch.md`  
**Mode:** PLANNING ONLY (No Code)  
**Task Slug:** `gdrive-account-switch`  
**Target Component:** `src/components/mobile/settings/modals/GoogleDriveBackupModal.tsx` & `src/lib/services/googleDriveService.ts`  
**Architecture:** Option 1 (Direct Account Switching & In-App OAuth) as Primary Experience, with Option 2 (Native System Share Sheet) as Seamless Fallback.

---

## 1. Context & User Flow

Currently, the Google Drive backup modal shows a dotted card with an email input box and an account card that can feel confusing or cluttered. The goal is to streamline the experience into an intuitive, modern 6-step flow:

```
Settings
   ↓
Data & Backup (Backup & Restore)
   ↓
Google Drive Backup Modal
   ↓
Connected Account Card (Showing active destination with avatar & status)
   ↓
[ Change Google account ] (1-tap action)
   ↓
Google Account Picker (Native Google OAuth select_account prompt)
   ↓
Authorize RoomMate (drive.file scope)
   ↓
Backup Destination Confirmed (Visual badge + 1-tap "Backup Now" trigger)
   │
   └── [ Fallback ] ──> Save to Drive via System Share Sheet (Always available)
```

---

## 2. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **Mobile UX Designer** | `mobile-design`, `frontend-design` | Redesign the "Connected Account" card with modern status pills, clear "Change Google account" action, and graceful fallback alert banner. |
| **Frontend Engineer** | `react-components`, `clean-code` | Implement account switching logic, prompt trigger, account persistence, and destination confirmation in `GoogleDriveBackupModal.tsx`. |
| **Security & Auth Specialist** | `google-drive-service`, `clean-code` | Ensure `select_account` prompt is reliably passed, tokens stored securely in memory, and PIN encryption remains strictly local AES-256. |
| **QA Engineer** | `testing-patterns` | Verify account switching across multiple accounts, fallback behavior when Google Client ID is unconfigured, and test build. |

---

## 3. UI/UX Specifications

### A. Connected Account Card (Primary View)
Instead of multiple competing boxes, display a unified **Destination Card**:
- **Avatar & Name:** Google profile picture (or initial circle) with user's name & email.
- **Status Badge:** Emerald pill badge `Active Destination` or `Ready to Backup`.
- **Change Action Button:**
  - Styled as a sleek, outlined/ghost button: `[ 🔄 Change Account ]` or `[ Switch Account ]` with 44px touch target.
  - Tapping it triggers `handleSwitchGoogleAccount()`.

### B. Account Switch Interaction
1. When user taps `[ Change Google account ]`:
   - Triggers `requestGoogleDriveAuthorization()` with `{ prompt: 'select_account' }`.
   - Google Identity Services pops up the Google Account Picker ("Choose an account to continue to RoomMate").
2. User selects an account or enters new credentials.
3. Upon approval:
   - Newly selected account is saved to `localStorage` (`roommate_google_drive_accounts`).
   - Modal dynamically updates the Connected Account card.
   - Triggers a subtle tactile haptic (`hapticSuccess()`) and shows a brief confirmation toast/pill: *"Backup destination updated to user@gmail.com"*.
   - User enters their 4-digit PIN (pre-filled if previously configured) and taps **"Backup to Google Drive"**.

### C. Fallback Experience (Option 2)
- At the bottom of the modal, retain the clean secondary button:
  - `[ 📤 Save to Drive via System Share Sheet ]`
  - Subtitle / Helper text: *"No Google setup needed • Uses your phone's native Google Drive app"*.
- If `VITE_GOOGLE_CLIENT_ID` is missing or Google OAuth fails:
  - Display an inline contextual helper that highlights the System Share Sheet button so the user is never blocked.

---

## 4. Implementation Touchpoints

### 1. `src/components/mobile/settings/modals/GoogleDriveBackupModal.tsx`
- **State Refinement:**
  - Simplify account selection state: replace `isAddNew` and text input with a focused `activeAccount: GoogleDriveAccount | null`.
  - Add `isSwitchingAccount: boolean` indicator for instant visual feedback while Google OAuth opens.
- **Component Layout:**
  - **Header:** "Google Drive Backup" with destination subtitle.
  - **Section 1: Backup Destination (Connected Account Card):**
    - Displays active Google account.
    - Prominent `Change Account` button.
  - **Section 2: Encryption PIN:**
    - 4-digit PIN input with reveal toggle.
  - **Section 3: Actions:**
    - Primary CTA: `[ ☁️ Authorize & Backup to Google Drive ]`
    - Divider: "OR"
    - Secondary Fallback: `[ 📤 Save to Drive via System Share Sheet ]`

### 2. `src/lib/services/googleDriveService.ts`
- Ensure `requestGoogleDriveAuthorization` supports explicit account switching:
  - Always enforce `prompt: 'select_account'` when switching.
  - Return clean error messages if Client ID is unconfigured with clear fallback recommendations.

---

## 5. Edge Cases & Safeguards

1. **User Closes Account Picker Without Selecting:**
   - Detect `popup_closed_by_user` or `cancelled`.
   - Retain previous connected account without breaking UI or showing error red flags.
2. **Missing `VITE_GOOGLE_CLIENT_ID`:**
   - Modal displays a friendly inline alert explaining that direct cloud upload requires a Google Client ID, while immediately offering the 1-tap **System Share Sheet** fallback.
3. **Multiple Stored Accounts:**
   - Provide an optional quick dropdown/sheet if the user has previously connected 2+ accounts, plus the "Sign into another account" option.
4. **Data Privacy Guarantee:**
   - Highlight the `drive.file` scope notice: RoomMate can only access its own `.rmvault` files and can never view or read existing personal documents.

---

## 6. Verification Checklist

- [ ] Connected account card clearly displays current Google user and destination status.
- [ ] Tapping "[ Change Google account ]" initiates Google's `select_account` picker.
- [ ] Selecting a new account updates the connected account card with instant visual confirmation.
- [ ] Cancelling the Google picker leaves the current account intact without error state.
- [ ] Encryption PIN input works with auto-population from local vault.
- [ ] Fallback button ("Save to Drive via System Share Sheet") operates smoothly on Android devices.
- [ ] Dark mode and light mode styles match RoomMate design tokens.
- [ ] TypeScript build passes with zero errors (`npm run build`).
