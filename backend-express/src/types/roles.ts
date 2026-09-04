/**
 * File: backend-express/src/types/roles.ts
 *
 * Purpose: Implements application infrastructure responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import { RoleCode as DatabaseRoleCode } from '@prisma/client';

export const RoleCode = DatabaseRoleCode;
export type RoleCode = DatabaseRoleCode;

export const ADMIN_ROLE_CODES = [RoleCode.SUPER_ADMIN, RoleCode.COMPANY_ADMIN] as const;

const EXTERNAL_ROLE_CODES: Record<RoleCode, string> = {
  [RoleCode.SUPER_ADMIN]: 'ROLE-SUPER-ADMIN',
  [RoleCode.COMPANY_ADMIN]: 'ROLE-COMPANY-ADMIN',
  [RoleCode.DIRECTOR]: 'ROLE-DIRECTOR',
  [RoleCode.OPERATIONAL_MANAGER]: 'ROLE-OM',
  [RoleCode.PROJECT_MANAGER]: 'ROLE-PM',
  [RoleCode.SUPERVISOR]: 'ROLE-SUPERVISOR',
  [RoleCode.CRM_LEAD]: 'ROLE-CRM-LEAD',
  [RoleCode.SALES]: 'ROLE-SALES',
  [RoleCode.FINANCE]: 'ROLE-FINANCE',
  [RoleCode.STAFF]: 'ROLE-STAFF',
};

/**
 * toExternalRoleCode implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function toExternalRoleCode(role: RoleCode): string {
  return EXTERNAL_ROLE_CODES[role];
}

/**
 * parseRoleCode implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function parseRoleCode(value: string): RoleCode | null {
  const normalized = value.trim().toUpperCase();
/**
 * match implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const match = (Object.entries(EXTERNAL_ROLE_CODES) as Array<[RoleCode, string]>)
    .find(([internal, external]) => normalized === internal || normalized === external);
  return match?.[0] ?? null;
}

/**
 * hasRole implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function hasRole(roles: readonly string[], role: RoleCode): boolean {
  return roles.includes(role);
}

/**
 * isSuperAdmin implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function isSuperAdmin(roles: readonly string[]): boolean {
  return hasRole(roles, RoleCode.SUPER_ADMIN);
}

/**
 * isCompanyAdmin implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function isCompanyAdmin(roles: readonly string[]): boolean {
  return isSuperAdmin(roles) || hasRole(roles, RoleCode.COMPANY_ADMIN);
}
