# Project Plan: UptimeRobot MCP Connection & Live Monitoring Setup

**Plan File:** `docs/PLAN-uptimerobot-mcp.md`  
**Date:** September 19, 2026  
**Status:** Ready for Execution (Planning Mode)  
**Mode:** PLANNING ONLY (No source code modifications executed in this step)

---

## 1. Executive Summary & Context

The user requested:
1. Connect to the **UptimeRobot Model Context Protocol (MCP)** server at `https://mcp.uptimerobot.com/mcp`.
2. Configure all connections using a secure environment variable `UPTIMEROBOT_API_KEY`.
3. Verify end-to-end connectivity and operational integrity (monitors created, health status verified).
4. Update the uptime monitoring documentation (`docs/UPTIMEROBOT_INTEGRATION.md` and `docs/UPTIME_MONITORING_PHASE_BY_PHASE_EXECUTION.md`) with live configuration details.

### Pre-flight Diagnostic Verification (Completed):
- **MCP Endpoint Check:** Probed `https://mcp.uptimerobot.com/mcp` with JSON-RPC 2.0. Confirmed endpoint is active and supports 34 tools (`list-monitors`, `create-monitor`, `get-monitor-details`, `list-integrations`, etc.).
- **Account Verification:** Authenticated as `rajdeep.bhattacharyya25@gmail.com` (Account ID: `3785250`, Free Tier limit: 50 monitors, current monitors: 0).
- **Notification Contact:** Verified existing active notification channel ID `8829170` (`rajdeep.bhattacharyya25@gmail.com`, Type: `Email`, Status: `Active`).

---

## 2. Architecture & Connection Blueprint

```
                      ┌──────────────────────────────────────────────┐
                      │             AI Client / IDE                  │
                      │  - Antigravity / Cursor / Claude Code        │
                      │  - Reads .mcp.json with Bearer Token         │
                      └──────────────────────┬───────────────────────┘
                                             │ JSON-RPC 2.0 / MCP
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │    UptimeRobot Hosted MCP Server             │
                      │    https://mcp.uptimerobot.com/mcp           │
                      │    (Bearer: ${UPTIMEROBOT_API_KEY})          │
                      └───────┬──────────────────────────────┬───────┘
                              │                              │
                  Monitor 1   │                              │ Monitor 2
                  (Web SPA)   │                              │ (Backend Health)
                              ▼                              ▼
              ┌───────────────────────────┐      ┌───────────────────────────┐
              │ https://roommate26.vercel │      │ https://roommate26.vercel │
              │ .app/                     │      │ .app/api/health           │
              │ - HTTP 200 OK             │      │ - HTTP 200 OK             │
              │ - 5-min interval          │      │ - Keyword: "status":"ok"  │
              │ - 30s timeout             │      │ - 15s timeout             │
              └───────────────────────────┘      └───────────────────────────┘
```

---

## 3. Phase-by-Phase Task Breakdown

### Phase 1: Environment & Client Configuration
- **Task 1.1:** Update `.mcp.json` in the workspace root to register `uptimerobot`:
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
- **Task 1.2:** Update `.env.example` with `UPTIMEROBOT_API_KEY=your-api-key` and securely record the key in git-ignored `.env`.

### Phase 2: Automated Dual-Monitor Provisioning via MCP
- **Task 2.1:** Call `create-monitor` for **Monitor 1 (Production Web)**:
  - `friendlyName`: `"RoomMate - Production Web"`
  - `url`: `https://roommate26.vercel.app/`
  - `type`: `"HTTP"`
  - `interval`: `300` (seconds)
  - `timeout`: `30` (seconds)
  - `assignedAlertContacts`: `[{"alertContactId": 8829170, "threshold": 0, "recurrence": 0}]`
- **Task 2.2:** Call `create-monitor` for **Monitor 2 (Backend & Database Health API)**:
  - `friendlyName`: `"RoomMate - Backend & Database Health"`
  - `url`: `https://roommate26.vercel.app/api/health`
  - `type`: `"KEYWORD"` (or `"HTTP"`)
  - `keywordValue`: `"status\":\"ok\""` (if KEYWORD) or HTTP status 200
  - `interval`: `300` (seconds)
  - `timeout`: `15` (seconds)
  - `assignedAlertContacts`: `[{"alertContactId": 8829170, "threshold": 0, "recurrence": 0}]`

### Phase 3: Monitor Health & Connectivity Validation
- **Task 3.1:** Execute `list-monitors` via MCP to capture the newly assigned Monitor IDs and current statuses.
- **Task 3.2:** Execute `get-monitor-details` for both monitors to verify configuration parameters, assigned alert contacts, and regional settings.
- **Task 3.3:** Record response codes and round-trip verification data.

### Phase 4: Documentation Synchronization
- **Task 4.1:** Update `docs/UPTIMEROBOT_INTEGRATION.md`:
  - Document the automated MCP integration.
  - Insert the generated Monitor IDs, target URLs, and assigned alert recipient (`rajdeep.bhattacharyya25@gmail.com`).
  - Add MCP query instructions (`list-monitors`, `list-incidents`, `get-monitor-stats`).
- **Task 4.2:** Update `docs/UPTIME_MONITORING_PHASE_BY_PHASE_EXECUTION.md`:
  - Add execution record under Phase 5 detailing the automated MCP provisioning, active monitor identifiers, and confirmed live status.

### Phase 5: Regression & Build Verification
- **Task 5.1:** Execute `npm test` to guarantee all 344 existing unit and integration tests remain 100% green.
- **Task 5.2:** Execute `npm run lint` to ensure zero ESLint errors.
- **Task 5.3:** Execute `npx tsc -p tsconfig.node.json --noEmit` and `npm run build` to confirm build integrity.

---

## 4. Agent Assignments

| Role | Responsibilities | Assigned Files |
| :--- | :--- | :--- |
| **DevOps & MCP Integrator** | Configure `.mcp.json`, invoke MCP tools, provision monitors | `.mcp.json`, `.env.example` |
| **Documentation Specialist** | Update integration guides and phase logs with live IDs | `docs/UPTIMEROBOT_INTEGRATION.md`, `docs/UPTIME_MONITORING_PHASE_BY_PHASE_EXECUTION.md` |
| **QA / Release Auditor** | Run regression suite, typechecks, and build audits | `test/`, `dist/`, build pipelines |

---

## 5. Verification Checklist

- [ ] `.mcp.json` contains valid `uptimerobot` configuration with Bearer authorization header.
- [ ] Direct MCP JSON-RPC call confirms tools are operable.
- [ ] Monitor 1 (`RoomMate - Production Web`) is created with 5-minute interval.
- [ ] Monitor 2 (`RoomMate - Backend & Database Health`) is created with 5-minute interval.
- [ ] Email contact `rajdeep.bhattacharyya25@gmail.com` (ID: `8829170`) is linked to both monitors.
- [ ] `docs/UPTIMEROBOT_INTEGRATION.md` updated with exact monitor IDs and MCP connection details.
- [ ] `docs/UPTIME_MONITORING_PHASE_BY_PHASE_EXECUTION.md` updated with MCP integration status.
- [ ] Full regression test suite passes (344 tests, 0 lint errors, 0 tsc errors, 0 build errors).

---

## 6. Open Questions for User Confirmation

1. **Target Production Domain:**
   - The default URL configured in `monitoringConfig.ts` is `https://roommate-production.vercel.app`.
   - If your production deployment is hosted on a different Vercel URL (e.g. `https://roommate-xxx.vercel.app`) or a custom domain, please confirm before monitor creation so we register the exact live URL.
