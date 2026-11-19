import crypto from 'crypto';
import { DepartmentRoleLevel, Prisma, RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { parseRoleCode } from '../../types/roles';

export type DashboardWidgetCode =
  | 'DASH_PERSONAL'
  | 'DASH_PROJECTS'
  | 'DASH_CRM'
  | 'DASH_FINANCE'
  | 'DASH_INVENTORY'
  | 'DASH_EXECUTIVE';

export interface DashboardWidgetCatalogItem {
  code: DashboardWidgetCode;
  title: string;
  description: string;
  required_module: string | null;
  is_baseline: boolean;
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetCatalogItem[] = [
  {
    code: 'DASH_PERSONAL',
    title: 'Workspace Pribadi (Baseline)',
    description: 'Proyek terkait pribadi, Main Task, Weekly Task, Daily Task, dan pengajuan sendiri.',
    required_module: 'PROJECTS',
    is_baseline: true,
  },
  {
    code: 'DASH_PROJECTS',
    title: 'Portofolio Proyek & WBS Tim',
    description: 'Portofolio proyek perusahaan, WBS manajemen, milestone, dan monitoring tim.',
    required_module: 'PROJECTS',
    is_baseline: false,
  },
  {
    code: 'DASH_CRM',
    title: 'CRM & Sales Pipeline',
    description: 'Pipeline lead, opportunity, quotation, dan performa penjualan.',
    required_module: 'CRM',
    is_baseline: false,
  },
  {
    code: 'DASH_FINANCE',
    title: 'Keuangan, Arus Kas & Anggaran',
    description: 'Ringkasan arus kas, piutang/utang (AR/AP), realisasi anggaran, dan keuangan.',
    required_module: 'FINANCE',
    is_baseline: false,
  },
  {
    code: 'DASH_INVENTORY',
    title: 'Inventori, Gudang & Aset',
    description: 'Status stok gudang, pergerakan barang transit, reservasi, dan aset operasional.',
    required_module: 'INVENTORY',
    is_baseline: false,
  },
  {
    code: 'DASH_EXECUTIVE',
    title: 'Executive 360° & WBS Direksi',
    description: 'Data direksi 360° lintas modul & pemantauan WBS perusahaan lengkap.',
    required_module: 'REPORTING',
    is_baseline: false,
  },
];

export type DataScopeType = 'OWN' | 'TEAM' | 'ALL';

export interface TranslatedModuleGrant {
  module_code: string;
  tier_level: number;
  allow_read: boolean;
  allow_write: boolean;
  data_scope: DataScopeType;
}

export interface LegacyRoleTranslation {
  role_code: RoleCode;
  preset_key: string;
  label: string;
  role_level: DepartmentRoleLevel;
  default_job_title: string;
  modules: TranslatedModuleGrant[];
  dashboard_widgets: DashboardWidgetCode[];
}

export const BASELINE_PROJECTS_GRANT: TranslatedModuleGrant = {
  module_code: 'PROJECTS',
  tier_level: 3,
  allow_read: true,
  allow_write: true,
  data_scope: 'OWN',
};

export const LEGACY_ROLE_TRANSLATION_MAP: Record<string, LegacyRoleTranslation> = {
  'ROLE-STAFF': {
    role_code: RoleCode.STAFF,
    preset_key: 'STAFF_BASELINE',
    label: 'Baseline Staff',
    role_level: 'STAFF',
    default_job_title: 'Staff Operasional',
    modules: [{ ...BASELINE_PROJECTS_GRANT }],
    dashboard_widgets: ['DASH_PERSONAL'],
  },
  STAFF: {
    role_code: RoleCode.STAFF,
    preset_key: 'STAFF_BASELINE',
    label: 'Baseline Staff',
    role_level: 'STAFF',
    default_job_title: 'Staff Operasional',
    modules: [{ ...BASELINE_PROJECTS_GRANT }],
    dashboard_widgets: ['DASH_PERSONAL'],
  },
  'ROLE-SUPERVISOR': {
    role_code: RoleCode.SUPERVISOR,
    preset_key: 'SUPERVISOR',
    label: 'Supervisor Tim',
    role_level: 'SPV',
    default_job_title: 'Supervisor',
    modules: [
      { module_code: 'PROJECTS', tier_level: 2, allow_read: true, allow_write: true, data_scope: 'TEAM' },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_PROJECTS'],
  },
  SUPERVISOR: {
    role_code: RoleCode.SUPERVISOR,
    preset_key: 'SUPERVISOR',
    label: 'Supervisor Tim',
    role_level: 'SPV',
    default_job_title: 'Supervisor',
    modules: [
      { module_code: 'PROJECTS', tier_level: 2, allow_read: true, allow_write: true, data_scope: 'TEAM' },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_PROJECTS'],
  },
  'ROLE-PM': {
    role_code: RoleCode.PROJECT_MANAGER,
    preset_key: 'PROJECT_MANAGER',
    label: 'Project Manager (PM)',
    role_level: 'SPV',
    default_job_title: 'Project Manager',
    modules: [
      { module_code: 'PROJECTS', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'REPORTING', tier_level: 2, allow_read: true, allow_write: false, data_scope: 'ALL' },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_PROJECTS'],
  },
  PROJECT_MANAGER: {
    role_code: RoleCode.PROJECT_MANAGER,
    preset_key: 'PROJECT_MANAGER',
    label: 'Project Manager (PM)',
    role_level: 'SPV',
    default_job_title: 'Project Manager',
    modules: [
      { module_code: 'PROJECTS', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'REPORTING', tier_level: 2, allow_read: true, allow_write: false, data_scope: 'ALL' },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_PROJECTS'],
  },
  'ROLE-FINANCE': {
    role_code: RoleCode.FINANCE,
    preset_key: 'FINANCE',
    label: 'Finance & Accounting',
    role_level: 'SPV',
    default_job_title: 'Finance Officer',
    modules: [
      { module_code: 'FINANCE', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'REPORTING', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { ...BASELINE_PROJECTS_GRANT },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_FINANCE'],
  },
  FINANCE: {
    role_code: RoleCode.FINANCE,
    preset_key: 'FINANCE',
    label: 'Finance & Accounting',
    role_level: 'SPV',
    default_job_title: 'Finance Officer',
    modules: [
      { module_code: 'FINANCE', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'REPORTING', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { ...BASELINE_PROJECTS_GRANT },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_FINANCE'],
  },
  'ROLE-CRM-LEAD': {
    role_code: RoleCode.CRM_LEAD,
    preset_key: 'CRM_LEAD',
    label: 'CRM Lead',
    role_level: 'SPV',
    default_job_title: 'CRM & Sales Lead',
    modules: [
      { module_code: 'CRM', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'SALES', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { ...BASELINE_PROJECTS_GRANT },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_CRM'],
  },
  CRM_LEAD: {
    role_code: RoleCode.CRM_LEAD,
    preset_key: 'CRM_LEAD',
    label: 'CRM Lead',
    role_level: 'SPV',
    default_job_title: 'CRM & Sales Lead',
    modules: [
      { module_code: 'CRM', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'SALES', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { ...BASELINE_PROJECTS_GRANT },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_CRM'],
  },
  'ROLE-SALES': {
    role_code: RoleCode.SALES,
    preset_key: 'SALES',
    label: 'Sales Executive',
    role_level: 'STAFF',
    default_job_title: 'Sales Executive',
    modules: [
      { module_code: 'CRM', tier_level: 3, allow_read: true, allow_write: true, data_scope: 'OWN' },
      { module_code: 'SALES', tier_level: 3, allow_read: true, allow_write: true, data_scope: 'OWN' },
      { ...BASELINE_PROJECTS_GRANT },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_CRM'],
  },
  SALES: {
    role_code: RoleCode.SALES,
    preset_key: 'SALES',
    label: 'Sales Executive',
    role_level: 'STAFF',
    default_job_title: 'Sales Executive',
    modules: [
      { module_code: 'CRM', tier_level: 3, allow_read: true, allow_write: true, data_scope: 'OWN' },
      { module_code: 'SALES', tier_level: 3, allow_read: true, allow_write: true, data_scope: 'OWN' },
      { ...BASELINE_PROJECTS_GRANT },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_CRM'],
  },
  'ROLE-OM': {
    role_code: RoleCode.OPERATIONAL_MANAGER,
    preset_key: 'OPERATIONAL_MANAGER',
    label: 'OM / Inventory Manager',
    role_level: 'GM',
    default_job_title: 'Operational Manager',
    modules: [
      { module_code: 'INVENTORY', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'PROJECTS', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'PROCUREMENT', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'REPORTING', tier_level: 2, allow_read: true, allow_write: false, data_scope: 'ALL' },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_INVENTORY', 'DASH_PROJECTS'],
  },
  OPERATIONAL_MANAGER: {
    role_code: RoleCode.OPERATIONAL_MANAGER,
    preset_key: 'OPERATIONAL_MANAGER',
    label: 'OM / Inventory Manager',
    role_level: 'GM',
    default_job_title: 'Operational Manager',
    modules: [
      { module_code: 'INVENTORY', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'PROJECTS', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'PROCUREMENT', tier_level: 1, allow_read: true, allow_write: true, data_scope: 'ALL' },
      { module_code: 'REPORTING', tier_level: 2, allow_read: true, allow_write: false, data_scope: 'ALL' },
    ],
    dashboard_widgets: ['DASH_PERSONAL', 'DASH_INVENTORY', 'DASH_PROJECTS'],
  },
  'ROLE-DIRECTOR': {
    role_code: RoleCode.DIRECTOR,
    preset_key: 'DIRECTOR_360',
    label: 'Direktur Executive 360°',
    role_level: 'GM',
    default_job_title: 'Director',
    modules: [
      { module_code: 'REPORTING', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'PROJECTS', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'FINANCE', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'CRM', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'INVENTORY', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
    ],
    dashboard_widgets: [
      'DASH_PERSONAL',
      'DASH_EXECUTIVE',
      'DASH_FINANCE',
      'DASH_PROJECTS',
      'DASH_CRM',
      'DASH_INVENTORY',
    ],
  },
  DIRECTOR: {
    role_code: RoleCode.DIRECTOR,
    preset_key: 'DIRECTOR_360',
    label: 'Direktur Executive 360°',
    role_level: 'GM',
    default_job_title: 'Director',
    modules: [
      { module_code: 'REPORTING', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'PROJECTS', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'FINANCE', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'CRM', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
      { module_code: 'INVENTORY', tier_level: 0, allow_read: true, allow_write: false, data_scope: 'ALL' },
    ],
    dashboard_widgets: [
      'DASH_PERSONAL',
      'DASH_EXECUTIVE',
      'DASH_FINANCE',
      'DASH_PROJECTS',
      'DASH_CRM',
      'DASH_INVENTORY',
    ],
  },
};

export const QUICK_ACCESS_PRESETS = [
  LEGACY_ROLE_TRANSLATION_MAP.STAFF,
  LEGACY_ROLE_TRANSLATION_MAP.SUPERVISOR,
  LEGACY_ROLE_TRANSLATION_MAP.PROJECT_MANAGER,
  LEGACY_ROLE_TRANSLATION_MAP.OPERATIONAL_MANAGER,
  LEGACY_ROLE_TRANSLATION_MAP.FINANCE,
  LEGACY_ROLE_TRANSLATION_MAP.CRM_LEAD,
  LEGACY_ROLE_TRANSLATION_MAP.SALES,
  LEGACY_ROLE_TRANSLATION_MAP.DIRECTOR,
];

const SCOPE_RANK: Record<DataScopeType, number> = {
  OWN: 1,
  TEAM: 2,
  ALL: 3,
};

const ROLE_LEVEL_RANK: Record<DepartmentRoleLevel, number> = {
  STAFF: 1,
  SPV: 2,
  GM: 3,
};

const MANAGED_DOMAIN_ROLE_CODES: RoleCode[] = [
  RoleCode.DIRECTOR,
  RoleCode.OPERATIONAL_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.SUPERVISOR,
  RoleCode.FINANCE,
  RoleCode.CRM_LEAD,
  RoleCode.SALES,
  RoleCode.STAFF,
];

export interface MergedRoleTranslationResult {
  role_level: DepartmentRoleLevel;
  modules: TranslatedModuleGrant[];
  dashboard_widgets: DashboardWidgetCode[];
}

/**
 * Union + Strongest-Tier Wins across multiple role codes.
 * Always preserves baseline PROJECTS (Tier 3, OWN) + DASH_PERSONAL so Weekly & Daily Tasks remain accessible.
 */
export function mergeLegacyRoleTranslations(roleCodes: Array<string | RoleCode>): MergedRoleTranslationResult {
  const moduleMap = new Map<string, TranslatedModuleGrant>();
  const widgetSet = new Set<DashboardWidgetCode>(['DASH_PERSONAL']);
  let bestRoleLevel: DepartmentRoleLevel = 'STAFF';

  const upsertGrant = (grant: TranslatedModuleGrant) => {
    const code = grant.module_code.toUpperCase();
    const existing = moduleMap.get(code);
    if (!existing) {
      moduleMap.set(code, { ...grant, module_code: code });
      return;
    }
    const winningTier = Math.min(existing.tier_level, grant.tier_level);
    const winningScope =
      SCOPE_RANK[grant.data_scope] > SCOPE_RANK[existing.data_scope]
        ? grant.data_scope
        : existing.data_scope;
    moduleMap.set(code, {
      module_code: code,
      tier_level: winningTier,
      allow_read: existing.allow_read || grant.allow_read,
      allow_write: existing.allow_write || grant.allow_write,
      data_scope: winningScope,
    });
  };

  for (const rawCode of roleCodes) {
    const key = String(rawCode || '').trim().toUpperCase();
    if (!key) continue;
    if (key === 'COMPANY_ADMIN' || key === 'ROLE-COMPANY-ADMIN' || key === 'SUPER_ADMIN' || key === 'ROLE-SUPER-ADMIN') {
      if (ROLE_LEVEL_RANK.GM > ROLE_LEVEL_RANK[bestRoleLevel]) {
        bestRoleLevel = 'GM';
      }
      continue;
    }
    const spec = LEGACY_ROLE_TRANSLATION_MAP[key];
    if (!spec) continue;
    if (ROLE_LEVEL_RANK[spec.role_level] > ROLE_LEVEL_RANK[bestRoleLevel]) {
      bestRoleLevel = spec.role_level;
    }
    for (const mod of spec.modules) {
      upsertGrant(mod);
    }
    for (const w of spec.dashboard_widgets) {
      widgetSet.add(w);
    }
  }

  // Always enforce baseline PROJECTS so Weekly & Daily Task projection never breaks
  upsertGrant(BASELINE_PROJECTS_GRANT);

  return {
    role_level: bestRoleLevel,
    modules: Array.from(moduleMap.values()),
    dashboard_widgets: Array.from(widgetSet),
  };
}

export function deterministicUuid(seed: string): string {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Derives compatibility RoleCodes from active module grants + dashboard widgets + role_level.
 * Note: PROJECTS Tier 3 OWN maps to ROLE-STAFF (never ROLE-PM).
 */
export function deriveManagedRoleCodes(params: {
  modules: TranslatedModuleGrant[];
  dashboardWidgets: string[];
  roleLevel?: DepartmentRoleLevel | string | null;
}): RoleCode[] {
  const derived = new Set<RoleCode>();
  const widgetSet = new Set(params.dashboardWidgets.map((w) => String(w).toUpperCase()));
  const activeModules = params.modules.filter((m) => m.allow_read);

  if (widgetSet.has('DASH_EXECUTIVE')) {
    derived.add(RoleCode.DIRECTOR);
  }

  for (const mod of activeModules) {
    const code = mod.module_code.toUpperCase();
    if (code === 'REPORTING' && mod.tier_level === 0) {
      derived.add(RoleCode.DIRECTOR);
    } else if (code === 'FINANCE') {
      if (mod.allow_write || mod.tier_level <= 2) {
        derived.add(RoleCode.FINANCE);
      }
    } else if (code === 'INVENTORY' || code === 'PROCUREMENT') {
      if (mod.allow_write || mod.tier_level <= 2) {
        derived.add(RoleCode.OPERATIONAL_MANAGER);
      }
    } else if (code === 'CRM' || code === 'SALES') {
      if (mod.tier_level <= 2 && mod.data_scope === 'ALL') {
        derived.add(RoleCode.CRM_LEAD);
      } else if (mod.allow_write) {
        derived.add(RoleCode.SALES);
      }
    } else if (code === 'PROJECTS') {
      if (mod.tier_level === 1 && mod.allow_write) {
        derived.add(RoleCode.PROJECT_MANAGER);
      } else if (mod.tier_level === 2) {
        derived.add(RoleCode.SUPERVISOR);
      } else {
        derived.add(RoleCode.STAFF);
      }
    }
  }

  if (String(params.roleLevel || '').toUpperCase() === 'SPV' && !derived.has(RoleCode.PROJECT_MANAGER)) {
    derived.add(RoleCode.SUPERVISOR);
  }

  if (derived.size === 0) {
    derived.add(RoleCode.STAFF);
  }

  return Array.from(derived);
}

export async function getUserQuickAccess(companyId: string, userId: string) {
  const membership = await prisma.iam_user_company_membership.findFirst({
    where: { company_id: companyId, user_id: userId, status: 'ACTIVE' },
  });
  if (!membership) {
    throw new NotFoundError('User tidak ditemukan pada company aktif.');
  }

  const [user, orgMemberships, moduleAssignments, moduleAccessRows, dashboardRows, userRoleRows] =
    await Promise.all([
      prisma.iam_user.findUnique({
        where: { id: userId },
        include: { department: true },
      }),
      prisma.core_user_org_membership.findMany({
        where: { company_id: companyId, user_id: userId, is_active: true },
        include: { department: true },
        orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      }),
      prisma.iam_user_module_assignment.findMany({
        where: { company_id: companyId, user_id: userId, status: 'ACTIVE' },
      }),
      prisma.iam_user_module_access.findMany({
        where: { company_id: companyId, user_id: userId },
      }),
      prisma.iam_user_dashboard_access.findMany({
        where: { company_id: companyId, user_id: userId },
      }),
      prisma.iam_user_role.findMany({
        where: { user_id: userId, OR: [{ company_id: companyId }, { company_id: null }] },
      }),
    ]);

  if (!user) {
    throw new NotFoundError('Data user tidak ditemukan.');
  }

  const roleIds = userRoleRows.map((r) => r.role_id).filter((id): id is string => Boolean(id));
  const roles = roleIds.length
    ? await prisma.iam_role.findMany({ where: { id: { in: roleIds } } })
    : [];
  const roleCodes = roles
    .map((r) => parseRoleCode(r.role_code))
    .filter((c): c is RoleCode => c !== null);

  const fallbackMerged = mergeLegacyRoleTranslations(roleCodes);

  let enabledWidgets: DashboardWidgetCode[];
  if (dashboardRows.length > 0) {
    const set = new Set<DashboardWidgetCode>(['DASH_PERSONAL']);
    for (const row of dashboardRows) {
      if (row.is_enabled) {
        set.add(row.widget_code as DashboardWidgetCode);
      }
    }
    enabledWidgets = Array.from(set);
  } else {
    enabledWidgets = fallbackMerged.dashboard_widgets;
  }

  const effectiveModules: TranslatedModuleGrant[] =
    moduleAssignments.length > 0
      ? moduleAssignments.map((ma) => {
          const override = moduleAccessRows.find(
            (r) => r.module_code.toUpperCase() === ma.module_code.toUpperCase()
          );
          return {
            module_code: ma.module_code.toUpperCase(),
            tier_level: ma.tier_level,
            allow_read: override ? override.allow_read : true,
            allow_write: override ? override.allow_write : ma.tier_level > 0,
            data_scope: (ma.data_scope?.toUpperCase() as DataScopeType) || 'OWN',
          };
        })
      : fallbackMerged.modules;

  // Ensure baseline PROJECTS is always represented
  if (!effectiveModules.some((m) => m.module_code === 'PROJECTS')) {
    effectiveModules.push({ ...BASELINE_PROJECTS_GRANT });
  }

  const isLegacyTransition =
    moduleAssignments.length === 0 &&
    roleCodes.some(
      (c) =>
        c !== RoleCode.STAFF &&
        c !== RoleCode.COMPANY_ADMIN &&
        c !== RoleCode.SUPER_ADMIN
    );

  const effectiveRoleLevel =
    isLegacyTransition && (!user.role_level || user.role_level === 'STAFF')
      ? fallbackMerged.role_level
      : user.role_level;

  const inferredLegacyJobTitle =
    roleCodes
      .filter((c) => c !== RoleCode.STAFF && c !== RoleCode.COMPANY_ADMIN && c !== RoleCode.SUPER_ADMIN)
      .map((c) => LEGACY_ROLE_TRANSLATION_MAP[c]?.default_job_title)
      .find(Boolean) || '';

  const effectiveJobTitle =
    isLegacyTransition && (!user.job_title || !user.job_title.trim())
      ? inferredLegacyJobTitle
      : user.job_title ?? '';

  return {
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      department_id: user.department_id,
      department_name: user.department?.name ?? null,
      role_level: effectiveRoleLevel,
      reports_to_user_id: user.reports_to_user_id ?? null,
      job_title: effectiveJobTitle,
      active_role_id: user.active_role_id,
    },
    is_legacy_transition: isLegacyTransition,
    legacy_roles: roleCodes,
    roles: roleCodes,
    org_memberships: orgMemberships,
    modules: effectiveModules,
    dashboard_widgets: enabledWidgets,
    catalog: DASHBOARD_WIDGET_CATALOG,
    presets: QUICK_ACCESS_PRESETS,
  };
}

export interface SyncUserQuickAccessInput {
  companyId: string;
  tenantId?: string | null;
  actorId?: string | null;
  userId: string;
  departmentId?: string | null;
  roleLevel?: DepartmentRoleLevel | 'GM' | 'SPV' | 'STAFF';
  reportsToUserId?: string | null;
  jobTitle?: string;
  presetKey?: string | null;
  modules?: Array<{
    module_code: string;
    tier_level?: number;
    allow_read?: boolean;
    allow_write?: boolean;
    data_scope?: DataScopeType | string;
    enabled?: boolean;
  }>;
  dashboardWidgets?: string[];
  reason?: string;
}

export async function syncUserQuickAccess(input: SyncUserQuickAccessInput) {
  const { companyId, userId, actorId } = input;

  if (input.reportsToUserId && input.reportsToUserId === userId) {
    throw new ValidationError('Atasan langsung (reports_to_user_id) tidak boleh menunjuk ke diri sendiri.');
  }

  await prisma.$transaction(async (tx) => {
    const membership = await tx.iam_user_company_membership.findFirst({
      where: { company_id: companyId, user_id: userId, status: 'ACTIVE' },
    });
    if (!membership) {
      throw new ForbiddenError('User bukan anggota aktif dari company ini.');
    }

    const tenantId = input.tenantId || membership.tenant_id;
    const existingUser = await tx.iam_user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new NotFoundError('User tidak ditemukan.');
    }

    if (input.reportsToUserId) {
      const managerMembership = await tx.iam_user_company_membership.findFirst({
        where: { company_id: companyId, user_id: input.reportsToUserId, status: 'ACTIVE' },
      });
      if (!managerMembership) {
        throw new ValidationError('Atasan langsung harus berada pada company yang sama.');
      }
    }

    let targetDepartmentId: string | null =
      input.departmentId !== undefined ? input.departmentId || null : existingUser.department_id;
    let targetDepartmentCode: string | null = null;
    if (targetDepartmentId) {
      const dept = await tx.core_department.findFirst({
        where: { id: targetDepartmentId, company_id: companyId },
      });
      if (!dept) {
        throw new ValidationError('Unit/Departemen tidak ditemukan pada company ini.');
      }
      targetDepartmentCode = dept.code;
    }

    // Snapshot before state
    const existingRoleRows = await tx.iam_user_role.findMany({
      where: { user_id: userId, OR: [{ company_id: companyId }, { company_id: null }] },
    });
    const allCompanyRoles = await tx.iam_role.findMany({
      where: { OR: [{ tenant_id: tenantId }, { tenant_id: null }] },
    });
    const roleById = new Map(allCompanyRoles.map((r) => [r.id, r]));
    const beforeRoleCodes = existingRoleRows
      .map((ur) => (ur.role_id ? roleById.get(ur.role_id)?.role_code : null))
      .filter(Boolean);

    // Resolve preset if presetKey was provided
    const presetSpec = input.presetKey
      ? QUICK_ACCESS_PRESETS.find((p) => p.preset_key === input.presetKey) ||
        LEGACY_ROLE_TRANSLATION_MAP[input.presetKey]
      : undefined;

    const resolvedRoleLevel: DepartmentRoleLevel =
      (input.roleLevel as DepartmentRoleLevel) ||
      presetSpec?.role_level ||
      existingUser.role_level ||
      'STAFF';

    const resolvedJobTitle =
      input.jobTitle !== undefined
        ? String(input.jobTitle).trim()
        : presetSpec?.default_job_title || existingUser.job_title || '';

    const resolvedReportsTo =
      input.reportsToUserId !== undefined
        ? input.reportsToUserId || null
        : existingUser.reports_to_user_id || null;

    // 1. Update iam_user
    await tx.iam_user.update({
      where: { id: userId },
      data: {
        department_id: targetDepartmentId,
        role_level: resolvedRoleLevel,
        reports_to_user_id: resolvedReportsTo,
        job_title: resolvedJobTitle,
      },
    });

    // 2. Upsert core_user_org_membership & sync master_employee
    if (targetDepartmentId) {
      await tx.core_user_org_membership.updateMany({
        where: { company_id: companyId, user_id: userId, department_id: { not: targetDepartmentId } },
        data: { is_primary: false },
      });
      await tx.core_user_org_membership.upsert({
        where: {
          company_id_user_id_department_id: {
            company_id: companyId,
            user_id: userId,
            department_id: targetDepartmentId,
          },
        },
        update: {
          unit_role: resolvedRoleLevel,
          is_primary: true,
          is_active: true,
        },
        create: {
          id: deterministicUuid(`org-mem:${companyId}:${userId}:${targetDepartmentId}`),
          company_id: companyId,
          user_id: userId,
          department_id: targetDepartmentId,
          unit_role: resolvedRoleLevel,
          is_primary: true,
          allocation_pct: new Prisma.Decimal(100),
          is_active: true,
        },
      });

      // Sync master_employee if linked by email or user_id
      const masterDept = targetDepartmentCode
        ? await tx.master_department.findFirst({
            where: { company_id: companyId, department_code: targetDepartmentCode },
          })
        : null;
      const masterCc = targetDepartmentCode
        ? await tx.master_cost_center.findFirst({
            where: { company_id: companyId, cost_center_code: `CC-${targetDepartmentCode}` },
          })
        : null;
      if (masterDept || masterCc) {
        await tx.master_employee.updateMany({
          where: {
            company_id: companyId,
            user_id: userId,
          },
          data: {
            ...(masterDept ? { department_id: masterDept.id } : {}),
            ...(masterCc ? { cost_center_id: masterCc.id } : {}),
          },
        });
      }
    }

    // 3. Resolve dashboard widgets (DASH_PERSONAL is always enabled)
    const rawWidgets =
      input.dashboardWidgets !== undefined
        ? input.dashboardWidgets
        : presetSpec
        ? presetSpec.dashboard_widgets
        : ['DASH_PERSONAL'];
    const enabledWidgetSet = new Set<string>(['DASH_PERSONAL']);
    for (const w of rawWidgets) {
      const upper = String(w || '').trim().toUpperCase();
      if (DASHBOARD_WIDGET_CATALOG.some((item) => item.code === upper)) {
        enabledWidgetSet.add(upper);
      }
    }

    for (const item of DASHBOARD_WIDGET_CATALOG) {
      const isEnabled = item.code === 'DASH_PERSONAL' ? true : enabledWidgetSet.has(item.code);
      await tx.iam_user_dashboard_access.upsert({
        where: {
          company_id_user_id_widget_code: {
            company_id: companyId,
            user_id: userId,
            widget_code: item.code,
          },
        },
        update: {
          is_enabled: isEnabled,
          granted_by_id: actorId || null,
        },
        create: {
          id: deterministicUuid(`dash-acc:${companyId}:${userId}:${item.code}`),
          tenant_id: tenantId,
          company_id: companyId,
          user_id: userId,
          widget_code: item.code,
          is_enabled: isEnabled,
          granted_by_id: actorId || null,
        },
      });
    }

    // 4. Resolve module grants (always keep PROJECTS baseline active)
    const moduleGrantMap = new Map<string, TranslatedModuleGrant>();
    if (input.modules && input.modules.length > 0) {
      for (const m of input.modules) {
        const code = String(m.module_code || '').trim().toUpperCase();
        if (!code) continue;
        const enabled = m.enabled !== undefined ? Boolean(m.enabled) : Boolean(m.allow_read ?? true);
        if (!enabled && code !== 'PROJECTS') continue;
        const tier = typeof m.tier_level === 'number' ? m.tier_level : 3;
        moduleGrantMap.set(code, {
          module_code: code,
          tier_level: tier,
          allow_read: code === 'PROJECTS' ? true : Boolean(m.allow_read ?? true),
          allow_write:
            m.allow_write !== undefined
              ? Boolean(m.allow_write)
              : code === 'PROJECTS'
              ? true
              : tier > 0,
          data_scope: ((m.data_scope || (tier <= 1 ? 'ALL' : tier === 2 ? 'TEAM' : 'OWN'))
            .toString()
            .toUpperCase() as DataScopeType),
        });
      }
    } else if (presetSpec) {
      for (const m of presetSpec.modules) {
        moduleGrantMap.set(m.module_code, { ...m });
      }
    }

    // Guarantee baseline PROJECTS grant
    if (!moduleGrantMap.has('PROJECTS')) {
      moduleGrantMap.set('PROJECTS', { ...BASELINE_PROJECTS_GRANT });
    }
    // If a dashboard widget requires a module, ensure at least read access on that module
    for (const item of DASHBOARD_WIDGET_CATALOG) {
      if (enabledWidgetSet.has(item.code) && item.required_module) {
        const reqMod = item.required_module.toUpperCase();
        if (!moduleGrantMap.has(reqMod)) {
          const isExecOnly = item.code === 'DASH_EXECUTIVE';
          moduleGrantMap.set(reqMod, {
            module_code: reqMod,
            tier_level: isExecOnly ? 0 : 1,
            allow_read: true,
            allow_write: !isExecOnly,
            data_scope: 'ALL',
          });
        }
        if (reqMod === 'CRM' && !moduleGrantMap.has('SALES')) {
          const crmGrant = moduleGrantMap.get('CRM')!;
          moduleGrantMap.set('SALES', { ...crmGrant, module_code: 'SALES' });
        }
      }
    }

    const ALL_KNOWN_MODULES = ['PROJECTS', 'FINANCE', 'CRM', 'SALES', 'INVENTORY', 'PROCUREMENT', 'REPORTING'];
    for (const modCode of ALL_KNOWN_MODULES) {
      const grant = moduleGrantMap.get(modCode);
      if (grant) {
        await tx.iam_user_module_access.upsert({
          where: { user_id_module_code: { user_id: userId, module_code: modCode } },
          update: {
            company_id: companyId,
            tenant_id: tenantId,
            allow_read: grant.allow_read,
            allow_write: grant.allow_write,
            granted_by_id: actorId || null,
          },
          create: {
            id: deterministicUuid(`mod-acc:${userId}:${modCode}`),
            tenant_id: tenantId,
            company_id: companyId,
            user_id: userId,
            module_code: modCode,
            allow_read: grant.allow_read,
            allow_write: grant.allow_write,
            granted_by_id: actorId || null,
          },
        });

        await tx.iam_user_module_assignment.upsert({
          where: {
            company_id_user_id_module_code: {
              company_id: companyId,
              user_id: userId,
              module_code: modCode,
            },
          },
          update: {
            tier_level: grant.tier_level,
            position_title: resolvedJobTitle,
            department_id: targetDepartmentId,
            reports_to_user_id: resolvedReportsTo,
            data_scope: grant.data_scope,
            status: 'ACTIVE',
          },
          create: {
            id: deterministicUuid(`mod-asg:${companyId}:${userId}:${modCode}`),
            tenant_id: tenantId,
            company_id: companyId,
            user_id: userId,
            module_code: modCode,
            tier_level: grant.tier_level,
            position_title: resolvedJobTitle,
            department_id: targetDepartmentId,
            reports_to_user_id: resolvedReportsTo,
            data_scope: grant.data_scope,
            is_primary: modCode === 'PROJECTS',
            status: 'ACTIVE',
            created_by_id: actorId || null,
          },
        });
      } else {
        await tx.iam_user_module_access.updateMany({
          where: { company_id: companyId, user_id: userId, module_code: modCode },
          data: { allow_read: false, allow_write: false },
        });
        await tx.iam_user_module_assignment.updateMany({
          where: { company_id: companyId, user_id: userId, module_code: modCode },
          data: { status: 'INACTIVE' },
        });
      }
    }

    // 5. Full Reconcile & Prune iam_user_role (protect COMPANY_ADMIN & SUPER_ADMIN)
    const activeGrants = Array.from(moduleGrantMap.values());
    const derivedRoleCodes = deriveManagedRoleCodes({
      modules: activeGrants,
      dashboardWidgets: Array.from(enabledWidgetSet),
      roleLevel: resolvedRoleLevel,
    });
    const derivedSet = new Set<RoleCode>(derivedRoleCodes);

    // Map RoleCode -> best iam_role record for this tenant
    const roleRecordByCode = new Map<RoleCode, { id: string; role_code: RoleCode }>();
    for (const r of allCompanyRoles) {
      const parsed = parseRoleCode(r.role_code);
      if (!parsed) continue;
      const existing = roleRecordByCode.get(parsed);
      if (!existing || r.tenant_id === tenantId) {
        roleRecordByCode.set(parsed, { id: r.id, role_code: parsed });
      }
    }

    const existingRoleCodeSet = new Set<RoleCode>();
    const roleRowsToDelete: string[] = [];
    const protectedRoleIds = new Set<string>();

    for (const ur of existingRoleRows) {
      const roleObj = ur.role_id ? roleById.get(ur.role_id) : undefined;
      const parsed = roleObj ? parseRoleCode(roleObj.role_code) : null;
      if (!parsed) continue;

      if (parsed === RoleCode.COMPANY_ADMIN || parsed === RoleCode.SUPER_ADMIN) {
        protectedRoleIds.add(ur.role_id!);
        existingRoleCodeSet.add(parsed);
        continue;
      }

      if (MANAGED_DOMAIN_ROLE_CODES.includes(parsed) && !derivedSet.has(parsed)) {
        roleRowsToDelete.push(ur.id);
      } else {
        existingRoleCodeSet.add(parsed);
      }
    }

    if (roleRowsToDelete.length > 0) {
      await tx.iam_user_role.deleteMany({
        where: { id: { in: roleRowsToDelete } },
      });
    }

    for (const code of derivedRoleCodes) {
      if (!existingRoleCodeSet.has(code)) {
        const targetRole = roleRecordByCode.get(code);
        if (targetRole) {
          await tx.iam_user_role.create({
            data: {
              id: deterministicUuid(`user-role:${companyId}:${userId}:${targetRole.id}:${Date.now()}`),
              tenant_id: tenantId,
              company_id: companyId,
              user_id: userId,
              role_id: targetRole.id,
              created_by_id: actorId || null,
            },
          });
        }
      }
    }

    // Reconcile active_role_id if previous active role was pruned
    const remainingRoleCodes = new Set<RoleCode>([
      ...Array.from(existingRoleCodeSet).filter((c) =>
        c === RoleCode.COMPANY_ADMIN || c === RoleCode.SUPER_ADMIN || derivedSet.has(c)
      ),
      ...derivedRoleCodes,
    ]);
    const currentActiveRoleObj = existingUser.active_role_id
      ? roleById.get(existingUser.active_role_id)
      : undefined;
    const currentActiveParsed = currentActiveRoleObj
      ? parseRoleCode(currentActiveRoleObj.role_code)
      : null;

    if (!currentActiveParsed || !remainingRoleCodes.has(currentActiveParsed)) {
      const preferredOrder: RoleCode[] = [
        RoleCode.COMPANY_ADMIN,
        RoleCode.DIRECTOR,
        RoleCode.OPERATIONAL_MANAGER,
        RoleCode.PROJECT_MANAGER,
        RoleCode.FINANCE,
        RoleCode.CRM_LEAD,
        RoleCode.SUPERVISOR,
        RoleCode.SALES,
        RoleCode.STAFF,
      ];
      const nextPrimaryCode =
        preferredOrder.find((c) => remainingRoleCodes.has(c)) || derivedRoleCodes[0] || RoleCode.STAFF;
      const nextRoleRec = roleRecordByCode.get(nextPrimaryCode);
      if (nextRoleRec) {
        await tx.iam_user.update({
          where: { id: userId },
          data: { active_role_id: nextRoleRec.id },
        });
      }
    }

    // 6. Audit log to iam_assignment_history
    await tx.iam_assignment_history.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        actor_id: actorId || null,
        target_user_id: userId,
        module_code: 'QUICK_ACCESS',
        change_type: 'QUICK_ACCESS_SYNC',
        before_json: JSON.stringify({
          department_id: existingUser.department_id,
          role_level: existingUser.role_level,
          reports_to_user_id: existingUser.reports_to_user_id,
          job_title: existingUser.job_title,
          roles: beforeRoleCodes,
        }),
        after_json: JSON.stringify({
          department_id: targetDepartmentId,
          role_level: resolvedRoleLevel,
          reports_to_user_id: resolvedReportsTo,
          job_title: resolvedJobTitle,
          modules: activeGrants,
          dashboard_widgets: Array.from(enabledWidgetSet),
          roles: Array.from(remainingRoleCodes),
        }),
        reason: input.reason || 'Quick Access sync by Company Admin',
      },
    });
  });

  return getUserQuickAccess(companyId, userId);
}
