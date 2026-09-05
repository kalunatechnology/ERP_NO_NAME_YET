import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  status: string;
  tenant_id: string | null;
  company_id: string | null;
  accessible_company_ids: string[];
  roles: string[];
  active_role_code: string | null;
  enabled_modules: string[];
  /** Module codes granted directly to this user by its Company Admin. */
  delegated_modules?: string[];
}

// Augment Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      companyId?: string | null;
      tenantId?: string | null;
      requestId?: string;
      /** Set by entitlement middleware so downstream role checks know whether
       * the request is an explicit Company-Admin delegation. */
      moduleAccess?: { moduleCode: string; delegated: boolean; allowRead: boolean; allowWrite: boolean };
    }
  }
}

export {};
