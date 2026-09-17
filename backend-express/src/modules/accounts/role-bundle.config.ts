import { RoleCode } from '../../types/roles';

export interface RoleBundleDefinition {
  label: string;
  requiredModules: string[];
}

export const ROLE_BUNDLES: Partial<Record<RoleCode, RoleBundleDefinition>> = {
  [RoleCode.FINANCE]: {
    label: 'Finance',
    requiredModules: [
      'FINANCE',
      'REPORTING',
    ],
  },

  [RoleCode.OPERATIONAL_MANAGER]: {
    label: 'Operational Manager',
    requiredModules: [
      'PROJECTS',
      'REPORTING',
      'REQUESTS',
    ],
  },

  [RoleCode.PROJECT_MANAGER]: {
    label: 'Project Manager',
    requiredModules: [
      'PROJECTS',
      'REPORTING',
    ],
  },

  [RoleCode.SUPERVISOR]: {
    label: 'Supervisor',
    requiredModules: [
      'PROJECTS',
      'REPORTING',
    ],
  },

  [RoleCode.STAFF]: {
    label: 'Staff',
    requiredModules: [
      'PROJECTS',
      'REPORTING',
    ],
  },

  [RoleCode.CRM_LEAD]: {
    label: 'CRM Lead',
    requiredModules: [
      'CRM',
      'SALES',
      'REPORTING',
    ],
  },

  [RoleCode.SALES]: {
    label: 'Sales',
    requiredModules: [
      'CRM',
      'SALES',
      'REPORTING',
    ],
  },

  [RoleCode.DIRECTOR]: {
    label: 'Director',
    requiredModules: [
      'PROJECTS',
      'FINANCE',
      'CRM',
      'REPORTING',
    ],
  },
};
