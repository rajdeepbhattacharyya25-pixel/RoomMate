# Project Plan: Settings Experience Redesign & CampusFlow → RoomMate Migration

**Task Slug**: `settings-redesign`  
**Target File**: `docs/PLAN-settings-redesign.md`  
**Status**: Ready for Review / Pending Approval  

---

## 1. Phase 0: Complete CampusFlow → RoomMate Migration

Before modifying or redesigning Settings, execute a controlled migration from `CampusFlow` to `RoomMate`:

1. **Storage Keys & Events**:
   - `campusflow_saas_db_v3` &rarr; `roommate_saas_db_v1` (auto-migrated on startup in `mockStorage.ts`)
   - `campusflow_app_lock_enabled` &rarr; `roommate_app_lock_enabled` (dual-read fallback)
   - `campusflow_app_lock_timeout` &rarr; `roommate_app_lock_timeout` (dual-read fallback)
   - `campusflow_vault_pin` &rarr; `roommate_vault_pin` (dual-read fallback)
   - `campusflow_notification_sound_enabled` &rarr; `roommate_notification_sound_enabled`
   - `campusflow_haptics_enabled` &rarr; `roommate_haptics_enabled`
   - `campusflow_settings_changed` &rarr; `roommate_settings_changed`
   - `campusflow_offline_sync_queue` &rarr; `roommate_offline_sync_queue`
   - `campusflow_budget_user_` &rarr; `roommate_budget_user_`
   - `campusflow_jwt_resident_token` &rarr; `roommate_jwt_resident_token`
   - `campusflow_fcm_token` &rarr; `roommate_fcm_token`
   - `campusflow_simulated_offline` &rarr; `roommate_simulated_offline`
   - `campusflow_biometric_device_enrolled` &rarr; `roommate_biometric_device_enrolled`
2. **Notification Channels**: Update channel IDs to `roommate_expenses_channel`, etc.
3. **Deep Link URLs**: `roommate://` as primary, retain `campusflow://` fallback.
4. **Seed Password Integrity**: Keep `CampusFlowPassword2026!` for existing cloud auth seed users.
5. **Branding**: Clean up all visible "CampusFlow" text in UI and comments.
6. **Verification**: Confirm sessions, PINs, Supabase reads/writes, and QR storage survive the migration without logout.

---

## 2. Phase 1: Settings Redesign Architecture

### Responsive Layout
- **Wider screens / tablets (&ge; 380px)**: Vertical category rail (`w-16` to `w-20` on left, content on right).
- **Narrow phones (< 380px)**: Horizontally scrollable category chip selector at top to preserve 100% content width for cards and inputs.
- **Category transitions**: 180ms CSS fade & slide.
- **Default category**: 👤 Account tab opens by default.
- **Android back button**: Closes modals/sheets first; switches to Account before triggering app exit protection.

### 9 Reordered & Refined Categories

```
SETTINGS (⚙️)
│
├── 👤 1. Account (Default)
│   ├── Profile Card (Photo upload, Name, Email, Username, Role badge)
│   ├── Edit Name Sheet
│   ├── Change Email Modal (Supabase auth verification link flow)
│   ├── Edit Username Modal
│   └── Payment Identity (Single home for QR: UPI ID, Upload/Replace/Remove QR, Fullscreen QR Viewer)
│
├── 🔔 2. Notifications
│   ├── Expense Activity Toggles
│   ├── Payments Toggles
│   ├── Room Toggles
│   ├── Other Toggles
│   ├── Notification Sound (Switch + Test Chime)
│   ├── Haptic Feedback (Switch + Tactile Impact)
│   ├── Quiet Hours (Time selector sheet)
│   └── Push Alerts (FCM registration status)
│
├── 🔐 3. Security
│   ├── App Lock & Biometrics Switch
│   ├── Lock Timeout Bottom Sheet (immediate, 30s, 1m, 5m, 10m)
│   ├── Change PIN Bottom Sheet (StrictPinInput, 4-digit limit)
│   ├── Biometric Settings (Hardware detection: FaceID/TouchID/Fingerprint/WebAuthn)
│   ├── Manage Devices (Sign out other devices modal via Supabase Auth — no fabricated device rows)
│   └── Delete Account (Protected confirmation flow)
│
├── 💳 4. Payment
│   ├── Default Payment Method (UPI / Cash)
│   ├── Default UPI App (PhonePe / Google Pay / Paytm / Generic Intent)
│   └── UPI Payment Confirmations Toggle
│
├── 💎 5. Membership
│   ├── Resident Membership Tier (Free Tier vs Pro Tier)
│   ├── Resident Pro (₹49/mo) Features & Perks
│   └── Upgrade Action / Subscription Management
│
├── 📊 6. Data & Backup
│   ├── Export Data (PDF / CSV / Excel via ExportBottomSheet)
│   └── Cloud Sync Status (Realtime live indicator, last synced, retry sync)
│
├── ⚙️ 7. App Preferences
│   └── Appearance (System Default, Light, Dark)
│
├── 🆘 8. Help & Support
│   ├── Help Center (FAQ sheet)
│   ├── Report a Problem (Category, description, screenshot attachment)
│   ├── Contact Support
│   └── Suggest a Feature
│
└── ℹ️ 9. About
    ├── Dynamic BUILD_INFO Display (Version, Build, Channel, Build date/time from metadata)
    ├── Check for Updates (liveUpdater integration)
    ├── Advanced Staging Diagnostics (Collapsible secondary panel)
    ├── Developer Tools (DEV mode only, collapsible with ⚠️ badge: Persona switch, RLS audit, Storage reset)
    └── Log Out & Lock Vault (Confirmation dialog)
```

---

## 3. Strict Boundary Rules

1. **No Mock / Fabricated Data**: Manage Devices does not invent fake device lists; QR is not duplicated in Payment tab; Language selector is omitted until multi-language architecture is built; WhatsApp bots or unbacked payment features are not added.
2. **Excluded Features**: Accessibility settings, Reduce motion, Privacy controls, and Activity history remain strictly omitted.
3. **Rollback-Safe Facade**: Keep `MobileProfile.tsx` as a functional facade re-exporting `MobileSettings.tsx`.

---

## 4. Verification Checklist

- [ ] Phase 0: Storage keys migrated with backward compatibility, zero sessions broken
- [ ] Bottom Nav displays Settings (⚙️) as 5th tab
- [ ] Settings defaults to Account tab
- [ ] Responsive rail on &ge;380px and horizontal scroll chip selector on <380px
- [ ] Profile photo upload & preview works with existing service
- [ ] Edit Name bottom sheet saves to DB and updates UI immediately
- [ ] Change Email informs of confirmation requirement and invokes Supabase auth
- [ ] UPI ID edits and validates properly
- [ ] Payment QR upload, replace, remove, and full-screen view work exclusively in Account tab
- [ ] Notification sound and haptics toggles work
- [ ] Quiet hours time selection functions
- [ ] App Lock timeout bottom sheet works
- [ ] Change PIN enforces strict 4-digit validation via `StrictPinInput`
- [ ] Biometrics hardware capability is correctly detected and displayed
- [ ] "Sign out other devices" works without fabricated device lists
- [ ] Default UPI app preferences save and connect to `upiIntentService`
- [ ] Resident Pro upgrade connects to `onUpgradePlan`
- [ ] Export Data triggers PDF/CSV/Excel downloads
- [ ] Cloud sync status reflects real live/offline state
- [ ] About tab shows dynamic metadata from `BUILD_INFO`
- [ ] Developer tools are present and collapsible in dev mode, absent in production
- [ ] Logout and Vault lock function with confirmation
- [ ] Android back button closes modals before exiting
