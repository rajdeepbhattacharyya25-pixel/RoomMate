# Project Plan: RoomMate System-Wide Dark Mode Implementation

**Task Slug**: `dark-mode`  
**Target File**: `docs/PLAN-dark-mode.md`  
**Status**: Ready for Implementation / Architecture Confirmed  
**Target Architecture**: Hybrid Token Architecture (Tailwind `darkMode: 'class'` + CSS Semantic Custom Properties)  
**System Integration**: Full Native Capacitor StatusBar & Web Meta Theme-Color Synchronization  
**Primary Scope**: Mobile Resident Shell, Navigation, All Screens, All 15+ Settings Modals, Bottom Sheets, Auth, and Desktop Simulator Frame  

---

## 1. Executive Summary & Core Directives

### Objective
Elevate RoomMate from a light-only interface with a cosmetic theme toggle into a **cohesive, high-fidelity, system-wide dark theme**. When the user toggles between **SYSTEM**, **LIGHT**, and **DARK** in `Settings → Preferences → Appearance & Theme`, the entire application transitions instantaneously and persists reliably across app restarts, reloads, and Android activity recreations.

### Strict Guardrails & Non-Negotiables
1. **Preserve Existing Design Identity**: Retain RoomMate's signature Electric Indigo / Purple accent (`#6366F1` / `#4F46E5`), layout geometries, border-radii (`rounded-2xl`, `rounded-xl`), typography scale (`Inter`, tabular numbers for ₹ currency), and core expense calculation UX.
2. **No Pure Black (#000000) Canvas**: Employ a sophisticated layered dark palette tailored for financial legibility and nighttime student use:
   - **Canvas / App Background**: `#0B0B10`
   - **Primary Surface / Bottom Sheet / Nav**: `#12121A`
   - **Elevated Surfaces / Inputs**: `#181820` / `#20202A`
   - **Cards & Ledger Containers**: `#1C1C25`
   - **Borders & Dividers**: Low-contrast neutral slate (`#27354A` / `#222A3A`)
   - **Text Hierarchy**: Pure Ivory Chalk (`#F8FAFC`), Soft Slate Silver (`#94A3B8`), Muted Gray (`#64748B`)
3. **No White Flash (FOUC)**: Synchronously hydrate theme preference in `<head>` before React renders to prevent light-to-dark flashing on reload.
4. **Preserve All Business Logic & Data Contracts**: Theme implementation only. Zero changes to Supabase schema, authentication, RLS, financial ledger computations, or cloud sync adapters.

---

## 2. Phase 0: Centralized Token System & Build Configuration

### 2.1 Tailwind CSS Configuration (`index.html`)
- **Configure Class-based Dark Mode**: Add `darkMode: 'class'` to the inline `tailwind.config` in `index.html` (currently missing, causing `dark:` variants to be ignored).
- **Extend Semantic Color Palette**:
  ```javascript
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          surface: {
            base: 'var(--bg-canvas)',
            card: 'var(--bg-surface)',
            elevated: 'var(--bg-surface-elevated)',
            input: 'var(--bg-input)'
          },
          border: {
            subtle: 'var(--border-subtle)',
            divider: 'var(--border-divider)'
          }
        }
      }
    }
  };
  ```

### 2.2 CSS Semantic Variables (`src/index.css`)
Expand `:root` and `.dark` blocks in `src/index.css`:
```css
:root {
  --bg-canvas: #f9f9ff;
  --bg-surface: #ffffff;
  --bg-surface-elevated: #ffffff;
  --bg-surface-subtle: #f3f4f6;
  --bg-card: #ffffff;
  --bg-input: #ffffff;
  --border-subtle: #e5e7eb;
  --border-divider: #f1f5f9;
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --text-muted: #6b7280;
  --primary: #4f46e5;
  --primary-hover: #4338ca;
  --credit-green: #059669;
  --debt-red: #dc2626;
  --pending-amber: #d97706;
}

.dark {
  --bg-canvas: #0b0b10;
  --bg-surface: #12121a;
  --bg-surface-elevated: #181820;
  --bg-surface-subtle: #161622;
  --bg-card: #1c1c25;
  --bg-input: #20202a;
  --border-subtle: #27354a;
  --border-divider: #1e2638;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --credit-green: #10b981;
  --debt-red: #f43f5e;
  --pending-amber: #f59e0b;
}

body {
  background-color: var(--bg-canvas);
  color: var(--text-primary);
  transition: background-color 0.2s ease, color 0.2s ease;
}
```

### 2.3 Head Anti-Flash Pre-hydration Script (`index.html`)
Inject early script in `index.html` `<head>` prior to bundle loading:
```html
<script>
  (function() {
    try {
      var saved = localStorage.getItem('roommate_theme') || 'system';
      var isDark = saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
</script>
```

---

## 3. Phase 1: Global Theme Provider & Native Hardware Synchronization

### 3.1 Theme Context (`src/context/ThemeContext.tsx`)
Create a single source of truth for the entire application:
- **Types**: `ThemePreference = 'system' | 'light' | 'dark'`, `ResolvedTheme = 'light' | 'dark'`
- **State**:
  - `preference`: Initialized from `localStorage.getItem('roommate_theme')`
  - `resolvedTheme`: Derived reactively from preference + OS `prefers-color-scheme`
- **Actions**:
  - `setTheme(mode: ThemePreference)`: Updates state, stores to `roommate_theme`, syncs DOM classes (`.dark`), dispatches native status bar updates, updates meta theme-color.
- **System Media Listener**:
  - Attaches `window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)`
  - Reactively flips `resolvedTheme` when `preference === 'system'` if the OS theme toggles.
- **Native Status Bar Sync**:
  - Calls `setAppStatusBarStyle(resolvedTheme === 'dark' ? 'DARK' : 'LIGHT', resolvedTheme === 'dark' ? '#0B0B10' : '#F9F9FF')`
- **PWA Meta Tag Sync**:
  - Dynamically updates `<meta name="theme-color">` to `#0B0B10` (Dark) vs `#F9F9FF` (Light).

### 3.2 Wire Provider into Application Root
- Update `src/main.tsx` to wrap `<App />` within `<ThemeProvider>`.
- Refactor `src/App.tsx` startup status bar initialization to use the resolved theme rather than forcing hardcoded `'LIGHT'`.

---

## 4. Phase 2: App Shell, Frame, and Navigation System

### 4.1 Mobile Layout Shell (`src/components/mobile/MobileLayout.tsx`)
- **Outer Desktop Background**: `bg-[#F1F5F9] dark:bg-[#07070B]`.
- **Top Header Bar**: `text-slate-600 dark:text-slate-400`, Stitch badge `bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800`.
- **Action Buttons (Test Shake / Desktop Switch)**: `bg-white dark:bg-[#181820] border-slate-300 dark:border-[#27354A] text-slate-700 dark:text-slate-200`.
- **Device Frame Container**:
  - Replace hardcoded `bg-[#F9F9FF]` with `bg-[#F9F9FF] dark:bg-[#0B0B10]`.
  - Frame border: `md:border-slate-800 dark:md:border-slate-700`.
- **Safe-area Top Spacer**: `bg-[#F9F9FF] dark:bg-[#0B0B10]`.

### 4.2 Bottom Navigation Bar (`src/components/mobile/MobileBottomNav.tsx`)
- **Nav Container**: `bg-white/95 dark:bg-[#12121A]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-[#27354A]`.
- **Inactive Tabs**: `text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200`.
- **Active Tab Indicators**: `text-indigo-600 dark:text-indigo-400 font-semibold`.
- **Central FAB (`+`)**: Indigo background with crisp dark boundary `border-2 border-white dark:border-[#12121A] shadow-md shadow-indigo-500/25`.
- **iOS Home Indicator Bar**: `bg-slate-300 dark:bg-slate-700`.

---

## 5. Phase 3: Settings & Preferences Experience

### 5.1 Appearance & Theme Card (`AppPreferencesTab.tsx`)
- Connect directly to `useTheme()` hook:
  - System card: Active ring/bg in dark mode `dark:bg-indigo-950/40 dark:border-indigo-500 dark:text-indigo-300`.
  - Light card: Active ring/bg in dark mode `dark:bg-amber-950/40 dark:border-amber-500 dark:text-amber-300`.
  - Dark card: Active ring/bg `bg-indigo-50/80 border-indigo-400 dark:bg-indigo-900/40 dark:border-indigo-500`.
  - Inactive cards: `bg-white dark:bg-[#181820] border-slate-200 dark:border-[#27354A] text-slate-900 dark:text-slate-200`.
- Ensure density toggle, shake to report toggles, and clear cache buttons inherit `dark:bg-[#181820] dark:border-[#27354A]`.

### 5.2 All 9 Settings Tabs Audit & Theming
1. **AccountTab.tsx**: Profile card, photo upload placeholder, identity badges, UPI display card.
2. **NotificationsTab.tsx**: Notification category toggle switches, quiet hours card, test chime button.
3. **SecurityTab.tsx**: Biometric toggle, PIN management cards, device session cards, delete account danger zone.
4. **PaymentTab.tsx**: Default payment radio list, UPI apps list, confirmation toggles.
5. **MembershipTab.tsx**: Plan cards, Free vs Pro perks badges, subscription renewal date.
6. **DataBackupTab.tsx**: Google Drive backup card, JSON export/restore cards, sync progress bar.
7. **HelpSupportTab.tsx**: FAQ accordion cards, contact support cards, quick diagnostic info.
8. **AboutTab.tsx**: Version cards, developer credits, licenses, legal links.

### 5.3 All 15+ Settings Modals & Sheets
Apply `dark:bg-[#12121A] dark:border-[#27354A]` and input styling across:
- `ChangePinModal.tsx` & `StrictPinInput.tsx`
- `EditNameModal.tsx`, `EditPhoneModal.tsx`, `EditUsernameModal.tsx`, `EditUpiIdModal.tsx`
- `ChangeEmailModal.tsx`
- `FullScreenQrModal.tsx` & `QrPreviewModal.tsx`
- `LockTimeoutSheet.tsx` & `QuietHoursSheet.tsx`
- `RestoreBackupModal.tsx` & `GoogleDriveBackupModal.tsx`
- `SignOutOthersModal.tsx` & `DeleteAccountModal.tsx`
- `ReportProblemModal.tsx`

---

## 6. Phase 4: Core Mobile Screen Theming

### 6.1 Home Dashboard (`MobileDashboard.tsx`)
- **Balance Cards (Hero)**:
  - Total Monthly Spend card: Deep gradient/card surface (`dark:bg-[#1C1C25] dark:border-[#27354A]`).
  - "You Owe" card: Warm amber tint with dark contrast (`dark:bg-amber-950/20 dark:border-amber-800/40 text-amber-400`).
  - "You Get Back" card: Emerald mint tint with dark contrast (`dark:bg-emerald-950/20 dark:border-emerald-800/40 text-emerald-400`).
- **Quick Action Bar & Room Switcher**:
  - Horizontal room chips: `dark:bg-[#181820] dark:border-[#27354A] dark:text-slate-200`.
  - Notification icon button: `dark:bg-[#181820] dark:border-[#27354A] dark:text-slate-300`.
- **Recent Activity Ledger Feed**:
  - Transaction row containers: `dark:bg-[#1C1C25] dark:border-[#222A3A]`.
  - Amount indicators with tabular numbers and distinct positive/negative styling.
  - Category icon badges: muted translucent backgrounds.

### 6.2 Shared Room Ledger (`MobileRoomLedger.tsx` & Subcomponents)
- **Room Header & Metric Overview**: Room title, invite code badge, member count, total room spend.
- **Tab Segmented Control (Expenses / Balances / Settlements)**:
  - Container: `bg-slate-100 dark:bg-[#181820]`.
  - Active pill: `bg-white dark:bg-[#27354A] text-slate-900 dark:text-white shadow-xs`.
- **Expense Creation & Editing Modals**:
  - Add Expense modal: Title, amount input (`CurrencyInput.tsx`), category pill picker, split method chips (Equally, Exact, %, Shares).
  - Member split list rows with input steppers.
- **Balances Tab**:
  - Net balance cards for each member.
  - Debt relationships ("User owes you ₹X", "You owe User ₹Y").
  - "Settle Up" primary action triggers.
- **Settlements Tab**:
  - Recorded settlements list, UPI transaction IDs, verified proof images, settlement confirmation dialogs.
- **Room Sub-Modals**:
  - `RoomMembersModal.tsx`, `RoomSettingsModal.tsx`, `RoomInviteModal.tsx`, `RoomActivitySection.tsx`, `TransferOwnershipModal.tsx`, `MobileLeaveRoomModal.tsx`, `JoinRequestReviewModal.tsx`, `JoinRoomModal.tsx`.

### 6.3 Personal Vault (`MobilePersonalVault.tsx`)
- **Security Lock Gateway**: PIN pad / biometrics unlock interface for vault entries.
- **Budget Goal Progress Bar**: Background rail `dark:bg-slate-800`, progress fill with proper contrast.
- **Category Spend Breakdown**: Category bars, icons, and expense statistics.
- **Personal Expense Form**: Amount input, category selector, payment method, recurring toggle.
- **Expense History List**: Filter chips, search bar, transaction list items, delete confirmation alerts.

### 6.4 Auth & Onboarding Flow (`MobileLogin.tsx` & Modals)
- **Login / Signup Screens**:
  - Brand header & logo presentation in dark environment.
  - Input fields: Email, password, name, phone, confirm password.
  - Google SSO Button: `GoogleSignInButton.tsx` (dark mode container and border).
  - Forgot password sheet & reset confirmation.
- **Onboarding & Policy Modals**:
  - `FirstLoginOnboardingModal.tsx`: Feature introduction slides, finish CTA.
  - `GooglePinSetupModal.tsx`: Mandatory 4-digit PIN setup for Google sign-in users.
  - `OAuthProviderNoticeModal.tsx`: OAuth session handling info sheet.

### 6.5 Floating Drawers, Sheets, & Notifications
- `NotificationCenterDrawer.tsx` & `NotificationCard.tsx`:
  - Drawer slide-over surface: `dark:bg-[#12121A] dark:border-l dark:border-[#27354A]`.
  - Unread notification cards, read state, action buttons ("Pay Now", "View Split").
- `MobileBottomSheet.tsx`:
  - Backdrop blur, handle bar `bg-slate-400 dark:bg-slate-600`, content surface `dark:bg-[#12121A]`.
- `UpiIntentPayModal.tsx` & `UpiQrScannerModal.tsx`:
  - Camera viewfinder overlay, QR scanner frame, UPI intent buttons.
- `WhatsAppNudgeModal.tsx` & `SettlementProofModal.tsx`:
  - Message preview card, send button, proof viewer.
- `ShakeBugReportModal.tsx`:
  - Form textarea, attachment preview, diagnostic telemetry badges.

---

## 7. Verification Checklist & Testing Matrix

### Automated & Unit Tests
- [ ] Run `npm run test` (Vitest) to ensure no regressions in settings, storage, or crypto helpers.
- [ ] Add unit test in `src/components/mobile/settings/settings.test.ts` verifying theme preference storage and resolution for `'system'`, `'light'`, and `'dark'`.
- [ ] Verify `npm run lint` (oxlint) passes cleanly with 0 errors.

### Manual Verification Scenarios
| Test ID | Action | Expected Result |
| :--- | :--- | :--- |
| **TEST-01** | Select **DARK** in Settings | Entire application immediately turns dark; `#0B0B10` canvas; cards `#1C1C25`; text Ivory `#F8FAFC`. |
| **TEST-02** | Select **LIGHT** in Settings | Entire application immediately returns to the original light theme with identical contrast and layouts. |
| **TEST-03** | Select **SYSTEM** with OS in Light mode | App renders light theme matching OS. |
| **TEST-04** | Select **SYSTEM** with OS in Dark mode | App renders dark theme matching OS. |
| **TEST-05** | Switch OS theme while RoomMate is open | App dynamically flips theme in real time when in SYSTEM mode. |
| **TEST-06** | Hard refresh / Reload page in Dark mode | Instant load in dark theme; zero light-to-dark flashing (FOUC). |
| **TEST-07** | Inspect Native Status Bar | Capacitor StatusBar style flips between `Dark` (white icons) and `Light` (dark icons); background colors match canvas. |
| **TEST-08** | Bottom Navigation Audit | Dark surface `#12121A`, slate-400 inactive icons, active purple indicator `#6366F1`, FAB prominent with dark ring. |
| **TEST-09** | Ledger & Financial Audit | Amounts readable; Emerald credit text `#10B981`, Amber debt text `#F59E0B`; member debts visible with high contrast. |
| **TEST-10** | Modals & Bottom Sheets Audit | Open all 15+ settings modals, quick action sheet, room modals; verify zero white background leaks. |
| **TEST-11** | Input & Form Field Audit | Focus states, placeholders, caret, and entered text crisp and legible across all text, number, and PIN inputs. |
| **TEST-12** | Repeated Toggling Stress Test | Toggle LIGHT &harr; DARK 10 times consecutively; verify state stability, zero layout shifts, and zero visual glitches. |

---

## 8. Agent Task Breakdown & Execution Order

1. **Phase 0 & 1 (Core Engine & Token Setup)**:
   - Update `index.html` (Tailwind `darkMode: 'class'`, meta theme-color, inline anti-flash script).
   - Update `src/index.css` (semantic dark tokens, body background transition).
   - Create `src/context/ThemeContext.tsx` and integrate in `src/main.tsx` & `src/App.tsx`.
2. **Phase 2 (Shell & Layout Alignment)**:
   - Update `src/components/mobile/MobileLayout.tsx` and `MobileBottomNav.tsx`.
3. **Phase 3 (Settings & Preferences)**:
   - Update `AppPreferencesTab.tsx` and connect to `ThemeContext`.
   - Update `MobileSettings.tsx` and all 9 tabs.
   - Update all 15 settings modal components.
4. **Phase 4 (Screens, Modals, Forms & Inputs)**:
   - Update `MobileDashboard.tsx`, `MobileRoomLedger.tsx`, `MobilePersonalVault.tsx`, `MobileLogin.tsx`.
   - Update common inputs (`StrictPinInput`, `CurrencyInput`, `PhoneInput`, `PrefixInput`).
   - Update remaining sheets and drawers (`MobileBottomSheet`, `NotificationCenterDrawer`, `UpiIntentPayModal`, etc.).
5. **Phase 5 (Verification & Polish)**:
   - Execute test suite (`npm run test`), lint check (`npm run lint`), and visual smoke tests across all screens and sheets.
