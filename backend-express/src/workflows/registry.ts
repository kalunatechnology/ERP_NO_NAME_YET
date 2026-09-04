/**
 * File: backend-express/src/workflows/registry.ts
 *
 * Purpose: Implements workflow and state transition responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import {
  BaseWorkflow,
  WorkflowNotFoundError,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
} from './engine';

class WorkflowRegistrySingleton {
  private registry: Map<string, BaseWorkflow> = new Map();

/**
 * makeKey implements this file's named method contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  private makeKey(tenantCode: string, moduleCode: string): string {
    return `${tenantCode.toLowerCase()}:${moduleCode.toUpperCase()}`;
  }

/**
 * register implements this file's named method contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  public register(workflow: BaseWorkflow): void {
    const key = this.makeKey(workflow.TENANT_CODE, workflow.MODULE_CODE);
    this.registry.set(key, workflow);
  }

/**
 * get implements this file's named method contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
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

/**
 * listAll implements this file's named method contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  public listAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, wf] of this.registry.entries()) {
      result[key] = wf.constructor.name;
    }
    return result;
  }
}

export const WorkflowRegistry = new WorkflowRegistrySingleton();
