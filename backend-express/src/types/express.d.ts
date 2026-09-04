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
}

// Augment Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      companyId?: string | null;
      tenantId?: string | null;
      requestId?: string;
    }
  }
}

export {};
