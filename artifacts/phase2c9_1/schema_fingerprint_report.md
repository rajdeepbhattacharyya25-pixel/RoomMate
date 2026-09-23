# Schema Fingerprint & Lifecycle Structural Verification Report
**Phase 2C.9.1 — Deployment-Safety Verification**  
**Database**: Isolated Lifecycle Clone (`prod_phase2c9_1_clone`)  
**Target Release Commit**: `4e3d9723896c33e6ac00ca1991168814733fd7dc`  
**Execution Timestamp**: 2026-09-23T11:30:00+05:30  

---

## 1. Executive Summary

As part of Phase 2C.9.1 Objective 2, an exact, deterministic, canonical schema fingerprint was generated before migration replay, after applying migrations 3–23, and after executing the full production rollback script (`scripts/production_rollback_migrations_3_23.sql`).

Comparison between the **Baseline Fingerprint** and the **Post-Rollback Fingerprint** demonstrated **EXACT CRYPTOGRAPHIC AND STRUCTURAL EQUALITY**:
* **Baseline SHA-256**: `b3fbeddd1ed4878d73909b4fe5e285bf4ad1163a69c2bdbd0557d76945e93b57`
* **Post-Rollback SHA-256**: `b3fbeddd1ed4878d73909b4fe5e285bf4ad1163a69c2bdbd0557d76945e93b57`
* **Hashes Match**: **YES (100% BIT-FOR-BIT IDENTICAL)**
* **Structural Diff**: **EXACT MATCH across all 15 audited dimensions**

---

## 2. Object Count & Fingerprint Comparison

| Schema Dimension | Baseline Clone | Migrated State (3–23) | Post-Rollback State | Structural Parity Status |
| :--- | :---: | :---: | :---: | :---: |
| **Tables (public)** | 18 | 24 (+6) | 18 | **EXACT MATCH** |
| **Columns (public)** | 185 | 262 (+77) | 185 | **EXACT MATCH** |
| **Primary Keys** | 18 | 24 (+6) | 18 | **EXACT MATCH** |
| **Foreign Keys** | 22 | 29 (+7) | 22 | **EXACT MATCH** |
| **Unique Constraints** | 5 | 12 (+7) | 5 | **EXACT MATCH** |
| **CHECK Constraints** | 153 | 228 (+75) | 153 | **EXACT MATCH** |
| **Indexes** | 63 | 86 (+23) | 63 | **EXACT MATCH** |
| **Functions / Procedures** | 75 | 92 (+17) | 75 | **EXACT MATCH** |
| **Triggers** | 6 | 21 (+15) | 6 | **EXACT MATCH** |
| **RLS State (Enabled Tables)** | 18 | 24 (+6) | 18 | **EXACT MATCH** |
| **RLS Policies** | 37 | 59 (+22) | 37 | **EXACT MATCH** |
| **Table Privileges / Grants** | 378 | 496 (+118) | 378 | **EXACT MATCH** |
| **Sequences** | 0 | 0 | 0 | **EXACT MATCH** |
| **Views / Materialized Views** | 0 | 0 | 0 | **EXACT MATCH** |
| **Migration History Rows** | 2 | 2 | 2 | **EXACT MATCH** |
| **Canonical SHA-256 Hash** | `b3fbeddd...` | `4d8464b7...` | `b3fbeddd...` | **EXACT MATCH (`true`)** |

---

## 3. Forensic Remediation Applied to Rollback Script

During verification, three subtle structural discrepancies were discovered between pre-migration baseline and post-rollback state. All three were forensically resolved in `scripts/production_rollback_migrations_3_23.sql`:

1. **`public.get_room_balances` Security Context**:
   * *Finding*: Migration 23 changed `get_room_balances` from `SECURITY INVOKER` (established in Migration 11) to `SECURITY DEFINER`.
   * *Resolution*: Explicitly redefined `get_room_balances` back to its pre-migration 23 `SECURITY INVOKER` definition in Step 1 of the rollback script.
2. **RLS Policy Target Roles (`bug_reports` & `in_app_notifications`)**:
   * *Finding*: The rollback script previously recreated policies on `bug_reports` and `in_app_notifications` with `TO authenticated`, whereas the historical baseline migrations (`20260914_bug_reports.sql` and `20260914_in_app_notifications.sql`) omitted the `TO` clause (defaulting to `TO public`).
   * *Resolution*: Removed `TO authenticated` from the baseline policy restoration statements so that PostgreSQL records `roles: ["public"]` matching the exact baseline.
3. **Restoration of Modification Privileges**:
   * *Finding*: Migration 23 executed `REVOKE UPDATE, DELETE ON public.expense_splits FROM anon, authenticated;` and `REVOKE UPDATE, DELETE ON public.settlement_payments FROM anon, authenticated;`. The rollback script initially only granted back to `authenticated`, leaving `anon` without `UPDATE` and `DELETE`.
   * *Resolution*: Updated rollback script to `GRANT UPDATE, DELETE ... TO authenticated, anon;`, restoring exact baseline privilege symmetry.

---

## 4. Artifact Reference

All artifacts are persisted in `artifacts/phase2c9_1/`:
* `baseline_schema_fingerprint.json` (Canonical JSON representation of baseline schema)
* `baseline_schema_fingerprint.sha256` (SHA-256 hash: `b3fbeddd1ed4878d73909b4fe5e285bf4ad1163a69c2bdbd0557d76945e93b57`)
* `post_migration_schema_fingerprint.json` (Canonical JSON representation of migrated schema, SHA-256: `4d8464b70bcd91d10aca6a94031680b40038ce5cdedd01f962d9b8ae288c9ca5`)
* `post_rollback_schema_fingerprint.json` (Canonical JSON representation of post-rollback schema, SHA-256: `b3fbeddd1ed4878d73909b4fe5e285bf4ad1163a69c2bdbd0557d76945e93b57`)
* `schema_diff_baseline_vs_postrollback.json` (Full 15-dimension diff showing `status: "EXACT_MATCH"` for every category)
