import { runSql } from './test_exec_helper.js';

async function testConcurrency() {
  console.log('Testing split race condition under concurrent execution...');
  
  // Setup test room and expense
  const roomId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const expId = '88880000-0000-0000-0000-000000000001';
  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';
  const userE = '77777777-7777-7777-7777-777777777777';

  // Create an expense of 100.00
  await runSql(`
    DELETE FROM public.expense_splits WHERE shared_expense_id = '${expId}';
    DELETE FROM public.shared_expenses WHERE id = '${expId}';
    INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method)
    VALUES ('${expId}', '${roomId}', '${userA}', '${userA}', 'Race Test Expense', 100.00, 'Other', 'EXACT');
  `);

  // Run two concurrent inserts of 60.00 each (total 120.00 > 100.00)
  const p1 = runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userA}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    SELECT pg_sleep(0.05);
    INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
    VALUES ('${expId}', '${userB}', 60.00);
    COMMIT;
  `);

  const p2 = runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userA}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    SELECT pg_sleep(0.05);
    INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
    VALUES ('${expId}', '${userE}', 60.00);
    COMMIT;
  `);

  const results = await Promise.allSettled([p1, p2]);
  console.log('Result 1:', results[0].status, results[0].value ? 'SUCCESS' : results[0].reason?.message);
  console.log('Result 2:', results[1].status, results[1].value ? 'SUCCESS' : results[1].reason?.message);

  // Check sum of splits in database
  const checkRes = await runSql(`
    SELECT COALESCE(SUM(share_amount), 0.00) AS total_splits
    FROM public.expense_splits
    WHERE shared_expense_id = '${expId}';
  `);
  console.log('Database total splits:', checkRes.stdout.trim());
}

testConcurrency().catch(console.error);
