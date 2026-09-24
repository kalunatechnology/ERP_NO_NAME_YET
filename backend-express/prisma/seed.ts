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
console.error(
  'Generic seed is disabled. Use `npm run seed:master` for master/demo data or `npm run seed:production` for the explicitly guarded production profile.',
);
process.exitCode = 1;
