import { runSql } from './test_exec_helper.js';

async function main() {
  const q = await runSql(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'expense_splits';
  `);
  console.log('=== INDEXES ON expense_splits ===');
  console.log(q.stdout);
}

main().catch(console.error);
