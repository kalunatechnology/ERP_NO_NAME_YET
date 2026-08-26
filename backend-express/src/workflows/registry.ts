import {
  BaseWorkflow,
  WorkflowNotFoundError,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
} from './engine';

class WorkflowRegistrySingleton {
  private registry: Map<string, BaseWorkflow> = new Map();

  private makeKey(tenantCode: string, moduleCode: string): string {
    return `${tenantCode.toLowerCase()}:${moduleCode.toUpperCase()}`;
  }

  public register(workflow: BaseWorkflow): void {
    const key = this.makeKey(workflow.TENANT_CODE, workflow.MODULE_CODE);
    this.registry.set(key, workflow);
  }

  public get(tenantCode: string, moduleCode: string): BaseWorkflow {
    // 1. Try exact tenant match
    let key = this.makeKey(tenantCode, moduleCode);
    let wf = this.registry.get(key);
    if (wf) return wf;

    // 2. Fallback to default tenant
    key = this.makeKey('default', moduleCode);
    wf = this.registry.get(key);
    if (wf) return wf;

    throw new WorkflowNotFoundError(tenantCode, moduleCode);
  }

  public listAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, wf] of this.registry.entries()) {
      result[key] = wf.constructor.name;
    }
    return result;
  }
}

export const WorkflowRegistry = new WorkflowRegistrySingleton();
