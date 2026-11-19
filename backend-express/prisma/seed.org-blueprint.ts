import prisma from '../src/config/database';
import {
  BASELINE_PROJECTS_GRANT,
  DASHBOARD_WIDGET_CATALOG,
  deterministicUuid,
} from '../src/modules/accounts/org-policy-sync.service';

interface OrgBlueprintNode {
  code: string;
  name: string;
  unit_type: 'DIRECTORATE' | 'DEPARTMENT' | 'DIVISION';
  parent_code: string | null;
  hierarchy_level: number;
  materialized_path: string;
  description: string;
  modules: Array<{
    module_key: string;
    can_read: boolean;
    can_write: boolean;
    can_approve: boolean;
    default_role_code: string | null;
  }>;
}

const ORG_BLUEPRINT_NODES: OrgBlueprintNode[] = [
  {
    code: 'DIR-EXEC',
    name: 'Direktorat Eksekutif',
    unit_type: 'DIRECTORATE',
    parent_code: null,
    hierarchy_level: 1,
    materialized_path: '/DIR-EXEC/',
    description: 'Direktorat Eksekutif & Pemantauan Strategis 360°',
    modules: [
      { module_key: 'REPORTING', can_read: true, can_write: false, can_approve: true, default_role_code: 'DIRECTOR' },
      { module_key: 'PROJECTS', can_read: true, can_write: false, can_approve: true, default_role_code: 'DIRECTOR' },
    ],
  },
  {
    code: 'OPS',
    name: 'Departemen Operasional & Proyek',
    unit_type: 'DEPARTMENT',
    parent_code: 'DIR-EXEC',
    hierarchy_level: 2,
    materialized_path: '/DIR-EXEC/OPS/',
    description: 'Departemen Eksekusi Proyek, Gudang, dan Pengadaan Operasional',
    modules: [
      { module_key: 'PROJECTS', can_read: true, can_write: true, can_approve: true, default_role_code: 'OPERATIONAL_MANAGER' },
      { module_key: 'INVENTORY', can_read: true, can_write: true, can_approve: true, default_role_code: 'OPERATIONAL_MANAGER' },
      { module_key: 'PROCUREMENT', can_read: true, can_write: true, can_approve: true, default_role_code: 'OPERATIONAL_MANAGER' },
    ],
  },
  {
    code: 'OPS-PROJ',
    name: 'Divisi Manajemen Proyek (PMO)',
    unit_type: 'DIVISION',
    parent_code: 'OPS',
    hierarchy_level: 3,
    materialized_path: '/DIR-EXEC/OPS/OPS-PROJ/',
    description: 'Divisi Perencanaan WBS, Eksekusi Proyek, dan Pengendalian Milestone',
    modules: [
      { module_key: 'PROJECTS', can_read: true, can_write: true, can_approve: true, default_role_code: 'PROJECT_MANAGER' },
      { module_key: 'REPORTING', can_read: true, can_write: false, can_approve: false, default_role_code: 'PROJECT_MANAGER' },
    ],
  },
  {
    code: 'OPS-INV',
    name: 'Divisi Gudang, Inventori & Aset',
    unit_type: 'DIVISION',
    parent_code: 'OPS',
    hierarchy_level: 3,
    materialized_path: '/DIR-EXEC/OPS/OPS-INV/',
    description: 'Divisi Pengelolaan Gudang, Mutasi Stok, Transit, dan Kapitalisasi Aset',
    modules: [
      { module_key: 'INVENTORY', can_read: true, can_write: true, can_approve: true, default_role_code: 'OPERATIONAL_MANAGER' },
      { module_key: 'PROJECTS', can_read: true, can_write: true, can_approve: false, default_role_code: 'STAFF' },
    ],
  },
  {
    code: 'FIN',
    name: 'Departemen Finance & Accounting',
    unit_type: 'DEPARTMENT',
    parent_code: 'DIR-EXEC',
    hierarchy_level: 2,
    materialized_path: '/DIR-EXEC/FIN/',
    description: 'Departemen Keuangan, Akuntansi Buku Besar, Pajak, dan Pengendalian Anggaran',
    modules: [
      { module_key: 'FINANCE', can_read: true, can_write: true, can_approve: true, default_role_code: 'FINANCE' },
      { module_key: 'REPORTING', can_read: true, can_write: true, can_approve: true, default_role_code: 'FINANCE' },
      { module_key: 'PROJECTS', can_read: true, can_write: true, can_approve: false, default_role_code: 'STAFF' },
    ],
  },
  {
    code: 'SALES',
    name: 'Departemen Commercial, CRM & Sales',
    unit_type: 'DEPARTMENT',
    parent_code: 'DIR-EXEC',
    hierarchy_level: 2,
    materialized_path: '/DIR-EXEC/SALES/',
    description: 'Departemen Penjualan, Pipeline CRM, Quotation, dan Kemitraan Pelanggan',
    modules: [
      { module_key: 'CRM', can_read: true, can_write: true, can_approve: true, default_role_code: 'CRM_LEAD' },
      { module_key: 'SALES', can_read: true, can_write: true, can_approve: true, default_role_code: 'CRM_LEAD' },
      { module_key: 'PROJECTS', can_read: true, can_write: true, can_approve: false, default_role_code: 'STAFF' },
    ],
  },
];

async function seedOrgBlueprint() {
  console.log('[seed:org-blueprint] Starting N-level org blueprint & baseline dashboard seed...');
  const companies = await prisma.core_company.findMany({
    where: { status: 'ACTIVE' },
  });

  for (const company of companies) {
    const companyId = company.id;
    const tenantId = company.tenant_id;
    const deptIdByCode = new Map<string, string>();

    for (const node of ORG_BLUEPRINT_NODES) {
      const parentId = node.parent_code ? deptIdByCode.get(node.parent_code) ?? null : null;
      const detId = deterministicUuid(`org-blueprint:${companyId}:${node.code}`);

      const dept = await prisma.core_department.upsert({
        where: { company_id_code: { company_id: companyId, code: node.code } },
        update: {
          parent_id: parentId,
          unit_type: node.unit_type,
          hierarchy_level: node.hierarchy_level,
          materialized_path: node.materialized_path,
          description: node.description,
          is_active: true,
        },
        create: {
          id: detId,
          tenant_id: tenantId,
          company_id: companyId,
          parent_id: parentId,
          unit_type: node.unit_type,
          code: node.code,
          name: node.name,
          description: node.description,
          hierarchy_level: node.hierarchy_level,
          materialized_path: node.materialized_path,
          is_cost_center: true,
          is_active: true,
        },
      });

      deptIdByCode.set(node.code, dept.id);

      for (const mod of node.modules) {
        await prisma.core_department_module_access.upsert({
          where: {
            department_id_module_key: {
              department_id: dept.id,
              module_key: mod.module_key,
            },
          },
          update: {
            can_read: mod.can_read,
            can_write: mod.can_write,
            can_approve: mod.can_approve,
            default_role_code: mod.default_role_code,
          },
          create: {
            id: deterministicUuid(`dept-mod:${dept.id}:${mod.module_key}`),
            company_id: companyId,
            department_id: dept.id,
            module_key: mod.module_key,
            can_read: mod.can_read,
            can_write: mod.can_write,
            can_approve: mod.can_approve,
            default_role_code: mod.default_role_code,
          },
        });
      }
    }

    // Ensure all active users in this company have baseline DASH_PERSONAL and PROJECTS (Tier 3, OWN)
    const memberships = await prisma.iam_user_company_membership.findMany({
      where: { company_id: companyId, status: 'ACTIVE' },
    });

    for (const mem of memberships) {
      await prisma.iam_user_dashboard_access.upsert({
        where: {
          company_id_user_id_widget_code: {
            company_id: companyId,
            user_id: mem.user_id,
            widget_code: 'DASH_PERSONAL',
          },
        },
        update: { is_enabled: true },
        create: {
          id: deterministicUuid(`dash-acc:${companyId}:${mem.user_id}:DASH_PERSONAL`),
          tenant_id: tenantId,
          company_id: companyId,
          user_id: mem.user_id,
          widget_code: 'DASH_PERSONAL',
          is_enabled: true,
        },
      });

      for (const item of DASHBOARD_WIDGET_CATALOG) {
        if (item.code === 'DASH_PERSONAL') continue;
        const existingWidget = await prisma.iam_user_dashboard_access.findUnique({
          where: {
            company_id_user_id_widget_code: {
              company_id: companyId,
              user_id: mem.user_id,
              widget_code: item.code,
            },
          },
        });
        if (!existingWidget) {
          await prisma.iam_user_dashboard_access.create({
            data: {
              id: deterministicUuid(`dash-acc:${companyId}:${mem.user_id}:${item.code}`),
              tenant_id: tenantId,
              company_id: companyId,
              user_id: mem.user_id,
              widget_code: item.code,
              is_enabled: false,
            },
          });
        }
      }

      const existingProjAssign = await prisma.iam_user_module_assignment.findUnique({
        where: {
          company_id_user_id_module_code: {
            company_id: companyId,
            user_id: mem.user_id,
            module_code: 'PROJECTS',
          },
        },
      });
      if (!existingProjAssign) {
        await prisma.iam_user_module_assignment.create({
          data: {
            id: deterministicUuid(`mod-asg:${companyId}:${mem.user_id}:PROJECTS`),
            tenant_id: tenantId,
            company_id: companyId,
            user_id: mem.user_id,
            module_code: 'PROJECTS',
            tier_level: BASELINE_PROJECTS_GRANT.tier_level,
            data_scope: BASELINE_PROJECTS_GRANT.data_scope,
            is_primary: true,
            status: 'ACTIVE',
          },
        });
      }
    }

    console.log(
      `[seed:org-blueprint] Seeded ${ORG_BLUEPRINT_NODES.length} org nodes & baseline access for ${memberships.length} users in company ${company.company_code} (${companyId}).`
    );
  }
}

seedOrgBlueprint()
  .catch((err) => {
    console.error('[seed:org-blueprint] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
