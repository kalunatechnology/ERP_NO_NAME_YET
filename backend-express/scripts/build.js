/**
 * Unified build entry point.
 *
 * A Hostinger build runs pending Prisma migrations before compiling the
 * backend. Other environments compile only: Vercel must never run migrations
 * in a serverless build, and local builds must not touch a remote database.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertNoUuidCastsForTextIds(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assertNoUuidCastsForTextIds(location);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const source = fs.readFileSync(location, 'utf8');
      if (source.includes('::uuid')) {
        throw new Error(`Invalid raw SQL UUID cast for TEXT-backed Prisma IDs: ${path.relative(path.resolve(__dirname, '..'), location)}`);
      }
    }
  }
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
  const hasFrontend = fs.existsSync(path.resolve(root, '..', 'frontend-next', 'lib', 'access', 'module-contract.ts'));

  // Prisma String IDs are stored as PostgreSQL TEXT in the production
  // baseline. Rust-free driver parameters are text too; forcing them to UUID
  // produces PostgreSQL 42883 (operator does not exist: text = uuid).
  assertNoUuidCastsForTextIds(path.join(root, 'src'));

  run(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'generate']);
  run(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')]);

  if (process.env.SKIP_TESTS_ON_BUILD !== 'true') {
    // tests/q11-system-guardrails.ts imports contracts from the sibling frontend-next project.
    // In isolated deployment environments (e.g., Hostinger / Docker / CI standalone backend),
    // skip cross-project monorepo tests if the sibling folder does not exist or target is Hostinger.
    if (hasFrontend && process.env.DEPLOYMENT_TARGET !== 'hostinger') {
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/q11-system-guardrails.ts']);
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/project-financial-targets.unit.ts']);
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/project-input-validation.unit.ts']);
      // This test also asserts frontend route/navigation contracts, therefore
      // it cannot compile in a backend-only Hostinger deployment artifact.
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/project-acting-manager.unit.ts']);
    } else {
      console.log('Skipping cross-project frontend contract tests (monorepo frontend-next not present or production deployment target).');
    }

    run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/reporting-global-scope.unit.ts']);
    run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/cors-preflight.unit.ts']);
    run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/text-id-crud.unit.ts']);
    run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/integration-hardening.unit.ts']);
    run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/marbot-signature.unit.ts']);
  }
}

try {
  main();
} catch (error) {
  console.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
