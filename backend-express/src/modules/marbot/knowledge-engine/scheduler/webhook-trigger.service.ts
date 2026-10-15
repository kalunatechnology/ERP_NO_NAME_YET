import { JobManagerService } from '../manager/job-manager.service';
import { ScanCoordinatorService } from '../manager/scan-coordinator.service';

export interface DeploySyncOptions {
  commitSha?: string;
  runSynchronously?: boolean;
}

export class WebhookTriggerService {
  /**
   * Handles post-deployment sync webhook trigger.
   */
  static async handleDeploySync(options: DeploySyncOptions = {}) {
    const commitSha = options.commitSha;

    if (options.runSynchronously) {
      return ScanCoordinatorService.runScan({
        commitSha,
        isFullReconcile: false,
      });
    }

    const jobId = await JobManagerService.scheduleDeltaCrawl(commitSha);
    return {
      queued: true,
      jobId,
      commitSha: commitSha ?? 'auto',
    };
  }
}
