/**
 * File: backend-express/src/workflows/index.ts
 *
 * Purpose: Implements workflow and state transition responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import { WorkflowRegistry } from './registry';
import { ArsalynkSalesOrderWorkflow } from './tenants/arsalynk/sales_order.workflow';
import { ArsalynkProjectWorkflow } from './tenants/arsalynk/project.workflow';
import { ArsalynkProcurementWorkflow } from './tenants/arsalynk/procurement.workflow';
import { DefaultSalesOrderWorkflow } from './tenants/default/sales_order.workflow';
import { DefaultProjectWorkflow } from './tenants/default/project.workflow';
import { DefaultProcurementWorkflow } from './tenants/default/procurement.workflow';

// Register all workflows into the singleton registry
WorkflowRegistry.register(new ArsalynkSalesOrderWorkflow());
WorkflowRegistry.register(new ArsalynkProjectWorkflow());
WorkflowRegistry.register(new ArsalynkProcurementWorkflow());
WorkflowRegistry.register(new DefaultSalesOrderWorkflow());
WorkflowRegistry.register(new DefaultProjectWorkflow());
WorkflowRegistry.register(new DefaultProcurementWorkflow());

export * from './engine';
export * from './registry';
