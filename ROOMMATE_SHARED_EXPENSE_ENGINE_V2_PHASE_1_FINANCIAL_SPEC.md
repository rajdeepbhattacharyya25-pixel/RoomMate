# ROOMMATE — SHARED EXPENSE ENGINE V2
## PHASE 1 — FINANCIAL MODEL, LEDGER CONTRACT & INVARIANTS SPECIFICATION

**Document ID:** `ROOMMATE_SHARED_EXPENSE_ENGINE_V2_PHASE_1_FINANCIAL_SPEC.md`  
**Date:** October 4, 2026  
**Auditor / Architect:** Senior Financial-Ledger, PostgreSQL/Supabase & Mobile UX Architect  
**Status:** SPECIFICATION COMPLETE — DESIGN CONTRACT ONLY (Zero Code / Schema Changes)  
**Reference Document:** `ROOMMATE_SHARED_EXPENSE_ENGINE_V2_PHASE_0_AUDIT.md`  
**Environment Safety:** Production (`pbzaaskftrmnvocczhat.supabase.co`) & Staging untouched.

---

## 1. EXECUTIVE SUMMARY

Following the Phase 0 forensic discovery, this specification establishes the **canonical financial model, ledger contract, mathematical invariants, and architecture** for RoomMate Shared Expense Engine V2.

### Summary of Architectural Upgrades:
1. **Transition from Isolated Bilateral Debts to Multilateral Net-Position Ledger:**
   - RoomMate V1 tracked expenses as independent 2-person pairwise debts (`calculateRoomPairwiseDebts`), which forced overall debtors to act as intermediate clearinghouses and created circular debt loops ($A \to B \to C \to A$) upon bilateral payments.
   - RoomMate V2 introduces a canonical two-stage financial ledger:
     $$\text{Gross Net Position} \xrightarrow{\text{Subtract Cumulative Settlements}} \text{Outstanding Net Position} \xrightarrow{\text{Min-Cash-Flow Matching}} \text{Simplified Acyclic Settlements}$$
   - In an $N$-person room, the maximum number of settlement transactions is mathematically proven to be $\le N - 1$ with **strictly zero cycles**.
2. **Elimination of Floating-Point Authority — Canonical Integer Minor Units (Paise):**
   - The authoritative source of truth for all monetary transactions, shares, and balances is specified in integer **paise** ($1 \text{ INR} = 100 \text{ paise}$).
   - All floating-point arithmetic (`Math.round`, `parseFloat`, `toFixed(0)`) is removed from financial decision paths.
3. **Zero-Tolerance Financial Invariant (`diff === 0`):**
   - The hardcoded $5\text{-paise}$ tolerance (`Math.abs(diff) <= 0.05`) in `MobileRoomLedger.tsx` and `RoomLedger.tsx` is abolished.
   - An expense is valid if and only if $\sum \text{shares} = \text{total\_amount}$ to the exact paisa.
4. **Single Source of Truth in PostgreSQL:**
   - Client-side balance calculation is demoted to a non-authoritative optimistic preview.
   - The hardened PostgreSQL function `public.get_room_balances` is expanded into an atomic RPC:
     `public.get_room_financial_summary_v2(p_room_id UUID)`
     which evaluates validated expenses, committed settlements, and simplified transfer recommendations in a single transactional read snapshot.
5. **Exact Paise Preservation in UPI Settlement:**
   - Truncation via `toFixed(0)` in `UpiIntentPayModal.tsx` is prohibited. All UPI URIs (`upi://pay?am=...`) must specify exact two-decimal rupee strings derived directly from integer paise.

---

## 2. CURRENT ARCHITECTURE RECAP (PHASE 0 AUDIT HIGHLIGHTS)

| Dimension | Current Implementation (V1) | Status | Defect / Failure Mode |
|---|---|---|---|
| **Debt Model** | Bilateral pairwise debt (`calculateRoomPairwiseDebts` in `engine.ts`) | CONFIRMED FROM CURRENT CODE | N-person room yields $\frac{N(N-1)}{2}$ debts. Intermediate debtors become creditors. Cyclic debts ($A \to B \to C \to A$). |
| **Split Validation** | `Math.abs(diff) <= 0.05` in `MobileRoomLedger.tsx:747` | CONFIRMED FROM CURRENT CODE | False "₹200 fully allocated" for ₹199.98. RPC rejects; fallback insert silently dropped by DB views. |
| **Money Representation** | IEEE-754 `number` + `round2(x)` | CONFIRMED FROM CURRENT CODE | Floating-point binary drift; inconsistent rounding across files. |
| **UPI Settlement** | `initialAmount.toFixed(0)` in `UpiIntentPayModal.tsx:66` | CONFIRMED FROM CURRENT CODE | Truncates paise to zero decimals; impossible to settle exact fractional shares. |
| **Authority** | Client-side JS (`engine.ts`), DB RPC `get_room_balances` unused | CONFIRMED FROM CURRENT CODE | Dual-ledger fracture; web, mobile, exports, and DB views calculate different numbers. |
| **Realtime Sync** | 10 sequential REST calls in `fetchCloudDatabaseState()` | CONFIRMED FROM CURRENT CODE | Race condition: Expense read before splits commit $\implies$ phantom zero-share state. |
| **Export Service** | `roomExpenseExportService.ts` independent pool logic | CONFIRMED FROM CURRENT CODE | Custom 50-paise heuristic (`netBalance >= 0.5`) marks un-settled debts as "Settled". |

---

## 3. CANONICAL FINANCIAL MODEL

The RoomMate V2 engine formally separates financial concepts into four distinct, immutable tiers:

```
┌────────────────────────────────────────────────────────┐
│                      1. EXPENSE                        │
│   Real-world economic expenditure in a room            │
│   e.g., Wi-Fi: 50000 paise, Payer: Jyotirmay           │
└───────────────────────────┬────────────────────────────┘
                            │ Allocated into
                            ▼
┌────────────────────────────────────────────────────────┐
│                   2. EXPENSE SHARE                     │
│   Portion assigned to a participant                    │
│   e.g., Jyotirmay: 16667, Raju: 16667, Lopamudra: 16666│
└───────────────────────────┬────────────────────────────┘
                            │ Summed into
                            ▼
┌────────────────────────────────────────────────────────┐
│               3. MEMBER NET POSITION                   │
│   Aggregate position of member across all room expenses│
│   Gross Net = Total Paid - Total Share                 │
│   Outstanding Net = Gross Net + Settlements Sent       │
│                     - Settlements Received             │
└───────────────────────────┬────────────────────────────┘
                            │ Resolved by
                            ▼
┌────────────────────────────────────────────────────────┐
│                     4. SETTLEMENT                      │
│   Actual transfer of money between debtor and creditor │
│   e.g., Raju transfers 3334 paise to Jyotirmay         │
└────────────────────────────────────────────────────────┘
```

### Definitions:

1. **Expense ($E$):**
   A discrete financial event within a room where one active member (the `payer`) disburses money for goods or services benefiting one or more members (`participants`).
2. **Expense Share ($S_{E, u}$):**
   The non-negative portion of expense $E$ allocated to member $u$. Every participant $u \in \text{participants}(E)$ has exactly one split row. The sum of all shares must strictly equal the expense total.
3. **Member Net Position ($N_u$):**
   The signed scalar balance of member $u$ in room $R$. It is derived strictly from historical bill payments, allocated expense shares, and executed settlement payments. It is never an arbitrary manual value.
4. **Settlement ($P$):**
   A separate, distinct payment transaction between a net debtor (payer) and a net creditor (payee) that reduces the debtor's obligation and satisfies the creditor's claim. **A settlement NEVER mutates or rewrites historical expense splits.**

---

## 4. MONEY REPRESENTATION & PRECISION CONTRACT

### 4.1 Canonical Minor Unit (Paise)
- **Base Unit:** Integer **Paise** ($1 \text{ INR} = 100 \text{ Paise}$).
- **Range:** Signed 64-bit integer (`BIGINT` in PostgreSQL, `bigint` or safe integer `number` in TypeScript up to $\pm 9 \times 10^{15}$, corresponding to ₹90,000,000,000,000).
- **Prohibition:** Floating-point `number` must NEVER be used to store, add, subtract, split, or compare financial state.

### 4.2 Layer Representation Matrix

| Layer | Canonical Type | Example Value (₹200.50) | Invariant / Boundary Rule |
|---|---|---|---|
| **Database Storage** | `BIGINT` (Paise) or `NUMERIC(12, 2)` | `20050` (or `200.50` exact) | Always validate scale $= 2$. In V2 schema, store `amount_paise BIGINT`. |
| **PostgreSQL RPCs** | `BIGINT` (Paise) | `20050` | All internal math executed with integer operators (`+`, `-`, `/`, `%`). |
| **API / JSON Payloads** | Integer `number` (Paise) | `20050` | Field names suffixed with `_paise` (e.g. `total_amount_paise`). |
| **TypeScript Ledger Engine** | `type Paise = number` (Integer) | `20050` | Enforce `Number.isInteger(x)`. Rounding via `Math.floor` / integer modulo. |
| **UI Inputs / Display** | Formatted string | `"₹200.50"` | Parse string $\to$ integer paise on input: `Math.round(parseFloat(str) * 100)`. |
| **UPI Intent URI** | Exact 2-decimal string | `"200.50"` | Formatted via: `(paise / 100).toFixed(2)` where `paise % 1 === 0`. |

### 4.3 Conversion Contract: PostgreSQL `NUMERIC(12, 2)` $\leftrightarrow$ Integer Paise
To ensure 100% backward compatibility during migration before database columns are altered to `BIGINT`:
- **PostgreSQL to Paise:**
  $$\text{amount\_paise} = \text{ROUND}(\text{col\_numeric} \times 100)::\text{BIGINT}$$
- **Paise to PostgreSQL:**
  $$\text{col\_numeric} = (\text{amount\_paise}::\text{NUMERIC} / 100.00)$$

---

## 5. THE CORE FINANCIAL FORMULA

For any room $R$ and member $u \in \text{members}(R)$:

### 5.1 Cumulative Expense Components:
$$\text{TotalPaidAsPayer}(u) = \sum_{e \in E_R, \text{paid\_by}(e) = u} \text{amount\_paise}(e)$$
$$\text{TotalAllocatedShare}(u) = \sum_{e \in E_R} \sum_{s \in \text{splits}(e), \text{user}(s) = u} \text{share\_paise}(s)$$

### 5.2 Gross Net Position (Expense Balance):
$$\text{GrossNetPosition}(u) = \text{TotalPaidAsPayer}(u) - \text{TotalAllocatedShare}(u)$$

### 5.3 Cumulative Settlement Components:
$$\text{SettlementsSent}(u) = \sum_{p \in P_R, \text{payer}(p) = u} \text{amount\_paise}(p)$$
$$\text{SettlementsReceived}(u) = \sum_{p \in P_R, \text{payee}(p) = u} \text{amount\_paise}(p)$$
$$\text{NetSettlementEffect}(u) = \text{SettlementsSent}(u) - \text{SettlementsReceived}(u)$$

### 5.4 Canonical Outstanding Net Position:
$$\mathbf{NetPosition}(u) = \text{GrossNetPosition}(u) + \text{NetSettlementEffect}(u)$$
$$= (\text{TotalPaidAsPayer}(u) + \text{SettlementsSent}(u)) - (\text{TotalAllocatedShare}(u) + \text{SettlementsReceived}(u))$$

### 5.5 Semantic Interpretation Contract:
The engine exposes explicit direction and unsigned magnitude:
```typescript
export interface MemberNetPositionV2 {
  userId: string;
  netPositionPaise: number; // Signed: positive = creditor, negative = debtor, 0 = settled
  direction: 'RECEIVE' | 'OWES' | 'SETTLED';
  absoluteAmountPaise: number;
  formattedAmount: string; // e.g. "₹33.34"
}
```
- If $\text{NetPosition}(u) > 0$: `direction = 'RECEIVE'`, member is a **CREDITOR**.
- If $\text{NetPosition}(u) < 0$: `direction = 'OWES'`, member is a **DEBTOR**.
- If $\text{NetPosition}(u) = 0$: `direction = 'SETTLED'`, member has zero obligations.

---

## 6. LEDGER CONSERVATION INVARIANTS

### INVARIANT L1 — ZERO-SUM ROOM LEDGER (Conservation of Value)
> **At all times, across every room $R$, the sum of all member net positions must strictly equal zero in exact integer arithmetic:**
> $$\sum_{u \in \text{members}(R)} \text{NetPosition}(u) = 0 \quad (\text{exact paise})$$

*Proof:*
$$\sum_u \text{TotalPaidAsPayer}(u) = \sum_{e \in E_R} \text{amount\_paise}(e)$$
$$\sum_u \text{TotalAllocatedShare}(u) = \sum_{e \in E_R} \sum_{s \in \text{splits}(e)} \text{share\_paise}(s)$$
By Invariant L2 ($\sum_{s} \text{share\_paise}(s) = \text{amount\_paise}(e)$), $\sum_u \text{TotalPaid} = \sum_u \text{TotalShare}$.  
Similarly, every settlement payment has exactly one payer and one payee, so:
$$\sum_u \text{SettlementsSent}(u) = \sum_u \text{SettlementsReceived}(u) = \sum_{p \in P_R} \text{amount\_paise}(p)$$
Therefore:
$$\sum_u \text{NetPosition}(u) = (\sum \text{Paid} - \sum \text{Share}) + (\sum \text{Sent} - \sum \text{Received}) = 0 + 0 = 0. \quad \blacksquare$$

### INVARIANT L2 — EXACT EXPENSE ALLOCATION
> **For every expense $e$, the sum of all participant shares must equal the total expense amount to the exact paisa:**
> $$\sum_{s \in \text{splits}(e)} \text{share\_paise}(s) \equiv \text{total\_amount\_paise}(e)$$
> **No tolerance ($\pm 0.05$) is permitted.**

### INVARIANT L3 — DETERMINISTIC ROUNDING
> **Given the same total amount in paise and the same set of participant user IDs, the split algorithm must always generate the exact same allocation.**
> Remainder paise $R = \text{total\_paise} \pmod k$ must be assigned to the first $R$ participants when participants are ordered deterministically by UUID lexicographical order.

### INVARIANT L4 — NO FLOATING-POINT FINANCIAL AUTHORITY
> **No client or server calculation that determines a persisted financial state may use floating-point operators without immediate integer truncation/modulo reconciliation.**

---

## 7. DETERMINISTIC ROUNDING POLICY

When total amount $A$ (in paise) cannot be divided evenly among $k$ participants:

1. **Calculate Base Share:**
   $$\text{base\_paise} = \lfloor A / k \rfloor$$
2. **Calculate Remainder Paise:**
   $$R = A \pmod k \quad (0 \le R < k)$$
3. **Deterministic Participant Ordering:**
   Sort participant user IDs lexicographically ascending:
   $$u_{(0)} < u_{(1)} < \dots < u_{(k-1)}$$
4. **Allocation Formula:**
   $$\text{share\_paise}(u_{(i)}) = \begin{cases} 
   \text{base\_paise} + 1 & \text{for } 0 \le i < R \\
   \text{base\_paise} & \text{for } R \le i < k 
   \end{cases}$$

### Example Verification: ₹200 across 3 members ($A = 20000$ paise, $k = 3$):
- $\text{base\_paise} = \lfloor 20000 / 3 \rfloor = 6666$ paise.
- $R = 20000 \pmod 3 = 2$ paise.
- User IDs: `user_a` < `user_b` < `user_c`.
- Allocation:
  - `user_a`: $6666 + 1 = 6667$ paise (₹66.67)
  - `user_b`: $6666 + 1 = 6667$ paise (₹66.67)
  - `user_c`: $6666 + 0 = 6666$ paise (₹66.66)
- **Sum:** $6667 + 6667 + 6666 = 20000$ paise (₹200.00). **Exact match.**

---

## 8. SPLIT MODES SPECIFICATION CONTRACT

### 8.1 EQUAL SPLIT
- **Input:** `total_amount_paise: number`, `participant_user_ids: string[]`.
- **Validation:** `total_amount_paise > 0`, `participant_user_ids.length > 0`, unique IDs.
- **Normalization:** Sort `participant_user_ids` lexicographically ascending.
- **Rounding:** Apply Invariant L3 deterministic remainder distribution.
- **Output:** Array of `{ user_id: string, share_paise: number }`.
- **Error Conditions:** Empty participants $\to$ `EMPTY_PARTICIPANTS`, non-positive total $\to$ `INVALID_AMOUNT`.

### 8.2 EXACT SPLIT
- **Input:** `total_amount_paise: number`, `custom_values: Record<string, number>` (in paise).
- **Validation:**
  1. Every participant share $> 0$.
  2. Strict equality: $\sum \text{custom\_values}[u] === \text{total\_amount\_paise}$.
- **Normalization:** None (client values are exact).
- **Rounding:** None. The engine does NOT alter or reconcile exact splits.
- **Output:** Array of `{ user_id: string, share_paise: number }`.
- **Error Conditions:**
  - $\sum \text{custom\_values} \ne \text{total\_amount\_paise} \to \text{EXACT\_SPLIT\_SUM\_MISMATCH}$ (rejected!).

### 8.3 PERCENTAGE SPLIT
- **Input:** `total_amount_paise: number`, `percentages: Record<string, number>` (basis points: $100.00\% = 10000$ bp).
- **Validation:** $\sum \text{percentages}[u] === 10000$ (must equal exactly $100.00\%$).
- **Normalization:**
  $$\text{raw\_share}_i = \lfloor (\text{total\_amount\_paise} \times \text{percentages}[u_i]) / 10000 \rfloor$$
- **Rounding:** Compute remainder $R = \text{total\_amount\_paise} - \sum \text{raw\_share}_i$. Distribute $+1$ paisa to participants with highest fractional remainders (or sorted `user_id` on ties) until exhausted.
- **Output:** `{ user_id, share_paise }[]` summing exactly to `total_amount_paise`.
- **Error Conditions:** Percentages do not sum to $100.00\% \to \text{PERCENTAGE\_SUM\_MISMATCH}$.

### 8.4 SHARES-BASED SPLIT
- **Input:** `total_amount_paise: number`, `weights: Record<string, number>` (positive integer shares).
- **Validation:** Every weight $> 0$ integer; $\text{TotalShares} = \sum \text{weights}[u] > 0$.
- **Normalization:**
  $$\text{raw\_share}_i = \lfloor (\text{total\_amount\_paise} \times \text{weights}[u_i]) / \text{TotalShares} \rfloor$$
- **Rounding:** Compute remainder $R = \text{total\_amount\_paise} - \sum \text{raw\_share}_i$. Sort by largest remainder cent fraction, distributing $+1$ paisa until sum matches.
- **Output:** `{ user_id, share_paise }[]` summing exactly to `total_amount_paise`.

---

## 9. REFERENCE SCENARIO RECONCILIATION (THE ₹700 EXAMPLE)

### Inputs:
- Room Members:
  - $U_J$: Jyotirmay (`00000000-0000-0000-0000-000000000001`)
  - $U_L$: Lopamudra (`00000000-0000-0000-0000-000000000002`)
  - $U_R$: Raju (`00000000-0000-0000-0000-000000000003`)
- Expense 1: Wi-Fi = ₹500 (50000 paise), Paid by Jyotirmay ($U_J$)
  - Equal split among $U_J, U_L, U_R$. Remainder: $50000 \pmod 3 = 2$ paise.
  - Lexicographical sort: $U_J$ gets $+1$, $U_L$ gets $+1$.
  - Shares:
    - $U_J = 16667$ paise (₹166.67)
    - $U_L = 16667$ paise (₹166.67)
    - $U_R = 16666$ paise (₹166.66)
    - Sum = 50000 paise.
- Expense 2: Water = ₹200 (20000 paise), Paid by Raju ($U_R$)
  - Equal split among $U_J, U_L, U_R$. Remainder: $20000 \pmod 3 = 2$ paise.
  - Shares:
    - $U_J = 6667$ paise (₹66.67)
    - $U_L = 6667$ paise (₹66.67)
    - $U_R = 6666$ paise (₹66.66)
    - Sum = 20000 paise.

### Canonical Net Position Computation:
| Member | Total Paid | Total Share | Gross Net Position | Net Status |
|---|---|---|---|---|
| **Jyotirmay ($U_J$)** | 50000 paise | $16667 + 6667 = 23334$ paise | $\mathbf{+26666\text{ paise}}$ (+₹266.66) | **CREDITOR** |
| **Raju ($U_R$)** | 20000 paise | $16666 + 6666 = 23332$ paise | $\mathbf{-3332\text{ paise}}$ (-₹33.32) | **DEBTOR** |
| **Lopamudra ($U_L$)** | 0 paise | $16667 + 6667 = 23334$ paise | $\mathbf{-23334\text{ paise}}$ (-₹233.34) | **DEBTOR** |
| **Room Total** | 70000 paise | 70000 paise | $\mathbf{0\text{ paise}}$ | **Invariant L1 Satisfied** |

### Settlement Resolution:
Applying the canonical debt simplification algorithm (Section 10):
- **Transfer 1:** Lopamudra ($U_L$) $\longrightarrow$ Jyotirmay ($U_J$): **23334 paise (₹233.34)**
- **Transfer 2:** Raju ($U_R$) $\longrightarrow$ Jyotirmay ($U_J$): **3332 paise (₹33.32)**
- **Total Transfers:** Exactly 2.
- **Raju never pays or collects from Lopamudra.**
- **Zero cycles.**

---

## 10. DEBT SIMPLIFICATION ALGORITHM (CANONICAL SETTLEMENT ENGINE)

### 10.1 Algorithm Selection: Deterministic Greedy Min-Cash-Flow Matching
We select the **Greedy Creditor-Debtor Matching Algorithm** with lexicographical tie-breaking:
- **Optimality:** Guarantees that an $N$-person room produces at most $N - 1$ transfers.
- **Acyclicity:** Produces a strictly bipartite directed graph ($\text{Debtors} \to \text{Creditors}$). It is mathematically impossible to produce cycles ($A \to B \to C \to A$).
- **Determinism:** Sorting equal balances by `user_id` ensures identical transfers across all platforms and execution environments.

### 10.2 Formal Algorithm Specification:

```
FUNCTION simplify_debts_v2(member_net_positions: Map<UUID, BIGINT>) -> List<SimplifiedTransfer>
    LET creditors = PriorityQueue(descending by balance, tie-break by user_id ascending)
    LET debtors = PriorityQueue(descending by debt magnitude, tie-break by user_id ascending)

    FOR EACH (user_id, balance) IN member_net_positions:
        IF balance > 0 THEN
            creditors.push({ user_id: user_id, amount: balance })
        ELSE IF balance < 0 THEN
            debtors.push({ user_id: user_id, amount: ABS(balance) })
        END IF
    END FOR

    LET transfers = []

    WHILE creditors IS NOT EMPTY AND debtors IS NOT EMPTY:
        LET top_creditor = creditors.pop()
        LET top_debtor = debtors.pop()

        LET transfer_amount = MIN(top_creditor.amount, top_debtor.amount)

        transfers.append({
            from_user_id: top_debtor.user_id,
            to_user_id: top_creditor.user_id,
            amount_paise: transfer_amount
        })

        LET remaining_credit = top_creditor.amount - transfer_amount
        LET remaining_debt = top_debtor.amount - transfer_amount

        IF remaining_credit > 0 THEN
            creditors.push({ user_id: top_creditor.user_id, amount: remaining_credit })
        END IF

        IF remaining_debt > 0 THEN
            debtors.push({ user_id: top_debtor.user_id, amount: remaining_debt })
        END IF
    END WHILE

    RETURN transfers
END FUNCTION
```

### 10.3 Complexity & Termination Proof:
- **Time Complexity:** $O(N \log N)$ where $N \le 50$ (typical room size $\le 10$). Execution time is $< 1\text{ ms}$.
- **Termination:** In each iteration, at least one member's balance is completely zeroed out and removed from the queues. Thus, the loop terminates in at most $N - 1$ iterations.

---

## 11. SETTLEMENT GRAPH INVARIANTS

### INVARIANT S1 — NO SELF-SETTLEMENT
> **No settlement payment or recommended transfer may have `from_user_id === to_user_id`:**
> $$\forall t \in \text{transfers}, \quad t.\text{from\_user\_id} \ne t.\text{to\_user\_id}$$

### INVARIANT S2 — STRICTLY ACYCLIC SETTLEMENT GRAPH (NO CYCLES)
> **The graph of recommended transfers must form a Directed Acyclic Graph (DAG) with zero directed cycles:**
> $$\forall \text{ cycle } C = (u_1 \to u_2 \to \dots \to u_k \to u_1), \quad |C| = 0$$

### INVARIANT S3 — NO OVER-SETTLEMENT
> **No individual settlement payment may exceed the payer's current net debt or the payee's current net credit:**
> $$\text{amount\_paise}(p) \le \min(|\text{NetPosition}(\text{payer})|, \text{NetPosition}(\text{payee}))$$
> *Overpayments creating reverse debts are strictly rejected at the database trigger level.*

### INVARIANT S4 — SETTLEMENT CONSERVATION OF LEDGER VALUE
> **An executed settlement payment transfers value between two members without altering total room expenses or any other member's net position:**
> $$\Delta \text{NetPosition}(\text{payer}) = +\text{amount\_paise}(p)$$
> $$\Delta \text{NetPosition}(\text{payee}) = -\text{amount\_paise}(p)$$
> $$\Delta \text{NetPosition}(\text{other}) = 0$$

---

## 12. SETTLEMENTS AS SEPARATE EVENTS CONTRACT

1. **Immutability of Expenses:**
   Recording a settlement payment inserts a new immutable audit record into `public.settlement_payments`. It **MUST NEVER UPDATE OR DELETE** any existing row in `public.shared_expenses` or `public.expense_splits`.
2. **Sequential Resolution:**
   - If Raju owes ₹33.32 and pays ₹20.00:
     - Historical split shares: Raju share remains ₹233.32 across the bills.
     - Cumulative settlements sent by Raju: ₹20.00.
     - Remaining outstanding obligation: $33.32 - 20.00 = ₹13.32$.

---

## 13. PARTIAL PAYMENT MODEL CONTRACT

When a member makes a partial settlement:

1. **Validation Rules:**
   - `amount_paise > 0` (zero and negative payments strictly prohibited).
   - `amount_paise <= outstanding_debt_paise` (over-settlements strictly rejected with `OVERSETTLEMENT_EXCEEDS_DEBT`).
2. **State Transition:**
   - If `amount_paise < outstanding_debt_paise`: Debt status is `PARTIALLY_SETTLED`. Remaining debt is dynamically computed as `outstanding_debt_paise - amount_paise`.
   - If `amount_paise === outstanding_debt_paise`: Debt status is `COMPLETED_SETTLED`.
3. **No Artificial Credit Creation:**
   Unlike V1 (which created reverse credits when users overpaid), V2 strictly rejects overpayments. If a user intends to make an advance, it must be recorded as an expense or advance payment category, not a settlement of non-existent debt.

---

## 14. SETTLEMENT HISTORY & OUTSTANDING BALANCES

The financial engine maintains clear separation between:
- **Ledger Inception:** All active (non-deleted) shared expenses and splits.
- **Gross Net Position:** $\text{Paid} - \text{Share}$.
- **Settlement Ledger:** All historical payments recorded in `settlement_payments`.
- **Current Outstanding Position:** $\text{Gross Net Position} + (\text{Settlements Sent} - \text{Settlements Received})$.

Historical settlements never decay or expire; they permanently adjust the net position vector until new expenses or settlements are committed.

---

## 15. AUTHORITATIVE SOURCE OF TRUTH & RPC ARCHITECTURE

### 15.1 Architectural Mandate
- **PostgreSQL is the Sole Financial Authority.**
- The application will expose one canonical RPC:
  `public.get_room_financial_summary_v2(p_room_id UUID)`
- This function runs on PostgreSQL as a `SECURITY DEFINER` function with `STABLE` volatility.

### 15.2 RPC Output Schema (`JSONB`):
```json
{
  "room_id": "00000000-0000-0000-0000-000000000000",
  "total_room_expenses_paise": 70000,
  "formatted_total_expenses": "₹700.00",
  "members": [
    {
      "user_id": "00000000-0000-0000-0000-000000000001",
      "name": "Jyotirmay",
      "email": "jyotirmay@app.com",
      "total_paid_paise": 50000,
      "total_share_paise": 23334,
      "settlements_sent_paise": 0,
      "settlements_received_paise": 0,
      "net_position_paise": 26666,
      "direction": "RECEIVE",
      "formatted_net_position": "₹266.66"
    },
    {
      "user_id": "00000000-0000-0000-0000-000000000003",
      "name": "Raju",
      "email": "raju@app.com",
      "total_paid_paise": 20000,
      "total_share_paise": 23332,
      "settlements_sent_paise": 0,
      "settlements_received_paise": 0,
      "net_position_paise": -3332,
      "direction": "OWES",
      "formatted_net_position": "₹33.32"
    }
  ],
  "simplified_settlements": [
    {
      "from_user_id": "00000000-0000-0000-0000-000000000002",
      "from_user_name": "Lopamudra",
      "to_user_id": "00000000-0000-0000-0000-000000000001",
      "to_user_name": "Jyotirmay",
      "amount_paise": 23334,
      "formatted_amount": "₹233.34"
    },
    {
      "from_user_id": "00000000-0000-0000-0000-000000000003",
      "from_user_name": "Raju",
      "to_user_id": "00000000-0000-0000-0000-000000000001",
      "to_user_name": "Jyotirmay",
      "amount_paise": 3332,
      "formatted_amount": "₹33.32"
    }
  ],
  "invariants": {
    "zero_sum_verified": true,
    "discrepancy_paise": 0
  }
}
```

---

## 16. CLIENT RESPONSIBILITY & SEPARATION OF CONCERNS

| Operation | Client (Web/Mobile) Authority | PostgreSQL Backend Authority |
|---|---|---|
| Split preview while typing | Allowed (runs local preview engine) | Not involved |
| Form allocation validation | Enforces `diff === 0` (instant UX feedback) | Final authoritative gate in RPC |
| Persisting shared expense | Formats command; sends to RPC | Validates sum & membership; commits |
| Calculating room balances | Displays RPC response | Executes SQL aggregation |
| Calculating who owes whom | Renders `simplified_settlements` | Executes Min-Cash-Flow algorithm |
| Settle-up payment authorization | Dispatches payment intent | Enforces `amount <= debt` |

---

## 17. EXPORT RESPONSIBILITY CONTRACT

- **Rule:** `src/lib/services/roomExpenseExportService.ts` must be refactored to **call or consume the canonical output of `get_room_financial_summary_v2`**.
- **Prohibition:** The export service is strictly prohibited from maintaining private settlement pools (`remainingSettlementPool`) or applying heuristic tolerances (`netBalance >= 0.5`).
- **Data Parity:** Every exported PDF/XLSX must match the on-screen ledger to the exact paisa.

---

## 18. UPI PAYMENT AMOUNT CONTRACT

To prevent the loss of paise caused by `toFixed(0)`:
1. **Formatting Specification:**
   The `am` parameter in UPI URIs (`upi://pay?pa=...&am=...`) must always be formatted as:
   $$\text{am\_string} = (\text{amount\_paise} / 100).\text{toFixed}(2)$$
   where `amount_paise` is an integer.
2. **Contract Trace for ₹166.67:**
   - Ledger net position: `16667` paise.
   - Settle-up modal initial value: `16667` paise.
   - Quick chips:
     - "Full Due": sets `16667` paise (displays "₹166.67").
     - "50%": sets $\lfloor 16667 / 2 \rfloor = 8333$ paise (displays "₹83.33").
   - Generated UPI URI: `upi://pay?pa=...&am=166.67` (exact two decimal places).
   - `toFixed(0)` is completely eliminated.

---

## 19. REALTIME CONSISTENCY & CONCURRENCY MODEL

To resolve the Phase 0 finding of multi-table read race conditions:
1. **Single Composite State Query:**
   Instead of making 10 separate REST calls across 10 tables, real-time update notifications on financial tables (`shared_expenses`, `expense_splits`, `settlement_payments`) will invoke the single atomic RPC `get_room_financial_summary_v2`.
2. **Transactional Snapshot Isolation:**
   PostgreSQL executes the RPC under read committed snapshot isolation. An expense and its splits committed in a single transaction will always be read together, completely eliminating phantom zero-share states.

---

## 20. LEAVE-ROOM FINANCIAL CONTRACT

In `src/components/mobile/MobileLeaveRoomModal.tsx`:
- A member $u$ is eligible for a clean exit if and only if:
  $$\text{NetPosition}(u) \equiv 0 \quad (\text{exact paise})$$
- **Debtor State ($\text{NetPosition}(u) < 0$):**
  - Departure is **BLOCKED**.
  - UI displays exact outstanding debt and renders the direct "Pay Settlement" action.
- **Creditor State ($\text{NetPosition}(u) > 0$):**
  - Departure is **BLOCKED** by default.
  - UI displays the active simplified debtors who owe this member, with an explicit option: "Settle with Roommates" or "Waive Outstanding Balance (Forgive Debt)".

---

## 21. PROPOSED DATABASE CONSTRAINTS & RPC SIGNATURES

*(Design Only — No Migrations Applied in Phase 1)*

```sql
-- 1. Atomic RPC: Create Shared Expense V2 with exact integer validation
CREATE OR REPLACE FUNCTION public.create_shared_expense_v2(
  p_expense JSONB,
  p_splits JSONB
) RETURNS JSONB;

-- 2. Atomic RPC: Canonical Room Financial Summary & Simplified Settlements
CREATE OR REPLACE FUNCTION public.get_room_financial_summary_v2(
  p_room_id UUID
) RETURNS JSONB;

-- 3. Trigger Guard: Settlement cannot exceed outstanding debt
CREATE OR REPLACE FUNCTION public.enforce_settlement_bounds_v2()
RETURNS TRIGGER;

-- 4. Constraint: Table level check for positive amount in paise
ALTER TABLE public.shared_expenses 
  ADD CONSTRAINT chk_shared_expenses_positive_amount CHECK (total_amount > 0);
```

---

## 22. COMPLETE INVARIANT CATALOG

| Invariant ID | Name | Formal Statement | Enforcement Tier |
|---|---|---|---|
| **L1** | Zero-Sum Room Ledger | $\sum_{u \in R} \text{NetPosition}(u) \equiv 0$ | PostgreSQL RPC & Client Test Suite |
| **L2** | Exact Expense Allocation | $\sum_{s \in E} \text{share}(s) \equiv \text{total}(E)$ | PostgreSQL Trigger & Form Validation |
| **L3** | Deterministic Rounding | Remainder $R$ allocated by ascending UUID order | `engine.ts` & PL/pgSQL RPC |
| **L4** | No Float Financial Authority | All financial operations executed in integer paise | TypeScript Types & PostgreSQL |
| **L5** | Bounded Settlement | $\text{settlement} \le \min(\text{debtor\_debt}, \text{creditor\_credit})$ | PostgreSQL Trigger & Settle Modal |
| **L6** | Positive Settlement | $\text{settlement} > 0$ | PostgreSQL CHECK constraint |
| **L7** | Settlement Membership | Payer & Payee $\in \text{room\_members}(R)$ with `status = 'ACTIVE'` | PostgreSQL Trigger |
| **L8** | Expense Payer Membership | $\text{paid\_by} \in \text{room\_members}(R)$ with `status = 'ACTIVE'` | PostgreSQL Trigger |
| **L9** | Split Participant Membership | $\forall s \in \text{splits}, \text{user}(s) \in \text{room\_members}(R)$ | PostgreSQL Trigger |
| **L10** | Room Isolation | All foreign keys must reference the same `room_id` | PostgreSQL Trigger |
| **S1** | No Self-Settlement | $\text{payer\_id} \ne \text{payee\_id}$ | PostgreSQL CHECK constraint |
| **S2** | Acyclic Settlement Graph | Transfer graph is a strict DAG (0 cycles, $\le N-1$ transfers) | Min-Cash-Flow Algorithm |
| **S3** | Settlement Conservation | Settlement shifts balance without altering total expenses | Ledger Balance Equation |
| **R1** | Atomic Realtime Reads | Client state refreshes via atomic RPC snapshot | Supabase RPC |
| **U1** | Exact UPI Representation | UPI URIs specify exact 2-decimal string from paise | `upiIntentService.ts` |
| **E1** | Canonical Export Parity | Exports consume `get_room_financial_summary_v2` | `roomExpenseExportService.ts` |

---

## 23. FORMAL TEST VECTOR SPECIFICATION (25 TEST VECTORS)

```
================================================================================
TEST VECTOR CATALOG — ROOMMATE SHARED EXPENSE ENGINE V2
================================================================================
```

#### TEST 001: ₹100 / 2 members / equal split
- **Input:** Amount: 10000 paise. Participants: `[u1, u2]`. Payer: `u1`.
- **Expected Shares:** `u1: 5000 paise`, `u2: 5000 paise`.
- **Expected Net Positions:** `u1: +5000 paise` (RECEIVE), `u2: -5000 paise` (OWES).
- **Expected Settlements:** `u2 -> u1: 5000 paise (₹50.00)`.
- **Invariants Verified:** L1, L2, L3, S1, S2.

#### TEST 002: ₹100 / 3 members / equal split
- **Input:** Amount: 10000 paise. Participants: `[u1, u2, u3]` (`u1 < u2 < u3`). Payer: `u1`.
- **Expected Shares:** `u1: 3334 paise`, `u2: 3333 paise`, `u3: 3333 paise`.
- **Expected Net Positions:** `u1: +6666 paise`, `u2: -3333 paise`, `u3: -3333 paise`.
- **Expected Settlements:** `u2 -> u1: 3333 paise`, `u3 -> u1: 3333 paise`.
- **Invariants Verified:** L1, L2, L3.

#### TEST 003: ₹200 / 3 members / equal split (The ₹200 Bug Fix)
- **Input:** Amount: 20000 paise. Participants: `[u1, u2, u3]` (`u1 < u2 < u3`). Payer: `u1`.
- **Expected Shares:** `u1: 6667 paise`, `u2: 6667 paise`, `u3: 6666 paise`.
- **Expected Net Positions:** `u1: +13333 paise`, `u2: -6667 paise`, `u3: -6666 paise`.
- **Expected Settlements:** `u2 -> u1: 6667 paise`, `u3 -> u1: 6666 paise`.
- **Invariants Verified:** L1, L2, L3, L4. Sum of shares strictly equals 20000.

#### TEST 004: ₹1 / 3 members / equal split
- **Input:** Amount: 100 paise. Participants: `[u1, u2, u3]` (`u1 < u2 < u3`). Payer: `u1`.
- **Expected Shares:** `u1: 34 paise`, `u2: 33 paise`, `u3: 33 paise`.
- **Expected Net Positions:** `u1: +66 paise`, `u2: -33 paise`, `u3: -33 paise`.
- **Expected Settlements:** `u2 -> u1: 33 paise`, `u3 -> u1: 33 paise`.
- **Invariants Verified:** L2 (Sum = 100), L3.

#### TEST 005: ₹10 / 6 members / equal split
- **Input:** Amount: 1000 paise. Participants: 6 members (`u1` to `u6`). Payer: `u1`.
- **Expected Shares:** $1000 = 6 \times 166 + 4$. First 4 users get 167, last 2 get 166.
  `u1: 167`, `u2: 167`, `u3: 167`, `u4: 167`, `u5: 166`, `u6: 166`.
- **Expected Net Positions:** Sum $= 0$.
- **Invariants Verified:** L1, L2, L3.

#### TEST 006: ₹500 / 3 members / exact split
- **Input:** Amount: 50000 paise. Custom values: `u1: 15000`, `u2: 15000`, `u3: 20000`. Payer: `u1`.
- **Expected Shares:** `u1: 15000`, `u2: 15000`, `u3: 20000`.
- **Expected Net Positions:** `u1: +35000`, `u2: -15000`, `u3: -20000`.
- **Expected Settlements:** `u3 -> u1: 20000`, `u2 -> u1: 15000`.
- **Invariants Verified:** L1, L2.

#### TEST 007: ₹500 / percentage split
- **Input:** Amount: 50000 paise. Percentages: `u1: 2000 bp (20%)`, `u2: 3000 bp (30%)`, `u3: 5000 bp (50%)`. Payer: `u2`.
- **Expected Shares:** `u1: 10000`, `u2: 15000`, `u3: 25000`.
- **Expected Net Positions:** `u1: -10000`, `u2: +35000`, `u3: -25000`.
- **Expected Settlements:** `u3 -> u2: 25000`, `u1 -> u2: 10000`.
- **Invariants Verified:** L1, L2.

#### TEST 008: ₹500 / shares split
- **Input:** Amount: 50000 paise. Weights: `u1: 1`, `u2: 2`, `u3: 2` (Total: 5 shares). Payer: `u3`.
- **Expected Shares:** `u1: 10000`, `u2: 20000`, `u3: 20000`.
- **Expected Net Positions:** `u1: -10000`, `u2: -20000`, `u3: +30000`.
- **Expected Settlements:** `u2 -> u3: 20000`, `u1 -> u3: 10000`.
- **Invariants Verified:** L1, L2.

#### TEST 009: ₹700 reference two-expense scenario (The Core Cycle Fix)
- **Input:**
  - Expense 1: ₹500 (50000 paise) by `u_j` (Jyotirmay).
  - Expense 2: ₹200 (20000 paise) by `u_r` (Raju).
  - Participants: `u_j`, `u_l`, `u_r`.
- **Expected Net Positions:**
  - `u_j`: +26666 paise (+₹266.66)
  - `u_r`: -3332 paise (-₹33.32)
  - `u_l`: -23334 paise (-₹233.34)
- **Expected Settlements:**
  - `u_l -> u_j: 23334 paise (₹233.34)`
  - `u_r -> u_j: 3332 paise (₹33.32)`
- **Invariants Verified:** L1, S1, S2 (Zero cycles, no Raju $\to$ Lopamudra edge).

#### TEST 010: One creditor / two debtors
- **Input:** Net positions: `u1: +30000`, `u2: -20000`, `u3: -10000`.
- **Expected Settlements:** `u2 -> u1: 20000`, `u3 -> u1: 10000` (2 transfers).
- **Invariants Verified:** S2, S4.

#### TEST 011: Two creditors / one debtor
- **Input:** Net positions: `u1: +20000`, `u2: +10000`, `u3: -30000`.
- **Expected Settlements:** `u3 -> u1: 20000`, `u3 -> u2: 10000` (2 transfers).
- **Invariants Verified:** S2, S4.

#### TEST 012: Two creditors / two debtors
- **Input:** Net positions: `u1: +5000`, `u2: +7000`, `u3: -8000`, `u4: -4000`.
- **Expected Settlements:**
  - `u3 -> u2: 7000` (u2 settled; u3 remaining debt: 1000)
  - `u4 -> u1: 4000` (u4 settled; u1 remaining credit: 1000)
  - `u3 -> u1: 1000` (u3 and u1 settled)
- **Total Transfers:** 3 transfers ($\le N-1$). Zero cycles.
- **Invariants Verified:** L1, S2.

#### TEST 013: Three creditors / three debtors
- **Input:** Net positions: `c1: +10000, c2: +15000, c3: +5000`, `d1: -12000, d2: -10000, d3: -8000`.
- **Expected Settlements:** At most 5 transfers. All balances zeroed out.
- **Invariants Verified:** L1, S2 ($\le N-1$).

#### TEST 014: Partial settlement
- **Input:** `u2` owes `u1` 16667 paise. Settlement executed: `u2 -> u1` 10000 paise.
- **Expected Net Positions After:** `u1: +6667 paise`, `u2: -6667 paise`.
- **Expected Remaining Settlement:** `u2 -> u1: 6667 paise`.
- **Invariants Verified:** L1, S4.

#### TEST 015: Multiple partial settlements
- **Input:** Initial debt 16667 paise.
  - Pay 1: 10000 paise $\to$ remaining: 6667 paise.
  - Pay 2: 5000 paise $\to$ remaining: 1667 paise.
  - Pay 3: 1667 paise $\to$ remaining: 0 paise.
- **Expected Final Net Position:** Exactly 0 paise. Status: `SETTLED`.
- **Invariants Verified:** L1, S3, S4.

#### TEST 016: Exact final settlement
- **Input:** `u2` owes `u1` 5000 paise. Executes payment of 5000 paise.
- **Expected Net Positions:** `u1: 0`, `u2: 0`.
- **Expected Settlements List:** `[]` (empty list).
- **Invariants Verified:** L1, S3.

#### TEST 017: Attempted over-settlement
- **Input:** `u2` owes `u1` 5000 paise. Attempts to submit settlement of 5001 paise.
- **Expected Result:** REJECTED with exception `OVERSETTLEMENT_EXCEEDS_DEBT`. No database record inserted.
- **Invariants Verified:** L5.

#### TEST 018: Attempted negative or zero settlement
- **Input:** Submitting settlement with amount `<= 0`.
- **Expected Result:** REJECTED by database constraint `chk_settlement_positive_amount`.
- **Invariants Verified:** L6.

#### TEST 019: Attempted cross-room settlement
- **Input:** `u1` in Room A, `u2` in Room B. Submitting settlement for Room A.
- **Expected Result:** REJECTED with exception `ACCESS_DENIED: User not active member of room`.
- **Invariants Verified:** L7, L10.

#### TEST 020: Concurrent expense creation
- **Input:** Two clients submit expenses simultaneously to same room.
- **Expected Result:** Serialized by PostgreSQL row lock on room/splits. Both expenses committed; net positions sum to zero.
- **Invariants Verified:** L1, R1.

#### TEST 021: Concurrent settlement creation
- **Input:** Client A settles debt while Client B creates expense.
- **Expected Result:** Atomic transactional consistency. Invariant L1 holds at every snapshot.
- **Invariants Verified:** L1, S4.

#### TEST 022: Settlement against stale state
- **Input:** Client views debt of ₹100, but another device already paid ₹50. Client tries to pay ₹100.
- **Expected Result:** REJECTED by trigger (attempted 10000 > current debt 5000). Client notified to refresh.
- **Invariants Verified:** L5, R1.

#### TEST 023: Member leaving with zero balance
- **Input:** Member $u$ with `net_position === 0` calls `leave_room`.
- **Expected Result:** SUCCEEDS. Status updated to `LEFT`.
- **Invariants Verified:** Clean exit contract.

#### TEST 024: Member leaving while owing
- **Input:** Member $u$ with `net_position = -5000 paise` calls `leave_room`.
- **Expected Result:** BLOCKED with `UNRESOLVED_OBLIGATIONS_DEBTOR`.
- **Invariants Verified:** Clean exit contract.

#### TEST 025: Member leaving while being owed
- **Input:** Member $u$ with `net_position = +5000 paise` calls `leave_room` without waiving debt.
- **Expected Result:** BLOCKED with `UNRESOLVED_OBLIGATIONS_CREDITOR`.
- **Invariants Verified:** Clean exit contract.

---

## 24. TARGET ARCHITECTURE DIAGRAM

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MOBILE & WEB CLIENTS                            │
│  - Integer Paise Currency Formats                                      │
│  - Strict Zero-Tolerance Form Validation (diff === 0)                  │
│  - Non-Authoritative Client Preview Engine (`engine.ts: previewSplits`)│
│  - Renders Canonical Simplified Settlement Graph                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ Atomic RPC Commands
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE / POSTGRESQL                           │
│                                                                        │
│   1. `create_shared_expense_v2(p_expense, p_splits)`                   │
│      - Row lock on `rooms` (concurrency serialization)                 │
│      - Strict check: sum(splits_paise) == total_amount_paise           │
│      - Validates all participants belong to room                       │
│                                                                        │
│   2. `record_settlement_v2(p_settlement)`                              │
│      - Validates: amount > 0 and amount <= debtor_outstanding_debt     │
│      - Validates: payer != payee, both active members                  │
│      - Inserts immutable settlement audit record                       │
│                                                                        │
│   3. `get_room_financial_summary_v2(p_room_id)` [AUTHORITATIVE LEDGER] │
│      - Computes Gross Net = sum(paid) - sum(shares)                    │
│      - Computes Net Position = Gross Net + Net Settlement Effect       │
│      - Executes Greedy Min-Cash-Flow Debt Simplification               │
│      - Returns Verified Zero-Sum Balance Sheet + Acyclic Transfers     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ Realtime CDC Notification
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 UNIFIED SINGLE-RPC REALTIME DISPATCH                   │
│  - Realtime triggers call `get_room_financial_summary_v2` once         │
│  - Zero multi-table REST read race conditions                          │
│  - Full snapshot consistency across all connected devices              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 25. MIGRATION & IMPLEMENTATION STRATEGY

### 25.1 Migration Phases (Phase 2 & Phase 3 Roadmap)

```
Phase 2A: Database Ledger Hardening
  ├── Deploy `get_room_financial_summary_v2` RPC
  ├── Deploy `create_shared_expense_v2` RPC
  └── Add settlement bound triggers

Phase 2B: Core Engine Refactoring
  ├── Refactor `src/lib/ledger/engine.ts` to integer paise & min-cash-flow
  ├── Update `ledgerTestRunner.ts` to run all 25 test vectors
  └── Eliminate `toFixed(0)` in `UpiIntentPayModal.tsx`

Phase 2C: UI & State Alignment
  ├── Wire `MobileRoomLedger.tsx` & `RoomLedger.tsx` to canonical RPC
  ├── Remove 5-paise tolerance (`Math.abs(diff) <= 0.05`)
  └── Refactor `roomExpenseExportService.ts` to consume canonical summary

Phase 3: Production Rollout
  ├── Dry run migration on isolated staging database
  ├── Verify all 25 test vectors on staging
  └── Controlled deployment to production
```

### 25.2 Backwards Compatibility Contract:
- **Historical Data:** Existing `shared_expenses` and `settlement_payments` records will be read using exact conversion: $\text{paise} = \text{ROUND}(\text{numeric} \times 100)$.
- **No Schema Destruction:** No existing columns will be dropped. V2 will run alongside existing tables.
- **Safe Replay:** If an offline queue contains legacy mutation payloads, an adapter will convert them to integer paise before dispatch.

### 25.3 Rollback Plan:
If unexpected behavior occurs during Phase 2 staging tests:
1. Revert client configuration to legacy `calculateRoomPairwiseDebts`.
2. The database V2 RPCs are additive and do not alter existing schema structures, ensuring zero impact on legacy queries.

---

## 26. CRITICAL SELF-REVIEW QUESTIONNAIRE (14-POINT AUDIT)

| # | Review Question | Pass? | Verification Analysis |
|---|---|---|---|
| 1 | Can the model create money? | **NO (PASSED)** | Sum of shares strictly equals total amount (Invariant L2). Ledger net positions sum to zero (Invariant L1). |
| 2 | Can the model destroy money? | **NO (PASSED)** | Remainder paise are deterministically preserved by modulo allocation. No paise discarded. |
| 3 | Can member balances fail to sum to zero? | **NO (PASSED)** | Mathematically impossible: Total Paid $\equiv$ Total Share, and Settlements Sent $\equiv$ Settlements Received. |
| 4 | Can shares fail to sum to the expense total? | **NO (PASSED)** | Invariant L2 mandates strict equality. Any discrepancy rejects the transaction. |
| 5 | Can rounding create an unallocated amount? | **NO (PASSED)** | Integer division with explicit remainder distribution guarantees $\sum \text{shares} \equiv \text{total}$. |
| 6 | Can a debtor become a creditor incorrectly? | **NO (PASSED)** | Overpayments are rejected; settlements can only reduce debt to zero. |
| 7 | Can a settlement create a circular debt? | **NO (PASSED)** | Min-cash-flow algorithm constructs a strictly bipartite DAG ($\text{Debtors} \to \text{Creditors}$). Zero cycles. |
| 8 | Can a user settle more than they owe? | **NO (PASSED)** | Invariant L5 enforces `amount <= outstanding_debt` at the database trigger level. |
| 9 | Can a user settle another room's debt? | **NO (PASSED)** | Invariant L10 requires both payer and payee to belong to the expense's `room_id`. |
| 10 | Can two devices produce conflicting financial state? | **NO (PASSED)** | State is computed authoritatively by PostgreSQL RPC, not client memory. |
| 11 | Can UPI lose paise? | **NO (PASSED)** | `toFixed(0)` eliminated. UPI URIs formatted with exact 2-decimal paise strings. |
| 12 | Can export disagree with the room ledger? | **NO (PASSED)** | `roomExpenseExportService.ts` refactored to consume canonical RPC output directly. |
| 13 | Can frontend state become the financial source of truth? | **NO (PASSED)** | Frontend is strictly read/preview. Persisted state governed entirely by PostgreSQL. |
| 14 | Can a member leave while obligations remain? | **NO (PASSED)** | Clean exit strictly checks $\text{NetPosition}(u) \equiv 0$. |

---

## 27. OPEN DECISIONS FOR PRODUCT TEAM

1. **Creditor Departure Waiver UX:**
   When a member is owed money ($\text{NetPosition} > 0$) and wishes to leave the room, should the app allow them to "Forgive / Waive Remaining Credits", converting the remaining balance into an uncollected debt waiver, or must all debtors settle before departure?
2. **Simplified Settlements UX Toggle:**
   Should the Room Ledger show *only* the simplified settlements, or should users have an advanced accordion toggle to view "Detailed Bilateral Breakdown" for transparency?
3. **Remainder Cent Assignee Selection:**
   Currently, remainder paise are allocated lexicographically by `user_id`. Should the product team prefer allocating remainder paise to the `payer` (who fronted the cash) instead?

---

```
============================================================
PHASE 1 STATUS
============================================================

FINANCIAL SPECIFICATION COMPLETE

CANONICAL MONEY MODEL:
Integer Minor Units (Paise, 1 INR = 100 Paise). Stored as BIGINT/NUMERIC(12,2) with exact scale conversion. Zero floating-point authority.

CANONICAL NET BALANCE MODEL:
NetPosition(u) = (TotalPaidAsPayer + SettlementsSent) - (TotalAllocatedShare + SettlementsReceived). Exposed semantically with direction (RECEIVE / OWES / SETTLED) and exact paise magnitude.

CANONICAL SETTLEMENT MODEL:
Deterministic Greedy Min-Cash-Flow Matching. Bipartite Directed Acyclic Graph (Debtors -> Creditors). Maximum transfers <= N - 1. Strict mathematical impossibility of circular debts.

ROUNDING POLICY:
Deterministic Remainder Allocation (Invariant L3). Base share = floor(A/k); Remainder R = A mod k distributed +1 paisa to the first R participants sorted lexicographically by UUID.

NUMBER OF REQUIRED INVARIANTS:
16 Formal Invariants (L1-L10, S1-S3, R1, U1, E1).

NUMBER OF TEST VECTORS:
25 Formal Test Vectors (TEST 001 through TEST 025).

TOP 5 IMPLEMENTATION RISKS:
1. Backward compatibility with existing floating-point database records.
2. Offline mutation queue adaptation during migration.
3. User mental model adjustment from bilateral debts to simplified room settlements.
4. Ensuring atomic snapshot reads across Supabase realtime subscriptions.
5. Export PDF service dependency on legacy balance structures.

TOP 5 OPEN DECISIONS:
1. Optional "Bilateral Breakdown" toggle in UI vs. pure simplified view.
2. Remainder paise preference: Lexicographical UUID vs. Payer-first.
3. Creditor departure waiver / forgiveness protocol.
4. Threshold notification on incoming high-value settlements.
5. UPI intent deep link fallback behavior on non-Android platforms.

FILES EXPECTED TO CHANGE IN PHASE 2/3:
1. src/lib/ledger/engine.ts
2. src/components/mobile/MobileRoomLedger.tsx
3. src/components/RoomLedger.tsx
4. src/components/mobile/UpiIntentPayModal.tsx
5. src/lib/payments/upiIntentService.ts
6. supabase/migrations/ (New V2 Migration)
7. src/lib/storage/cloudStorageAdapter.ts
8. src/lib/services/roomExpenseExportService.ts
9. src/lib/ledger/ledgerTestRunner.ts
10. src/components/mobile/MobileLeaveRoomModal.tsx

============================================================
END PHASE 1
============================================================
```
