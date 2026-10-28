# PLAN: Phase 9 — Personal Vault + Room Share Integration & Personal Expense RLS Hardening

**Plan Identifier:** `PLAN-phase9-vault-rls.md`  
**Target Channel:** Isolated Staging Only  
**Production Gate:** `pbzaaskftrmnvocczhat.supabase.co` is **LOCKED & STRICTLY UNTOUCHED**  
**Created:** 2026-10-05

---

## 1. Executive Summary & Objective

In this phase, we resolve the two primary discrepancies discovered during the code-level financial audit:
1. **Personal Vault Financial Completeness:** Integrate the user's calculated Room Share split (`expense_splits.share_amount`) into their Personal Vault spending views without duplicating records in `personal_expenses`, unifying desktop and mobile spending definitions.
2. **Personal Expenses RLS & API Hardening:** Fix the insecure `FOR SELECT TO public USING (true)` policy on `public.personal_expenses` by implementing database-level owner isolation (`user_id = auth.uid()`), hardening RPCs against caller spoofing, and restricting client queries to server-side `eq('user_id', currentUser.id)`.

---

## 2. Environment & Staging Identification Audit

### Critical Environment Matrix
| Environment | Supabase Project Ref | Host / URL | Status | Safety Protocol |
| :--- | :--- | :--- | :--- | :--- |
| **Production** | `pbzaaskftrmnvocczhat` | `https://pbzaaskftrmnvocczhat.supabase.co` | **LOCKED** | **Zero connections, zero DDL, zero mutations.** |
| **Cloud Staging** | `ycredqiiwdbrjzqeczio` | `https://ycredqiiwdbrjzqeczio.supabase.co` | **STAGING** | Controlled migrations with safety assert. |
| **Local Staging DB** | Local Docker / Vitest | `127.0.0.1:54322` / mockStorage | **ACTIVE** | Primary test harness for regression & RLS logic. |

> [!WARNING]
> **Safety Flag:** The repo file `.env.staging` was found pointing to `pbzaaskftrmnvocczhat`. Before running any staging network requests, verify that the active target does NOT match `pbzaaskftrmnvocczhat`. Any script connecting to Supabase must include an explicit assert: `if (target === 'pbzaaskftrmnvocczhat') throw new Error('PRODUCTION_BLOCKED')`.

---

## 3. Financial Model Architecture (No Data Duplication)

### Invariants:
1. **Total Spent Formula:**
   $$\text{Total Spent} = \sum \text{personal\_expenses} + \sum_{\text{active rooms}} \text{expense\_splits}(\text{user\_id} = \text{me})$$
2. **Payer Recovery vs Spending:**
   - Amount paid up front for others ($\text{total\_amount} - \text{my\_share}$) is an asset/receivable, **NEVER** personal spending.
3. **Settlement Accounting:**
   - Settling a debt (e.g. paying ₹100 of ₹250 owed) alters outstanding balances, **NEVER** historical expense totals.
4. **Data Isolation:**
   - Shared bills remain in `shared_expenses` + `expense_splits`.
   - Private expenses remain in `personal_expenses`.
   - Zero synthetic rows are inserted into `personal_expenses` for shared expenses.

---

## 4. Phase Breakdown & Execution Plan

### Phase 1: Database RLS & RPC Security Hardening (Staging Migration)
- **New Migration:** `supabase/migrations/20261005160000_harden_personal_expenses_rls.sql`
  - Drop public `USING (true)` policies on `public.personal_expenses`.
  - Add strict owner policies:
    ```sql
    CREATE POLICY "Personal expenses owner select"
    ON public.personal_expenses FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Personal expenses owner insert"
    ON public.personal_expenses FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND amount > 0);

    CREATE POLICY "Personal expenses owner update"
    ON public.personal_expenses FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND amount > 0);

    CREATE POLICY "Personal expenses owner delete"
    ON public.personal_expenses FOR DELETE TO authenticated
    USING (user_id = auth.uid());
    ```
  - Harden `submit_personal_expense_secure` and `delete_personal_expense_secure` to verify caller authorization (`auth.uid() = p_user_id` or superadmin).

### Phase 2: Client Query & Cloud Adapter Hardening
- **File:** `src/lib/storage/cloudStorageAdapter.ts`
  - Change initial personal expense fetch:
    ```typescript
    // Before: supabase.from('personal_expenses').select('*')
    // After: Server-side user boundary
    supabase.from('personal_expenses').select('*').eq('user_id', currentUser.id)
    ```
- **File:** `src/lib/supabase/supabaseService.ts`
  - Validate all calls pass authenticated `currentUser.id`.

### Phase 3: Personal Vault Desktop Component Update
- **File:** `src/components/PersonalVault.tsx`
  - Accept `sharedExpenses`, `expenseSplits`, `activeRoom`, `allUsers`, and `settlementPayments`.
  - Compute `userRoomShareTotal = mySplits.reduce((sum, s) => sum + s.shareAmount, 0)`.
  - Display unified top summary cards:
    - **Total Outflow:** `₹2,750` (`Personal ₹2,500 + Room ₹250`)
    - **Private Expenses Card:** `₹2,500`
    - **Room Share Contribution Card:** `₹250`
    - **Room Share Standing:** You get ₹750 / You owe ₹X
  - Provide a toggle or dual-tab: **Private Expenses** (interactive, add/delete) vs. **Room Share Contributions** (read-only list of room splits).

### Phase 4: Mobile Personal Vault Component Update
- **File:** `src/components/mobile/MobilePersonalVault.tsx`
  - Update `weeklyTotal`, `selectedMonthTotal`, and `allTimeTotal` calculations to cleanly incorporate `totalSharedContribution` alongside `totalPersonalSpending`.
  - Add structured visual cards for Room Share contributions and net standing.

### Phase 5: Mobile Dashboard Parity Update
- **File:** `src/components/mobile/MobileDashboard.tsx`
  - Update the "Personal Spending Insights" card from displaying only `thisMonthPersonal` to displaying `Total Monthly Outflow (₹2,750)` with the clear subtext `Personal (₹2,500) + Room Share (₹250)`, achieving 100% desktop/mobile parity.

### Phase 6: Automated Security & Regression Test Harness
- **New Unit & Integration Tests:**
  - `src/test/v2-financial-engine/phase9PersonalVaultAndRls.test.ts`
  - Test Case 1: User A pays ₹1,000 for 4 members -> Personal Vault spending includes ₹250, Receivable = ₹750.
  - Test Case 2: Someone else pays ₹1,000 -> Personal Vault spending includes ₹250, Payable = ₹250.
  - Test Case 3: Partial settlement of ₹100 -> Spending unchanged (₹250), Receivable drops to ₹650.
  - Test Case 4: Zero row duplication in `personal_expenses`.
  - Test Case 5: Direct query for another user's personal expenses denied at database layer.
  - Test Case 6: Desktop and mobile spending totals are strictly identical.

---

## 5. Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Mobile resident PIN logins lack Supabase Auth JWT | RLS blocks legitimate read/write | Maintain secure session claim verification inside RPC or issue lightweight anonymous session tokens. |
| User logs private expense AND shared expense for same item | Accidental personal double counting | Add clear UI helper copy indicating that splitting a room bill automatically tracks your share. |
| Production leakage | Severe data/security breach | Hardcode assertion blocking `pbzaaskftrmnvocczhat` from all execution scripts. |

---

## 6. Verification Checklist & Success Criteria

- [ ] New migration created: `20261005160000_harden_personal_expenses_rls.sql`
- [ ] RLS on `public.personal_expenses` enforces `user_id = auth.uid()`
- [ ] Client queries enforce `.eq('user_id', currentUser.id)`
- [ ] `submit_personal_expense_secure` prevents caller spoofing
- [ ] Desktop `PersonalVault.tsx` displays Total Outflow (₹2,750 = ₹2,500 + ₹250)
- [ ] Mobile `MobilePersonalVault.tsx` displays matching unified totals
- [ ] Mobile `MobileDashboard.tsx` displays unified totals matching desktop
- [ ] No rows copied into `public.personal_expenses` from shared expenses
- [ ] Settlements never mutate historical expense totals
- [ ] All unit, integration, and security tests pass
- [ ] Production (`pbzaaskftrmnvocczhat`) verified 100% untouched
