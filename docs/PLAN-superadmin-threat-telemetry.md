# PLAN: Superadmin Intrusion Defense & Threat Telemetry

**Status**: Draft / Pending Approval  
**Target Area**: SuperAdmin Authentication (`src/lib/auth/superAdminSecurityService.ts`, `src/components/desktop/SuperAdminLoginModal.tsx`, `src/lib/auth/intrusionDetectionService.ts`)  
**Scope**: Intrusion throttling, persistent lockout, device/phone model fingerprinting, passive Geo-IP location lookup, real-time alert dispatch to SuperAdmin.

---

## 1. Problem Statement & Motivation
1. **No Real-Time Alerting**: When an unauthorized party (such as a curious resident or external attacker) attempts to guess SuperAdmin credentials, the legitimate SuperAdmin is never notified.
2. **Volatile In-Memory Lockout**: Currently, failed attempts are stored in memory (`memoryFailedAttempts`). Refreshing the browser or opening an incognito window resets the lockout counter.
3. **Missing Forensic Context**: Security audits currently only record generic string metadata without identifying the intruder's phone/hardware model (e.g. `Xiaomi Redmi Note 12`, `iPhone 15`, `Samsung S24`) or their approximate location (City, State, Country, ISP).

---

## 2. Proposed Architecture & Solutions

### A. Persistent Multi-Tier Rate Limiting & Escalating Lockout
Replace in-memory failure counters with cryptographically fingerprinted, persistent local & cloud state:
* **Attempt 1–2**: Normal feedback (`Invalid Master Security Key. X attempts remaining`).
* **Attempt 3**: Soft throttle + Background telemetry snapshot taken.
* **Attempt 5**: **Hard 30-minute lockout** with persistent countdown timer that survives page reloads + **Instant Alert Dispatch to SuperAdmin**.
* **Attempt 7+**: **24-hour device blacklist**.

### B. Passive Threat Telemetry (Zero GPS Prompts)
Create `src/lib/auth/intrusionDetectionService.ts` to capture rich forensics passively without alerting the attacker or triggering browser location permission dialogs:
1. **Device & Phone Model**:
   - Uses `navigator.userAgentData` (Client Hints) for modern Android/Chromium devices (`brand`, `model`, e.g., `Samsung SM-S928B`, `Pixel 8 Pro`).
   - Advanced User-Agent parser fallback for iOS / legacy devices (`iPhone 15`, `Xiaomi Redmi Note 12`, `OnePlus 11`, `MacBook Pro`, `Windows 11 PC`).
2. **Estimated Geo-IP Location**:
   - Queries privacy-friendly, passive Geo-IP endpoint (`ipapi.co/json` or fallback `ip-api.com/json`) with a 2.5s strict timeout.
   - Extracts:
     - `city` (e.g., `Kolkata`, `Bhubaneswar`, `Bengaluru`)
     - `region` (e.g., `West Bengal`, `Odisha`, `Karnataka`)
     - `country` (e.g., `India`)
     - `isp` / `org` (e.g., `Reliance Jio 5G`, `Airtel Broadband`)
     - `ip` address.

### C. Multi-Channel SuperAdmin Alerting
When an intrusion is flagged (at 3 and 5 failed attempts):
1. **In-App & Push Notification**:
   - Calls `db.createNotification` for all users with `role === 'SUPER_ADMIN'`.
   - Title: `🚨 Security Alert: Unauthorized SuperAdmin Login Attempt`
   - Body: `Multiple failed login attempts detected on ${email}.\n📱 Device: ${deviceModel}\n📍 Location: ${city}, ${region} (${isp})\n🌐 IP: ${ip}`
   - Priority: `HIGH` (triggers notification bell indicator and sound).
   - If FCM is configured, invokes `sendPushNotificationToMembers` to trigger native mobile push alert.
2. **Security Audit Logs**:
   - Creates a high-priority `SECURITY_INTRUSION_PROBE` audit entry visible in the SuperAdmin **Audit Logs** and **Security** screens.

---

## 3. Files to Create & Modify

| File | Change Type | Description |
|---|---|---|
| `src/lib/auth/intrusionDetectionService.ts` | New | Hardware model parser, passive Geo-IP resolution, persistent rate-limiting, and security alert dispatcher. |
| `src/lib/auth/intrusionDetectionService.test.ts` | New | Comprehensive unit tests for device detection, rate-limit thresholds, and payload formatting. |
| `src/components/desktop/SuperAdminLoginModal.tsx` | Modify | Integrate persistent intrusion detection, trigger telemetry capture on failures, and display escalating lockouts. |
| `src/lib/auth/superAdminSecurityService.ts` | Modify | Support persistent lockout synchronization and audit logging. |

---

## 4. Verification & Testing Plan
1. **Unit Tests**:
   - Run `npx vitest run src/lib/auth/intrusionDetectionService.test.ts` to test:
     - Accurate device model detection for Android, iOS, and Desktop user agents.
     - Persistent lockout countdown that survives restarts.
     - Correct formatting of security incident payloads.
2. **System Health & Build**:
   - Run `npm run test` (all 224+ tests passing).
   - Run `npm run lint` (0 lint errors).
   - Run `npx tsc -b` (0 type errors).
3. **Manual Verification**:
   - Trigger 3 and 5 failed password attempts in `SuperAdminLoginModal`.
   - Verify lockout timer is displayed and persists on browser refresh.
   - Verify SuperAdmin receives high-priority notification with phone model, city, ISP, and IP address.
