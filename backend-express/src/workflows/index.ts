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
