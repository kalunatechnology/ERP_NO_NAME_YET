/**
 * Unified build entry point.
 *
 * A Hostinger build runs pending Prisma migrations before compiling the
 * backend. Other environments compile only: Vercel must never run migrations
 * in a serverless build, and local builds must not touch a remote database.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  // The explicit target prevents accidental database writes from developer
  // machines and prevents migration execution in Vercel builds.
  if (process.env.VERCEL !== '1' && process.env.DEPLOYMENT_TARGET === 'hostinger') {
    run(process.execPath, [path.join(__dirname, 'deploy_hostinger_migrations.js')]);
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npmCommand, ['run', 'build:compile']);
}

try {
  main();
} catch (error) {
  console.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
