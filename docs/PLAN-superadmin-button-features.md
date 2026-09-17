# PLAN: Connect Remaining SuperAdmin Button Features & Lifecycle Actions

**Task Slug**: `superadmin-button-features`  
**Mode**: PLANNING ONLY  
**Generated At**: 2026-09-18  

---

## 1. Context Check & Scope

Following a complete scan across all SuperAdmin pages (`AdminDashboard`, `AdminUsers`, `AdminRooms`, `AdminExpenses`, `AdminAnalytics`, `AdminSupport`, `AdminNotifications`, `AdminSecurity`, `AdminAuditLogs`, `AdminSystemHealth`, `AdminSettings`), 5 specific frontend controls and lifecycle features were identified as either disconnected from cloud persistence, lacking status mutation buttons, or missing prop handoffs:

1. **Feature Suggestions Lifecycle Status Control**: Modal only supports status changes for bug reports; suggestions cannot be moved from `NEW` to `PLANNED`, `IN_DEVELOPMENT`, `IMPLEMENTED`, etc.
2. **Contact Requests Lifecycle & Status Update**: Inquiries remain `NEW` indefinitely; no status dropdown or update button in the modal.
3. **User Role Mutation (Promotion/Demotion)**: The backend RPC `superadmin_update_user_role` and `superAdminUpdateUserRoleCloud` exist, but no button exists in `AdminUserDetailModal` to promote a user to SuperAdmin or demote to Student.
4. **Topbar Notification Bell Data Wiring & Dismissal**: `AdminRouter` does not pass `notifications` to `AdminLayout`, leaving the popover blank. Popover also lacks "Mark all read" and dismiss actions.
5. **Platform Settings Supabase Cloud Sync**: Saving global platform configuration updates local browser storage, but is not dispatched to Supabase `public.platform_settings`.

---

## 2. Phase Breakdown & Tasks

### Phase 1: Storage Layer & Cloud Adapters
- [ ] In `src/lib/storage/cloudStorageAdapter.ts`:
  - [ ] Implement `fetchPlatformSettingsCloud(): Promise<PlatformSettings | null>`
  - [ ] Implement `updatePlatformSettingsCloud(settings: Partial<PlatformSettings>, updatedByUserId: string): Promise<boolean>`
  - [ ] Implement `updateFeatureSuggestionStatusCloud(id: string, status: FeatureSuggestionStatus, adminNotes?: string): Promise<boolean>`
  - [ ] Implement `updateContactRequestStatusCloud(id: string, status: 'NEW' | 'IN_REVIEW' | 'RESOLVED', adminNotes?: string): Promise<boolean>`
- [ ] In `src/lib/storage/mockStorage.ts`:
  - [ ] Add `updateUserRole(superAdminId: string, targetUserId: string, newRole: UserRole): User`
  - [ ] Add `updateContactRequestStatus(superAdminId: string, contactId: string, status: 'NEW' | 'IN_REVIEW' | 'RESOLVED', adminNotes?: string): ContactRequest | null`
  - [ ] Add `markAllNotificationsAsRead(userId: string): void` and `dismissNotification(userId: string, notificationId: string): void`

### Phase 2: Support Desk Status Controllers
- [ ] In `src/components/admin/pages/AdminSupportDetailModal.tsx`:
  - [ ] Expand props to accept `onUpdateFeatureStatus` and `onUpdateContactStatus`
  - [ ] Render lifecycle status dropdown & "Update" button for Feature Suggestions
  - [ ] Render lifecycle status dropdown & "Update" button for Contact Inquiries
- [ ] In `src/components/admin/pages/AdminSupport.tsx`:
  - [ ] Wire `onUpdateFeatureStatus` and `onUpdateContactStatus` down to `AdminSupportDetailModal`
- [ ] In `src/components/admin/AdminRouter.tsx`:
  - [ ] Implement `handleUpdateFeatureStatus` and `handleUpdateContactStatus`

### Phase 3: User Role Mutation Control
- [ ] In `src/components/admin/pages/AdminUserDetailModal.tsx`:
  - [ ] Add `onUpdateUserRole` prop
  - [ ] In "Administrative Actions" tab, add role management section with "Promote to SuperAdmin" and "Demote to Student" buttons
  - [ ] Prevent current logged-in SuperAdmin from self-demotion
  - [ ] Trigger confirmation dialog with Level 2 Step-Up auth
- [ ] In `src/components/admin/pages/AdminUsers.tsx`:
  - [ ] Pass `onUpdateUserRole` prop to `AdminUserDetailModal`
- [ ] In `src/components/admin/AdminRouter.tsx`:
  - [ ] Implement `handleUpdateUserRole` connecting `superAdminUpdateUserRoleCloud` and `db.updateUserRole` with step-up verification

### Phase 4: Notification Bell Topbar & Platform Settings Cloud Sync
- [ ] In `src/components/admin/AdminRouter.tsx`:
  - [ ] Initialize `notifications` state and pass to `<AdminLayout>`
  - [ ] Add `fetchPlatformSettingsCloud()` to initial data fetch on mount
  - [ ] Dispatch `updatePlatformSettingsCloud()` inside `handleUpdateSettings`
- [ ] In `src/components/admin/AdminLayout.tsx` & `AdminTopbar.tsx`:
  - [ ] Add "Mark all as read" button and per-item dismiss action in notification popover
  - [ ] Render formatted relative timestamps and priority tags

---

## 3. Verification & Safety Checklist

- [ ] `npm test` runs with 0 failures
- [ ] `npx tsc --noEmit` returns no type errors
- [ ] Self-demotion safeguard active: current user cannot demote themselves
- [ ] Step-Up Auth executes before role changes and platform settings modifications
- [ ] Realtime toast feedback appears for all new actions
