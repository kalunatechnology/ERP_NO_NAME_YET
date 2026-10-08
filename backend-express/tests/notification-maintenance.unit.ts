import assert from 'node:assert/strict';
import { startNotificationMaintenance } from '../src/modules/core/notification-maintenance.service';

async function main() {
  const originalInterval = global.setInterval;
  const originalClear = global.clearInterval;
  const originalWarn = console.warn;
  let tick: () => void = () => {}, intervalMs = 0, unref = false, cleared = false;
  let ready = false, cleanupCalls = 0, reconcileCalls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const token = { unref: () => { unref = true; } };
  const db: any = {
    core_app_notification: { deleteMany: async () => { cleanupCalls++; await gate; return { count: 0 }; } },
    project_weekly_task: { findMany: async () => { reconcileCalls++; return []; } },
    project_task_activity_log: { findMany: async () => [] },
  };
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  const warnings: any[] = [];
  try {
    global.setInterval = ((callback: () => void, delay: number) => { tick = callback; intervalMs = delay; return token; }) as any;
    global.clearInterval = ((timer: unknown) => { assert.equal(timer, token); cleared = true; }) as any;
    console.warn = (...values) => { warnings.push(values); };
    const stop = startNotificationMaintenance(db, () => ready);
    assert.equal(cleanupCalls, 0, 'DB readiness gates all work');
    assert.equal(intervalMs, 3600000); assert(unref, 'Scheduler cannot keep shutdown waiting');
    ready = true;
    tick(); tick();
    assert.equal(cleanupCalls, 1, 'Overlapping ticks do not start another run');
    release(); await flush();
    assert.equal(reconcileCalls, 1);
    tick(); stop(); await flush(); tick();
    assert(cleared); assert.equal(cleanupCalls, 2); assert.equal(reconcileCalls, 1, 'Stopping after cleanup prevents further reconciliation');
    db.core_app_notification.deleteMany = async () => { throw Object.assign(new Error('fixture private connection detail'), { code: 'FIXTURE_FAILURE' }); };
    const stopRetry = startNotificationMaintenance(db, () => true);
    await flush();
    assert.equal(warnings.length, 1); assert(!JSON.stringify(warnings).includes('private connection detail'));
    db.core_app_notification.deleteMany = async () => ({ count: 0 });
    tick(); await flush();
    assert.equal(reconcileCalls, 2, 'A failed run can retry on the next tick');
    stopRetry();
    console.log('PASS: notification scheduler waits for DB readiness, runs hourly without overlap, stops safely, suppresses connection details and retries failures. All persistence uses fixtures.');
  } finally {
    global.setInterval = originalInterval; global.clearInterval = originalClear; console.warn = originalWarn;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
