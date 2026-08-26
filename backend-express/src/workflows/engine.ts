/**
 * Workflow Engine — Base Types & Abstract Class.
 *
 * TypeScript port of backend/apps/workflows/base.py
 *
 * Module codes:
 *   SALES_ORDER, PROJECT, PURCHASE_ORDER, SALES_QUOTATION, INVOICE, PAYMENT, PROCUREMENT
 */

export interface TransitionContext {
  user: {
    id: string;
    is_superuser: boolean;
    roles: string[];
  };
  company_id: string | null;
  tenant_code: string;
  note?: string;
  extra?: Record<string, unknown>;
}

export interface TransitionInfo {
  action: string;        // e.g. 'confirm', 'approve', 'reject'
  label: string;         // Human-readable label
  to_status: string;     // Target status after transition
  requires_approval?: boolean;
  approval_level?: string;
  description?: string;
}

export type TransitionMap = Record<string, TransitionInfo[]>;

/**
 * Generic document interface for workflow operations.
 * Domain services pass actual Prisma records here.
 */
export interface WorkflowDocument {
  id: string;
  [key: string]: unknown;
}

export class WorkflowValidationError extends Error {
  public readonly errors?: Record<string, unknown>;
  constructor(message: string, errors?: Record<string, unknown>) {
    super(message);
    this.name = 'WorkflowValidationError';
    this.errors = errors;
  }
}

export class WorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowTransitionError';
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(tenantCode: string, moduleCode: string) {
    super(`No workflow registered for tenant '${tenantCode}' module '${moduleCode}'.`);
    this.name = 'WorkflowNotFoundError';
  }
}

/**
 * Abstract base class for all tenant-specific workflow implementations.
 */
export abstract class BaseWorkflow {
  abstract readonly MODULE_CODE: string;
  abstract readonly TENANT_CODE: string;
  abstract readonly VALID_STATUSES: string[];
  abstract readonly TRANSITIONS: TransitionMap;

  abstract getInitialStatus(): string;

  abstract getAvailableTransitions(
    currentStatus: string,
    context: TransitionContext,
  ): TransitionInfo[];

  abstract validateTransition(
    document: WorkflowDocument,
    fromStatus: string,
    toStatus: string,
    context: TransitionContext,
  ): void | Promise<void>;

  abstract onStatusChanged(
    document: WorkflowDocument,
    fromStatus: string,
    toStatus: string,
    context: TransitionContext,
  ): void | Promise<void>;

  // Optional hooks
  requiresApproval(_document: WorkflowDocument, _context: TransitionContext): boolean {
    return false;
  }

  getApprovalLevels(_document: WorkflowDocument, _context: TransitionContext): string[] {
    return [];
  }

  onDocumentCreated(_document: WorkflowDocument, _context: TransitionContext): void | Promise<void> {
    return;
  }

  getFlowSummary(): Record<string, unknown> {
    return {
      tenant: this.TENANT_CODE,
      module: this.MODULE_CODE,
      initial_status: this.getInitialStatus(),
      valid_statuses: this.VALID_STATUSES,
      transitions: Object.fromEntries(
        Object.entries(this.TRANSITIONS).map(([from, transitions]) => [
          from,
          transitions.map((t) => ({
            action: t.action,
            label: t.label,
            to_status: t.to_status,
            requires_approval: t.requires_approval ?? false,
          })),
        ]),
      ),
    };
  }

  protected isSuperuser(context: TransitionContext): boolean {
    return context.user.is_superuser;
  }

  protected getUserRoles(context: TransitionContext): string[] {
    return context.user.roles.map((r) => r.toUpperCase());
  }
}
