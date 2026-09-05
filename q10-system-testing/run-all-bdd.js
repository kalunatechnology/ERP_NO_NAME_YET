/**
 * Q10 complete BDD orchestrator.
 *
 * Runs every existing Q10 feature suite outside the Express/Next folders so
 * terminal round-trip limits cannot truncate the test run. Each child keeps
 * its complete stdout/stderr evidence; a timeout becomes BLOCKED, never PASS.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
const node = process.execPath;
const resultPath = path.join(__dirname, 'Q10_RUNTIME_RESULTS.json');

/** Runs a child suite, preserving its output and classifying its exact outcome. */
function executeSuite(suite, command, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, env: { ...process.env, NODE_ENV: 'test' }, windowsHide: true });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on('error', (error) => {
      output += `\nPROCESS_ERROR: ${error.message}`;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      const status = timedOut ? 'BLOCKED' : exitCode === 0 ? 'PASS' : 'FAIL';
      resolve({ suite, status, exit_code: exitCode, signal, elapsed_ms: Date.now() - startedAt, timeout_ms: timeoutMs, output });
    });
  });
}

async function main() {
  const tsNode = path.join(backend, 'node_modules', 'ts-node', 'dist', 'bin.js');
  const suites = [
    ['Static Express–Next contract matrix', node, ['run-contract-audit.js'], __dirname, 60_000],
    ['All demo-persona login BDD (15 seconds per login)', node, ['run-login-loading-bdd.js'], __dirname, 180_000],
    ['Critical system BDD feature (8 scenarios)', node, [tsNode, '--files', 'tests/q10-system.bdd.ts'], backend, 180_000],
    ['Company Admin access BDD feature (12 scenarios)', node, [tsNode, '--files', 'tests/q10-company-admin-access.bdd.ts'], backend, 240_000],
    ['Runtime API contract BDD', node, ['run-runtime-contract-bdd.js'], __dirname, 120_000],
  ];
  const results = [];
  for (const [suite, command, args, cwd, timeoutMs] of suites) {
    process.stdout.write(`START: ${suite}\n`);
    const result = await executeSuite(suite, command, args, cwd, timeoutMs);
    results.push(result);
    process.stdout.write(`${result.status}: ${suite} (${result.elapsed_ms} ms)\n`);
  }
  const summary = {
    executed_at: new Date().toISOString(),
    runner: 'Q10 complete BDD orchestrator',
    login_timeout_ms: 15_000,
    status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'ATTENTION_REQUIRED',
    results,
  };
  fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ status: summary.status, result_file: resultPath, suites: results.map(({ suite, status, elapsed_ms }) => ({ suite, status, elapsed_ms })) }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(resultPath, JSON.stringify({ status: 'RUNNER_ERROR', error: error.message, stack: error.stack }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
