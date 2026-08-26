import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  status: string;
  tenant_id: string | null;
  roles: string[];
}

// Augment Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      companyId?: string | null;
      tenantId?: string | null;
    }
  }
}

export {};
