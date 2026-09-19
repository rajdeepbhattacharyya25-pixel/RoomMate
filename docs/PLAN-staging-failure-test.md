# Implementation Plan: Safe Staging Failure Simulation, On-Demand SuperAdmin Sync & Email-to-Webhook Architecture

> **Plan ID:** `PLAN-staging-failure-test`  
> **Status:** User Approved (Implementing Requested Scope)  
> **Target Environment:** Vercel (Production + Preview/Staging) + Supabase + UptimeRobot (Free)  
> **Scope:**
> 1. Safe failure & recovery simulation on isolated Vercel Preview deployment (`staging` branch).
> 2. On-Demand SuperAdmin UptimeRobot Sync (`api/uptime-sync.ts` + UI button & alert in `AdminSystemHealth.tsx`).
> 3. Inbound Webhook Receiver (`api/uptime-webhook.ts`) + Turnkey Email-to-Webhook Worker (`scripts/email-to-webhook-worker.js`).
> 4. Full test/lint/tsc/build regression suite.

---

## 1. Executive Summary & Goals

The production uptime monitoring setup is officially verified and accepted:
* **Monitor 1 (`804035441`):** `RoomMate - Production Web` (`HTTP` on `https://roommate26.vercel.app/`) — 5 min.
* **Monitor 2 (`804035777`):** `RoomMate - Backend & Database Health` (`KEYWORD` checking `{"status":"ok"}` on `https://roommate26.vercel.app/api/health`) — 5 min.
* **Alert Contact:** `rajdeep.bhattacharyya25@gmail.com` (`8829170`).

The user has approved proceeding and requested:
1. **Safe Staging Failure/Recovery Test:** Prove that an outage causes UptimeRobot to flag DOWN and send an email alert, and recovery flags UP and sends a recovery email—using a Vercel Preview/Staging deployment so production is never touched.
2. **On-Demand SuperAdmin Sync Alerts:** Add a live synchronization feature to the SuperAdmin System Health dashboard that queries UptimeRobot API, syncs any detected outages into `system_incidents`, and triggers immediate SuperAdmin alert banners.
3. **Email-to-Webhook Integration:** Build an inbound webhook receiver (`api/uptime-webhook.ts`) that ingests alert events into `system_incidents`, alongside a turnkey Cloudflare Email Worker (`scripts/email-to-webhook-worker.js`) to bridge UptimeRobot free email alerts into webhooks at $0.00 cost.

---

## 2. Architecture & Component Interaction

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    UptimeRobot Free                                    │
│  - Probes Monitor 1 (Web) & Monitor 2 (Health API) every 5 minutes                     │
│  - On Outage: Sends email to rajdeep.bhattacharyya25@gmail.com                         │
└───────────────────┬────────────────────────────────────────────┬───────────────────────┘
                    │                                            │
        (A) Email Alert Dispatched                  (B) REST API (Polling / On-Demand)
                    ▼                                            ▼
┌───────────────────────────────────────┐            ┌───────────────────────────────────┐
│     Cloudflare Email Worker           │            │      Vercel Serverless Function   │
│  (scripts/email-to-webhook-worker.js) │            │         /api/uptime-sync          │
│  - Extracts monitor name & status     │            │  - Reads UPTIMEROBOT_API_KEY      │
│  - Signs request with shared secret   │            │  - Calls UptimeRobot getMonitors  │
└───────────────────┬───────────────────┘            └─────────────────┬─────────────────┘
                    │ POST                                             │
                    ▼                                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RoomMate Inbound Incident Management                            │
│                                                                                        │
│  1. /api/uptime-webhook: Receives push events from Email-to-Webhook worker             │
│  2. /api/uptime-sync: Synchronizes on SuperAdmin dashboard demand                      │
│                                                                                        │
│  Updates: public.system_incidents (Postgres DB) via Supabase Client                   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Realtime Broadcast
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         SuperAdmin System Health Dashboard                             │
│  - Live Outage Alert Banner with ticking clock                                         │
│  - "Sync UptimeRobot" button with live status toast                                    │
│  - Active & Resolved Incident History Table                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Phases

### Phase 1: Safe Staging Failure & Recovery Simulation
1. Create and push `staging` branch to `origin/staging`.
2. Verify Vercel preview deployment at `https://roommate-git-staging-*.vercel.app/api/health`.
3. Provision temporary KEYWORD monitor on UptimeRobot via MCP targeting the preview URL with email alerts.
4. Verify initial status is **`UP`**.
5. Temporarily update `api/health.ts` on `staging` branch to return `503 Service Unavailable` with `{"status":"error"}`.
6. Commit & push to `origin/staging`.
7. Verify staging endpoint returns 503 while production remains 200 OK.
8. Verify UptimeRobot detects `DOWN` and sends alert email to `rajdeep.bhattacharyya25@gmail.com`.
9. Revert failure commit on `staging`, push to `origin/staging`.
10. Verify staging endpoint returns 200 OK and UptimeRobot detects recovery (`UP`) and sends recovery email.
11. Delete temporary staging monitor from UptimeRobot via API (`deleteMonitor`).

### Phase 2: On-Demand SuperAdmin Sync (`api/uptime-sync.ts`)
1. Create `api/uptime-sync.ts`:
   - Validates caller authentication or secret token.
   - Calls UptimeRobot REST API `getMonitors` (`https://api.uptimerobot.com/v2/getMonitors`) using `UPTIMEROBOT_API_KEY`.
   - Inspects monitor statuses (`2` = UP, `9` = DOWN).
   - If DOWN: checks `system_incidents` for an active outage; creates one if absent (`severity: 'CRITICAL'`, `status: 'INVESTIGATING'`).
   - If UP: auto-resolves any active incident previously logged for that service.
   - Returns `{ success: true, monitorsChecked: 2, activeIncidents: count, downCount: 0 }`.
2. Update `src/components/admin/pages/AdminSystemHealth.tsx`:
   - Add a prominent **"Sync UptimeRobot"** action button in the header and telemetry section.
   - Add loading state, error handling, and reactive alert feedback toast.
   - Automatically re-fetches `system_incidents` and updates the live alert banner.

### Phase 3: Inbound Webhook (`api/uptime-webhook.ts`) & Email-to-Webhook Worker
1. Create `api/uptime-webhook.ts`:
   - Validates `x-webhook-secret` header or bearer token against `UPTIME_WEBHOOK_SECRET`.
   - Accepts structured JSON payloads:
     ```json
     {
       "event": "DOWN" | "UP",
       "monitorName": "RoomMate - Backend & Database Health",
       "url": "https://roommate26.vercel.app/api/health",
       "reason": "Simulated or detected outage",
       "timestamp": "2026-09-19T17:45:00Z"
     }
     ```
   - On `DOWN`: creates or updates active incident in `system_incidents`.
   - On `UP`: resolves active incident in `system_incidents` with calculated duration.
   - Returns `{ ok: true, action: 'created' | 'resolved', incidentId: string }`.
2. Create `scripts/email-to-webhook-worker.js`:
   - A standalone, zero-dependency Cloudflare Email Worker.
   - Listens to incoming emails from UptimeRobot (e.g. `alert@uptimerobot.com`).
   - Parses the email subject and body (`"is DOWN"` vs `"is UP"`).
   - Forwards the parsed alert to `https://roommate26.vercel.app/api/uptime-webhook` with secure authentication.
3. Update `docs/UPTIMEROBOT_INTEGRATION.md`:
   - Document the complete step-by-step guide for deploying the Cloudflare Email Worker (100% free tier, zero external cost).

### Phase 4: Full Quality Gates & Production Health Verification
1. Run existing test suite (`npm test`).
2. Run ESLint (`npm run lint`).
3. Run TypeScript checks (`npx tsc --noEmit` and `npx tsc -p tsconfig.node.json --noEmit`).
4. Run production build (`npm run build`).
5. Verify live production `/api/health` and both production monitors remain healthy and active.
