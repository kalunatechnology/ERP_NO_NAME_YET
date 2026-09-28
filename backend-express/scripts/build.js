/**
 * Unified application build entry point.
 *
 * Hostinger production deploys are the one exception to the normal
 * database-mutation-free build rule: Hostinger only invokes `npm run build`, so
 * pending production migrations must be applied here before the new application
 * binary is published. Vercel, CI, and local builds remain database-mutation
 * free.
 *
 * The Hostinger path delegates to `scripts/deploy_hostinger_migrations.js`,
 * which validates the direct PostgreSQL connection, reconciles the historical
 * production/master Prisma lineage, and then runs `prisma migrate deploy`.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, '..'),
    env: options.env ?? process.env,
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

function runHostingerProductionMigration(root) {
  const directUrl = process.env.SUPABASE_DIRECT_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!directUrl) {
    throw new Error(
      'Hostinger production deployment requires SUPABASE_DIRECT_URL, DIRECT_URL, or DATABASE_URL so pending Prisma migrations cannot be silently skipped.',
    );
  }

  console.log('Hostinger production build: applying pending database migrations before application compilation.');
  run(process.execPath, [path.join(root, 'scripts', 'deploy_hostinger_migrations.js')], {
    env: {
      ...process.env,
      DEPLOYMENT_TARGET: 'hostinger',
      SUPABASE_DIRECT_URL: process.env.SUPABASE_DIRECT_URL || directUrl,
      DIRECT_URL: process.env.DIRECT_URL || directUrl,
      DATABASE_URL: process.env.DATABASE_URL || directUrl,
    },
  });
  console.log('Hostinger production build: database migration gate completed successfully.');
}

function main() {
  const isHostinger = process.env.VERCEL !== '1' && process.env.DEPLOYMENT_TARGET === 'hostinger';
  const skipHostingerMigration = process.env.HOSTINGER_SKIP_DB_MIGRATION === 'true';
  const root = path.resolve(__dirname, '..');
  const hasFrontend = fs.existsSync(path.resolve(root, '..', 'frontend-next', 'lib', 'access', 'module-contract.ts'));

  assertNoUuidCastsForTextIds(path.join(root, 'src'));

  if (isHostinger && !skipHostingerMigration) {
    runHostingerProductionMigration(root);
  } else if (isHostinger) {
    console.warn('Hostinger database migration explicitly skipped via HOSTINGER_SKIP_DB_MIGRATION=true.');
  }

  run(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'generate']);
  run(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')]);

  if (isHostinger) {
    console.log('Hostinger application build: production migrations checked/applied, Prisma generated, and TypeScript compiled.');
    return;
  }

  if (process.env.SKIP_TESTS_ON_BUILD !== 'true') {
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
