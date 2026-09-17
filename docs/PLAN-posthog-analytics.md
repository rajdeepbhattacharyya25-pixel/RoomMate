# Project Plan: PostHog Product Analytics (Phase 3)

## Overview
Implement centralized, privacy-conscious PostHog product analytics for the RoomMate student expense application. Focus strictly on user flows, feature adoption, and UX health with zero retention of financial amounts, UPI IDs, or private data.

## Task Breakdown
1. **Central Analytics Engine:**
   - Centralize event dispatching in `src/lib/analytics/posthog.ts`.
   - Prevent duplicate events using a 300ms deduplication cache for rapid re-renders and navigation changes.
   - Configure global super properties: `app_version`, `app_channel`, and `platform`.
2. **Privacy & Redaction Guard:**
   - Automatically scrub forbidden property keys: `amount`, `balance`, `debt`, `upi`, `pin`, `password`, `token`, `note`, `description`, `title`, `phone`, `email`.
   - Use regex inspection on all string values to strip accidental VPAs, phone numbers, and JWTs.
3. **Event Taxonomy Implementation:**
   - **AUTH:** `signup_started`, `signup_completed`, `login_completed`, `logout_completed`
   - **ONBOARDING:** `onboarding_started`, `onboarding_completed`, `profile_setup_completed`
   - **ROOM:** `room_creation_started`, `room_created`, `room_join_started`, `room_joined`, `room_invitation_sent`
   - **EXPENSE:** `personal_expense_created`, `shared_expense_created`, `expense_updated`, `expense_deleted`
   - **SETTLEMENT:** `settlement_started`, `settlement_recorded`, `settlement_completed`
   - **PAYMENT:** `payment_flow_started`, `payment_flow_completed`, `payment_flow_failed`
   - **SETTINGS:** `profile_updated`, `notification_settings_changed`
4. **Integration Wiring:**
   - Wire event triggers in `src/App.tsx`, `src/components/mobile/MobileLogin.tsx`, and `src/lib/payments/upiIntentService.ts`.
   - Ensure `analytics.identify(userId)` and `analytics.reset()` are called during login/logout.
5. **Unit Test Suite:**
   - Expand `src/lib/analytics/posthog.test.ts` to test event taxonomy, deduplication cache, privacy scrubbing, and identity handling.

## Verification Checklist
- [ ] Unit tests pass: `npx vitest run src/lib/analytics/posthog.test.ts`
- [ ] Full test suite pass: `npm run test`
- [ ] Lint pass: `npm run lint`
- [ ] Build pass: `npm run build`
