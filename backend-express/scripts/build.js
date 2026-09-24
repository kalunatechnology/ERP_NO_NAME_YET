/**
 * Unified application build entry point.
 *
 * IMPORTANT: an application build must be database-mutation free. Hostinger,
 * Vercel, CI, and local builds only generate Prisma Client and compile the
 * application. Database migrations are an explicit release operation via
 * `npm run deploy:hostinger:db`; they are never forced by `npm run build`.
 *
 * This separation prevents a migration-history problem from blocking a frontend
 * or backend code release and prevents ordinary rebuilds from mutating a live
 * database. CI remains responsible for validating the migration contract.
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
  const isHostinger = process.env.VERCEL !== '1' && process.env.DEPLOYMENT_TARGET === 'hostinger';

  // Never connect to or mutate a database from an application build. Migrations
  // are intentionally explicit (`npm run deploy:hostinger:db`) so failed
  // migration history cannot prevent unrelated frontend/backend code from being
  // built and published.
  const root = path.resolve(__dirname, '..');
  const hasFrontend = fs.existsSync(path.resolve(root, '..', 'frontend-next', 'lib', 'access', 'module-contract.ts'));

  // Prisma String IDs are stored as PostgreSQL TEXT in the production
  // baseline. Rust-free driver parameters are text too; forcing them to UUID
  // produces PostgreSQL 42883 (operator does not exist: text = uuid).
  assertNoUuidCastsForTextIds(path.join(root, 'src'));

  run(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'generate']);
  run(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')]);

  // Hostinger application builds stop after deterministic, database-free
  // compilation. Database migration/audit is a separate release operation.
  if (isHostinger) {
    console.log('Hostinger application build: Prisma generated and TypeScript compiled. Database migration is explicit via npm run deploy:hostinger:db and is not executed by npm run build.');
    return;
  }

  if (process.env.SKIP_TESTS_ON_BUILD !== 'true') {
    // tests/q11-system-guardrails.ts imports contracts from the sibling frontend-next project.
    if (hasFrontend) {
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/q11-system-guardrails.ts']);
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/project-financial-targets.unit.ts']);
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/project-input-validation.unit.ts']);
      run(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--files', 'tests/project-acting-manager.unit.ts']);
    } else {
      console.log('Skipping cross-project frontend contract tests (monorepo frontend-next not present).');
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
