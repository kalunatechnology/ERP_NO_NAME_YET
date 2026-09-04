/**
 * File: backend-express/src/modules/implementation/implementation.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the implementation domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router } from 'express';
import { createCrudRouter } from '../../utils/crud-factory';

export const implementationRouter = Router();

// REST ViewSets
implementationRouter.use('/releases', createCrudRouter({ modelName: 'implementation_release', searchFields: ['release_name', 'release_code'] }));
implementationRouter.use('/phases', createCrudRouter({ modelName: 'implementation_phase', searchFields: ['phase_name'] }));
implementationRouter.use('/phase-items', createCrudRouter({ modelName: 'implementation_phase_item' }));
implementationRouter.use('/workflows', createCrudRouter({ modelName: 'implementation_workflow', searchFields: ['workflow_name'] }));
implementationRouter.use('/workflow-stages', createCrudRouter({ modelName: 'implementation_workflow_stage' }));
implementationRouter.use('/work-items', createCrudRouter({ modelName: 'implementation_work_item', searchFields: ['title'] }));
implementationRouter.use('/test-cycles', createCrudRouter({ modelName: 'implementation_test_cycle', searchFields: ['cycle_name'] }));
implementationRouter.use('/gtm-milestones', createCrudRouter({ modelName: 'implementation_gtm_milestone', searchFields: ['milestone_name'] }));
