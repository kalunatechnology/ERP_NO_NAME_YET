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

  // Invoke local tool entry points through the current Node executable. This
  // behaves consistently on Windows and Linux and never depends on shell
  // resolution of npm/npm.cmd during a hosting build.
  const root = path.resolve(__dirname, '..');
  run(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'generate']);
  run(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')]);
  run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/q11-system-guardrails.ts']);
}

try {
  main();
} catch (error) {
  console.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
