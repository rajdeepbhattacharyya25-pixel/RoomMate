import { runSql } from './test_exec_helper.js';

async function test() {
  const sql = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    
    -- Test with query that requires splits to match total_amount
    WITH validated_expenses AS (
      SELECT se.id, se.room_id, se.paid_by, se.total_amount
      FROM public.shared_expenses se
      JOIN public.expense_splits es ON es.shared_expense_id = se.id
      WHERE se.room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND se.is_deleted = false
      GROUP BY se.id, se.room_id, se.paid_by, se.total_amount
      HAVING ROUND(SUM(es.share_amount), 2) = ROUND(se.total_amount, 2)
    ),
    expenses_paid AS (
      SELECT ve.paid_by AS user_id, COALESCE(SUM(ve.total_amount), 0.00) AS total_paid
      FROM validated_expenses ve
      GROUP BY ve.paid_by
    ),
    expenses_owed AS (
      SELECT es.user_id, COALESCE(SUM(es.share_amount), 0.00) AS total_share
      FROM public.expense_splits es
      JOIN validated_expenses ve ON ve.id = es.shared_expense_id
      GROUP BY es.user_id
    )
    SELECT
      (SELECT COALESCE(SUM(total_paid), 0.00) FROM expenses_paid) AS total_paid_sum,
      (SELECT COALESCE(SUM(total_share), 0.00) FROM expenses_owed) AS total_owed_sum;
    
    ROLLBACK;
  `;
  const res = await runSql(sql);
  console.log(res.stdout);
}

test();
