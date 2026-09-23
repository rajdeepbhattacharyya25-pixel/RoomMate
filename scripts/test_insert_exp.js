import { runSql } from './test_exec_helper.js';

async function main() {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Electricity Bill', 1200.00, 'Electricity', 'EQUAL')
    RETURNING id;
    COMMIT;
  `;
  try {
    const res = await runSql(wrapped);
    console.log('STDOUT:');
    console.log(res.stdout);
    console.log('STDERR:');
    console.log(res.stderr);
  } catch (err) {
    console.error('ERROR:');
    console.error(err);
  }
}

main().catch(console.error);
