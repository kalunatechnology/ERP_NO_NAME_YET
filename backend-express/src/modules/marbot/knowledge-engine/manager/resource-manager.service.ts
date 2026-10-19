import os from 'node:os';
import { env } from '../../../../config/env';

export interface ResourceMetrics {
  cpuPercent: number;
  memoryPercent: number;
  isThrottled: boolean;
}

export class ResourceManagerService {
  /**
   * Calculates approximate memory usage percentage.
   */
  static getMemoryUsagePercent(): number {
    const total = os.totalmem();
    const free = os.freemem();
    if (total <= 0) return 0;
    const used = total - free;
    return Math.round((used / total) * 100);
  }

  /**
   * Calculates approximate CPU usage based on 1-minute load average.
   */
  static getCpuLoadPercent(): number {
    const load = os.loadavg()[0] || 0;
    const cpuCount = os.cpus().length || 1;
    const percent = Math.round((load / cpuCount) * 100);
    return Math.min(100, Math.max(0, percent));
  }

  /**
   * Checks if current system load is within configured limits.
   */
  static isUnderLoadThreshold(): boolean {
    const memPercent = this.getMemoryUsagePercent();
    const cpuPercent = this.getCpuLoadPercent();

    const memLimit = env.MARBOT_KE_MEM_LIMIT_PERCENT;
    const cpuLimit = env.MARBOT_KE_CPU_LIMIT_PERCENT;

    return memPercent <= memLimit && cpuPercent <= cpuLimit;
  }

  /**
   * If load exceeds threshold, pauses execution briefly to relieve pressure.
   */
  static async checkThrottle(): Promise<void> {
    if (!this.isUnderLoadThreshold()) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  /**
   * Returns current snapshot of resource utilization.
   */
  static getMetrics(): ResourceMetrics {
    const memPercent = this.getMemoryUsagePercent();
    const cpuPercent = this.getCpuLoadPercent();
    const isThrottled = !this.isUnderLoadThreshold();

    return {
      cpuPercent,
      memoryPercent: memPercent,
      isThrottled,
    };
  }
}
