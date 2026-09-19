# PLAN: Professional GitHub Commit & Upload Strategy

**Task**: Upload all pending changes to GitHub with professional Conventional Commits  
**Target Branch**: `main` (`origin/main`)  
**Status**: Ready for Execution  

---

## 1. Overview & Pre-Flight Validation

- **Test Suite**: 32 test files passed, 345/345 tests green (`npm test`).
- **Production Bundle**: Passed clean Vite & TypeScript build (`npm run build`).
- **Secret Protection**: `.env` and sensitive local files remain safely excluded in `.gitignore`. `.mcp.json` references `${UPTIMEROBOT_API_KEY}` without plain text credentials.

---

## 2. Atomic Commit Strategy

### Commit 1: Android Release Stability & Version Bump
```bash
git add android/app/build.gradle android/gradle.properties src/config/buildInfo.ts docs/PLAN-fix-apk-crash-v8.md
git commit -m "fix(android): resolve release APK crash by disabling minification and bump build to v8"
```
- **Rationale**: Keeps native Android stability fixes isolated from web/monitoring features.

### Commit 2: Health Monitoring Engine & Persistence Architecture
```bash
git add api/health.ts src/types/index.ts src/config/monitoringConfig.ts src/config/monitoringConfig.test.ts src/config/freeTierCompliance.test.ts src/lib/supabase/client.ts src/lib/health/healthService.ts src/lib/health/healthService.test.ts src/lib/health/failureScenarioSimulation.test.ts src/lib/health/securityPrivacyReview.test.ts src/lib/storage/cloudStorageAdapter.ts src/lib/storage/mockStorage.ts src/lib/storage/incidentDataModel.test.ts supabase/migrations/20260918_system_incidents_hardening.sql tsconfig.node.json vercel.json
git commit -m "feat(health): add core health probe service, storage adapter, and database migrations"
```
- **Rationale**: Packages backend serverless probes, Supabase ping mechanisms, schema migrations, and storage abstraction layers together with their test suites.

### Commit 3: SuperAdmin System Health Portal & Navigation UI
```bash
git add src/components/admin/pages/AdminSystemHealth.tsx src/components/admin/pages/adminSystemHealthHelpers.ts src/components/admin/pages/adminSystemHealth.test.ts src/components/admin/AdminRouter.tsx src/components/admin/AdminSidebar.tsx src/components/admin/pages/AdminDashboard.tsx src/components/admin/pages/AdminExpenseDetailModal.tsx src/components/admin/pages/AdminUserDetailModal.tsx src/components/admin/adminSecurityAuth.test.ts src/components/Navbar.tsx src/App.tsx src/lib/auth/superAdminSecurityService.ts
git commit -m "feat(admin): implement system health dashboard, live telemetry, and incident management UI"
```
- **Rationale**: Groups all frontend UI components, router integrations, navigation indicators, and SuperAdmin security checks.

### Commit 4: UptimeRobot MCP Configuration & Integration Docs
```bash
git add .mcp.json .env.example .gitignore docs/PLAN-uptimerobot-mcp.md docs/UPTIMEROBOT_INTEGRATION.md docs/UPTIME_MONITORING_PHASE_BY_PHASE_EXECUTION.md docs/PLAN-github-upload.md
git commit -m "feat(monitoring): integrate UptimeRobot MCP configuration and operational docs"
```
- **Rationale**: Encapsulates external tooling configurations, environment variable templates, and documentation.

---

## 3. Remote Push & Verification

```bash
git push origin main
git status -s -b
```

---

## 4. Verification Checklist

- [x] All automated unit and integration tests passing (`345/345`)
- [x] Full production TypeScript and bundle compilation verified
- [x] Zero credential leaks in git staging diffs
- [ ] Atomic commits created and verified in git log
- [ ] Successfully pushed to `origin/main`
