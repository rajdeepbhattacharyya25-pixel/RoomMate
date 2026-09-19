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
| **Monitor ID** | **`804035441`** | **`804035442`** |
| **Friendly Name** | `RoomMate - Production Web` | `RoomMate - Backend & Database Health` |
| **Target URL** | `https://roommate26.vercel.app/` | `https://roommate26.vercel.app/api/health` |
| **Monitor Type** | `HTTP` | `HTTP` |
| **Check Interval** | `300 seconds` (5 mins) | `300 seconds` (5 mins) |
| **Request Timeout** | `30 seconds` | `15 seconds` |
| **Success Statuses** | `2xx`, `3xx` (HTTP 200) | `2xx`, `3xx` (HTTP 200) |
| **Current Status** | **`UP`** (Operational) | **`UP`** (Operational) |
| **Alert Contact** | `rajdeep.bhattacharyya25@gmail.com` (`8829170`) | `rajdeep.bhattacharyya25@gmail.com` (`8829170`) |
| **Threshold / Delay** | `0 minutes` (Instant) | `0 minutes` (Instant) |

---

## 4. MCP Operational Commands & Verification

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
**Expected Response:** Returns both monitors (`804035441` and `804035442`) with `status: "UP"`.

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

## 5. Security & Isolation Guarantee

1. **Zero Secret Leakage:** The public health endpoint `/api/health` strictly responds with `{"status":"ok"}` or `{"status":"error"}`. Connection strings, user records, and database secrets are never exposed.
2. **Student Privacy:** Row Level Security (RLS) on Supabase prevents student accounts from accessing incident telemetry.
3. **Zero Financial Impact:** Health checks run on isolated serverless routes and never touch ledger calculation loops, debt graphs, or local mutation queues.
