/**
 * Production process entry point.
 *
 * A release must finish committed Prisma migrations before Express accepts
 * traffic. The migration runner is deliberately restricted to known
 * long-lived backend targets: Vercel functions never call this file.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const MIGRATION_TARGETS = new Set(['hostinger', 'docker']);

function run() {
  const target = process.env.DEPLOYMENT_TARGET;

  if (MIGRATION_TARGETS.has(target)) {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'deploy_hostinger_migrations.js')],
      { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  } else {
    console.log('Database migration skipped: DEPLOYMENT_TARGET is not a production backend target.');
  }

  require('../dist/server.js');
}

try {
  run();
} catch (error) {
  console.error(`Application startup blocked: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
