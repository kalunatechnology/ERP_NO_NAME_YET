/**
 * Production process entry point.
 *
 * Docker release entry point. A container must finish committed Prisma
 * migrations before Express accepts traffic. Hostinger runs migrations once
 * in scripts/build.js and starts through server.js, avoiding restart loops.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const MIGRATION_TARGETS = new Set(['docker']);

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
