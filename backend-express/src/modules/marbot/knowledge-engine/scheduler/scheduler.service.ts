import { execSync } from 'child_process';
import { env } from '../../../../config/env';
import { JobLockService } from './job-lock.service';
import { JobManagerService } from '../manager/job-manager.service';
import { RepositoryCrawler } from '../crawler/repository-crawler';
import { SnapshotManager } from '../publishing/snapshot-manager';
import { ScanCoordinatorService } from '../manager/scan-coordinator.service';

export class KnowledgeEngineScheduler {
  private static lastTriggeredDay = '';

  /**
   * Automatically checks on server startup whether the current Git commit
   * differs from the active snapshot. If so, triggers sync immediately without
   * needing any external curl commands.
   */
  /**
   * Safely checks Git diff between baseline commit and current commit.
   * If baseline commit is missing (shallow/rebase), merge base unknown, analyzer/config changed,
   * or git command fails, falls back safely to full reconciliation scan.
   */
  static evaluateCommitDiffSafety(
    baselineSha: string,
    currentSha: string
  ): { canSkip: boolean; isFullReconcile: boolean; reason: string } {
    try {
      // 1. Verify baseline commit exists in current repository object database
      try {
        execSync(`git cat-file -e ${baselineSha}^{commit}`, { stdio: 'ignore', timeout: 3000 });
      } catch {
        return {
          canSkip: false,
          isFullReconcile: true,
          reason: 'BASELINE_COMMIT_MISSING_OR_PRUNED',
        };
      }

      // 2. Run git diff between baseline commit and current commit
      const diffOutput = execSync(`git diff --name-only ${baselineSha} ${currentSha}`, {
        encoding: 'utf8',
        timeout: 8000,
      });

      const changedFiles = diffOutput.split(/\r?\n/).filter(Boolean);

      // If diff output is empty despite different SHAs, treat as ambiguous (e.g. merge commit)
      if (changedFiles.length === 0) {
        return {
          canSkip: false,
          isFullReconcile: false,
          reason: 'EMPTY_OR_AMBIGUOUS_DIFF',
        };
      }

      // 3. Analyzer/Crawler/Knowledge Engine or DB Schema changes -> Force FULL RECONCILE
      const hasEngineChanges = changedFiles.some(
        (f) =>
          f.includes('knowledge-engine/') ||
          f.includes('prisma/schema.prisma') ||
          f === 'package.json' ||
          f.includes('tsconfig.json')
      );
      if (hasEngineChanges) {
        return {
          canSkip: false,
          isFullReconcile: true,
          reason: 'ENGINE_OR_SCHEMA_CHANGED',
        };
      }

      // 4. Check for relevant application code changes
      const hasCodeChanges = changedFiles.some(
        (f) =>
          /\.(ts|tsx|prisma|js)$/.test(f) &&
          !f.endsWith('.unit.ts') &&
          !f.endsWith('.test.ts') &&
          !f.includes('tests/') &&
          !f.endsWith('.md')
      );

      if (!hasCodeChanges) {
        return {
          canSkip: true,
          isFullReconcile: false,
          reason: 'NON_CODE_CHANGES_ONLY',
        };
      }

      return {
        canSkip: false,
        isFullReconcile: false,
        reason: 'APPLICATION_CODE_CHANGED',
      };
    } catch (err) {
      // Safe fallback on any error: do a full reconcile scan
      return {
        canSkip: false,
        isFullReconcile: true,
        reason: `GIT_DIFF_ERROR: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Automatically checks on server startup whether the current Git commit
   * differs from the active snapshot. If so, triggers sync immediately without
   * needing any external curl commands.
   */
  static async checkStartupCommitSync(): Promise<void> {
    if (!env.MARBOT_KE_ENABLED) return;

    try {
      const currentCommit = RepositoryCrawler.resolveCommitSha();
      const activeSnapshot = await SnapshotManager.getActiveSnapshot();

      // If no active snapshot exists yet, or current commit is different from active snapshot
      if (!activeSnapshot || activeSnapshot.commit_sha !== currentCommit) {
        let isFullReconcile = false;

        // If an active snapshot exists, check whether code files actually changed
        if (activeSnapshot) {
          const evalResult = this.evaluateCommitDiffSafety(activeSnapshot.commit_sha, currentCommit);
          if (evalResult.canSkip) {
            console.log(
              `[MKIE] Commit ${currentCommit} does not affect core code or schema (${evalResult.reason}). Preserving active snapshot ${activeSnapshot.id}.`
            );
            return;
          }
          isFullReconcile = evalResult.isFullReconcile;
          console.log(
            `[MKIE] Commit diff safety check: ${evalResult.reason} (isFullReconcile: ${isFullReconcile})`
          );
        }

        const workerId = `startup-sync-${process.pid}`;
        const lock = await JobLockService.acquireLock(
          'marbot_ke_startup_sync',
          workerId,
          900,
          currentCommit
        );

        if (lock.acquired) {
          console.log(
            `🚀 [MKIE] New commit detected (${currentCommit}). Auto-syncing knowledge engine without manual curl...`
          );
          if (env.MARBOT_KE_MODE !== 'observation') {
            await ScanCoordinatorService.runScan({
              commitSha: currentCommit,
              isFullReconcile,
            });
          } else {
            await JobManagerService.scheduleDeltaCrawl(currentCommit);
          }
        }
      }
    } catch (err) {
      console.warn(
        '[MKIE] Startup auto-sync check skipped:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Evaluates the current Asia/Jakarta time and triggers daily or weekly jobs.
   */
  static async checkSchedule(): Promise<void> {
    if (!env.MARBOT_KE_ENABLED) return;

    const now = new Date();
    // Get Asia/Jakarta date and hour
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const day = parts.find((p) => p.type === 'day')?.value || '';
    const hour = parts.find((p) => p.type === 'hour')?.value || '';

    const todayStr = `${year}-${month}-${day}`;

    // Target: Midnight hour (00) in Asia/Jakarta once per day
    if (hour === '00' && this.lastTriggeredDay !== todayStr) {
      const workerId = `scheduler-${process.pid}`;
      const lock = await JobLockService.acquireLock(
        'marbot_ke_cron_trigger',
        workerId,
        1800
      );

      if (lock.acquired) {
        this.lastTriggeredDay = todayStr;

        // Check if Sunday (day of week 0) for full reconciliation
        const dayOfWeek = new Date(todayStr).getDay();
        if (dayOfWeek === 0) {
          await JobManagerService.scheduleFullReconciliation();
        } else {
          await JobManagerService.scheduleDeltaCrawl();
        }
      }
    }
  }

  /**
   * Starts the scheduler with an auto-sync check on boot, plus the recurring evaluation loop.
   */
  static startScheduler(isReady: () => boolean, intervalMs = 60000) {
    // 1. Run automatic commit diff check 3 seconds after server is ready
    const startupTimeout = setTimeout(() => {
      if (isReady()) {
        void this.checkStartupCommitSync();
      }
    }, 3000);
    startupTimeout.unref?.();

    // 2. Periodic cron evaluation loop
    const timer = setInterval(() => {
      if (!isReady()) return;
      this.checkSchedule().catch((err) => {
        console.warn('Knowledge engine scheduler tick error:', err);
      });
    }, intervalMs);

    timer.unref?.();

    return () => {
      clearTimeout(startupTimeout);
      clearInterval(timer);
    };
  }
}
