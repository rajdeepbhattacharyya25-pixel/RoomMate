# Project Plan: Android Notification Brand Identity (Monochrome Silhouette & Dynamic Avatars)

**File:** `docs/PLAN-notification-icons.md`  
**Mode:** PLANNING ONLY (No Code)  
**Task Slug:** `notification-icons`  
**Target:** Android Native Assets (`res/drawable`, `AndroidManifest.xml`), Capacitor Config (`capacitor.config.ts`), and FCM Backend Payload (`supabase/functions/send-push/index.ts` & `src/lib/firebase/pushService.ts`).  
**Design Pattern:** Dual-Layer Asset Architecture — Monochrome Status Bar Silhouette (`ic_stat_notification`) + Full-Color Dynamic Large Icon / Avatar (`notification.image`).

---

## 1. Context & Problem Statement

When push notifications arrive while the RoomMate mobile app is closed:
- Android currently receives `icon: 'ic_launcher'` (the full-color adaptive mipmap icon).
- Because Android 5.0+ strictly enforces that all status-bar notification icons must be **monochrome white silhouettes on a transparent background**, Android strips the colors, causing the status-bar icon to render as an unreadable white square or generic system shape.
- Simultaneously, the notification card inside the expanded notification tray lacks the full-color branded icon or sender avatar beside the message text (the distinct visual presentation seen in apps like WhatsApp, Telegram, and YouTube).

### Core Principle
FCM system delivery provides the primary notification delivery path, while Android notification channels and native notification assets provide graceful presentation across supported Android versions.

---

## 2. Dynamic Notification Taxonomy

Notifications are divided into two distinct trust and context tiers:

| Notification Event | Notification Type | Status-Bar Icon | Notification Card Large Icon / Image | Example Preview |
| :--- | :--- | :--- | :--- | :--- |
| **New Shared Expense Added** | Interpersonal / User | 🏠 `ic_stat_notification` | 👤 Sender Avatar (e.g. Arjun) | *"Arjun added ₹1,200 Electricity • Share: ₹300"* |
| **Shared Expense Edited / Deleted** | Interpersonal / User | 🏠 `ic_stat_notification` | 👤 Sender Avatar | *"Sneha edited Grocery bill"* |
| **Settlement Payment Recorded** | Interpersonal / User | 🏠 `ic_stat_notification` | 👤 Payer Avatar | *"Joyjit paid ₹400 via UPI"* |
| **Roommate Nudge Received** | Interpersonal / User | 🏠 `ic_stat_notification` | 👤 Nudger Avatar | *"Priya nudged you about ₹250 pending balance"* |
| **Room Invitation Received** | Interpersonal / User | 🏠 `ic_stat_notification` | 👤 Inviter Avatar | *"Rajdeep invited you to join Flat 302"* |
| **Backup Completed / Failed** | System / App | 🏠 `ic_stat_notification` | 🔵 RoomMate Logo | *"Encrypted personal vault backup completed"* |
| **Security / Threat Alert** | System / Security | 🏠 `ic_stat_notification` | 🔵 RoomMate Logo | *"New login detected on Android device"* |
| **Platform / Announcement Update** | System / App | 🏠 `ic_stat_notification` | 🔵 RoomMate Logo | *"SuperAdmin announcement: Server maintenance"* |

---

## 3. Architecture & Dual-Layer Asset Pipeline

```
                                  TRIGGER EVENT
                     (Shared Bill, Nudge, or System Alert)
                                        │
                                        ▼
                         [ pushService.ts (Client) ]
               Determines actor avatar vs fallback system logo URL
                                        │
                                        ▼
                     [ Supabase send-push Edge Function ]
                         Constructs FCM v1 HTTP payload
                                        │
                                        ▼
                              FCM HTTP v1 Protocol
        {
          "notification": { "title": "...", "body": "...", "image": "<avatar_or_logo_url>" },
          "android": {
            "priority": "high",
            "notification": {
              "icon": "ic_stat_notification",
              "color": "#6366F1",
              "image": "<avatar_or_logo_url>",
              "channel_id": "roommate_alerts"
            }
          }
        }
                                        │
                                        ▼
                         [ Android OS Device Daemon ]
             (Handled natively by Google Play Services even if app is closed)
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
           Android Status Bar                       Notification Tray
          [ic_stat_notification]               [Title, Body + Large Avatar/Logo]
        Pure white silhouette vector            Dynamic sender photo or RoomMate logo
        Tinted with accent (#6366F1)            placed on the right/left of card
```

---

## 4. Technical Touchpoints & Deliverables

### A. Android Native Project Layer
1. **Asset Generation (`android/app/src/main/res/drawable/`):**
   - Create `ic_stat_notification.xml` (VectorDrawable) or `ic_stat_notification.png` across `mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`.
   - Must be strictly 100% white silhouette (`#FFFFFF`) with transparent alpha background.
2. **Color Resource (`android/app/src/main/res/values/colors.xml`):**
   - Declare `<color name="notification_accent_color">#6366F1</color>`.
3. **Manifest Declarations (`android/app/src/main/AndroidManifest.xml`):**
   - Register `com.google.firebase.messaging.default_notification_icon` pointing to `@drawable/ic_stat_notification`.
   - Register `com.google.firebase.messaging.default_notification_color` pointing to `@color/notification_accent_color`.
4. **Capacitor Configuration (`capacitor.config.ts`):**
   - Under `LocalNotifications`, set `smallIcon: "ic_stat_notification"` and `iconColor: "#6366F1"`.

### B. Supabase FCM Edge Function Layer (`supabase/functions/send-push/index.ts`)
1. **Dynamic Avatar Resolution:**
   - Check if payload contains `actorAvatar` or `senderAvatar` (hosted on ImgBB CDN or Supabase Storage).
   - If present: Set `resolvedImage = actorAvatar`.
   - If absent or system notification: Set `resolvedImage = DEFAULT_ROOMMATE_LOGO_URL` (high-res hosted logo).
2. **Payload Android Config:**
   - Update FCM v1 `android.notification`:
     - `icon: 'ic_stat_notification'` (replaces legacy `ic_launcher`).
     - `color: '#6366F1'`.
     - `image: resolvedImage` (enables the Large Icon beside notification text).
     - Keep `channel_id`, `sound: 'notification.mp3'`, and `priority: 'high'`.

### C. Client Push Dispatch Layer (`src/lib/firebase/pushService.ts`)
1. Ensure `dispatchRoomNotification` passes the `actorAvatar` (sender's profile photo) when dispatching shared bill splits, settlements, and nudges.
2. Ensure system and backup alerts omit `actorAvatar` so they automatically use the RoomMate brand logo.

---

## 5. Edge Cases & Safeguards

1. **Avatar Image Network Failure / Offline / Expired URL:**
   - Android's notification manager gracefully falls back to displaying the app's default icon if `notification.image` fails to download, ensuring notifications are never dropped.
2. **Dark Mode vs Light Mode System Tints:**
   - Because `ic_stat_notification` is pure white with alpha transparency, Android OS automatically tints the icon to dark grey in light status bars and pure white in dark status bars.
3. **Android 13+ Notification Permissions (`POST_NOTIFICATIONS`):**
   - `AndroidManifest.xml` already declares `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`, and runtime prompt is handled at login.
4. **Channel ID Configuration:**
   - Ensure the notification channel `roommate_alerts` sets `importance: NotificationManager.IMPORTANCE_HIGH` so heads-up banners appear over apps when active.

---

## 6. Dynamic Agent Assignments

| Agent Role | Skill / Focus | Key Deliverables |
| :--- | :--- | :--- |
| **Android Specialist** | `mobile-design`, `powershell-windows` | Generate vector `ic_stat_notification`, create `colors.xml`, update `AndroidManifest.xml` and `capacitor.config.ts`. |
| **Backend & Cloud Specialist** | `clean-code`, `api-patterns` | Update `supabase/functions/send-push/index.ts` to implement the dynamic avatar vs brand logo rule and FCM v1 image payload. |
| **Mobile Lead Developer** | `clean-code`, `react-components` | Update `src/lib/firebase/pushService.ts` to attach sender avatars to all user-generated notification dispatches. |
| **QA & Verification Engineer** | `testing-patterns`, `checklist` | Execute `npm test` and build check, verify manifest XML syntax and FCM payload structure. |

---

## 7. Verification Checklist

- [ ] `ic_stat_notification` vector drawable created and validated (alpha transparency, zero non-white colors).
- [ ] `colors.xml` defines `notification_accent_color` (`#6366F1`).
- [ ] `AndroidManifest.xml` registers `default_notification_icon` and `default_notification_color`.
- [ ] `capacitor.config.ts` declares `smallIcon: "ic_stat_notification"`.
- [ ] `send-push` Edge Function resolves sender avatar for user events and RoomMate logo for system events.
- [ ] `send-push` passes `image` and `icon: 'ic_stat_notification'` in FCM v1 Android notification config.
- [ ] `pushService.ts` attaches `actorAvatar` to expense, settlement, and nudge notification dispatches.
- [ ] Unit tests pass with zero regressions (`npm test`).
- [ ] Production build passes with zero errors (`npm run build`).
