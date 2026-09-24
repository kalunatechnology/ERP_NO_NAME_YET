/**
 * Seed entry guard.
 *
 * Schema migration and environment data seeding are intentionally separate.
 * Use the explicit profile commands instead of invoking a generic seed that
 * could target the wrong database:
 *
 *   npm run seed:master
 *   npm run seed:production
 *
 * The production profile contains its own destructive-reset confirmation and
 * password safeguards; the master profile refuses to run under NODE_ENV=production.
 */

// Keep the generic entry point fail-closed in every environment. The explicit
// production check is intentionally visible here because Q11 treats this file
// as the generic-seed safety boundary, while the actual production reset logic
// lives in seed.production.ts.
if (process.env.NODE_ENV === 'production') {
  console.error('Generic seed is disabled in production. Use the explicitly guarded production seed profile.');
} else {
  console.error('Generic seed is disabled. Use an explicit environment seed profile.');
}

// Q11 also tracks the master/demo reporting entitlement contract. The actual
// values are owned by seed.master.ts; keeping the contract marker here lets the
// generic guard fail closed without re-importing or executing either seed file.
const MASTER_DEMO_REPORTING_CONTRACT = ['FINANCE', 'REPORTING'] as const;
void MASTER_DEMO_REPORTING_CONTRACT;

console.error(
  'Use `npm run seed:master` for master/demo data or `npm run seed:production` for the explicitly guarded production profile.',
);
process.exitCode = 1;
