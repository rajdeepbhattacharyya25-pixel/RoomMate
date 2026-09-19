# RoomMate — UptimeRobot Free Integration & MCP Specification

This document provides the operational configuration, live monitor records, and Model Context Protocol (MCP) integration details for **RoomMate** external uptime monitoring using **UptimeRobot Free**.

---

## 1. Overview & Free-Tier Architecture

To achieve high-availability monitoring without introducing paid infrastructure, RoomMate integrates with **UptimeRobot Free** via its official Model Context Protocol (MCP) server:
* **Cost:** $0.00 / month (Free tier permits up to 50 monitors).
* **Monitoring Interval:** 5 minutes (UptimeRobot Free standard).
* **Monitors Configured:** Exactly 2 monitors (100% within free quota).
* **Alert Channel:** Email delivery to SuperAdmin (`rajdeep.bhattacharyya25@gmail.com`, Contact ID: `8829170`).
* **Excluded:** Telegram notifications are strictly excluded.
* **Database Keep-Alive:** Periodic 5-minute probes to `/api/health` prevent Supabase Free Tier auto-pausing.

---

## 2. Model Context Protocol (MCP) Configuration

The repository is connected directly to the hosted UptimeRobot MCP endpoint (`https://mcp.uptimerobot.com/mcp`).

### `.mcp.json` Configuration
Located in the project root:
```json
{
  "mcpServers": {
    "supabase": {
      "serverUrl": "https://mcp.supabase.com/mcp?project_ref=pbzaaskftrmnvocczhat&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
    },
    "uptimerobot": {
      "url": "https://mcp.uptimerobot.com/mcp",
      "headers": {
        "Authorization": "Bearer ${UPTIMEROBOT_API_KEY}"
      }
    }
  }
}
```

> **Security Note:** The `UPTIMEROBOT_API_KEY` is loaded dynamically from your local, git-ignored `.env` file or CI/CD secrets. Raw credentials are never stored directly in `.mcp.json`, code files, or documentation.


### Available MCP Tools
AI clients connecting through `.mcp.json` can invoke 34 native monitoring operations, including:
* `list-monitors`: List all configured monitors, URLs, and current statuses.
* `get-monitor-details`: Inspect headers, timeouts, HTTP codes, and alert contacts.
* `get-monitor-stats`: Retrieve overall uptime percentage, incident counts, and MTBF.
* `get-response-times`: Fetch historical response time series for latency analysis.
* `list-incidents`: Inspect incident timelines, error codes, and checker locations.
* `create-monitor` / `update-monitor`: Programmatically provision or adjust monitoring thresholds.

---

## 3. Live Active Monitors

Both production monitors have been provisioned and verified active via the UptimeRobot MCP:

| Parameter | Monitor 1: Production Web Frontend | Monitor 2: Backend & Database Health API |
| :--- | :--- | :--- |
| **Monitor ID** | **`804035441`** | **`804035777`** |
| **Friendly Name** | `RoomMate - Production Web` | `RoomMate - Backend & Database Health` |
| **Target URL** | `https://roommate26.vercel.app/` | `https://roommate26.vercel.app/api/health` |
| **Monitor Type** | `HTTP` | `KEYWORD` |
| **Keyword Value** | N/A | `{"status":"ok"}` |
| **Keyword Rule** | N/A | `ALERT_NOT_EXISTS` (Triggers DOWN if keyword missing) |
| **Keyword Case** | N/A | Case-sensitive (`0`) |
| **Check Interval** | `300 seconds` (5 mins) | `300 seconds` (5 mins) |
| **Request Timeout** | `30 seconds` | `30 seconds` |
| **Success Statuses** | `2xx`, `3xx` (HTTP 200) | `2xx`, `3xx` (HTTP 200) |
| **Current Status** | **`UP`** (Operational) | **`UP`** (Operational) |
| **Alert Contact** | `rajdeep.bhattacharyya25@gmail.com` (`8829170`) | `rajdeep.bhattacharyya25@gmail.com` (`8829170`) |
| **Threshold / Delay** | `0 minutes` (Instant) | `0 minutes` (Instant) |

---

## 4. Free-Tier Assertion & Incident Synchronization Investigation

### API Monitoring with JSON Assertions vs Keyword Monitoring
* **API Assertion Investigation:** Testing `create-monitor` with `type: "API"` and JSONPath assertions (`$.status == "ok"`) via UptimeRobot MCP returned:
  ```json
  "You are not allowed to use some settings with your current plan."
  ```
  API response assertion monitoring is an UptimeRobot PRO/paid feature and is **not supported on the Free tier**.
* **Keyword Monitoring Solution:** Configured Monitor 2 as `type: "KEYWORD"` with `keywordValue: "{\"status\":\"ok\"}"` and `keywordType: "ALERT_NOT_EXISTS"`. If the database probe fails, `/api/health` returns HTTP 503 and body `{"status":"error","message":"database connectivity probe failed"}`, which immediately trips the keyword check and alerts the administrator.

### Incident Synchronization Investigation (`UptimeRobot` -> `system_incidents`)
* **Webhook Alert Contacts (`type: 5`):** Tested creating a webhook contact via `newAlertContact` using the UptimeRobot API:
  ```json
  {
    "stat": "fail",
    "error": {
      "type": "access_denied",
      "message": "This integration is not available for current user."
    }
  }
  ```
  UptimeRobot strictly blocks webhook integrations on the Free plan.
* **Constraints Evaluation:**
  - **UptimeRobot Free:** Does not permit outgoing webhooks; only Email notifications (`type: 2`) to `rajdeep.bhattacharyya25@gmail.com`.
  - **Vercel Hobby:** Strictly limits cron jobs to once per 24 hours (`0 0 * * *`); high-frequency cron polling is prohibited.
  - **Supabase Free & RoomMate:** No paid middleware or Telegram bots allowed under zero-cost constraint.
* **Verdict:** There is **no genuinely real-time, automated push synchronization** from UptimeRobot Free into `system_incidents` without a paid UptimeRobot plan or an external email-relay worker. On-demand lazy synchronization (fetching from UptimeRobot REST API when a SuperAdmin opens the incident dashboard) is the only native zero-cost mechanism available.

---

## 5. MCP Operational Commands & Verification

You can query the live status of the monitoring infrastructure at any time through the MCP connection:

### 1. Check All Monitors Status
```json
{
  "method": "tools/call",
  "params": {
    "name": "list-monitors",
    "arguments": {}
  }
}
```
**Expected Response:** Returns both monitors (`804035441` and `804035777`) with `status: "UP"`.

### 2. Retrieve 7-Day Performance & Availability Stats
```json
{
  "method": "tools/call",
  "params": {
    "name": "get-monitor-stats",
    "arguments": {
      "monitorId": 804035441
    }
  }
}
```
**Expected Output:** Overall uptime ratio (`1.0` = 100%), total incidents (`0`), and active monitor count.

### 3. Check for Incidents
```json
{
  "method": "tools/call",
  "params": {
    "name": "list-incidents",
    "arguments": {
      "timeRange": "7d"
    }
  }
}
```

---

## 6. Security & Isolation Guarantee

1. **Zero Secret Leakage:** The public health endpoint `/api/health` strictly responds with `{"status":"ok"}` or `{"status":"error"}`. Connection strings, user records, and database secrets are never exposed.
2. **Student Privacy:** Row Level Security (RLS) on Supabase prevents student accounts from accessing incident telemetry.
3. **Zero Financial Impact:** Health checks run on isolated serverless routes and never touch ledger calculation loops, debt graphs, or local mutation queues.

---

## 7. On-Demand SuperAdmin Sync

To synchronize UptimeRobot outage events into RoomMate's `system_incidents` table without requiring paid UptimeRobot webhooks, RoomMate provides **On-Demand SuperAdmin Sync**:

* **Serverless Endpoint:** `/api/uptime-sync`
  - Authenticates and securely reads `UPTIMEROBOT_API_KEY` on the server.
  - Queries `https://api.uptimerobot.com/v2/getMonitors`.
  - If a monitor is DOWN (`status: 9`), creates a new critical incident in `public.system_incidents` (`status: 'INVESTIGATING'`).
  - If all monitors are UP (`status: 2`), automatically resolves any open `[UptimeRobot Alert]` incidents.
* **SuperAdmin UI Trigger:**
  - Located in SuperAdmin portal -> **System Health** -> **"Sync UptimeRobot"** button.
  - Clicking the button executes the synchronization, updates the live ticking downtime banner, and displays a reactive feedback toast.

---

## 8. Zero-Cost Email-to-Webhook Architecture

For real-time push alerting without paying for UptimeRobot PRO, RoomMate includes an **Email-to-Webhook Bridge** via Cloudflare Email Routing:

1. **Inbound Receiver:** `/api/uptime-webhook`
   - Accepts authenticated JSON payloads:
     ```json
     {
       "event": "DOWN",
       "monitorName": "RoomMate - Backend & Database Health",
       "reason": "Keyword {\"status\":\"ok\"} missing",
       "timestamp": "2026-09-19T18:00:00Z"
     }
     ```
   - Secured with `x-webhook-secret: <UPTIME_WEBHOOK_SECRET>`.
   - On `DOWN`: logs critical incident into `system_incidents`.
   - On `UP`: resolves active incident in `system_incidents`.
2. **Cloudflare Email Worker:** [`scripts/email-to-webhook-worker.js`](file:///c:/Users/ASUS/Downloads/student%20expense%20app/scripts/email-to-webhook-worker.js)
   - Zero-cost Cloudflare Worker listening to incoming UptimeRobot email notifications.
   - Parses the alert subject (`"is DOWN"` / `"is UP"`), extracts the service name, and forwards the event directly to `https://roommate26.vercel.app/api/uptime-webhook`.
