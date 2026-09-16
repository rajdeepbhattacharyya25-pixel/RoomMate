# ROOMMATE — SUPERADMIN SECURITY SYSTEM PLAN
## High-Security Multi-Layer Authentication & Authorization Layer

**Document:** `docs/PLAN-superadmin-security.md`  
**Mode:** PLANNING ONLY (No source code changes)  
**Status:** PROPOSED FOR USER APPROVAL (UPDATED WITH STRICT SERVER-SIDE BOUNDARIES)  
**Target Architecture:** Desktop & Mobile (Capacitor Android/iOS) + Supabase Cloud PostgreSQL / Local Engine  
**Role Scope:** Strictly accounts where verified server-side `role === 'SUPER_ADMIN'`  
**Zero Trust Principle:** Frontend is completely untrusted. The server and database are the sole security boundaries.

---

## 1. Zero-Trust Security Objective & Server-Side Enforcement

### The Threat Model
Assume that an attacker:
1. Completely controls the client runtime and browser DevTools.
2. Can tamper with frontend JavaScript, set local variables like `role = 'superadmin'` or `mfaVerified = true`.
3. Can intercept and modify HTTP/WebSocket request payloads (e.g. inject `{ "role": "superadmin" }` or `{ "userId": "usr-superadmin" }`).
4. Can invoke API endpoints directly via `curl` / Postman / scripts using valid normal student credentials.
5. Can execute direct SQL queries against Supabase tables via PostgREST.

### Non-Negotiable Core Principle
> **The frontend is ONLY a user experience (UX) layer.**  
> It must NEVER be treated as a security boundary.  
> Every privileged action, role resolution, MFA assurance check, and step-up verification must occur **server-side** inside trusted PostgreSQL database functions and Row Level Security (RLS) policies.

---

## 2. Server-Side Execution Flow for Every Privileged Operation

Every Superadmin operation must follow this exact sequence:

```text
Incoming Request / Supabase RPC Call
      ↓
[1. Validate Session]
Extract caller identity directly from server-side cryptographic context (auth.uid())
      ↓
[2. Resolve True Role from Database]
SELECT role FROM public.profiles WHERE id = auth.uid()
(NEVER accept role from client parameters or payload)
      ↓
[3. Enforce Role === 'SUPER_ADMIN']
If role <> 'SUPER_ADMIN' → ABORT (RAISE EXCEPTION 'FORBIDDEN')
      ↓
[4. Verify MFA Authentication Assurance Level]
Inspect server JWT claims: auth.jwt() ->> 'aal' === 'aal2'
If not AAL2 → ABORT (RAISE EXCEPTION 'MFA_REQUIRED')
      ↓
[5. Enforce Step-Up Freshness (Risk-Based)]
• Level 1 (Normal): Valid AAL2 session
• Level 2 (Sensitive): Verify last_step_up_at >= now() - INTERVAL '10 minutes'
• Level 3 (Critical/Destructive): Require immediate dual-factor verification (Biometric + TOTP)
      ↓
[6. Authorize & Execute Operation]
Execute database mutation within the security boundary
      ↓
[7. Immutable Server-Side Audit Log]
INSERT into public.security_audit_logs with authenticated actor_id (Zero secret leaks)
```

---

## 3. Database Schema & Migration Specification

### Migration File: `supabase/migrations/20260916_superadmin_security_system.sql`

#### 1. Tamper-Proof Trigger on `public.profiles` (Anti-Escalation Gate)
```sql
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Prevent privilege escalation
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() <> 'service_role' AND NOT internal.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Unauthorized role escalation attempt. Non-superadmins cannot modify roles.';
    END IF;
  END IF;

  -- Prevent account suspension bypass by self or unauthorized actors
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    IF auth.role() <> 'service_role' AND NOT internal.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Non-superadmins cannot modify account suspension status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_role_escalation();
```

#### 2. Table: `public.superadmin_security_settings`
```sql
CREATE TABLE IF NOT EXISTS public.superadmin_security_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  totp_enrolled BOOLEAN NOT NULL DEFAULT false,
  totp_factor_id TEXT,
  backup_totp_enrolled BOOLEAN NOT NULL DEFAULT false,
  backup_totp_factor_id TEXT,
  biometric_enabled BOOLEAN NOT NULL DEFAULT false,
  recovery_codes_configured BOOLEAN NOT NULL DEFAULT false,
  recovery_codes_remaining INT NOT NULL DEFAULT 0,
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  failed_mfa_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_step_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.superadmin_security_settings ENABLE ROW LEVEL SECURITY;

-- Read policy: only verified superadmins can inspect their own security settings
CREATE POLICY "Superadmin reads own security settings"
  ON public.superadmin_security_settings FOR SELECT
  TO authenticated
  USING (internal.is_super_admin(auth.uid()) AND user_id = auth.uid());

-- Direct client updates strictly DENIED; settings can only be altered via verified RPCs
CREATE POLICY "No direct client update on security settings"
  ON public.superadmin_security_settings FOR UPDATE
  TO authenticated
  USING (false);
```

#### 3. Table: `public.superadmin_recovery_codes`
```sql
CREATE TABLE IF NOT EXISTS public.superadmin_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, -- SHA-256 hash of normalized code (XXXX-XXXX-XXXX)
  is_consumed BOOLEAN NOT NULL DEFAULT false,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON public.superadmin_recovery_codes(user_id);
ALTER TABLE public.superadmin_recovery_codes ENABLE ROW LEVEL SECURITY;
-- ZERO client policies: NO SELECT, INSERT, UPDATE, or DELETE permits for authenticated/anon!
-- Accessible exclusively through SECURITY DEFINER RPCs.
```

#### 4. Table: `public.superadmin_trusted_devices`
```sql
CREATE TABLE IF NOT EXISTS public.superadmin_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  browser TEXT NOT NULL,
  ip_address TEXT,
  is_trusted BOOLEAN NOT NULL DEFAULT true,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON public.superadmin_trusted_devices(user_id);
ALTER TABLE public.superadmin_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin views own devices"
  ON public.superadmin_trusted_devices FOR SELECT
  TO authenticated
  USING (internal.is_super_admin(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "No direct client modifications on trusted devices"
  ON public.superadmin_trusted_devices FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
```

#### 5. Table: `public.security_audit_logs` (Immutable Append-Only Trail)
```sql
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  event_type TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'BLOCKED')),
  target_entity TEXT,
  target_entity_id TEXT,
  device_id TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_security_audit_actor ON public.security_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_event ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_logs(created_at DESC);
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin reads security audit logs"
  ON public.security_audit_logs FOR SELECT
  TO authenticated
  USING (internal.is_super_admin(auth.uid()));

-- UPDATE and DELETE have NO policies, making logs permanently immutable!
-- INSERT is done solely via SECURITY DEFINER logging functions.
```

#### 6. Server-Side RPC Functions for All Privileged Operations
Every privileged action is exposed as a hardened PostgreSQL RPC function with server-side validation:

1. **`superadmin_assert_access(p_risk_level INT)` Helper Function**:
   - Validates `auth.uid() IS NOT NULL`.
   - Checks `internal.is_super_admin(auth.uid())`.
   - Checks `auth.jwt() ->> 'aal' = 'aal2'`.
   - If `p_risk_level >= 2`, checks `last_step_up_at >= now() - INTERVAL '10 minutes'`.
   - Aborts with specific PostgreSQL exceptions if any assertion fails.
2. **`superadmin_toggle_user_suspension(p_target_user_id, p_suspend, p_reason)`**:
   - Asserts Level 2 access, mutates `profiles.is_suspended`, logs event to `security_audit_logs`.
3. **`superadmin_toggle_room_freeze(p_room_id, p_freeze, p_reason)`**:
   - Asserts Level 2 access, mutates `rooms.is_frozen`, logs event.
4. **`superadmin_archive_room(p_room_id, p_archive, p_reason)`**:
   - Asserts Level 2 access, mutates `rooms.is_archived`, logs event.
5. **`superadmin_reset_room_code(p_room_id)`**:
   - Asserts Level 2 access, generates secure random 6-character invite code, updates room, logs event.
6. **`superadmin_revoke_device_session(p_device_id)`**:
   - Asserts Level 2 access, marks device revoked in `superadmin_trusted_devices`, logs event.
7. **`superadmin_revoke_all_other_sessions(p_current_device_id)`**:
   - Asserts Level 3 access (requires dual verification), revokes all other devices, logs event.
8. **`superadmin_verify_recovery_code(p_code)`**:
   - Hashes `p_code`, matches unconsumed code for `auth.uid()`, consumes it, records audit log.
9. **`superadmin_store_recovery_codes(p_code_hashes)`**:
   - Asserts Level 3 access, replaces old unconsumed codes with new hashes, updates settings, logs event.
10. **`superadmin_verify_step_up(p_action, p_method)`**:
    - Updates `last_step_up_at = now()`, records step-up audit entry.

---

## 4. Client & Storage Engine Parity

### Local / Offline Mirror (`mockStorage.ts`)
The offline and unit testing mock storage engine mirrors the identical security gate:
- `verifySuperAdminAssurance(actionRiskLevel: 1 | 2 | 3)`:
  - Validates active session token.
  - Verifies user's true stored role is `SUPER_ADMIN` (rejects forged caller parameters).
  - Verifies MFA configuration & verification status.
  - Checks 10-minute step-up freshness window for Level 2 and Level 3 actions.
- Any attempt to update `user.role` from `STUDENT` to `SUPER_ADMIN` throws `SECURITY_VIOLATION`.

### Client Security Service (`superAdminSecurityService.ts`)
- Manages TOTP enrollment via Supabase Auth MFA (`supabase.auth.mfa.*`) in live mode, and RFC 6238 HMAC-SHA1 Web Crypto engine in offline mode.
- Hashes recovery codes client-side with SHA-256 before transmitting to RPC. Never writes plaintext recovery codes to disk/localStorage.
- Handles rate-limiting (5 failures in 5 min -> 15 min lock) and generic error messages.

---

## 5. Explicit Attack Scenarios & Server-Side Verification

| Attack | Attacker Technique | Server Defense & Outcome |
|---|---|---|
| **Attack 1** | Modifies `localStorage` or React state to `role = 'superadmin'` | **DENIED**: Server checks `internal.is_super_admin(auth.uid())` in DB; rejects with 403 Forbidden. |
| **Attack 2** | Calls `superadmin_toggle_user_suspension` RPC using student JWT | **DENIED**: Server RPC checks `auth.uid()` against `profiles.role`; aborts immediately. |
| **Attack 3** | Calls `supabase.from('profiles').update({ role: 'SUPER_ADMIN' })` | **DENIED**: Database trigger `trg_prevent_role_escalation` aborts with `SECURITY_VIOLATION`. |
| **Attack 4** | Navigates directly to `/admin` with valid student session | **DENIED**: Frontend redirects to student view; backend blocks all data fetch queries via RLS. |
| **Attack 5** | Calls sensitive action with AAL1 (password only, no MFA) | **DENIED**: RPC checks `auth.jwt() ->> 'aal' = 'aal2'`; aborts with `MFA_REQUIRED`. |
| **Attack 6** | Attempts to reuse a previously consumed recovery code | **DENIED**: Code hash matches `is_consumed = true`; rejected with generic error. |
| **Attack 7** | Calls `supabase.from('superadmin_recovery_codes').select('*')` | **DENIED**: Zero SELECT policies exist on recovery codes table; PostgREST returns empty / 401. |
| **Attack 8** | Attempts to delete or edit `security_audit_logs` | **DENIED**: No UPDATE or DELETE policies exist; table is permanently append-only. |

---

## 6. Implementation Checklist & Verification

1. **Database Migration**:
   - Execute `20260916_superadmin_security_system.sql` on Supabase project `pbzaaskftrmnvocczhat`.
2. **Security Services**:
   - Create `src/lib/auth/superAdminSecurityService.ts`.
   - Update `src/lib/native/biometrics.ts`.
   - Update `src/lib/storage/mockStorage.ts` and `src/lib/storage/cloudStorageAdapter.ts`.
3. **Admin UI & Flow**:
   - Update `AdminLoginView.tsx` and `SuperAdminLoginModal.tsx` for mandatory MFA.
   - Implement `StepUpAuthModal.tsx`.
   - Protect all privileged actions in `AdminRouter.tsx`.
   - Overhaul `AdminSecurity.tsx` with all 7 security sections.
4. **Automated Security Tests**:
   - Create `src/lib/auth/superAdminSecurity.test.ts` testing all 8 attacks and complete operational lifecycle.
   - Run `npm test` and `npm run build`.

---
*Ready to begin execution upon your confirmation.*
