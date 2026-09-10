-- ============================================================================
-- Student Expense App - Room Financial Calculation & Debt RPC Functions
-- ============================================================================

-- Function to return member financial balances for a room
CREATE OR REPLACE FUNCTION public.get_room_balances(p_room_id UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  total_paid NUMERIC,
  total_share NUMERIC,
  settlements_paid NUMERIC,
  settlements_received NUMERIC,
  net_balance NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH members AS (
    SELECT rm.user_id, p.name, p.email
    FROM public.room_members rm
    JOIN public.profiles p ON p.id = rm.user_id
    WHERE rm.room_id = p_room_id AND rm.status = 'ACTIVE'
  ),
  expenses_paid AS (
    SELECT paid_by AS user_id, COALESCE(SUM(total_amount), 0) AS total_paid
    FROM public.shared_expenses
    WHERE room_id = p_room_id AND is_deleted = false
    GROUP BY paid_by
  ),
  expenses_owed AS (
    SELECT es.user_id, COALESCE(SUM(es.share_amount), 0) AS total_share
    FROM public.expense_splits es
    JOIN public.shared_expenses se ON se.id = es.shared_expense_id
    WHERE se.room_id = p_room_id AND se.is_deleted = false
    GROUP BY es.user_id
  ),
  settlements_sent AS (
    SELECT payer_id AS user_id, COALESCE(SUM(amount), 0) AS settlements_paid
    FROM public.settlement_payments
    WHERE room_id = p_room_id
    GROUP BY payer_id
  ),
  settlements_rcvd AS (
    SELECT payee_id AS user_id, COALESCE(SUM(amount), 0) AS settlements_received
    FROM public.settlement_payments
    WHERE room_id = p_room_id
    GROUP BY payee_id
  )
  SELECT
    m.user_id,
    m.name,
    m.email,
    COALESCE(ep.total_paid, 0) AS total_paid,
    COALESCE(eo.total_share, 0) AS total_share,
    COALESCE(ss.settlements_paid, 0) AS settlements_paid,
    COALESCE(sr.settlements_received, 0) AS settlements_received,
    (COALESCE(ep.total_paid, 0) + COALESCE(ss.settlements_paid, 0)) -
    (COALESCE(eo.total_share, 0) + COALESCE(sr.settlements_received, 0)) AS net_balance
  FROM members m
  LEFT JOIN expenses_paid ep ON ep.user_id = m.user_id
  LEFT JOIN expenses_owed eo ON eo.user_id = m.user_id
  LEFT JOIN settlements_sent ss ON ss.user_id = m.user_id
  LEFT JOIN settlements_rcvd sr ON sr.user_id = m.user_id
  ORDER BY net_balance DESC;
$$;
